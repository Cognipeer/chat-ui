import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentServerClient } from "./client";
import type { ConversationEvent } from "../types";

const encoder = new TextEncoder();

/** An event-stream response whose frames the test pushes by hand. */
function liveStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
  return {
    response: new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
    push: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
  };
}

const frame = (seq: number, type: string, data: Record<string, unknown> = {}, runId = "run_1") =>
  `id: ${seq}\nevent: ${type}\ndata: ${JSON.stringify({ seq, type, data, run_id: runId, created_at: "2026-10-11T10:00:00.000Z" })}\n\n`;

const textResponse = (text: string) =>
  new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const as = (f: unknown) => f as unknown as typeof fetch;

describe("AgentServerClient.followEvents", () => {
  it("reads the replayed and live events in order, with their ids, run ids and the live text deltas", async () => {
    const fetchMock = vi.fn(async () =>
      textResponse(
        [
          ": open\n\n",
          frame(8, "agent.tool_use", { tool_call_id: "t1", name: "search", args: { q: "x" } }),
          `event: agent.message.delta\ndata: ${JSON.stringify({ text: "Hel" })}\n\n`,
          ": ping\n\n",
          frame(9, "agent.message", { content: "Hello", message_id: "m2" }),
          frame(10, "session.status_idle", { stop_reason: "end_turn" }),
        ].join("")
      )
    );
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: as(fetchMock), reconnect: { retries: 0 } });
    const controller = new AbortController();
    const seen: ConversationEvent[] = [];
    await client.followEvents("c1", {
      after: 7,
      signal: controller.signal,
      onEvent: (e) => {
        seen.push(e);
        if (e.type === "session.status_idle") controller.abort();
      },
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://x/api/conversations/c1/events/stream?after=7");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Accept).toBe("text/event-stream");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(seen.map((e) => e.type)).toEqual(["agent.tool_use", "agent.message.delta", "agent.message", "session.status_idle"]);
    expect(seen[0]).toMatchObject({ seq: 8, runId: "run_1", createdAt: "2026-10-11T10:00:00.000Z", data: { name: "search", args: { q: "x" } } });
    expect(seen[1]).toEqual({ type: "agent.message.delta", data: { text: "Hel" } });
    expect(seen[1].seq).toBeUndefined();
    expect(seen[3].seq).toBe(10);
  });

  it("asks for the given event types", async () => {
    const fetchMock = vi.fn(async () => textResponse(frame(1, "session.status_idle")));
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: as(fetchMock) });
    const controller = new AbortController();
    await client.followEvents("c1", { types: ["agent.message", "session.status_idle"], signal: controller.signal, onEvent: () => controller.abort() });
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("http://x/conversations/c1/events/stream?after=0&types=agent.message%2Csession.status_idle");
  });

  it("opens the stream again from the last event when the server closes it, without repeating or losing one", async () => {
    const urls: string[] = [];
    const responses = [
      textResponse(frame(1, "agent.tool_use", { tool_call_id: "t1", name: "a" }) + frame(2, "agent.tool_result", { tool_call_id: "t1", ok: true })),
      textResponse(frame(3, "agent.message", { content: "x", message_id: "m" }) + frame(4, "session.status_idle", { stop_reason: "end_turn" })),
    ];
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(url);
      return responses.shift()!;
    });
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: as(fetchMock), reconnect: { delayMs: 1, maxDelayMs: 1 } });
    const controller = new AbortController();
    const reconnects: number[] = [];
    const types: string[] = [];
    await client.followEvents("c1", {
      signal: controller.signal,
      onReconnect: (n) => reconnects.push(n),
      onEvent: (e) => {
        types.push(`${e.seq}:${e.type}`);
        if (e.type === "session.status_idle") controller.abort();
      },
    });
    expect(urls).toEqual(["http://x/conversations/c1/events/stream?after=0", "http://x/conversations/c1/events/stream?after=2"]);
    expect(types).toEqual(["1:agent.tool_use", "2:agent.tool_result", "3:agent.message", "4:session.status_idle"]);
    expect(reconnects).toEqual([1]);
  });

  it("opens it again after a network error, with backoff, and gives up after the allowed failures", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("network down");
      return textResponse(frame(1, "session.status_idle", { stop_reason: "end_turn" }));
    });
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: as(fetchMock), reconnect: { delayMs: 1, maxDelayMs: 2 } });
    const controller = new AbortController();
    const seen: string[] = [];
    await client.followEvents("c1", { signal: controller.signal, onEvent: (e) => { seen.push(e.type); controller.abort(); } });
    expect(calls).toBe(2);
    expect(seen).toEqual(["session.status_idle"]);

    const always = vi.fn(async () => {
      throw new TypeError("still down");
    });
    const failing = new AgentServerClient({ baseUrl: "http://x", fetch: as(always), reconnect: { retries: 2, delayMs: 1, maxDelayMs: 1 } });
    await expect(failing.followEvents("c1", { onEvent: () => {} })).rejects.toThrow("still down");
    expect(always).toHaveBeenCalledTimes(3);
  });

  it("throws a refusal that trying again cannot fix, with its code", async () => {
    const fetchMock = vi.fn(async () => json({ error: { code: "NOT_FOUND", message: "Conversation not found" } }, 404));
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: as(fetchMock), reconnect: { delayMs: 1 } });
    await expect(client.followEvents("c1", { onEvent: () => {} })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tries again after a 503", async () => {
    const answers = [json({ error: { code: "INTERNAL_ERROR", message: "down" } }, 503), textResponse(frame(1, "session.status_idle"))];
    const fetchMock = vi.fn(async () => answers.shift()!);
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: as(fetchMock), reconnect: { delayMs: 1 } });
    const controller = new AbortController();
    await client.followEvents("c1", { signal: controller.signal, onEvent: () => controller.abort() });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops at once when aborted, even in the middle of the wait before a reconnect", async () => {
    const live = liveStream();
    const fetchMock = vi.fn(async () => live.response);
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: as(fetchMock) });
    const controller = new AbortController();
    const seen: string[] = [];
    const done = client.followEvents("c1", { signal: controller.signal, onEvent: (e) => seen.push(e.type) });
    live.push(frame(1, "agent.tool_use", { tool_call_id: "t", name: "n" }));
    await vi.waitFor(() => expect(seen).toEqual(["agent.tool_use"]));
    controller.abort();
    await expect(done).resolves.toBeUndefined();
  });

  it("sends the credentials it was given", async () => {
    const fetchMock = vi.fn(async () => textResponse(frame(1, "session.status_idle")));
    const client = new AgentServerClient({ baseUrl: "http://x", authorization: "Bearer t", getHeaders: async () => ({ "X-User-Id": "u1" }), fetch: as(fetchMock) });
    const controller = new AbortController();
    await client.followEvents("c1", { signal: controller.signal, onEvent: () => controller.abort() });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: "Bearer t", "X-User-Id": "u1" });
  });
});

describe("AgentServerClient.cancel", () => {
  it("posts with no body and reads what the server says", async () => {
    const fetchMock = vi.fn(async () =>
      json({ cancelled: true, runId: "run_1", settled: true, cancelledActionIds: ["a1"], stopReason: "cancelled", runtime: { status: "idle", stopReason: "cancelled", lastEventSeq: 14, pendingActionIds: [] } })
    );
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: as(fetchMock) });
    const result = await client.cancel("c1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://x/conversations/c1/cancel");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(result).toEqual({
      cancelled: true,
      runId: "run_1",
      settled: true,
      cancelledActionIds: ["a1"],
      stopReason: "cancelled",
      runtime: { status: "idle", stopReason: "cancelled", lastEventSeq: 14, pendingActionIds: [] },
    });
  });

  it("a 202 is a run that is still winding down; nothing to cancel is not an error", async () => {
    const accepted = vi.fn(async () => json({ cancelled: true, runId: "run_1", settled: false }, 202));
    expect((await new AgentServerClient({ baseUrl: "http://x", fetch: as(accepted) }).cancel("c1")).settled).toBe(false);
    const nothing = vi.fn(async () => json({ cancelled: false, settled: true, runtime: { status: "idle", lastEventSeq: 3 } }));
    expect(await new AgentServerClient({ baseUrl: "http://x", fetch: as(nothing) }).cancel("c1")).toMatchObject({ cancelled: false, settled: true });
  });

  it("throws what the server refused with", async () => {
    const forbidden = vi.fn(async () => json({ error: { code: "FORBIDDEN", message: "not yours" } }, 403));
    await expect(new AgentServerClient({ baseUrl: "http://x", fetch: as(forbidden) }).cancel("c1")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});

describe("AgentServerClient budget and continue", () => {
  it("sets the budget with a PATCH and normalizes what comes back", async () => {
    const fetchMock = vi.fn(async () =>
      json({ id: "c1", budget: { maxCostUsd: 20, onReach: "pause" }, spentUsd: 0.42, runtime: { status: "idle", stopReason: "budget_reached", lastEventSeq: 9, pendingActionIds: [] } })
    );
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: as(fetchMock) });
    const updated = await client.updateBudget("c1", { maxCostUsd: 20, onReach: "pause" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://x/conversations/c1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ budget: { maxCostUsd: 20, onReach: "pause" } });
    expect(updated).toMatchObject({ id: "c1", budget: { maxCostUsd: 20, onReach: "pause" }, spentUsd: 0.42, runtime: { status: "idle", stopReason: "budget_reached" } });
  });

  it("removes it with null, and shows the refusal", async () => {
    const fetchMock = vi.fn(async () => json({ id: "c1", budget: null }));
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: as(fetchMock) });
    expect((await client.updateBudget("c1", null)).budget).toBeNull();
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ budget: null });

    const refused = vi.fn(async () => json({ error: { code: "budget_forbidden", message: "needs authorizeBudget" } }, 403));
    await expect(new AgentServerClient({ baseUrl: "http://x", fetch: as(refused) }).updateBudget("c1", { maxCostUsd: 9, onReach: "pause" })).rejects.toMatchObject({
      code: "budget_forbidden",
      status: 403,
    });
  });

  it("reads the conversation's runtime and budget when it is loaded, dropping what is not well-formed", async () => {
    const fetchMock = vi.fn(async () =>
      json({
        conversation: { id: "c1", agentId: "a", runtime: { status: "running", lastEventSeq: 7, activeRunId: "run_1", pendingActionIds: [] }, budget: { maxCostUsd: 5 }, spentUsd: 1 },
        messages: [],
      })
    );
    const { conversation } = await new AgentServerClient({ baseUrl: "http://x", fetch: as(fetchMock) }).getConversation("c1");
    expect(conversation.runtime).toEqual({ status: "running", lastEventSeq: 7, activeRunId: "run_1", pendingActionIds: [] });
    expect(conversation.budget).toEqual({ maxCostUsd: 5, onReach: "pause" });

    const junk = vi.fn(async () => json({ conversation: { id: "c1", agentId: "a", runtime: { status: "dancing" } }, messages: [] }));
    expect((await new AgentServerClient({ baseUrl: "http://x", fetch: as(junk) }).getConversation("c1")).conversation.runtime).toBeUndefined();
  });

  it("keeps the runtime of each row of the conversation list", async () => {
    const fetchMock = vi.fn(async () =>
      json({
        conversations: [
          { id: "c1", agentId: "a", title: "x", runtime: { status: "requires_action", lastEventSeq: 3, pendingActionIds: ["a1"] } },
          { id: "c2", agentId: "a", title: "y", runtime: { nonsense: true } },
        ],
        total: 2, limit: 20, offset: 0, hasMore: false,
      })
    );
    const page = await new AgentServerClient({ baseUrl: "http://x", fetch: as(fetchMock) }).getConversations();
    expect(page.conversations[0].runtime?.status).toBe("requires_action");
    expect(page.conversations[1].runtime).toBeUndefined();
  });

  it("continues with a JSON body, or streams the continuation", async () => {
    const plain = vi.fn(async () => json({ response: { id: "m2", content: "ok" } }));
    const res = await new AgentServerClient({ baseUrl: "http://x", fetch: as(plain) }).continueConversation("c1");
    const [url, init] = plain.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://x/conversations/c1/continue");
    expect(init.method).toBe("POST");
    expect(res).toMatchObject({ response: { id: "m2" } });

    const streamed = vi.fn(async () =>
      textResponse(`data: ${JSON.stringify({ type: "stream.text", text: "ok", timestamp: 1 })}\n\ndata: ${JSON.stringify({ type: "stream.done", conversationId: "c1", messageId: "m2", content: "ok", stopReason: "end_turn", timestamp: 2 })}\n\n`)
    );
    const seen: string[] = [];
    const out = await new AgentServerClient({ baseUrl: "http://x", fetch: as(streamed) }).continueConversation("c1", {
      stream: true,
      callbacks: { onText: (_t, full) => seen.push(full), onDone: (e) => seen.push(e.type) },
    });
    expect(out).toBeUndefined();
    expect(JSON.parse((streamed.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ stream: true });
    expect(seen).toEqual(["ok", "stream.done"]);
  });

  it("a refused continue carries the server's code and the figures", async () => {
    const fetchMock = vi.fn(async () =>
      json({ error: { code: "budget_reached", message: "used up", details: { spentUsd: 1.02, maxCostUsd: 1, onReach: "pause" } } }, 402)
    );
    await expect(new AgentServerClient({ baseUrl: "http://x", fetch: as(fetchMock) }).continueConversation("c1")).rejects.toMatchObject({
      code: "budget_reached",
      status: 402,
      details: { spentUsd: 1.02, maxCostUsd: 1 },
    });
  });
});

describe("AgentServerClient files", () => {
  it("lists the files a conversation holds, with how many it may hold", async () => {
    const fetchMock = vi.fn(async () =>
      json({
        files: [
          { id: "f1", name: "a.pdf", mimeType: "application/pdf", size: 10, expiresAt: "2026-11-10T00:00:00.000Z", conversationId: "c1", userId: "u" },
          { id: "f2", name: "b.png", mimeType: "image/png", size: 20 },
        ],
        total: 2, limit: 200, offset: 0, hasMore: false, maxFiles: 10,
      })
    );
    const listed = await new AgentServerClient({ baseUrl: "http://x", fetch: as(fetchMock) }).listFiles("c1");
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("http://x/conversations/c1/files?limit=200");
    expect(listed.total).toBe(2);
    expect(listed.maxFiles).toBe(10);
    expect(listed.hasMore).toBeUndefined();
    expect(listed.files[0]).toEqual({ id: "f1", name: "a.pdf", mimeType: "application/pdf", size: 10, expiresAt: "2026-11-10T00:00:00.000Z" });
  });

  it("uploads the file as itself: bytes as the body, its own type, name and conversation in the query", async () => {
    const fetchMock = vi.fn(async () => json({ file: { id: "f1", name: "plan.txt", mimeType: "text/plain", size: 5, expiresAt: "2026-11-10T00:00:00.000Z" } }, 201));
    const client = new AgentServerClient({ baseUrl: "http://x/api", authorization: "Bearer t", fetch: as(fetchMock) });
    expect(client.supportsRawUpload).toBe(true);
    const blob = new Blob(["hello"], { type: "text/plain" });
    const progress: Array<[number, number]> = [];
    const stored = await client.uploadFile({
      file: { name: "my plan & notes.txt", mimeType: "text/plain", blob },
      conversationId: "c 1",
      onProgress: ({ loaded, total }) => progress.push([loaded, total]),
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://x/api/files?name=my+plan+%26+notes.txt&conversationId=c+1");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(blob);
    expect(init.headers).toMatchObject({ "Content-Type": "text/plain", Authorization: "Bearer t" });
    expect(stored).toEqual({ id: "f1", name: "plan.txt", mimeType: "text/plain", size: 5, expiresAt: "2026-11-10T00:00:00.000Z" });
    expect(progress[progress.length - 1]).toEqual([5, 5]);
  });

  it("sends the JSON form for a file given as base64, and when raw uploads are turned off", async () => {
    const fetchMock = vi.fn(async () => json({ file: { id: "f1", name: "a.txt", mimeType: "text/plain", size: 5 } }, 201));
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: as(fetchMock) });
    await client.uploadFile({ file: { name: "a.txt", mimeType: "text/plain", content: "aGVsbG8=" }, conversationId: "c1" });
    let [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://x/files");
    expect(JSON.parse(init.body as string)).toEqual({ file: { name: "a.txt", content: "aGVsbG8=", mimeType: "text/plain" }, conversationId: "c1" });

    const noRaw = new AgentServerClient({ baseUrl: "http://x", fetch: as(fetchMock), rawUpload: false });
    expect(noRaw.supportsRawUpload).toBe(false);
    await noRaw.uploadFile({ file: { name: "a.txt", mimeType: "text/plain", blob: new Blob(["hello"], { type: "text/plain" }) }, conversationId: "c1" });
    [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("http://x/files");
    expect(JSON.parse(init.body as string).file).toEqual({ name: "a.txt", content: "aGVsbG8=", mimeType: "text/plain" });
  });

  it("an upload the server refuses throws its code, and one aborted before it starts never leaves", async () => {
    const refused = vi.fn(async () => json({ error: { code: "too_many_files", message: "full", details: { maxFiles: 3, held: 3 } } }, 409));
    await expect(
      new AgentServerClient({ baseUrl: "http://x", fetch: as(refused) }).uploadFile({ file: { name: "a.txt", mimeType: "text/plain", blob: new Blob(["x"]) }, conversationId: "c1" })
    ).rejects.toMatchObject({ code: "too_many_files", status: 409, details: { maxFiles: 3, held: 3 } });

    const never = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(
      new AgentServerClient({ baseUrl: "http://x", fetch: as(never) }).uploadFile({ file: { name: "a.txt", mimeType: "text/plain", blob: new Blob(["x"]) }, signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(never).not.toHaveBeenCalled();
  });
});

/** Just enough of XMLHttpRequest for the upload code: the test plays the network. */
class FakeXhr {
  static last: FakeXhr;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown;
  status = 0;
  responseText = "";
  aborted = false;
  upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
}

describe("AgentServerClient raw upload with progress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const blob = () => new Blob(["hello world"], { type: "application/pdf" });

  it("reports how far the bytes got, then resolves with the stored file", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const client = new AgentServerClient({ baseUrl: "http://x", authorization: "Bearer t" });
    const progress: Array<[number, number]> = [];
    const done = client.uploadFile({
      file: { name: "doc.pdf", mimeType: "application/pdf", blob: blob() },
      conversationId: "c1",
      onProgress: ({ loaded, total }) => progress.push([loaded, total]),
    });
    await vi.waitFor(() => expect(FakeXhr.last?.body).toBeDefined());
    const xhr = FakeXhr.last;
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("http://x/files?name=doc.pdf&conversationId=c1");
    expect(xhr.headers).toMatchObject({ "Content-Type": "application/pdf", Authorization: "Bearer t" });
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 4, total: 11 });
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 5, total: 0 });
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 11, total: 11 });
    xhr.respond(201, { file: { id: "f9", name: "doc.pdf", mimeType: "application/pdf", size: 11 } });
    await expect(done).resolves.toMatchObject({ id: "f9", name: "doc.pdf", size: 11 });
    expect(progress[0]).toEqual([4, 11]);
    expect(progress).toContainEqual([11, 11]);
    expect(progress).not.toContainEqual([5, 0]);
  });

  it("rejects with the server's code and details on a refusal, and with a plain error when the network fails", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const client = new AgentServerClient({ baseUrl: "http://x" });
    const refused = client.uploadFile({ file: { name: "a.pdf", mimeType: "application/pdf", blob: blob() }, conversationId: "c1", onProgress: () => {} });
    await vi.waitFor(() => expect(FakeXhr.last?.body).toBeDefined());
    FakeXhr.last.respond(415, { error: { code: "unsupported_file_type", message: "no pdf", details: { allowed: ["image/*"] } } });
    await expect(refused).rejects.toMatchObject({ code: "unsupported_file_type", status: 415, message: "no pdf", details: { allowed: ["image/*"] } });

    const offline = client.uploadFile({ file: { name: "a.pdf", mimeType: "application/pdf", blob: blob() }, onProgress: () => {} });
    await vi.waitFor(() => expect(FakeXhr.last?.body).toBeDefined());
    FakeXhr.last.onerror?.();
    await expect(offline).rejects.toThrow("Network error");

    const html = client.uploadFile({ file: { name: "a.pdf", mimeType: "application/pdf", blob: blob() }, onProgress: () => {} });
    await vi.waitFor(() => expect(FakeXhr.last?.body).toBeDefined());
    FakeXhr.last.status = 502;
    FakeXhr.last.responseText = "<html>bad gateway</html>";
    FakeXhr.last.onload?.();
    await expect(html).rejects.toMatchObject({ status: 502, message: "Request failed (502)" });
  });

  it("aborts the transfer when the signal fires", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const client = new AgentServerClient({ baseUrl: "http://x" });
    const controller = new AbortController();
    const done = client.uploadFile({ file: { name: "a.pdf", mimeType: "application/pdf", blob: blob() }, signal: controller.signal, onProgress: () => {} });
    await vi.waitFor(() => expect(FakeXhr.last?.body).toBeDefined());
    controller.abort();
    expect(FakeXhr.last.aborted).toBe(true);
    await expect(done).rejects.toMatchObject({ name: "AbortError" });
  });

  it("uses the host's own fetch (no progress API there) when it has one", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    FakeXhr.last = undefined as unknown as FakeXhr;
    const fetchMock = vi.fn(async () => json({ file: { id: "f1", name: "a.pdf", mimeType: "application/pdf", size: 11 } }, 201));
    const client = new AgentServerClient({ baseUrl: "http://x", fetch: as(fetchMock) });
    const progress: number[] = [];
    await client.uploadFile({ file: { name: "a.pdf", mimeType: "application/pdf", blob: blob() }, onProgress: ({ loaded }) => progress.push(loaded) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(FakeXhr.last).toBeUndefined();
    expect(progress).toEqual([11]);
  });
});

describe("AgentServerClient.getFileUrl", () => {
  const pngBlob = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is the file route itself when there are no credentials to send", async () => {
    const client = new AgentServerClient({ baseUrl: "http://x/api" });
    expect(await client.getFileUrl({ id: "f 1" })).toBe("http://x/api/files/f%201/content?disposition=inline");
    expect(await client.getFileUrl({ id: "f1" }, { disposition: "attachment" })).toBe("http://x/api/files/f1/content?disposition=attachment");
  });

  it("fetches the bytes with the credentials and hands back one blob URL per file, a picture keeping its type", async () => {
    const created: Blob[] = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => { created.push(b); return `blob:fake-${created.length}`; }, revokeObjectURL: vi.fn() }));
    const fetchMock = vi.fn(async () => new Response(pngBlob(), { status: 200, headers: { "content-type": "image/png" } }));
    const client = new AgentServerClient({ baseUrl: "http://x", authorization: "Bearer t", fetch: as(fetchMock) });
    const [a, b] = await Promise.all([client.getFileUrl({ id: "f1" }), client.getFileUrl({ id: "f1" })]);
    expect(a).toBe("blob:fake-1");
    expect(b).toBe("blob:fake-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe("http://x/files/f1/content?disposition=inline");
    expect(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>).Authorization).toBe("Bearer t");
    expect(created[0].type).toBe("image/png");
  });

  it("never lets a stored page or vector file keep an active type: it becomes a plain download", async () => {
    const created: Blob[] = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => { created.push(b); return `blob:fake-${created.length}`; }, revokeObjectURL: vi.fn() }));
    const fetchMock = vi.fn(async () => new Response("<svg onload=alert(1)>", { status: 200, headers: { "content-type": "image/svg+xml" } }));
    const client = new AgentServerClient({ baseUrl: "http://x", authorization: "Bearer t", fetch: as(fetchMock) });
    await client.getFileUrl({ id: "f1" });
    expect(created[0].type).toBe("application/octet-stream");
    // the download variant is a download whatever it is
    fetchMock.mockImplementation(async () => new Response(pngBlob(), { status: 200, headers: { "content-type": "image/png" } }));
    await client.getFileUrl({ id: "f2" }, { disposition: "attachment" });
    expect(created[1].type).toBe("application/octet-stream");
  });

  it("does not remember a failure, and dispose releases the blob URLs", async () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:fake-1", revokeObjectURL: revoke }));
    const answers = [json({ error: { code: "NOT_FOUND", message: "gone" } }, 404), new Response(pngBlob(), { status: 200 })];
    const fetchMock = vi.fn(async () => answers.shift()!);
    const client = new AgentServerClient({ baseUrl: "http://x", authorization: "Bearer t", fetch: as(fetchMock) });
    await expect(client.getFileUrl({ id: "f1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await client.getFileUrl({ id: "f1" })).toBe("blob:fake-1");
    client.dispose();
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:fake-1"));
  });
});
