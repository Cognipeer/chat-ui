import { describe, expect, it } from "vitest";
import { pendingActionFromWire, pendingActionsFromWire, resolutionToWire, stopFromResponse } from "./wire";

describe("pendingActionFromWire", () => {
  it("reads an approval of the Console client wire", () => {
    expect(
      pendingActionFromWire({ id: "act_1", kind: "tool_approval", tool_name: "sandbox_exec", args: { cmd: "ls" }, status: "pending", expires_at: "2026-10-12T00:00:00Z", requested_at: "x" })
    ).toEqual({ id: "act_1", type: "tool_approval", toolName: "sandbox_exec", args: { cmd: "ls" }, expiresAt: "2026-10-12T00:00:00Z" });
  });

  it("keeps the JSON Schema of the arguments, whichever way the server spells it", () => {
    const schema = { type: "object", required: ["cmd"], properties: { cmd: { type: "string" } } };
    for (const key of ["args_schema", "argsSchema", "input_schema", "inputSchema"]) {
      const action = pendingActionFromWire({ id: "a", kind: "tool_approval", tool_name: "t", args: { cmd: "ls" }, [key]: schema });
      expect(action, key).toMatchObject({ argsSchema: schema });
    }
    // something that is not a schema is not kept
    expect(pendingActionFromWire({ id: "a", kind: "tool_approval", tool_name: "t", args_schema: "nope" })).not.toHaveProperty("argsSchema");
  });

  it("reads a question, turning snake_case keys back", () => {
    expect(
      pendingActionFromWire({
        id: "act_2", kind: "user_question", status: "pending", allow_free_text: false,
        questions: [{ question: "Which?", header: "Env", multi_select: true, required: false, options: [{ label: "Prod", value: "prod", description: "live", preview: "x" }, { value: "no label" }] }],
      })
    ).toEqual({
      id: "act_2", type: "user_question", allowFreeText: false,
      questions: [{ question: "Which?", header: "Env", multiSelect: true, required: false, options: [{ label: "Prod", value: "prod", description: "live", preview: "x" }] }],
    });
  });

  it("takes agent-server's own spelling too", () => {
    expect(pendingActionFromWire({ id: "a", type: "tool_approval", toolName: "t", title: "Allow?", summary: "s" })).toEqual({ id: "a", type: "tool_approval", toolName: "t", title: "Allow?", summary: "s" });
  });

  it("drops actions that are settled, malformed or of an unknown kind", () => {
    expect(pendingActionFromWire({ id: "a", kind: "tool_approval", tool_name: "t", status: "resolved" })).toBeUndefined();
    expect(pendingActionFromWire({ id: "a", kind: "tool_approval" })).toBeUndefined();
    expect(pendingActionFromWire({ id: "a", kind: "user_question", questions: [] })).toBeUndefined();
    expect(pendingActionFromWire({ id: "a", kind: "other" })).toBeUndefined();
    expect(pendingActionFromWire({ kind: "tool_approval", tool_name: "t" })).toBeUndefined();
    expect(pendingActionFromWire(null)).toBeUndefined();
    expect(pendingActionsFromWire("nope")).toEqual([]);
    expect(pendingActionsFromWire([{ id: "a", kind: "tool_approval", tool_name: "t" }, { id: "x" }])).toHaveLength(1);
  });
});

describe("resolutionToWire", () => {
  it("spells an approval the way the client API takes it", () => {
    expect(resolutionToWire({ type: "tool_approval", decision: "allow", comment: "ok", approvedArgs: { a: 1 }, rememberForSession: true })).toEqual({
      decision: "allow", comment: "ok", approved_args: { a: 1 }, remember_for_session: true,
    });
    expect(resolutionToWire({ type: "tool_approval", decision: "deny" })).toEqual({ decision: "deny" });
  });
  it("sends the answers of a question as they are", () => {
    expect(resolutionToWire({ type: "user_question", answers: { "Which?": ["a", "b"] } })).toEqual({ answers: { "Which?": ["a", "b"] } });
    expect(resolutionToWire({ type: "user_question", answers: {}, cancelled: true })).toEqual({ answers: {}, cancelled: true });
  });
});

describe("stopFromResponse", () => {
  it("maps stop_reason and takes the runtime's wording from stop_detail or incomplete_details", () => {
    expect(stopFromResponse({ stop_reason: "limit", stop_detail: "maxToolCalls" })).toEqual({ stopReason: "limit", stopDetail: "maxToolCalls" });
    expect(stopFromResponse({ stop_reason: "completed" })).toEqual({ stopReason: "end_turn" });
    expect(stopFromResponse({ incomplete_details: { reason: "max_output_tokens" } })).toEqual({ stopDetail: "max_output_tokens" });
    expect(stopFromResponse(null)).toEqual({});
  });
});

describe("tools of the host page on the Console wire", () => {
  it("reads a client_tool action", () => {
    expect(
      pendingActionFromWire({ id: "act_9", kind: "client_tool", tool_name: "open_ticket", tool_call_id: "tc9", args: { id: 7 }, timeout_seconds: 45, status: "pending" })
    ).toEqual({ id: "act_9", type: "client_tool", toolName: "open_ticket", toolCallId: "tc9", args: { id: 7 }, timeoutSeconds: 45 });
    expect(pendingActionFromWire({ id: "act_9", kind: "client_tool" })).toBeUndefined();
  });

  it("writes its answer as output or error", () => {
    expect(resolutionToWire({ type: "client_tool", output: { done: true } })).toEqual({ output: { done: true } });
    expect(resolutionToWire({ type: "client_tool", error: "no answer" })).toEqual({ error: "no answer" });
  });
});
