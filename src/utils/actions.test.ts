import { describe, expect, it } from "vitest";
import type { Message, PendingAction } from "../types";
import {
  collectPendingActions,
  restorePendingActions,
  singleFreeTextQuestion,
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
