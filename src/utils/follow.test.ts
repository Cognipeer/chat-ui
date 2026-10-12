import { describe, expect, it } from "vitest";
import { applyFollowEvent, newFollowState, type FollowState } from "./follow";
import type { ConversationEvent } from "../types";

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
});
