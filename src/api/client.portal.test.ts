import { describe, expect, it, vi } from "vitest";
import { AgentServerClient } from "./client";
import type { StreamCallbacks } from "./transport";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sse = (...events: object[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
const as = (f: unknown) => f as unknown as typeof fetch;

type Call = [string, RequestInit];
const calls = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls as unknown as Call[];

describe("regenerate and edit", () => {
  it("regenerates the newest answer with the stream flag and delivers the same frames as a message", async () => {
    const fetchMock = vi.fn(async () =>
      sse(
        { type: "stream.start", conversationId: "c1", messageId: "m2", timestamp: 1 },
        { type: "stream.text", text: "New answer", timestamp: 2 },
        { type: "stream.done", conversationId: "c1", messageId: "m2", content: "New answer", timestamp: 3 }
      )
    );
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock) });
    const texts: string[] = [];
    const done = vi.fn();
    const callbacks: StreamCallbacks = { onText: (_t, full) => texts.push(full), onDone: done };
    await client.regenerateMessage("c1", "m 2", { stream: true, callbacks });

    const [url, init] = calls(fetchMock)[0];
    expect(url).toBe("http://x/api/conversations/c1/messages/m%202/regenerate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ stream: true });
    expect(texts).toEqual(["New answer"]);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("edits a message with its new text and the files it keeps", async () => {
    const fetchMock = vi.fn(async () => json({ message: {}, response: {} }));
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock) });
    await client.editMessage("c1", "u1", { content: "better question", fileIds: ["f1"] }, { stream: false });
    const [url, init] = calls(fetchMock)[0];
    expect(url).toBe("http://x/api/conversations/c1/messages/u1/edit");
    expect(JSON.parse(String(init.body))).toEqual({ content: "better question", fileIds: ["f1"] });
  });

  it("throws the server's refusal with its code", async () => {
    const fetchMock = vi.fn(async () => json({ error: { code: "conversation_busy", message: "busy" } }, 409));
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock) });
    await expect(client.regenerateMessage("c1", "m2")).rejects.toMatchObject({ code: "conversation_busy", status: 409 });
  });
});

describe("feedback", () => {
  it("sends the rating with reasons and comment, and returns what the server stored", async () => {
    const fetchMock = vi.fn(async () => json({ feedback: { rating: "down", reasons: ["too_long"], comment: "trimmed" } }));
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock) });
    const stored = await client.sendFeedback("c1", "m2", { rating: "down", reasons: ["too_long"], comment: "too wordy" });
    const [url, init] = calls(fetchMock)[0];
    expect(url).toBe("http://x/api/conversations/c1/messages/m2/feedback");
    expect(JSON.parse(String(init.body))).toEqual({ rating: "down", reasons: ["too_long"], comment: "too wordy" });
    expect(stored).toEqual({ rating: "down", reasons: ["too_long"], comment: "trimmed" });
  });

  it("withdraws a rating with null and tolerates an empty answer", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock) });
    expect(await client.sendFeedback("c1", "m2", { rating: null })).toBeNull();
    expect(JSON.parse(String(calls(fetchMock)[0][1].body))).toEqual({ rating: null });
    expect(await client.sendFeedback("c1", "m2", { rating: "up" })).toBeUndefined();
  });
});

describe("history", () => {
  it("renames and pins through the conversation PATCH", async () => {
    const fetchMock = vi.fn(async () => json({}));
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock) });
    await client.renameConversation("c1", "New title");
    await client.pinConversation("c1", true);
    expect(calls(fetchMock).map(([url, init]) => [init.method, url, JSON.parse(String(init.body))])).toEqual([
      ["PATCH", "http://x/api/conversations/c1", { title: "New title" }],
      ["PATCH", "http://x/api/conversations/c1", { metadata: { pinned: true } }],
    ]);
  });

  it("lists a pinned conversation with its pinned flag", async () => {
    const fetchMock = vi.fn(async () =>
      json({
        conversations: [
          { id: "a", agentId: "x", metadata: { pinned: true } },
          { id: "b", agentId: "x" },
        ],
        total: 2,
        limit: 20,
        offset: 0,
        hasMore: false,
      })
    );
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock) });
    const page = await client.getConversations();
    expect(page.conversations.map((c) => c.pinned)).toEqual([true, undefined]);
  });

  it("bulk-deletes in chunks of 100 and reports who is gone and who is not", async () => {
    const ids = Array.from({ length: 130 }, (_, i) => `c${i}`);
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const sent = (JSON.parse(String(init.body)) as { ids: string[] }).ids;
      return json({ deleted: sent.filter((id) => id !== "c5"), failed: sent.includes("c5") ? [{ id: "c5", code: "forbidden" }] : [] });
    });
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock) });
    const result = await client.deleteConversations(ids);
    expect(calls(fetchMock as never).map(([url]) => url)).toEqual(["http://x/api/conversations/bulk-delete", "http://x/api/conversations/bulk-delete"]);
    expect((JSON.parse(String(calls(fetchMock as never)[0][1].body)) as { ids: string[] }).ids).toHaveLength(100);
    expect(result.deleted).toHaveLength(129);
    expect(result.failed).toEqual([{ id: "c5", code: "forbidden" }]);
  });

  it("treats a server that lists nothing as having deleted the chunk, and one that lists only failures as having deleted the rest", async () => {
    const empty = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(vi.fn(async () => new Response(null, { status: 204 }))) });
    expect(await empty.deleteConversations(["a", "b"])).toEqual({ deleted: ["a", "b"], failed: [] });
    const partial = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(vi.fn(async () => json({ failed: ["b"] }))) });
    expect(await partial.deleteConversations(["a", "b"])).toEqual({ deleted: ["a"], failed: [{ id: "b" }] });
  });

  it("falls back to deleting one by one on a server without the bulk route", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/bulk-delete")) return json({ error: { code: "not_found" } }, 404);
      return init.method === "DELETE" && url.endsWith("/c2") ? json({ error: { code: "forbidden" } }, 403) : new Response(null, { status: 204 });
    });
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock) });
    expect(await client.deleteConversations(["c1", "c2"])).toEqual({ deleted: ["c1"], failed: [{ id: "c2", code: "forbidden" }] });
  });

  it("surfaces any other failure of the bulk route", async () => {
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(vi.fn(async () => json({ error: { code: "forbidden" } }, 403))) });
    await expect(client.deleteConversations(["a"])).rejects.toMatchObject({ status: 403 });
  });
});

describe("export", () => {
  it("fetches the file with the format and the tools flag, and takes its name from the server", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("# chat", { status: 200, headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": 'attachment; filename="chat.md"' } })
    );
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock) });
    const result = await client.exportConversation("c1", { format: "md", includeTools: true });
    const [url, init] = calls(fetchMock)[0];
    expect(url).toBe("http://x/api/conversations/c1/export?format=md&tools=1");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(result.filename).toBe("chat.md");
    expect(result.contentType).toBe("text/markdown");
    expect(result.blob.size).toBe(6);
  });

  it("reports an HTML answer so the page can print it", async () => {
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(vi.fn(async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }))) });
    const result = await client.exportConversation("c1", { format: "pdf" });
    expect(result.contentType).toBe("text/html");
    expect(result.filename).toBe("conversation.pdf");
  });

  it("throws the server's refusal", async () => {
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(vi.fn(async () => json({ error: { code: "export_disabled" } }, 403))) });
    await expect(client.exportConversation("c1", { format: "json" })).rejects.toMatchObject({ code: "export_disabled" });
  });
});
