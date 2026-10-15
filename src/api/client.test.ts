import { describe, expect, it, vi } from "vitest";
import { AgentServerClient } from "./client";
import type { StreamEvent } from "../types";

function sse(events: unknown[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("AgentServerClient.resolveAction", () => {
  it("posts the resolution and streams the continuation", async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        { type: "stream.action_resolved", conversationId: "c1", actionId: "a1", resolution: { type: "tool_approval", decision: "allow" }, timestamp: 1 },
        { type: "stream.text", text: "Done", timestamp: 2 },
        { type: "stream.done", conversationId: "c1", messageId: "m2", content: "Done", timestamp: 3 },
      ])
    );
    const client = new AgentServerClient({ baseUrl: "http://x/", fetch: fetchMock as unknown as typeof fetch });

    const seen: string[] = [];
    await client.resolveAction("c1", "a1", { type: "tool_approval", decision: "allow" }, {
      stream: true,
      callbacks: {
        onActionResolved: (e: StreamEvent) => seen.push(e.type),
        onText: (_t, full) => seen.push(`text:${full}`),
        onDone: (e: StreamEvent) => seen.push(e.type),
      },
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://x/conversations/c1/actions/a1");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      resolution: { type: "tool_approval", decision: "allow" },
      stream: true,
    });
    expect(seen).toEqual(["stream.action_resolved", "text:Done", "stream.done"]);
  });

  it("returns JSON without streaming and exposes the error code on 409", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ response: { id: "m" }, status: "completed" }), { status: 200 }));
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: ok as unknown as typeof fetch });
    const res = await client.resolveAction("c1", "a1", { type: "user_question", answers: { q: "v" } });
    expect(res?.status).toBe("completed");
    const [, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ resolution: { type: "user_question", answers: { q: "v" } } });

    const conflict = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: "action_not_pending", message: "Already resolved" } }), { status: 409 })
    );
    const c2 = new AgentServerClient({ baseUrl: "http://x", fetch: conflict as unknown as typeof fetch });
    await expect(c2.resolveAction("c1", "a1", { type: "tool_approval", decision: "deny" })).rejects.toMatchObject({
      message: "Already resolved",
      code: "action_not_pending",
      status: 409,
    });
  });
});

describe("AgentServerClient.sendMessageStream", () => {
  it("reports action_required and the paused done event", async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        { type: "stream.action_required", conversationId: "c1", messageId: "m1", actions: [{ id: "a1", type: "tool_approval", toolName: "t" }], timestamp: 1 },
        { type: "stream.done", conversationId: "c1", messageId: "m1", content: "", status: "requires_action", pendingActions: [{ id: "a1", type: "tool_approval", toolName: "t" }], timestamp: 2 },
      ])
    );
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: fetchMock as unknown as typeof fetch });
    const events: StreamEvent[] = [];
    await client.sendMessageStream("c1", { message: "go" }, {
      onActionRequired: (e) => events.push(e),
      onDone: (e) => events.push(e),
    });
    expect(events.map((e) => e.type)).toEqual(["stream.action_required", "stream.done"]);
  });
});

describe("AgentServerClient title frame", () => {
  it("asks for the title as its own frame only when the caller takes it, and hands the frame over", async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        { type: "stream.done", conversationId: "c1", messageId: "m1", content: "ok", timestamp: 1 },
        { type: "stream.title", conversationId: "c1", title: "Trip to Lisbon", timestamp: 2 },
      ])
    );
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: fetchMock as unknown as typeof fetch });
    const seen: string[] = [];
    await client.sendMessageStream("c1", { message: "go" }, {
      onDone: (e) => seen.push(e.type),
      onTitle: (e) => seen.push(e.type === "stream.title" ? `title:${e.title}` : e.type),
    });
    expect(seen).toEqual(["stream.done", "title:Trip to Lisbon"]);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ message: "go", stream: true, titleFrame: true });

    // a caller without onTitle keeps the title in the done event
    await client.sendMessageStream("c1", { message: "go" }, { onDone: () => undefined });
    const [, plain] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(plain.body as string)).toEqual({ message: "go", stream: true });
  });
});

describe("AgentServerClient stream errors", () => {
  it("passes the code of a stream.error event on, so the UI can show a friendly message", async () => {
    const fetchMock = vi.fn(async () => sse([{ type: "stream.error", error: "Conversation is busy", code: "CONVERSATION_BUSY", timestamp: 1 }]));
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: fetchMock as unknown as typeof fetch });
    const errors: Array<Error & { code?: string }> = [];
    await client.sendMessageStream("c1", { message: "go" }, { onError: (e) => errors.push(e) });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("Conversation is busy");
    expect(errors[0].code).toBe("CONVERSATION_BUSY");
  });

  it("leaves the code off an event that has none", async () => {
    const fetchMock = vi.fn(async () => sse([{ type: "stream.error", error: "boom", timestamp: 1 }]));
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: fetchMock as unknown as typeof fetch });
    const errors: Array<Error & { code?: string }> = [];
    await client.sendMessageStream("c1", { message: "go" }, { onError: (e) => errors.push(e) });
    expect(errors[0].code).toBeUndefined();
  });
});

describe("AgentServerClient search", () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

  it("searchConversations sends q (trimmed) with the filters and the abort signal", async () => {
    const fetchMock = vi.fn(async () =>
      json({ conversations: [{ id: "c1", agentId: "a", searchMatch: { field: "message", messageId: "m1", snippet: "…x…" } }], total: 1, limit: 50, offset: 0, hasMore: false, searchMode: "full" })
    );
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: fetchMock as unknown as typeof fetch });
    const controller = new AbortController();
    const page = await client.searchConversations("  a&b=c  ", { agentId: "a", limit: 50, signal: controller.signal });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://x/conversations?q=a%26b%3Dc&agentId=a&limit=50");
    expect(init.signal).toBe(controller.signal);
    expect(page.searchMode).toBe("full");
    expect(page.conversations[0].searchMatch?.messageId).toBe("m1");
  });

  it("getSearchMode reads features.conversationSearch once", async () => {
    const fetchMock = vi.fn(async () => json({ agents: [], features: { conversationSearch: "title" } }));
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: fetchMock as unknown as typeof fetch });
    expect(await client.getSearchMode()).toBe("title");
    expect(await client.getSearchMode()).toBe("title");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("getSearchMode is false for an older server, and is asked again after a failure", async () => {
    const old = new AgentServerClient({ baseUrl: "http://x", fetch: (async () => json({ agents: [] })) as unknown as typeof fetch });
    expect(await old.getSearchMode()).toBe(false);
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(json({ agents: [], features: { conversationSearch: "full" } }));
    const flaky = new AgentServerClient({ baseUrl: "http://x", fetch: fetchMock as unknown as typeof fetch });
    expect(await flaky.getSearchMode()).toBe(false);
    expect(await flaky.getSearchMode()).toBe("full");
  });
});
