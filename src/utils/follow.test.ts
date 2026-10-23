import { describe, expect, it, vi } from "vitest";
import { applyFollowEvent, newFollowState, type FollowState } from "./follow";
import { flowMetadata } from "./plan";
import type { ConversationEvent, PlanSnapshot } from "../types";

const ev = (type: string, data: Record<string, unknown> = {}, seq?: number): ConversationEvent => ({ type, data, ...(seq !== undefined ? { seq } : {}) });
const fold = (events: ConversationEvent[], from: FollowState = newFollowState()) => events.reduce(applyFollowEvent, from);

describe("applyFollowEvent", () => {
  it("folds a streamed turn: text, tools, the finished message, the end", () => {
    const state = fold([
      ev("agent.tool_use", { tool_call_id: "t1", name: "search", args: { q: "x" } }, 8),
      ev("agent.tool_result", { tool_call_id: "t1", name: "search", ok: true, duration_ms: 12 }, 9),
      ev("agent.message.delta", { text: "Hel" }),
      ev("agent.message.delta", { text: "lo" }),
      ev("agent.message", { content: "Hello", message_id: "m2" }, 10),
      ev("session.status_idle", { stop_reason: "end_turn" }, 11),
    ]);
    expect(state.text).toBe("Hello");
    expect(state.streamed).toBe(true);
    expect(state.messageId).toBe("m2");
    expect(state.tools.get("t1")).toEqual({ name: "search", args: { q: "x" }, result: { ok: true } });
    expect(state.idle).toEqual({ stopReason: "end_turn", detail: undefined, pendingActionIds: [] });
    expect(state.lastSeq).toBe(11);
  });

  it("a turn that did not stream shows its answer at agent.message", () => {
    const state = fold([ev("agent.message", { content: "All at once", message_id: "m2" }, 3)]);
    expect(state.text).toBe("All at once");
    expect(state.streamed).toBe(false);
  });

  it("a streamed answer is not replaced by the finished message that repeats it", () => {
    const state = fold([ev("agent.message.delta", { text: "abc" }), ev("agent.message", { content: "abc!", message_id: "m" })]);
    expect(state.text).toBe("abc");
  });

  it("a failed tool says so", () => {
    const state = fold([ev("agent.tool_use", { tool_call_id: "t", name: "n" }), ev("agent.tool_result", { tool_call_id: "t", ok: false, error: "boom" })]);
    expect(state.tools.get("t")?.result).toEqual({ ok: false, error: "boom" });
  });

  it("ignores a result for a call it never saw, and event types it does not know", () => {
    const start = newFollowState();
    expect(fold([ev("agent.tool_result", { tool_call_id: "nope", ok: true })], start).tools.size).toBe(0);
    expect(fold([ev("agent.compaction", {}, 5)], start).lastSeq).toBe(5);
  });

  it("a pause ends with the ids it waits on", () => {
    const state = fold([ev("action.required", { action_id: "a1" }, 3), ev("session.status_idle", { stop_reason: "requires_action", pending_action_ids: ["a1", 7] }, 4)]);
    expect(state.idle).toMatchObject({ stopReason: "requires_action", pendingActionIds: ["a1"] });
  });

  it("an error is kept with its code", () => {
    expect(fold([ev("session.error", { message: "interrupted", code: "run_interrupted" })]).error).toEqual({ message: "interrupted", code: "run_interrupted" });
    expect(fold([ev("session.error", {})]).error?.message).toBeTruthy();
  });

  it("a new turn clears what the last one left", () => {
    const state = fold([
      ev("agent.message.delta", { text: "old" }),
      ev("agent.tool_use", { tool_call_id: "t", name: "n" }),
      ev("session.status_idle", { stop_reason: "end_turn" }),
      ev("session.status_running", { trigger: "message" }),
    ]);
    expect(state.text).toBe("");
    expect(state.tools.size).toBe(0);
    expect(state.idle).toBeUndefined();
  });

  it("reads the user message a followed turn started with", () => {
    const state = fold([ev("user.message", { content: "go", message_id: "u9", files: [{ id: "f1", name: "a.pdf", mime_type: "application/pdf", size: 5 }, { name: "no id" }] })]);
    expect(state.userMessage).toEqual({
      id: "u9",
      content: "go",
      files: [{ id: "f1", name: "a.pdf", mimeType: "application/pdf", size: 5 }],
    });
    expect(fold([ev("user.message", { content: "no id" })]).userMessage).toBeUndefined();
  });

  describe("the reattach snapshot", () => {
    const snapshot = (data: Record<string, unknown>) => ev("agent.message.snapshot", data);

    it("seeds the text the run has written so far, and the message that started it", () => {
      const state = fold([
        snapshot({ run_id: "run_1", text: "Half of an ans", user_message: { id: "u1", content: "go", files: [{ id: "f1", name: "a.txt", mime_type: "text/plain", size: 3 }] } }),
      ]);
      expect(state.text).toBe("Half of an ans");
      expect(state.streamed).toBe(true);
      expect(state.snapshotRunId).toBe("run_1");
      expect(state.userMessage).toEqual({ id: "u1", content: "go", files: [{ id: "f1", name: "a.txt", mimeType: "text/plain", size: 3 }] });
      // not stored: the cursor does not move
      expect(state.lastSeq).toBeUndefined();
    });

    it("later deltas add to it, and a finished message that repeats the text does not replace it", () => {
      const state = fold([
        snapshot({ run_id: "run_1", text: "Half of " }),
        ev("agent.message.delta", { text: "an answer" }),
        ev("agent.message", { content: "Half of an answer!", message_id: "m2" }, 9),
      ]);
      expect(state.text).toBe("Half of an answer");
      expect(state.messageId).toBe("m2");
    });

    it("an empty snapshot (nothing written yet) leaves room for the first delta, and a null user message changes nothing", () => {
      const state = fold([snapshot({ run_id: "run_1", text: "", user_message: null }), ev("agent.message.delta", { text: "Hi" })]);
      expect(state.text).toBe("Hi");
      expect(state.userMessage).toBeUndefined();
      const kept = fold([ev("user.message", { content: "go", message_id: "u1" }), snapshot({ run_id: "run_1", text: "x", user_message: null })]);
      expect(kept.userMessage?.id).toBe("u1");
    });

    it("a reconnect brings a fresh snapshot with everything so far: it replaces, never doubles, the text", () => {
      const state = fold([
        snapshot({ run_id: "run_1", text: "Hello" }),
        ev("agent.message.delta", { text: ", wor" }),
        snapshot({ run_id: "run_1", text: "Hello, world" }),
        ev("agent.message.delta", { text: "!" }),
      ]);
      expect(state.text).toBe("Hello, world!");
    });

    it("the log replayed after the snapshot starts the same run again without wiping what the snapshot brought", () => {
      const replayed = { ...ev("session.status_running", { trigger: "message" }, 3), runId: "run_1" };
      const state = fold([snapshot({ run_id: "run_1", text: "Half" }), replayed]);
      expect(state.text).toBe("Half");
      // but another run starting is a new turn
      const next = fold([snapshot({ run_id: "run_1", text: "Half" }), { ...ev("session.status_running", {}, 12), runId: "run_2" }]);
      expect(next.text).toBe("");
      expect(next.snapshotRunId).toBeUndefined();
    });

    it("the replayed start of the run, which names no run, keeps what the snapshot brought", () => {
      // agent-server stamps neither the frame nor its data: the start of the run the snapshot stands for reads `{ trigger }`
      const start = ev("session.status_running", { trigger: "message" }, 2);
      const state = fold([snapshot({ run_id: "run_1", text: "Half of an ans" }), start, ev("agent.message.delta", { text: "wer", run_id: "run_1" })]);
      expect(state.text).toBe("Half of an answer");
      expect(state.snapshotRunId).toBe("run_1");
      // it is not marked as a new run either: a repeat of the same start (a reconnect) still keeps the text
      expect(fold([snapshot({ run_id: "run_1", text: "Half" }), start, start]).text).toBe("Half");
    });

    it("a snapshot that names no run is kept by a start that names none, and the start's run is adopted", () => {
      const state = fold([snapshot({ text: "Half" }), ev("session.status_running", {}, 2)]);
      expect(state.text).toBe("Half");
      const named = fold([snapshot({ text: "Half" }), { ...ev("session.status_running", {}, 2), runId: "run_9" }]);
      expect(named.text).toBe("Half");
      expect(named.snapshotRunId).toBe("run_9");
      // the run id inside the data counts too
      expect(fold([snapshot({ run_id: "run_1", text: "Half" }), ev("session.status_running", { run_id: "run_1" }, 2)]).text).toBe("Half");
      expect(fold([snapshot({ run_id: "run_1", text: "Half" }), ev("session.status_running", { run_id: "run_2" }, 2)]).text).toBe("");
    });

    it("a different run proves itself on a delta as well: the seeded text is not carried into it", () => {
      const state = fold([
        snapshot({ run_id: "run_1", text: "Old answer" }),
        ev("agent.message.delta", { text: "New ", run_id: "run_2" }),
        ev("agent.message.delta", { text: "one", run_id: "run_2" }),
      ]);
      expect(state.text).toBe("New one");
      expect(state.snapshotRunId).toBe("run_2");
      expect(state.seeded).toBe(false);
      // a delta of the snapshot's own run, or one that names no run, adds to the text
      expect(fold([snapshot({ run_id: "run_1", text: "Old " }), ev("agent.message.delta", { text: "answer", run_id: "run_1" })]).text).toBe("Old answer");
      expect(fold([snapshot({ run_id: "run_1", text: "Old " }), ev("agent.message.delta", { text: "answer" })]).text).toBe("Old answer");
    });

    it("a start after the turn went idle is a new turn, whether or not it names a run", () => {
      const state = fold([
        snapshot({ run_id: "run_1", text: "Done" }),
        ev("session.status_idle", { stop_reason: "end_turn" }, 4),
        ev("session.status_running", {}, 5),
      ]);
      expect(state.text).toBe("");
      expect(state.idle).toBeUndefined();
      expect(state.snapshotRunId).toBeUndefined();
    });

    it("a turn followed without a snapshot starts empty at its start, as before", () => {
      const state = fold([ev("agent.message.delta", { text: "stale" }), ev("session.status_running", {}, 2), ev("agent.message.delta", { text: "fresh" })]);
      expect(state.text).toBe("fresh");
    });
  });

  it("never moves the cursor back and does not mutate the state it was given", () => {
    const start = newFollowState();
    const a = applyFollowEvent(start, ev("agent.message.delta", { text: "x" }, 9));
    const b = applyFollowEvent(a, ev("agent.message.delta", { text: "y" }, 4));
    expect(b.lastSeq).toBe(9);
    expect(start.text).toBe("");
    expect(a.text).toBe("x");
  });
  describe("plan and compaction", () => {
    it("folds the plan and the condensing passes of a turn into its flow, in order", () => {
      const state = fold([
        ev("session.status_running", {}, 1),
        ev("agent.tool_use", { tool_call_id: "t1", name: "lookup", args: {} }, 2),
        ev("agent.tool_result", { tool_call_id: "t1", ok: true }, 3),
        ev("agent.plan", { version: 1, steps: [{ id: 1, title: "Look up", status: "in-progress" }, { id: 2, title: "Reply", status: "not-started" }] }, 4),
        ev("agent.compaction", { id: "c1", at: "2026-10-23T10:00:00Z" }, 5),
        ev("agent.plan", { version: 2, steps: [{ id: 1, title: "Look up", status: "completed" }, { id: 2, title: "Reply", status: "in-progress" }] }, 6),
      ]);
      expect(state.flow.activity).toEqual([
        { kind: "tool", id: "t1", name: "lookup", status: "ok" },
        { kind: "plan", version: 1, done: 0, total: 2, created: true },
        { kind: "compaction", id: "c1" },
        { kind: "plan", version: 2, done: 1, total: 2 },
      ]);
      expect(state.flow.plan?.steps.map((s) => s.status)).toEqual(["completed", "in-progress"]);
      expect(state.lastSeq).toBe(6);
    });

    it("a replayed plan or pass adds nothing, and a plan with no usable step is not a plan", () => {
      const plan = ev("agent.plan", { steps: [{ title: "A", status: "in-progress" }] }, 4);
      const once = fold([plan]);
      expect(applyFollowEvent(once, { ...plan, seq: 5 })).toMatchObject({ flow: once.flow, lastSeq: 5 });
      expect(fold([ev("agent.plan", { steps: [] }, 6)]).flow.plan).toBeUndefined();
      const pass = fold([ev("agent.compaction", { id: "c" }, 1)]);
      expect(fold([ev("agent.compaction", { id: "c" }, 2)], pass).flow.activity).toHaveLength(1);
    });

    it("a new turn starts with an empty flow", () => {
      const state = fold([ev("agent.plan", { steps: [{ title: "A", status: "in-progress" }] }, 1), ev("session.status_idle", {}, 2), ev("session.status_running", {}, 3)]);
      expect(state.flow).toEqual({ activity: [] });
    });

    it("what the event says the agent did to the plan decides what the turn shows as created", () => {
      const steps = [{ title: "A", status: "in-progress" }];
      // the first plan this turn shows may only change one written in an earlier turn
      expect(fold([ev("agent.plan", { operation: "update", steps }, 1)]).flow.activity).toEqual([{ kind: "plan", done: 0, total: 1 }]);
      expect(fold([ev("agent.plan", { operation: "write", steps }, 1)]).flow.activity).toEqual([{ kind: "plan", done: 0, total: 1, created: true }]);
      // an event that does not say goes by the turn so far, as before
      expect(fold([ev("agent.plan", { steps }, 1)]).flow.activity).toEqual([{ kind: "plan", done: 0, total: 1, created: true }]);
      expect(fold([ev("agent.plan", { operation: "rewrite", steps }, 1)]).flow.activity).toEqual([{ kind: "plan", done: 0, total: 1, created: true }]);
    });

    describe("a run that carries a paused turn on", () => {
      const carried: PlanSnapshot = {
        version: 1,
        steps: [
          { id: 1, title: "Look up", status: "completed" },
          { id: 2, title: "Reply", status: "in-progress" },
        ],
      };
      const withCarried = () => newFollowState(() => carried);
      const resumed = (data: Record<string, unknown> = { trigger: "resume" }, seq = 8) => ev("session.status_running", data, seq);
      const snapshot = (data: Record<string, unknown>) => ev("agent.message.snapshot", data);

      it("starts from the plan the turn had: the card stays and the next write is an update, not a creation", () => {
        const started = fold([resumed()], withCarried());
        expect(started.flow).toEqual({ plan: carried, activity: [] });
        // the plan the leg started with is not a change: it already sits in the message that paused
        expect(flowMetadata(started.flow)).toEqual({});
        const wrote = fold([ev("agent.plan", { version: 2, steps: [{ id: 1, title: "Look up", status: "completed" }, { id: 2, title: "Reply", status: "completed" }] }, 9)], started);
        expect(wrote.flow.activity).toEqual([{ kind: "plan", version: 2, done: 2, total: 2 }]);
        expect(flowMetadata(wrote.flow).plan?.version).toBe(2);
        // the same plan again changes nothing
        expect(fold([ev("agent.plan", { steps: [{ title: "Look up", status: "completed" }, { title: "Reply", status: "in-progress" }] }, 9)], started).flow).toBe(started.flow);
      });

      it("a request that lapsed (a timeout) carries the turn on as well", () => {
        expect(fold([resumed({ trigger: "timeout" })], withCarried()).flow.plan).toBe(carried);
      });

      it("a run that begins a turn carries nothing: a person's message, a reminder, a run that does not say why", () => {
        for (const data of [{ trigger: "message" }, { trigger: "message", mode: "regenerate" }, { trigger: "reminder" }, { trigger: "other" }, {}]) {
          expect(fold([resumed(data)], withCarried()).flow).toEqual({ activity: [] });
        }
        // the page is not even asked
        const ask = vi.fn(() => carried);
        fold([resumed({ trigger: "message" })], newFollowState(ask));
        expect(ask).not.toHaveBeenCalled();
      });

      it("asks the page when the run begins, not when the follower is made", () => {
        let onScreen: PlanSnapshot | undefined;
        const state = newFollowState(() => onScreen);
        // the messages the page loaded are on screen only after the follower began
        onScreen = carried;
        expect(fold([resumed()], state).flow.plan).toBe(carried);
        // a page with nothing to carry starts empty
        onScreen = undefined;
        expect(fold([resumed()], state).flow).toEqual({ activity: [] });
      });

      it("a follower that is given nothing to carry starts empty, as before", () => {
        expect(fold([resumed()]).flow).toEqual({ activity: [] });
      });

      it("the replayed start of a run joined through its snapshot takes the plan too, and keeps the text", () => {
        const state = fold([snapshot({ run_id: "run_2", text: "Half" }), { ...resumed(), runId: "run_2" }], withCarried());
        expect(state.text).toBe("Half");
        expect(state.flow).toEqual({ plan: carried, activity: [] });
        // a flow that has already seen the run is not replaced
        const seen = fold([snapshot({ run_id: "run_2", text: "Half" }), ev("agent.tool_use", { tool_call_id: "t1", name: "lookup" }, 7), resumed()], withCarried());
        expect(seen.flow.plan).toBeUndefined();
        expect(seen.flow.activity).toHaveLength(1);
      });
    });
  });
});
