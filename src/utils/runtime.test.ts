import { describe, expect, it } from "vitest";
import {
  formatUsd,
  isBudgetExhausted,
  messageStopDetail,
  messageStopReason,
  messageWarnings,
  normalizeBudget,
  normalizeRuntime,
  normalizeStopReason,
  runtimeAfterTurn,
  stopNoticeKind,
} from "./runtime";

describe("normalizeStopReason", () => {
  it("accepts agent-server's values and the older Console spellings", () => {
    for (const reason of ["end_turn", "requires_action", "cancelled", "max_turns", "limit", "budget_reached", "error"]) {
      expect(normalizeStopReason(reason)).toBe(reason);
    }
    expect(normalizeStopReason("completed")).toBe("end_turn");
    expect(normalizeStopReason("paused")).toBe("requires_action");
    expect(normalizeStopReason("canceled")).toBe("cancelled");
    expect(normalizeStopReason(" LIMIT ")).toBe("limit");
  });

  it("returns undefined for anything else", () => {
    expect(normalizeStopReason("dancing")).toBeUndefined();
    expect(normalizeStopReason(3)).toBeUndefined();
    expect(normalizeStopReason(undefined)).toBeUndefined();
  });
});

describe("messageStopReason and stopNoticeKind", () => {
  it("reads the message's own field, then metadata.stopReason", () => {
    expect(messageStopReason({ stopReason: "limit" })).toBe("limit");
    expect(messageStopReason({ metadata: { stopReason: "cancelled" } })).toBe("cancelled");
    expect(messageStopReason({ stopReason: "limit", metadata: { stopReason: "cancelled" } })).toBe("limit");
    expect(messageStopReason({})).toBeUndefined();
  });

  it("gives a notice only to an assistant answer that was stopped, never to a plain one or a pause", () => {
    const a = (m: object) => stopNoticeKind({ role: "assistant", ...m });
    expect(a({ stopReason: "cancelled" })).toBe("cancelled");
    expect(a({ stopReason: "max_turns" })).toBe("max_turns");
    expect(a({ metadata: { stopReason: "budget_reached" } })).toBe("budget_reached");
    expect(a({ stopReason: "error" })).toBe("error");
    expect(a({ status: "cancelled" })).toBe("cancelled");
    expect(a({ status: "incomplete" })).toBe("incomplete");
    expect(a({ stopReason: "end_turn" })).toBeUndefined();
    expect(a({ stopReason: "requires_action", status: "requires_action" })).toBeUndefined();
    expect(a({})).toBeUndefined();
    expect(stopNoticeKind({ role: "user", stopReason: "limit" })).toBeUndefined();
  });

  it("a reason beats the generic incomplete status", () => {
    expect(stopNoticeKind({ role: "assistant", status: "incomplete", stopReason: "limit" })).toBe("limit");
  });

  it("reads the runtime's wording from either spelling", () => {
    expect(messageStopDetail({ stopDetail: "maxToolCalls" })).toBe("maxToolCalls");
    expect(messageStopDetail({ metadata: { stop_detail: "x" } })).toBe("x");
    expect(messageStopDetail({ metadata: { stopDetail: "  " } })).toBeUndefined();
  });

  it("keeps only the well-formed warnings", () => {
    expect(messageWarnings({ metadata: { warnings: [{ code: "file_truncated" }, "x", { message: "no code" }, null, { code: "" }] } })).toEqual([
      { code: "file_truncated" },
    ]);
    expect(messageWarnings({ metadata: { warnings: "nope" } })).toEqual([]);
    expect(messageWarnings({})).toEqual([]);
  });
});

describe("normalizeRuntime and normalizeBudget", () => {
  it("keeps a well-formed runtime and drops what is not one", () => {
    expect(normalizeRuntime({ status: "running", stopReason: "end_turn", lastEventSeq: 7, pendingActionIds: ["a", 3], activeRunId: "run_1", extra: 1 })).toEqual({
      status: "running",
      stopReason: "end_turn",
      lastEventSeq: 7,
      pendingActionIds: ["a"],
      activeRunId: "run_1",
    });
    expect(normalizeRuntime({ status: "idle" })).toEqual({ status: "idle" });
    expect(normalizeRuntime({ status: "nope" })).toBeUndefined();
    expect(normalizeRuntime(null)).toBeUndefined();
    expect(normalizeRuntime("running")).toBeUndefined();
  });

  it("a budget defaults to pause, accepts snake_case, and null means removed", () => {
    expect(normalizeBudget({ maxCostUsd: 5 })).toEqual({ maxCostUsd: 5, onReach: "pause" });
    expect(normalizeBudget({ max_cost_usd: "2.5", on_reach: "stop" })).toEqual({ maxCostUsd: 2.5, onReach: "stop" });
    expect(normalizeBudget(null)).toBeNull();
    expect(normalizeBudget({ maxCostUsd: 0 })).toBeUndefined();
    expect(normalizeBudget({ maxCostUsd: "x" })).toBeUndefined();
    expect(normalizeBudget("5")).toBeUndefined();
  });
});

describe("isBudgetExhausted", () => {
  const budget = { maxCostUsd: 1, onReach: "pause" as const };
  it("is true when the server says paused, or when the limit is spent", () => {
    expect(isBudgetExhausted({ runtime: { status: "budget_paused" } })).toBe(true);
    expect(isBudgetExhausted({ budget, spentUsd: 1 })).toBe(true);
    expect(isBudgetExhausted({ budget: { maxCostUsd: 1, onReach: "stop" }, spentUsd: 1.5 })).toBe(true);
  });
  it("is false with room left, without a limit, or without a conversation", () => {
    expect(isBudgetExhausted({ budget, spentUsd: 0.4 })).toBe(false);
    expect(isBudgetExhausted({ budget: null, spentUsd: 99 })).toBe(false);
    expect(isBudgetExhausted({ budget })).toBe(false);
    expect(isBudgetExhausted(null)).toBe(false);
  });
});

describe("runtimeAfterTurn", () => {
  const pause = { maxCostUsd: 1, onReach: "pause" as const };
  it("a plain turn leaves the conversation idle, at the event it reached", () => {
    expect(runtimeAfterTurn({ status: "running", lastEventSeq: 3 }, { stopReason: "end_turn", seq: 9 })).toEqual({
      status: "idle", stopReason: "end_turn", lastEventSeq: 9, pendingActionIds: [],
    });
  });
  it("keeps the previous event number when the frame had none", () => {
    expect(runtimeAfterTurn({ status: "idle", lastEventSeq: 3 }, {}).lastEventSeq).toBe(3);
    expect(runtimeAfterTurn(undefined, {}).lastEventSeq).toBe(0);
  });
  it("a pause waits for the person, with the ids", () => {
    expect(runtimeAfterTurn(undefined, { stopReason: "requires_action", pendingActionIds: ["a1"] })).toMatchObject({
      status: "requires_action", pendingActionIds: ["a1"],
    });
    expect(runtimeAfterTurn(undefined, { pendingActionIds: ["a1"] }).status).toBe("requires_action");
  });
  it("the usage limit pauses a pause-budget conversation and only stops a stop-budget one", () => {
    expect(runtimeAfterTurn(undefined, { stopReason: "budget_reached", budget: pause }).status).toBe("budget_paused");
    expect(runtimeAfterTurn(undefined, { stopReason: "budget_reached", budget: { maxCostUsd: 1, onReach: "stop" } }).status).toBe("idle");
    expect(runtimeAfterTurn(undefined, { stopReason: "budget_reached" }).status).toBe("idle");
  });
});

describe("formatUsd", () => {
  it("shows cents, and more digits for amounts that would otherwise read as zero", () => {
    expect(formatUsd(1.5, "en")).toBe("$1.50");
    expect(formatUsd(0.0042, "en")).toBe("$0.0042");
    expect(formatUsd(0, "en")).toBe("$0.00");
    expect(formatUsd(12, "en")).toBe("$12.00");
  });
});
