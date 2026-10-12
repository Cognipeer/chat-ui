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
  it("renames and pins through the conversation PATCH (the pin is a top-level field)", async () => {
    const fetchMock = vi.fn(async () => json({}));
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock) });
    await client.renameConversation("c1", "New title");
    await client.pinConversation("c1", true);
    await client.pinConversation("c1", false);
    expect(calls(fetchMock).map(([url, init]) => [init.method, url, JSON.parse(String(init.body))])).toEqual([
      ["PATCH", "http://x/api/conversations/c1", { title: "New title" }],
      ["PATCH", "http://x/api/conversations/c1", { pinned: true }],
      ["PATCH", "http://x/api/conversations/c1", { pinned: false }],
    ]);
  });

  it("resolves with the pin the server stored, read from the conversation it answers with", async () => {
    // agent-server answers the conversation itself, with `pinned: true` only while it is pinned
    const pinnedAnswer = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(vi.fn(async () => json({ id: "c1", agentId: "a", pinned: true, metadata: { pinned: true } }))) });
    expect(await pinnedAnswer.pinConversation("c1", true)).toBe(true);
    const unpinnedAnswer = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(vi.fn(async () => json({ id: "c1", agentId: "a", metadata: {} }))) });
    expect(await unpinnedAnswer.pinConversation("c1", false)).toBe(false);
    // a server that ignored the pin looks exactly like an unpinned conversation
    expect(await unpinnedAnswer.pinConversation("c1", true)).toBe(false);
    const wrapped = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(vi.fn(async () => json({ conversation: { id: "c1", metadata: { pinned: true } } }))) });
    expect(await wrapped.pinConversation("c1", true)).toBe(true);
    // an answer that is not a conversation says nothing
    const silent = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(vi.fn(async () => json({}))) });
    expect(await silent.pinConversation("c1", true)).toBeUndefined();
  });

  describe("unpinning against an answer that echoes the pin it just removed", () => {
    // (the PATCH answer is the conversation as it was before the write; the GET that follows is how it is now)
    const stale = { id: "c1", agentId: "a", metadata: { pinned: true, pinnedAt: "2026-10-01T00:00:00.000Z" } };
    const sequence = (...answers: Array<Response | Error>) => {
      const queue = [...answers];
      return vi.fn(async () => {
        const next = queue.shift();
        if (!next) throw new Error("unexpected request");
        if (next instanceof Error) throw next;
        return next;
      });
    };
    const methods = (mock: ReturnType<typeof vi.fn>) => calls(mock).map(([url, init]) => `${init.method} ${url.replace("http://x/api", "")}`);

    it("trusts the conversation as it is now when it is not pinned", async () => {
      const fetchMock = sequence(json(stale), json({ conversation: { id: "c1", agentId: "a", metadata: {} }, messages: [] }));
      const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock) });
      expect(await client.pinConversation("c1", false)).toBe(false);
      expect(methods(fetchMock)).toEqual(["PATCH /conversations/c1", "GET /conversations/c1?limit=1"]);
    });

    it("still says pinned when the conversation as it is now is pinned", async () => {
      const fetchMock = sequence(json(stale), json({ conversation: { ...stale, pinned: true }, messages: [] }));
      const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock) });
      expect(await client.pinConversation("c1", false)).toBe(true);
    });

    it("lets the unpin the server accepted stand when the conversation cannot be read again", async () => {
      const refused = sequence(json(stale), json({ error: { code: "NOT_FOUND", message: "gone" } }, 404));
      expect(await new AgentServerClient({ baseUrl: "http://x/api", fetch: as(refused) }).pinConversation("c1", false)).toBeUndefined();
      const offline = sequence(json(stale), new TypeError("Failed to fetch"));
      expect(await new AgentServerClient({ baseUrl: "http://x/api", fetch: as(offline) }).pinConversation("c1", false)).toBeUndefined();
    });

    it("asks for nothing more when the answer already says unpinned, or when pinning", async () => {
      const unpinned = sequence(json({ id: "c1", agentId: "a", metadata: {} }));
      expect(await new AgentServerClient({ baseUrl: "http://x/api", fetch: as(unpinned) }).pinConversation("c1", false)).toBe(false);
      expect(unpinned).toHaveBeenCalledTimes(1);
      // a pin that the answer does not show is taken as it is: only an unpin has an echo to doubt
      const ignored = sequence(json({ id: "c1", agentId: "a", metadata: {} }));
      expect(await new AgentServerClient({ baseUrl: "http://x/api", fetch: as(ignored) }).pinConversation("c1", true)).toBe(false);
      expect(ignored).toHaveBeenCalledTimes(1);
    });

    it("passes a refusal of the unpin itself on", async () => {
      const fetchMock = sequence(json({ error: { code: "action_disabled", message: "Pinning is off" } }, 403));
      const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock) });
      await expect(client.pinConversation("c1", false)).rejects.toMatchObject({ status: 403, code: "action_disabled" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
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

  it("bulk-deletes in chunks of 100 and reports who is gone and who is not (the older { deleted[], failed[] } answer)", async () => {
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

  it("reads the answer agent-server really gives: results per id and a count", async () => {
    // POST /conversations/bulk-delete of agent-server 0.3.0
    const body = {
      results: [
        { id: "a", status: "deleted" },
        { id: "b", status: "not_found" },
        { id: "c", status: "busy", message: "A run is in progress on another node" },
        { id: "d", status: "error", message: "The conversation could not be deleted" },
        { id: "e", status: "deleted" },
      ],
      deleted: 2,
    };
    const fetchMock = vi.fn(async () => json(body));
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock) });
    expect(await client.deleteConversations(["a", "b", "c", "d", "e"])).toEqual({
      deleted: ["a", "e"],
      failed: [
        { id: "b", code: "not_found" },
        { id: "c", code: "busy", message: "A run is in progress on another node" },
        { id: "d", code: "error", message: "The conversation could not be deleted" },
      ],
    });
  });

  it("reads every id of an all-deleted agent-server answer as deleted", async () => {
    const client = new AgentServerClient({
      baseUrl: "http://x/api",
      fetch: as(vi.fn(async () => json({ results: [{ id: "a", status: "deleted" }, { id: "b", status: "deleted" }], deleted: 2 }))),
    });
    expect(await client.deleteConversations(["a", "b"])).toEqual({ deleted: ["a", "b"], failed: [] });
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

  it("asks for the print view when the server has no PDF renderer (501 export_format_unsupported)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("format=pdf")) return json({ error: { code: "export_format_unsupported", message: "This server has no PDF renderer." } }, 501);
      return new Response("<html>print me</html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8", "content-disposition": 'attachment; filename="chat.html"' } });
    });
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock) });
    const result = await client.exportConversation("c1", { format: "pdf", includeTools: false });
    expect(calls(fetchMock).map(([url]) => url)).toEqual([
      "http://x/api/conversations/c1/export?format=pdf&tools=0",
      "http://x/api/conversations/c1/export?format=html&tools=0",
    ]);
    expect(result.contentType).toBe("text/html");
    expect(result.blob.size).toBe("<html>print me</html>".length);
  });

  it("reports the 501 when the print view is refused too, and does not retry other refusals", async () => {
    const refuse = vi.fn(async (url: string) =>
      url.includes("format=pdf") ? json({ error: { code: "export_format_unsupported" } }, 501) : json({ error: { code: "VALIDATION_ERROR" } }, 400)
    );
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(refuse) });
    await expect(client.exportConversation("c1", { format: "pdf" })).rejects.toMatchObject({ status: 501, code: "export_format_unsupported" });
    const other = vi.fn(async () => json({ error: { code: "export_disabled" } }, 403));
    const forbidden = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(other) });
    await expect(forbidden.exportConversation("c1", { format: "pdf" })).rejects.toMatchObject({ status: 403 });
    expect(other).toHaveBeenCalledTimes(1);
    const md = vi.fn(async () => json({ error: { code: "export_format_unsupported" } }, 501));
    await expect(new AgentServerClient({ baseUrl: "http://x/api", fetch: as(md) }).exportConversation("c1", { format: "md" })).rejects.toMatchObject({ status: 501 });
    expect(md).toHaveBeenCalledTimes(1);
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
