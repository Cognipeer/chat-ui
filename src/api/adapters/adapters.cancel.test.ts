import { describe, expect, it, vi } from "vitest";
import { A2ATransport } from "./a2a";
import { ChatCompletionsTransport } from "./chatCompletions";
import { ResponsesTransport } from "./responses";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const as = (f: unknown) => f as unknown as typeof fetch;

/** An SSE answer that stays open until `finish()`, so a turn can be stopped while it runs. */
function openStream(first: unknown[]) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
  const send = (e: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
  first.forEach(send);
  return {
    response: new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
    send,
    finish: () => controller.close(),
  };
}

const text = (id: string, t: string) => ({
  id, object: "response", status: "completed",
  output: [{ id: "m", type: "message", role: "assistant", content: [{ type: "output_text", text: t }] }],
});

describe("ResponsesTransport.cancel", () => {
  const BASE = "https://api.example.com/v1";

  async function stopMidStream(turnsBefore: number) {
    const calls: Array<{ url: string; method?: string }> = [];
    let n = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      if (url.endsWith("/cancel")) return json({ cancelled: true });
      n += 1;
      if (n <= turnsBefore) return json(text(`resp_${n}`, "ok"));
      return stream.response;
    });
    const stream = openStream([{ type: "response.created", response: { id: "resp_live", status: "in_progress" } }]);
    const transport = new ResponsesTransport({ baseUrl: BASE, fetch: as(fetchMock), defaultAgentId: "a" });
    const conversation = await transport.createConversation({ agentId: "a" });
    for (let i = 0; i < turnsBefore; i++) await transport.sendMessage(conversation.id, { message: "earlier" });

    const running = transport.sendMessageStream(conversation.id, { message: "go" }, {});
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(turnsBefore + 1));
    await new Promise((r) => setTimeout(r, 10)); // the first event is read
    const result = await transport.cancel!(conversation.id);
    stream.send({ type: "response.completed", response: text("resp_live", "done") });
    stream.finish();
    await running;
    return { result, calls };
  }

  it("stops the first turn, whose id only the first stream event carries", async () => {
    const { result, calls } = await stopMidStream(0);
    expect(result).toEqual({ cancelled: true });
    expect(calls.at(-1)).toEqual({ url: `${BASE}/responses/resp_live/cancel`, method: "POST" });
  });

  it("stops a later turn by its own response, not the previous one", async () => {
    const { result, calls } = await stopMidStream(1);
    expect(result).toEqual({ cancelled: true });
    const cancels = calls.filter((c) => c.url.endsWith("/cancel"));
    expect(cancels).toEqual([{ url: `${BASE}/responses/resp_live/cancel`, method: "POST" }]);
  });

  it("has nothing to stop when the server keeps no state", async () => {
    const fetchMock = vi.fn(async () => json({}));
    const transport = new ResponsesTransport({ baseUrl: BASE, fetch: as(fetchMock), serverState: false });
    const c = await transport.createConversation({ agentId: "a" });
    expect(await transport.cancel!(c.id)).toEqual({ cancelled: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("A2ATransport.cancel", () => {
  const RPC = "https://a2a.example.com/rpc";
  const rpcBodies = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));

  it("sends tasks/cancel with the task the stream named", async () => {
    const stream = openStream([{ jsonrpc: "2.0", result: { kind: "status-update", taskId: "task_ctx-1_3", contextId: "ctx-1", status: { state: "working" } } }]);
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      if (body.method === "tasks/cancel") return json({ jsonrpc: "2.0", id: body.id, result: { kind: "task", id: body.params.id, status: { state: "canceled" } } });
      return stream.response;
    });
    const transport = new A2ATransport({ baseUrl: "https://a2a.example.com", rpcUrl: RPC, fetch: as(fetchMock) });
    const c = await transport.createConversation({ agentId: "a2a" });
    const running = transport.sendMessageStream(c.id, { message: "go" }, {});
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(await transport.cancel!(c.id)).toEqual({ cancelled: true });
    stream.finish();
    await running.catch(() => undefined);
    expect(rpcBodies(fetchMock).at(-1)).toMatchObject({ method: "tasks/cancel", params: { id: "task_ctx-1_3" } });
  });

  it("derives the Console's task id from the context when the answer comes in one piece", async () => {
    let release!: (r: Response) => void;
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      if (body.method === "tasks/cancel") return json({ jsonrpc: "2.0", id: body.id, result: { kind: "task", id: body.params.id, status: { state: "canceled" } } });
      return new Promise<Response>((r) => (release = r));
    });
    const transport = new A2ATransport({ baseUrl: "https://a2a.example.com", rpcUrl: RPC, fetch: as(fetchMock) });
    const c = await transport.createConversation({ agentId: "a2a" });
    // a later turn: the conversation already has a context; thread holds 2 earlier messages
    c.state = { contextId: "ctx-9" };
    (transport as any).store.save({ conversation: c, messages: [
      { id: "1", conversationId: c.id, role: "user", content: "a", createdAt: new Date(), updatedAt: new Date() },
      { id: "2", conversationId: c.id, role: "assistant", content: "b", createdAt: new Date(), updatedAt: new Date() },
    ] });
    const running = transport.sendMessage(c.id, { message: "go" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await transport.cancel!(c.id)).toEqual({ cancelled: true });
    expect(rpcBodies(fetchMock).at(-1)).toMatchObject({ method: "tasks/cancel", params: { id: "task_ctx-9_3" } });
    release(json({ jsonrpc: "2.0", result: { kind: "task", id: "task_ctx-9_3", contextId: "ctx-9", status: { state: "canceled" } } }));
    await running.catch(() => undefined);
  });

  it("is a quiet no when the server says the task is not running", async () => {
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) =>
      json({ jsonrpc: "2.0", id: JSON.parse(init?.body as string).id, error: { code: -32004, message: "nothing to cancel" } }));
    const transport = new A2ATransport({ baseUrl: "https://a2a.example.com", rpcUrl: RPC, fetch: as(fetchMock) });
    const c = await transport.createConversation({ agentId: "a2a" });
    c.state = { contextId: "ctx-1", taskId: "task_ctx-1_1" };
    expect(await transport.cancel!(c.id)).toEqual({ cancelled: false });
  });

  it("has no id to cancel before the server named a context", async () => {
    const fetchMock = vi.fn();
    const transport = new A2ATransport({ baseUrl: "https://a2a.example.com", rpcUrl: RPC, fetch: as(fetchMock) });
    const c = await transport.createConversation({ agentId: "a2a" });
    expect(await transport.cancel!(c.id)).toEqual({ cancelled: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ChatCompletionsTransport", () => {
  it("has no server-side stop: Stop only aborts the request", () => {
    const transport = new ChatCompletionsTransport({ baseUrl: "https://api.example.com/v1" });
    expect(transport.cancel).toBeUndefined();
  });
});
