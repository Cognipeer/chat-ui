import { describe, expect, it, vi } from "vitest";
import { A2ATransport } from "./a2a";
import { AgentSdkTransport, type AgentSdkAgent } from "./agentSdk";
import { ChatCompletionsTransport } from "./chatCompletions";
import { ResponsesTransport } from "./responses";
import type { StreamEvent } from "../../types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const as = (f: unknown) => f as unknown as typeof fetch;

const consoleApproval = { id: "act_1", kind: "tool_approval", tool_name: "sandbox_exec", args: { cmd: "ls" }, status: "pending", requested_at: "2026-10-11T10:00:00Z" };
const consoleQuestion = {
  id: "act_2", kind: "user_question", status: "pending", allow_free_text: true,
  questions: [{ question: "Which env?", options: [{ label: "Prod", value: "prod" }, { label: "Dev", value: "dev" }] }],
};

const paused = (actions: unknown[]) => ({
  id: "resp_conv-1",
  object: "response",
  status: "requires_action",
  stop_reason: "requires_action",
  required_action: { type: "agent_actions", actions },
  output: [{ id: "m", type: "message", role: "assistant", content: [{ type: "output_text", text: "I need your OK." }] }],
  usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
});

/** What the client API answers when other actions of the pause still wait: no output of its own */
const stillWaiting = (actions: unknown[]) => ({ ...paused(actions), output: [] });

const completed = (text: string, extra: Record<string, unknown> = {}) => ({
  id: "resp_conv-1",
  object: "response",
  status: "completed",
  stop_reason: "completed",
  output: [{ id: "m2", type: "message", role: "assistant", content: [{ type: "output_text", text }] }],
  ...extra,
});

describe("ResponsesTransport and a Console response that waits on a person", () => {
  function setup(answers: unknown[], options: Record<string, unknown> = {}) {
    const queue = [...answers];
    const fetchMock = vi.fn(async () => json(queue.shift()));
    const transport = new ResponsesTransport({ baseUrl: "https://api.example.com/client/v1/", fetch: as(fetchMock), defaultAgentId: "support", ...options });
    return { transport, fetchMock };
  }

  it("turns requires_action into cards on the stored assistant message", async () => {
    const { transport } = setup([paused([consoleApproval, consoleQuestion])]);
    const conversation = await transport.createConversation({ agentId: "support" });
    const sent = await transport.sendMessage(conversation.id, { message: "deploy" });

    expect(sent.status).toBe("requires_action");
    expect(sent.pendingActions?.map((a) => [a.id, a.type])).toEqual([["act_1", "tool_approval"], ["act_2", "user_question"]]);
    expect(sent.pendingActions?.[0]).toMatchObject({ toolName: "sandbox_exec", args: { cmd: "ls" } });
    expect(sent.pendingActions?.[1]).toMatchObject({ type: "user_question", allowFreeText: true });
    expect(sent.response.status).toBe("requires_action");
    expect(sent.response.content).toBe("I need your OK.");
    const { conversation: saved, messages } = await transport.getConversation(conversation.id);
    expect(saved.state?.sessionId).toBe("conv-1");
    expect(messages[1].pendingActions).toHaveLength(2);
  });

  it("streams the pause as action_required then a done with the actions", async () => {
    const sse = `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: paused([consoleApproval]) })}\n\n`;
    const fetchMock = vi.fn(async () => new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } }));
    const transport = new ResponsesTransport({ baseUrl: "https://x/v1", fetch: as(fetchMock), defaultAgentId: "support" });
    const conversation = await transport.createConversation({ agentId: "support" });
    const events: StreamEvent[] = [];
    await transport.sendMessageStream(conversation.id, { message: "deploy" }, {
      onActionRequired: (e) => events.push(e),
      onDone: (e) => events.push(e),
    });
    expect(events.map((e) => e.type)).toEqual(["stream.action_required", "stream.done"]);
    const done = events[1];
    expect(done.type === "stream.done" && done.status).toBe("requires_action");
    expect(done.type === "stream.done" && done.pendingActions?.[0].id).toBe("act_1");
  });

  it("answers an approval through the client API and shows the continuation as a new message", async () => {
    const { transport, fetchMock } = setup([paused([consoleApproval]), completed("Deployed.")]);
    expect(typeof transport.resolveAction).toBe("function");
    const conversation = await transport.createConversation({ agentId: "support" });
    await transport.sendMessage(conversation.id, { message: "deploy" });

    const events: string[] = [];
    const result = await transport.resolveAction!(
      conversation.id, "act_1",
      { type: "tool_approval", decision: "allow", comment: "go", approvedArgs: { cmd: "ls -l" }, rememberForSession: true },
      { stream: true, callbacks: { onStart: () => events.push("start"), onActionResolved: () => events.push("resolved"), onText: (_t, full) => events.push(full), onDone: (e) => events.push(e.type) } }
    );
    expect(result).toBeUndefined();

    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/client/v1/agents/sessions/conv-1/actions/act_1");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ decision: "allow", comment: "go", approved_args: { cmd: "ls -l" }, remember_for_session: true });
    expect(events).toEqual(["start", "resolved", "Deployed.", "stream.done"]);

    const { messages } = await transport.getConversation(conversation.id);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "assistant"]);
    expect(messages[1].actionStates?.act_1).toMatchObject({ status: "resolved", resolution: { decision: "allow" } });
    expect(messages[2]).toMatchObject({ content: "Deployed." });
    expect(messages[2].pendingActions).toBeUndefined();
  });

  it("an answer that leaves other actions waiting adds no message", async () => {
    const { transport } = setup([paused([consoleApproval, consoleQuestion]), stillWaiting([consoleQuestion])]);
    const conversation = await transport.createConversation({ agentId: "support" });
    await transport.sendMessage(conversation.id, { message: "go" });
    const reply = await transport.resolveAction!(conversation.id, "act_1", { type: "tool_approval", decision: "deny" });

    expect(reply?.status).toBe("requires_action");
    expect(reply?.pendingActions?.map((a) => a.id)).toEqual(["act_2"]);
    expect(reply?.response.id).toBe((await transport.getConversation(conversation.id)).messages[1].id);
    const { messages } = await transport.getConversation(conversation.id);
    expect(messages).toHaveLength(2);
    expect(messages[1].actionStates?.act_1).toMatchObject({ status: "resolved" });
    expect(messages[1].actionStates?.act_2).toBeUndefined();
  });

  it("refuses to answer an action twice, or one that is not there", async () => {
    const { transport } = setup([paused([consoleApproval]), completed("ok")]);
    const conversation = await transport.createConversation({ agentId: "support" });
    await transport.sendMessage(conversation.id, { message: "go" });
    await transport.resolveAction!(conversation.id, "act_1", { type: "tool_approval", decision: "allow" });
    await expect(transport.resolveAction!(conversation.id, "act_1", { type: "tool_approval", decision: "allow" })).rejects.toMatchObject({ code: "action_not_pending", status: 409 });
    await expect(transport.resolveAction!(conversation.id, "nope", { type: "tool_approval", decision: "allow" })).rejects.toMatchObject({ code: "action_not_pending" });
  });

  it("shows what the server refused an answer with", async () => {
    const queue: Response[] = [json(paused([consoleApproval])), json({ error: { type: "action_expired", message: "lapsed" } }, 410)];
    const fetchMock = vi.fn(async () => queue.shift()!);
    const transport = new ResponsesTransport({ baseUrl: "https://x/v1", fetch: as(fetchMock), defaultAgentId: "a" });
    const conversation = await transport.createConversation({ agentId: "a" });
    await transport.sendMessage(conversation.id, { message: "go" });
    await expect(transport.resolveAction!(conversation.id, "act_1", { type: "tool_approval", decision: "allow" })).rejects.toMatchObject({ code: "action_expired", status: 410 });
  });

  it("can send the answer elsewhere, or leave the cards read-only", async () => {
    const custom = setup([paused([consoleApproval]), completed("ok")], {
      actionUrl: ({ sessionId, actionId, baseUrl }: { sessionId: string; actionId: string; baseUrl: string }) => `${baseUrl}/sessions/${sessionId}/${actionId}/answer`,
    });
    const conversation = await custom.transport.createConversation({ agentId: "support" });
    await custom.transport.sendMessage(conversation.id, { message: "go" });
    await custom.transport.resolveAction!(conversation.id, "act_1", { type: "tool_approval", decision: "allow" });
    expect((custom.fetchMock.mock.calls[1] as unknown as [string])[0]).toBe("https://api.example.com/client/v1/sessions/conv-1/act_1/answer");

    const readOnly = setup([], { resolveActions: false });
    expect(readOnly.transport.resolveAction).toBeUndefined();
  });

  it("keeps why a response stopped, and does not call a plain one stopped", async () => {
    const limited = setup([completed("cut off", { status: "incomplete", stop_reason: "limit", stop_detail: "maxToolCalls", incomplete_details: { reason: "max_tool_calls" } })]);
    let conversation = await limited.transport.createConversation({ agentId: "support" });
    let sent = await limited.transport.sendMessage(conversation.id, { message: "x" });
    expect(sent.response).toMatchObject({ status: "incomplete", stopReason: "limit", stopDetail: "maxToolCalls" });
    expect(sent.stopReason).toBe("limit");

    const plain = setup([completed("fine")]);
    conversation = await plain.transport.createConversation({ agentId: "support" });
    sent = await plain.transport.sendMessage(conversation.id, { message: "x" });
    expect(sent.response.stopReason).toBeUndefined();
    expect(sent.response.status).toBeUndefined();
    expect(sent.status).toBeUndefined();
  });

  it("an ordinary OpenAI response is untouched", async () => {
    const { transport } = setup([{ id: "resp_abc", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "hi" }] }] }]);
    const conversation = await transport.createConversation({ agentId: "support" });
    const sent = await transport.sendMessage(conversation.id, { message: "x" });
    expect(sent.response.content).toBe("hi");
    expect(sent.pendingActions).toBeUndefined();
    expect((await transport.getConversation(conversation.id)).conversation.state?.sessionId).toBeUndefined();
  });

  it("a backend that cannot pause has no way to answer", () => {
    const chat = new ChatCompletionsTransport({ baseUrl: "https://x/v1", fetch: as(vi.fn()) });
    expect(chat.resolveAction).toBeUndefined();
  });
});

describe("A2ATransport and an input-required task", () => {
  const card = { name: "Agent", url: "https://a2a.example.com/rpc" };
  const task = (state: string, extra: Record<string, unknown> = {}) => ({
    jsonrpc: "2.0",
    id: "1",
    result: {
      kind: "task", id: "conv-1:1", contextId: "conv-1",
      status: { state, message: { kind: "message", role: "agent", parts: [{ kind: "text", text: "Waiting for you." }] } },
      artifacts: [],
      ...extra,
    },
  });

  function setup(answers: unknown[], options: Record<string, unknown> = {}) {
    const queue = [...answers];
    const fetchMock = vi.fn(async (url: string) => (url.includes("agent-card") ? json(card) : json(queue.shift())));
    const transport = new A2ATransport({ baseUrl: "https://a2a.example.com", fetch: as(fetchMock), ...options });
    return { transport, fetchMock };
  }

  it("shows the actions in the task's metadata as cards, and leaves them read-only without an answer route", async () => {
    const { transport } = setup([task("input-required", { metadata: { stopReason: "requires_action", pendingActions: [consoleApproval] } })]);
    expect(transport.resolveAction).toBeUndefined();
    const conversation = await transport.createConversation({ agentId: "a2a" });
    const sent = await transport.sendMessage(conversation.id, { message: "deploy" });
    expect(sent.status).toBe("requires_action");
    expect(sent.pendingActions?.[0]).toMatchObject({ id: "act_1", toolName: "sandbox_exec" });
    expect(sent.response.content).toBe("Waiting for you.");
    const { conversation: saved } = await transport.getConversation(conversation.id);
    expect(saved.state).toMatchObject({ contextId: "conv-1", taskId: "conv-1:1" });
  });

  it("answers through the route it is given, then the task is over", async () => {
    const { transport, fetchMock } = setup(
      [task("input-required", { metadata: { pendingActions: [consoleApproval] } }), completed("Deployed.", { id: "resp_conv-1" })],
      { actionUrl: ({ contextId, actionId }: { contextId: string; actionId: string }) => `https://api.example.com/client/v1/agents/sessions/${contextId}/actions/${actionId}` }
    );
    expect(typeof transport.resolveAction).toBe("function");
    const conversation = await transport.createConversation({ agentId: "a2a" });
    await transport.sendMessage(conversation.id, { message: "deploy" });
    await transport.resolveAction!(conversation.id, "act_1", { type: "tool_approval", decision: "allow" });

    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/actions/")) as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://api.example.com/client/v1/agents/sessions/conv-1/actions/act_1");
    expect(JSON.parse(call[1].body as string)).toEqual({ decision: "allow" });
    const { conversation: saved, messages } = await transport.getConversation(conversation.id);
    expect(messages[messages.length - 1].content).toBe("Deployed.");
    expect(saved.state?.taskId).toBeUndefined();
    expect(saved.state?.contextId).toBe("conv-1");
  });

  it("keeps why a completed task stopped early", async () => {
    const { transport } = setup([
      {
        jsonrpc: "2.0", id: "1",
        result: {
          kind: "task", id: "t", contextId: "c",
          status: { state: "completed" },
          metadata: { stopReason: "limit", stopDetail: "maxToolCalls" },
          artifacts: [{ artifactId: "x", parts: [{ kind: "text", text: "partial" }] }],
        },
      },
    ]);
    const conversation = await transport.createConversation({ agentId: "a2a" });
    const sent = await transport.sendMessage(conversation.id, { message: "x" });
    expect(sent.response).toMatchObject({ content: "partial", stopReason: "limit", stopDetail: "maxToolCalls" });
  });
});

describe("AgentSdkTransport and an agent that pauses", () => {
  const approvalState = (...ids: string[]) => ({
    messages: [],
    pendingApprovals: ids.map((id) => ({ id, status: "pending", toolName: "delete_file", args: { path: `/tmp/${id}` }, toolCallId: `tc-${id}`, metadata: { summary: "Deletes a file" } })),
    pendingUserQuestions: [],
    agent: { live: () => 1 },
  });

  function pausingAgent() {
    const invoke = vi.fn(async (input: any) => {
      if (input.pendingApprovals?.some((a: any) => a.status === "pending")) throw new Error("invoked while still pending");
      if (input.pendingApprovals) return { content: "Deleted.", state: { ...input, pendingApprovals: [] } };
      return { content: "", state: approvalState("ap1") };
    });
    const resolveToolApproval = vi.fn((state: any, r: any) => ({
      ...state,
      pendingApprovals: state.pendingApprovals.map((a: any) => (a.id === r.id ? { ...a, status: r.approved ? "approved" : "denied" } : a)),
    }));
    const resolveUserQuestion = vi.fn((state: any) => state);
    const agent = { invoke, resolveToolApproval, resolveUserQuestion } as unknown as AgentSdkAgent;
    return { agent, invoke, resolveToolApproval, resolveUserQuestion };
  }

  it("shows a pause as cards, keeps the state with the thread, and runs on with the answer", async () => {
    const { agent, invoke, resolveToolApproval } = pausingAgent();
    const transport = new AgentSdkTransport({ agents: { a: { agent } } });
    expect(typeof transport.resolveAction).toBe("function");
    const conversation = await transport.createConversation({ agentId: "a" });
    const sent = await transport.sendMessage(conversation.id, { message: "clean up" });

    expect(sent.status).toBe("requires_action");
    expect(sent.pendingActions).toEqual([
      { id: "ap1", type: "tool_approval", toolName: "delete_file", toolCallId: "tc-ap1", summary: "Deletes a file", args: { path: "/tmp/ap1" } },
    ]);
    const kept = (await transport.getConversation(conversation.id)).conversation.state?.sdkState as Record<string, unknown>;
    expect(kept.agent).toBeUndefined(); // the live runtime is not kept

    const reply = await transport.resolveAction!(conversation.id, "ap1", { type: "tool_approval", decision: "allow" });
    expect(resolveToolApproval).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "ap1", approved: true }));
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(reply?.response.content).toBe("Deleted.");
    const saved = await transport.getConversation(conversation.id);
    expect(saved.messages.map((m) => m.role)).toEqual(["user", "assistant", "assistant"]);
    expect(saved.messages[1].actionStates?.ap1.status).toBe("resolved");
    expect(saved.conversation.state?.sdkState).toBeUndefined();
  });

  it("with several actions open, only the last answer runs the agent", async () => {
    const invoke = vi.fn(async (input: any) =>
      input.pendingApprovals?.every((a: any) => a.status !== "pending")
        ? { content: "Both done.", state: { ...input, pendingApprovals: [] } }
        : { content: "", state: approvalState("ap1", "ap2") }
    );
    const resolveToolApproval = vi.fn((state: any, r: any) => ({
      ...state,
      pendingApprovals: state.pendingApprovals.map((a: any) => (a.id === r.id ? { ...a, status: r.approved ? "approved" : "denied" } : a)),
    }));
    const agent = { invoke, resolveToolApproval, resolveUserQuestion: vi.fn() } as unknown as AgentSdkAgent;
    const transport = new AgentSdkTransport({ agents: { a: { agent } } });
    const conversation = await transport.createConversation({ agentId: "a" });
    await transport.sendMessage(conversation.id, { message: "go" });

    const first = await transport.resolveAction!(conversation.id, "ap1", { type: "tool_approval", decision: "allow" });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(first?.pendingActions?.map((a) => a.id)).toEqual(["ap2"]);
    expect((await transport.getConversation(conversation.id)).messages).toHaveLength(2);

    const second = await transport.resolveAction!(conversation.id, "ap2", { type: "tool_approval", decision: "deny" });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(second?.response.content).toBe("Both done.");
  });

  it("answers a question in the SDK's shape", async () => {
    const questionState = {
      messages: [],
      pendingApprovals: [],
      pendingUserQuestions: [{ id: "q1", status: "pending", allowFreeText: true, questions: [{ question: "Which env?", options: [{ label: "Production", value: "prod" }] }] }],
    };
    const invoke = vi.fn(async (input: any) => (input.pendingUserQuestions ? { content: "Using prod.", state: { ...input, pendingUserQuestions: [] } } : { content: "", state: questionState }));
    const resolveUserQuestion = vi.fn((state: any) => ({ ...state, pendingUserQuestions: [{ ...state.pendingUserQuestions[0], status: "answered" }] }));
    const agent = { invoke, resolveToolApproval: vi.fn(), resolveUserQuestion } as unknown as AgentSdkAgent;
    const transport = new AgentSdkTransport({ agents: { a: { agent } } });
    const conversation = await transport.createConversation({ agentId: "a" });
    const sent = await transport.sendMessage(conversation.id, { message: "deploy" });
    expect(sent.pendingActions?.[0]).toMatchObject({ type: "user_question", allowFreeText: true });
    await transport.resolveAction!(conversation.id, "q1", { type: "user_question", answers: { "Which env?": "Production" } });
    expect(resolveUserQuestion).toHaveBeenCalledWith(expect.anything(), { id: "q1", answers: { "Which env?": { values: ["prod"] } }, answeredBy: "user", cancelled: false });
  });

  it("an agent that cannot pause offers no way to answer, and a plain turn clears the kept state", async () => {
    const plain = new AgentSdkTransport({ agents: { a: { agent: { invoke: async () => ({ content: "hi" }) } } } });
    expect(plain.resolveAction).toBeUndefined();

    const { agent } = pausingAgent();
    const transport = new AgentSdkTransport({ agents: { a: { agent } } });
    const conversation = await transport.createConversation({ agentId: "a" });
    await transport.sendMessage(conversation.id, { message: "go" });
    expect((await transport.getConversation(conversation.id)).conversation.state?.sdkState).toBeTruthy();
    (agent as unknown as { invoke: unknown }).invoke = vi.fn(async () => ({ content: "never mind" }));
    await transport.sendMessage(conversation.id, { message: "forget it" });
    expect((await transport.getConversation(conversation.id)).conversation.state?.sdkState).toBeUndefined();
  });

  it("a thread whose state is gone cannot be resumed and says so", async () => {
    const { agent } = pausingAgent();
    const transport = new AgentSdkTransport({ agents: { a: { agent } } });
    const conversation = await transport.createConversation({ agentId: "a" });
    await transport.sendMessage(conversation.id, { message: "go" });
    const saved = await transport.getConversation(conversation.id);
    saved.conversation.state = {};
    await expect(transport.resolveAction!(conversation.id, "ap1", { type: "tool_approval", decision: "allow" })).rejects.toMatchObject({
      code: "action_not_resumable",
    });
  });

  it("a turn cut off by Stop is stored as cancelled", async () => {
    const controller = new AbortController();
    const agent: AgentSdkAgent = {
      invoke: async (_input, config) => {
        controller.abort();
        void config;
        return { content: "half" };
      },
    };
    const transport = new AgentSdkTransport({ agents: { a: { agent } } });
    const conversation = await transport.createConversation({ agentId: "a" });
    await transport.sendMessageStream(conversation.id, { message: "go" }, {}, controller.signal);
    const { messages } = await transport.getConversation(conversation.id);
    expect(messages[1]).toMatchObject({ content: "half", status: "cancelled", stopReason: "cancelled" });
  });
});
