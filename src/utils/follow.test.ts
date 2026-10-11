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

  it("never moves the cursor back and does not mutate the state it was given", () => {
    const start = newFollowState();
    const a = applyFollowEvent(start, ev("agent.message.delta", { text: "x" }, 9));
    const b = applyFollowEvent(a, ev("agent.message.delta", { text: "y" }, 4));
    expect(b.lastSeq).toBe(9);
    expect(start.text).toBe("");
    expect(a.text).toBe("x");
  });
});
