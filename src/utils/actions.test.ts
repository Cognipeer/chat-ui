import { describe, expect, it } from "vitest";
import type { Message, PendingAction } from "../types";
import {
  actionDeadline,
  collectPendingActions,
  expireLapsedActions,
  isQuestionRequired,
  keepSettledDetail,
  normalizeActions,
  restorePendingActions,
  settledStateOf,
  singleFreeTextQuestion,
  splitRemaining,
  stateForSpentAction,
} from "./actions";

const approval: PendingAction = { id: "a1", type: "tool_approval", toolName: "sandbox_exec", args: { cmd: "ls" } };
const question: PendingAction = {
  id: "q1",
  type: "user_question",
  questions: [{ question: "Which env?" }],
};

function msg(partial: Partial<Message>): Message {
  return {
    id: "m",
    conversationId: "c",
    role: "assistant",
    content: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("restorePendingActions", () => {
  it("returns messages untouched when nothing is pending", () => {
    const messages = [msg({ id: "u", role: "user", content: "hi" }), msg({ id: "a", content: "hello" })];
    const restored = restorePendingActions(messages, undefined);
    expect(restored[0]).toBe(messages[0]);
    expect(restored[1]).toBe(messages[1]);
  });

  it("attaches the server's pending list to the last assistant message", () => {
    const restored = restorePendingActions(
      [msg({ id: "u", role: "user", content: "run" }), msg({ id: "a" })],
      [approval]
    );
    expect(restored[1].pendingActions).toEqual([approval]);
    expect(restored[1].status).toBe("requires_action");
    expect(collectPendingActions(restored).map((e) => e.action.id)).toEqual(["a1"]);
  });

  it("treats actions missing from the server's list as resolved", () => {
    const restored = restorePendingActions([msg({ pendingActions: [approval], status: "requires_action" })], []);
    expect(restored[0].actionStates?.a1.status).toBe("resolved");
    expect(collectPendingActions(restored)).toHaveLength(0);
  });

  it("falls back to the last message when the server reports nothing", () => {
    const restored = restorePendingActions(
      [
        msg({ id: "old", pendingActions: [approval], status: "requires_action" }),
        msg({ id: "u", role: "user" }),
        msg({ id: "new", pendingActions: [question], status: "requires_action" }),
      ],
      undefined
    );
    expect(collectPendingActions(restored).map((e) => e.action.id)).toEqual(["q1"]);
  });

  it("ignores malformed actions", () => {
    const restored = restorePendingActions([msg({ id: "a" })], [{ id: 5 }, { type: "tool_approval" }]);
    expect(restored[0].pendingActions).toBeUndefined();
  });
});

describe("singleFreeTextQuestion", () => {
  it("accepts one option-less question", () => {
    const entries = collectPendingActions(restorePendingActions([msg({ id: "a" })], [question]));
    expect(singleFreeTextQuestion(entries)?.question.question).toBe("Which env?");
  });

  it("rejects questions with options, approvals and multiple actions", () => {
    const withOptions: PendingAction = {
      id: "q2",
      type: "user_question",
      questions: [{ question: "Pick", options: [{ label: "A" }] }],
    };
    const of = (actions: PendingAction[]) =>
      collectPendingActions(restorePendingActions([msg({ id: "a" })], actions));
    expect(singleFreeTextQuestion(of([withOptions]))).toBeNull();
    expect(singleFreeTextQuestion(of([approval]))).toBeNull();
    expect(singleFreeTextQuestion(of([question, approval]))).toBeNull();
  });
});

describe("stateForSpentAction", () => {
  it("maps the codes that say an action can no longer be answered", () => {
    expect(stateForSpentAction("action_not_pending")).toEqual({ status: "resolved" });
    expect(stateForSpentAction("action_expired")).toEqual({ status: "expired" });
    expect(stateForSpentAction("action_cancelled")).toEqual({ status: "cancelled" });
  });

  it("leaves every other error to the caller", () => {
    expect(stateForSpentAction("rate_limited")).toBeUndefined();
    expect(stateForSpentAction(undefined)).toBeUndefined();
  });
});

describe("isQuestionRequired (a question is required unless the server says required: false)", () => {
  it("defaults to required", () => {
    expect(isQuestionRequired({})).toBe(true);
    expect(isQuestionRequired({ required: undefined })).toBe(true);
    expect(isQuestionRequired({ required: true })).toBe(true);
    expect(isQuestionRequired({ required: false })).toBe(false);
  });
});

describe("normalizeActions", () => {
  it("accepts the Console's snapshot spelling (`kind`) and keeps only well-formed actions", () => {
    const actions = normalizeActions([
      { id: "a1", kind: "tool_approval", toolName: "sandbox_exec", status: "pending" },
      { id: "q1", kind: "user_question", questions: [{ question: "Which?" }] },
      { id: "x", kind: "nonsense" },
      { kind: "tool_approval", toolName: "no id" },
    ]);
    expect(actions.map((a) => [a.id, a.type])).toEqual([
      ["a1", "tool_approval"],
      ["q1", "user_question"],
    ]);
  });
});

describe("restorePendingActions with settled actions the server recorded", () => {
  const snapshot = (entries: unknown[], extra: Partial<Message> = {}) =>
    msg({ id: "a", metadata: { pendingActions: entries }, ...extra });

  it("shows what was decided from settled entries in metadata.pendingActions", () => {
    const [restored] = restorePendingActions(
      [
        snapshot([
          { id: "a1", kind: "tool_approval", toolName: "sandbox_exec", args: { cmd: "ls" }, status: "resolved", resolution: { decision: "allow", approvedArgs: { cmd: "ls -la" }, rememberForSession: true }, resolvedBy: "u1", resolvedAt: "2026-10-11T10:00:00Z" },
          { id: "a2", kind: "tool_approval", toolName: "web_fetch", status: "resolved", resolution: { decision: "deny", comment: "too risky" } },
          { id: "a3", kind: "tool_approval", toolName: "slow", status: "expired" },
          { id: "a4", kind: "tool_approval", toolName: "other", status: "cancelled" },
          { id: "q1", kind: "user_question", questions: [{ question: "Which env?" }], status: "resolved", resolution: { answers: { "Which env?": "staging" } } },
          { id: "q2", kind: "user_question", questions: [{ question: "Notes?" }], status: "resolved", resolution: { cancelled: true } },
        ]),
      ],
      []
    );
    expect(restored.actionStates?.a1).toEqual({
      status: "resolved",
      resolution: { type: "tool_approval", decision: "allow", approvedArgs: { cmd: "ls -la" }, rememberForSession: true },
      resolvedBy: "u1",
      resolvedAt: "2026-10-11T10:00:00Z",
    });
    expect(restored.actionStates?.a2).toEqual({ status: "resolved", resolution: { type: "tool_approval", decision: "deny", comment: "too risky" } });
    expect(restored.actionStates?.a3).toEqual({ status: "expired" });
    expect(restored.actionStates?.a4).toEqual({ status: "cancelled" });
    expect(restored.actionStates?.q1).toEqual({ status: "resolved", resolution: { type: "user_question", answers: { "Which env?": "staging" } } });
    expect(restored.actionStates?.q2).toEqual({ status: "resolved", resolution: { type: "user_question", answers: {}, cancelled: true } });
    expect(collectPendingActions([restored])).toEqual([]);
  });

  it("reads metadata.actionStates and the message's own actionStates", () => {
    const [fromMeta] = restorePendingActions(
      [
        msg({
          id: "a",
          pendingActions: [approval],
          metadata: { actionStates: { a1: { status: "resolved", resolution: { decision: "deny", comment: "no" } } } },
        }),
      ],
      []
    );
    expect(fromMeta.actionStates?.a1).toMatchObject({ status: "resolved", resolution: { type: "tool_approval", decision: "deny", comment: "no" } });

    const own = { status: "expired" as const };
    const [fromOwn] = restorePendingActions([msg({ id: "a", pendingActions: [approval], actionStates: { a1: own } })], []);
    expect(fromOwn.actionStates?.a1).toBe(own);
  });

  it("falls back to plainly resolved when nothing says how it ended", () => {
    const [restored] = restorePendingActions([snapshot([{ id: "a1", kind: "tool_approval", toolName: "t", status: "pending" }])], []);
    expect(restored.actionStates?.a1).toEqual({ status: "resolved" });
  });

  it("lets the server's list of open actions win over a settled copy", () => {
    const [restored] = restorePendingActions(
      [
        snapshot([{ id: "a1", kind: "tool_approval", toolName: "sandbox_exec", status: "resolved", resolution: { decision: "allow" } }], {
          actionStates: { a1: { status: "resolved" } },
        }),
      ],
      [approval]
    );
    expect(restored.actionStates?.a1).toBeUndefined();
    expect(collectPendingActions([restored]).map((e) => e.action.id)).toEqual(["a1"]);
  });

  it("prefers a settled snapshot over the last-message guess when the server lists nothing", () => {
    const [restored] = restorePendingActions([snapshot([{ id: "a1", kind: "tool_approval", toolName: "t", status: "resolved", resolution: { decision: "allow" } }])]);
    expect(restored.actionStates?.a1.status).toBe("resolved");
    expect(collectPendingActions([restored])).toEqual([]);
  });
});

describe("keepSettledDetail", () => {
  it("keeps an Expired or Cancelled card a refresh would flatten to plainly resolved", () => {
    const current = [msg({ id: "a", pendingActions: [approval], actionStates: { a1: { status: "expired" } } })];
    const loaded = [msg({ id: "a", pendingActions: [approval], actionStates: { a1: { status: "resolved" } } })];
    expect(keepSettledDetail(loaded, current)[0].actionStates?.a1).toEqual({ status: "expired" });
  });

  it("takes the server's detail when it has some", () => {
    const current = [msg({ id: "a", pendingActions: [approval], actionStates: { a1: { status: "expired" } } })];
    const detailed = { status: "resolved" as const, resolution: { type: "tool_approval" as const, decision: "deny" as const } };
    const loaded = [msg({ id: "a", pendingActions: [approval], actionStates: { a1: detailed } })];
    expect(keepSettledDetail(loaded, current)[0].actionStates?.a1).toBe(detailed);
  });

  it("leaves messages it knows nothing about alone", () => {
    const loaded = [msg({ id: "z", pendingActions: [approval], actionStates: { a1: { status: "resolved" } } })];
    expect(keepSettledDetail(loaded, [])[0]).toBe(loaded[0]);
  });
});

describe("deadlines", () => {
  it("reads expiresAt as epoch milliseconds", () => {
    expect(actionDeadline({ expiresAt: "2026-10-11T10:00:00Z" })).toBe(Date.parse("2026-10-11T10:00:00Z"));
    expect(actionDeadline({})).toBeUndefined();
    expect(actionDeadline({ expiresAt: "not a date" })).toBeUndefined();
  });

  it("splits the time left into the largest unit that fits, rounding up", () => {
    expect(splitRemaining(23 * 3600_000 + 5000)).toEqual({ value: 23, unit: "hour" });
    expect(splitRemaining(2 * 86400_000)).toEqual({ value: 2, unit: "day" });
    expect(splitRemaining(9 * 60_000)).toEqual({ value: 9, unit: "minute" });
    expect(splitRemaining(42_000)).toEqual({ value: 42, unit: "second" });
    expect(splitRemaining(300)).toEqual({ value: 1, unit: "second" });
  });
});


describe("a request that lapsed and was refused by the server on its own", () => {
  it("reads as expired, not as a denial the person made", () => {
    expect(
      settledStateOf({ id: "a1", type: "tool_approval", status: "resolved", resolution: { decision: "deny", comment: "timed out" }, resolvedBy: "system:timeout", resolvedAt: "2026-10-11T10:00:00Z" })
    ).toEqual({
      status: "expired",
      resolution: { type: "tool_approval", decision: "deny", comment: "timed out" },
      resolvedBy: "system:timeout",
      resolvedAt: "2026-10-11T10:00:00Z",
    });
  });

  it("leaves a denial by a person, or by another system actor, as it is", () => {
    expect(settledStateOf({ id: "a1", type: "tool_approval", status: "resolved", resolution: { decision: "deny" }, resolvedBy: "user_1" })?.status).toBe("resolved");
    expect(settledStateOf({ id: "a1", type: "tool_approval", status: "cancelled", resolvedBy: "system" })?.status).toBe("cancelled");
  });
});

describe("expireLapsedActions", () => {
  const now = Date.parse("2026-10-11T10:00:00Z");
  const open = (expiresAt?: string): Message => msg({ id: "m1", status: "requires_action", pendingActions: [{ ...approval, ...(expiresAt ? { expiresAt } : {}) }] });

  it("marks an open action past its deadline as expired, and leaves the rest alone", () => {
    const [lapsed] = expireLapsedActions([open("2026-10-11T09:59:59Z")], now);
    expect(lapsed.actionStates?.a1).toEqual({ status: "expired" });
    const future = open("2026-10-11T10:00:01Z");
    const noDeadline = open();
    expect(expireLapsedActions([future, noDeadline], now)).toEqual([future, noDeadline]);
    expect(expireLapsedActions([future], now)[0]).toBe(future);
  });

  it("takes an action whose deadline is exactly now, and one the UI had put back to pending", () => {
    expect(expireLapsedActions([open("2026-10-11T10:00:00Z")], now)[0].actionStates?.a1.status).toBe("expired");
    const back = { ...open("2026-10-11T09:00:00Z"), actionStates: { a1: { status: "pending" as const } } };
    expect(expireLapsedActions([back], now)[0].actionStates?.a1.status).toBe("expired");
  });

  it("leaves an action alone that the UI has settled or is sending an answer for", () => {
    for (const status of ["resolving", "resolved", "cancelled", "expired"] as const) {
      const message = { ...open("2026-10-11T09:00:00Z"), actionStates: { a1: { status } } };
      expect(expireLapsedActions([message], now)[0], status).toBe(message);
    }
  });

  it("only touches the lapsed action of a message that holds several", () => {
    const message = msg({
      id: "m1",
      pendingActions: [
        { ...approval, id: "late", expiresAt: "2026-10-11T09:00:00Z" },
        { ...approval, id: "soon", expiresAt: "2026-10-11T11:00:00Z" },
      ],
    });
    expect(expireLapsedActions([message], now)[0].actionStates).toEqual({ late: { status: "expired" } });
  });
});
