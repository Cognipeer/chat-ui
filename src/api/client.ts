import type {
  Message,
  Conversation,
  ConversationBudget,
  ConversationEvent,
  ConversationListItem,
  MessagesPage,
  AgentInfo,
  FileAttachment,
  StreamEvent,
  ChatConfig,
  PendingAction,
  ActionResolution,
} from "../types";
import type {
  CancelResult,
  ChatTransport,
  ContinueOptions,
  FollowEventsOptions,
  GetConversationOptions,
  ListFilesResult,
  PaginatedResponse,
  ResolveActionOptions,
  SendMessageOptions,
  SendMessageResponse,
  StreamCallbacks,
  UploadFileParams,
} from "./transport";
import {
  buildHeaders,
  errorFromResponse,
  httpFetch,
  readSSE,
  type HttpOptions,
} from "./http";
import { normalizeBudget, normalizeMessagesPage, normalizeRuntime } from "../utils/runtime";
import { fileFromRecord, uploadMimeType } from "../utils/files";

/** How `followEvents` reconnects after losing the connection. */
export interface FollowReconnectOptions {
  /** Consecutive failed attempts before giving up (default 6). A connection that delivered a frame resets the count. */
  retries?: number;
  /** First wait before reconnecting, in ms; doubles each attempt (default 500) */
  delayMs?: number;
  /** Longest wait, in ms (default 8000) */
  maxDelayMs?: number;
}

export interface AgentServerClientOptions
  extends Pick<ChatConfig, "baseUrl" | "authorization" | "headers" | "getHeaders" | "fetch"> {
  agentId?: string;
  /**
   * Send uploaded files as the request body (`POST /files?name=&conversationId=`, the file's own
   * `Content-Type`) with upload progress instead of base64 JSON. Default `true`; turn it off for
   * a server that only takes the JSON form.
   */
  rawUpload?: boolean;
  /** Reconnect behaviour of `followEvents` */
  reconnect?: FollowReconnectOptions;
}

/** Wait `ms`, or until `signal` aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const abortError = () => new DOMException("The upload was aborted", "AbortError");

/** An upload that never reached the server: coded, so the UI can say it in the person's language. */
const uploadNetworkError = (cause?: unknown) =>
  Object.assign(new Error("Network error while uploading the file"), { code: "upload_failed", cause });

/** `httpFetch` for an upload: a connection that failed outright becomes a coded `upload_failed`. */
async function uploadFetch(http: HttpOptions, url: string, init: RequestInit): Promise<Response> {
  try {
    return await httpFetch(http, url, init);
  } catch (err) {
    // `fetch` rejects with a TypeError ("Failed to fetch") when there was no answer at all
    if (err instanceof TypeError) throw uploadNetworkError(err);
    throw err;
  }
}

/** `application/json` and the `+json` types: what the server takes for its JSON upload form. */
function isJsonMimeType(mimeType: string): boolean {
  const base = mimeType.split(";")[0]!.trim().toLowerCase();
  return base === "application/json" || base.endsWith("+json");
}

/** How many blob URLs `getFileUrl` keeps alive at once; the least recently used are released first. */
const MAX_FILE_URLS = 200;

/** Raster pictures are the only blobs that keep their own type: anything else could run in the page's origin. */
const SAFE_BLOB_TYPE = /^image\/(png|jpe?g|gif|webp)$/i;

/**
 * Agent Server API client
 */
export class AgentServerClient implements ChatTransport {
  private baseUrl: string;
  private http: HttpOptions;
  private rawUpload: boolean;
  private reconnect: Required<FollowReconnectOptions>;
  // Blob URLs made for files that need credentials to fetch, by file id
  private fileUrls = new Map<string, Promise<string>>();

  constructor(config: AgentServerClientOptions) {
    if (!config.baseUrl) {
      throw new Error("AgentServerClient requires a baseUrl");
    }
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.http = {
      authorization: config.authorization,
      headers: config.headers,
      getHeaders: config.getHeaders,
      fetch: config.fetch,
    };
    this.rawUpload = config.rawUpload !== false;
    this.reconnect = {
      retries: config.reconnect?.retries ?? 6,
      delayMs: config.reconnect?.delayMs ?? 500,
      maxDelayMs: config.reconnect?.maxDelayMs ?? 8000,
    };
  }

  /** `uploadFile` sends the file as the request body and reports progress (see `rawUpload`). */
  get supportsRawUpload(): boolean {
    return this.rawUpload;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const response = await httpFetch(this.http, `${this.baseUrl}${path}`, {
      method,
      headers: await buildHeaders(this.http),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw await errorFromResponse(response);
    }

    // 204 No Content — no body to parse
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // ============================================================================
  // Agents
  // ============================================================================

  async getAgents(): Promise<AgentInfo[]> {
    const response = await this.request<{ agents: AgentInfo[] }>("GET", "/agents");
    return response.agents;
  }

  async getAgent(agentId: string): Promise<AgentInfo> {
    return this.request<AgentInfo>("GET", `/agents/${agentId}`);
  }

  // ============================================================================
  // Conversations
  // ============================================================================

  async getConversations(params?: {
    agentId?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<ConversationListItem> & { conversations: ConversationListItem[] }> {
    const searchParams = new URLSearchParams();
    if (params?.agentId) searchParams.set("agentId", params.agentId);
    if (params?.userId) searchParams.set("userId", params.userId);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());

    const query = searchParams.toString();
    const page = await this.request<PaginatedResponse<ConversationListItem> & { conversations: ConversationListItem[] }>(
      "GET",
      `/conversations${query ? `?${query}` : ""}`
    );
    // The status badges read `runtime`: keep only what is well-formed
    return {
      ...page,
      conversations: (page.conversations ?? []).map((item) => {
        const { runtime: rawRuntime, ...rest } = item;
        const runtime = normalizeRuntime(rawRuntime);
        return runtime ? { ...rest, runtime } : rest;
      }),
    };
  }

  async createConversation(params: {
    agentId: string;
    userId?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Conversation> {
    const response = await this.request<{ conversation: Conversation }>(
      "POST",
      "/conversations",
      params
    );
    return response.conversation;
  }

  async getConversation(conversationId: string, options: GetConversationOptions = {}): Promise<{
    conversation: Conversation;
    messages: Message[];
    pendingActions?: PendingAction[];
    messagesPage?: MessagesPage;
  }> {
    const query = new URLSearchParams();
    if (options.before) query.set("before", options.before);
    if (options.limit) query.set("limit", String(options.limit));
    const suffix = query.toString();
    const { messagesPage: rawPage, ...data } = await this.request<{
      conversation: Conversation;
      messages: Message[];
      pendingActions?: PendingAction[];
      messagesPage?: unknown;
    }>("GET", `/conversations/${conversationId}${suffix ? `?${suffix}` : ""}`);
    const messagesPage = normalizeMessagesPage(rawPage);
    return {
      ...data,
      conversation: data.conversation ? this.readConversation(data.conversation, conversationId) : data.conversation,
      ...(messagesPage ? { messagesPage } : {}),
    };
  }

  async updateConversation(
    conversationId: string,
    params: {
      title?: string;
      metadata?: Record<string, unknown>;
      /** Sets the conversation's spend limit; `null` removes it */
      budget?: ConversationBudget | null;
    }
  ): Promise<Conversation> {
    return this.request("PATCH", `/conversations/${conversationId}`, params);
  }

  /**
   * Set (or with `null` remove) the conversation's spend limit (`PATCH /conversations/:id`).
   * Resolves to the updated conversation: its `budget`, `spentUsd` and - once the limit was
   * raised - the `runtime` it is in now. A server that refuses answers `budget_forbidden`
   * (403) or `invalid_budget` (400).
   */
  async updateBudget(conversationId: string, budget: ConversationBudget | null): Promise<Conversation> {
    const updated = await this.updateConversation(conversationId, { budget });
    return this.readConversation(updated, conversationId);
  }

  /** Fills what a PATCH answer leaves out and normalizes the runtime / budget it carries. */
  private readConversation(raw: Partial<Conversation> & { conversation?: Conversation }, id: string): Conversation {
    const { runtime: rawRuntime, budget: rawBudget, ...rest } = (raw.conversation ?? raw) as Partial<Conversation>;
    const runtime = normalizeRuntime(rawRuntime);
    const budget = rawBudget === undefined ? undefined : normalizeBudget(rawBudget);
    return {
      ...(rest as Conversation),
      id: rest.id ?? id,
      ...(runtime ? { runtime } : {}),
      ...(budget !== undefined ? { budget } : {}),
    };
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.request("DELETE", `/conversations/${conversationId}`);
  }

  // ============================================================================
  // Messages
  // ============================================================================

  async getMessages(
    conversationId: string,
    params?: { limit?: number; offset?: number; order?: "asc" | "desc" }
  ): Promise<PaginatedResponse<Message> & { messages: Message[] }> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.order) searchParams.set("order", params.order);

    const query = searchParams.toString();
    return this.request(
      "GET",
      `/conversations/${conversationId}/messages${query ? `?${query}` : ""}`
    );
  }

  async sendMessage(
    conversationId: string,
    options: SendMessageOptions
  ): Promise<SendMessageResponse> {
    return this.request(
      "POST",
      `/conversations/${conversationId}/messages`,
      options
    );
  }

  /**
   * Send a message with streaming response
   */
  async sendMessageStream(
    conversationId: string,
    options: Omit<SendMessageOptions, "stream">,
    callbacks: StreamCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await httpFetch(
      this.http,
      `${this.baseUrl}/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: await buildHeaders(this.http),
        body: JSON.stringify({ ...options, stream: true }),
        signal,
      }
    );

    if (!response.ok) {
      throw await errorFromResponse(response);
    }

    await this.readStream(response, callbacks);
  }

  /**
   * Answer a pending approval or question
   * (`POST /conversations/:id/actions/:actionId`). With `stream: true` the
   * continuation is delivered through `options.callbacks`.
   */
  async resolveAction(
    conversationId: string,
    actionId: string,
    resolution: ActionResolution,
    options: ResolveActionOptions = {}
  ): Promise<SendMessageResponse | undefined> {
    const path = `/conversations/${conversationId}/actions/${actionId}`;

    if (!options.stream) {
      return this.request("POST", path, { resolution });
    }

    const response = await httpFetch(this.http, `${this.baseUrl}${path}`, {
      method: "POST",
      headers: await buildHeaders(this.http),
      body: JSON.stringify({ resolution, stream: true }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw await errorFromResponse(response);
    }

    await this.readStream(response, options.callbacks ?? {});
    return undefined;
  }

  private async readStream(response: Response, callbacks: StreamCallbacks): Promise<void> {
    let fullText = "";

    await readSSE(response, ({ data: raw }) => {
      const data = raw.trim();
      if (!data) return;

      try {
        const event = JSON.parse(data) as StreamEvent;

        switch (event.type) {
          case "stream.start":
            callbacks.onStart?.(event);
            break;
          case "stream.text":
            fullText += event.text;
            callbacks.onText?.(event.text, fullText);
            break;
          case "stream.thinking":
            // Treat thinking as text for now
            fullText += (event as any).thinking;
            callbacks.onText?.((event as any).thinking, fullText);
            break;
          case "stream.tool_call":
            callbacks.onToolCall?.(event);
            break;
          case "stream.tool_result":
            callbacks.onToolResult?.(event);
            break;
          case "stream.progress":
            callbacks.onProgress?.(event);
            break;
          case "stream.error": {
            // The code lets the UI show a friendly message and recover (busy, pending action, ...)
            const error = new Error(event.error) as Error & { code?: string };
            if (event.code) error.code = event.code;
            callbacks.onError?.(error);
            break;
          }
          case "stream.action_required":
            callbacks.onActionRequired?.(event);
            break;
          case "stream.action_resolved":
            callbacks.onActionResolved?.(event);
            break;
          case "stream.done":
            callbacks.onDone?.(event);
            break;
        }
      } catch {
        // Ignore parse errors
      }
    });
  }

  // ============================================================================
  // Runs: cancel, continue, follow
  // ============================================================================

  /**
   * Stop the conversation's run on the server (`POST /conversations/:id/cancel`). The turn is
   * aborted (what was written so far is kept as the answer, `cancelled`); open approvals /
   * questions of a paused conversation are cancelled. Nothing to cancel is not an error.
   */
  async cancel(conversationId: string): Promise<CancelResult> {
    const response = await httpFetch(this.http, `${this.baseUrl}/conversations/${conversationId}/cancel`, {
      method: "POST",
      headers: await this.headersWithout("Content-Type"),
    });
    // 202: still winding down (or running on another node); the body says `settled: false`
    if (!response.ok) throw await errorFromResponse(response);
    const body = (await response.json().catch(() => ({}))) as Partial<CancelResult> & { runtime?: unknown };
    const runtime = normalizeRuntime(body.runtime);
    return {
      cancelled: body.cancelled === true,
      ...(typeof body.runId === "string" ? { runId: body.runId } : {}),
      settled: body.settled !== false && response.status !== 202,
      ...(Array.isArray(body.cancelledActionIds) ? { cancelledActionIds: body.cancelledActionIds } : {}),
      ...(typeof body.stopReason === "string" ? { stopReason: body.stopReason } : {}),
      ...(runtime ? { runtime } : {}),
    };
  }

  /**
   * Carry on a turn the conversation's budget stopped (`POST /conversations/:id/continue`).
   * Raise the budget first (`updateBudget`): while it is still used up the answer is
   * `402 budget_reached`. With `stream: true` the continuation arrives through
   * `options.callbacks`, like the answer to an action.
   */
  async continueConversation(
    conversationId: string,
    options: ContinueOptions = {}
  ): Promise<SendMessageResponse | undefined> {
    const path = `/conversations/${conversationId}/continue`;
    if (!options.stream) {
      return this.request("POST", path, {});
    }
    const response = await httpFetch(this.http, `${this.baseUrl}${path}`, {
      method: "POST",
      headers: await buildHeaders(this.http),
      body: JSON.stringify({ stream: true }),
      signal: options.signal,
    });
    if (!response.ok) throw await errorFromResponse(response);
    await this.readStream(response, options.callbacks ?? {});
    return undefined;
  }

  /**
   * Follow the conversation's event log (`GET /conversations/:id/events/stream`): the events
   * after `options.after` are replayed, then new ones arrive live, until `options.signal`
   * aborts. A lost connection is re-opened from the last event seen (with backoff, see the
   * `reconnect` option); a refusal that retrying cannot fix (404, 403, ...) is thrown.
   */
  async followEvents(conversationId: string, options: FollowEventsOptions): Promise<void> {
    const { signal } = options;
    let after = Math.max(0, options.after ?? 0);
    let failures = 0;
    let attempt = 0;

    while (!signal?.aborted) {
      let sawFrame = false;
      try {
        const query = new URLSearchParams({ after: String(after) });
        if (options.types && options.types.length > 0) query.set("types", options.types.join(","));
        const response = await httpFetch(
          this.http,
          `${this.baseUrl}/conversations/${conversationId}/events/stream?${query.toString()}`,
          {
            method: "GET",
            headers: await this.headersWithout("Content-Type", { Accept: "text/event-stream" }),
            signal,
          }
        );
        if (!response.ok) throw await errorFromResponse(response);

        await readSSE(response, ({ event, data }) => {
          sawFrame = true;
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            return;
          }
          if (!parsed || typeof parsed !== "object") return;
          let frame: ConversationEvent;
          if (event === "agent.message.delta") {
            // live text, not stored: no seq
            frame = { type: "agent.message.delta", data: parsed as Record<string, unknown> };
          } else {
            const raw = parsed as { seq?: unknown; type?: unknown; data?: unknown; run_id?: unknown; created_at?: unknown };
            const type = typeof raw.type === "string" ? raw.type : event;
            if (!type) return;
            frame = {
              ...(typeof raw.seq === "number" ? { seq: raw.seq } : {}),
              type,
              // The reattach snapshot is the one frame that is not in the log: no `id:` line, so no `seq`
              // (the cursor stays where it is). Its payload may also come unwrapped, like a delta's.
              data:
                raw.data && typeof raw.data === "object"
                  ? (raw.data as Record<string, unknown>)
                  : type === "agent.message.snapshot" && typeof raw.type !== "string"
                    ? (parsed as Record<string, unknown>)
                    : {},
              ...(typeof raw.run_id === "string" ? { runId: raw.run_id } : {}),
              ...(typeof raw.created_at === "string" ? { createdAt: raw.created_at } : {}),
            };
            if (frame.seq !== undefined && frame.seq > after) after = frame.seq;
          }
          options.onEvent(frame);
        }, signal);
        // The server closed the stream (its time limit, a proxy): open it again from where we are
        if (sawFrame) failures = 0;
        else failures += 1;
      } catch (error) {
        if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        const status = (error as { status?: number } | null)?.status;
        // A refusal is the answer; retrying only repeats it (408 / 429 / 5xx and network errors do retry)
        if (typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429) throw error;
        failures = sawFrame ? 1 : failures + 1;
        if (failures > this.reconnect.retries) throw error;
      }
      if (signal?.aborted) return;
      if (failures > this.reconnect.retries) {
        throw new Error("The event stream kept closing without delivering anything");
      }
      attempt += 1;
      options.onReconnect?.(attempt);
      await sleep(Math.min(this.reconnect.delayMs * 2 ** Math.max(0, failures - 1), this.reconnect.maxDelayMs), signal);
    }
  }

  /** Headers for a request without a body: no `Content-Type`, plus `extra`. */
  private async headersWithout(drop: string, extra: Record<string, string> = {}): Promise<Record<string, string>> {
    const headers = await buildHeaders(this.http, extra);
    delete headers[drop];
    return headers;
  }

  // ============================================================================
  // Files
  // ============================================================================

  /**
   * Store a file. With `file.blob` (and `rawUpload` on) the file goes up as itself - its bytes as
   * the body, its own `Content-Type`, `?name=&conversationId=` in the query - with progress when
   * `onProgress` is given; with `file.content` it is the JSON form with base64.
   */
  async uploadFile(params: UploadFileParams): Promise<FileAttachment> {
    const { file } = params;
    if (this.rawUpload && file.blob) {
      return this.uploadRaw(params, file.blob);
    }
    let content = file.content;
    if (content === undefined && file.blob) content = await blobToBase64(file.blob);
    if (content === undefined) throw new Error("uploadFile needs file.blob or file.content");
    if (params.signal?.aborted) throw abortError();
    const response = await uploadFetch(this.http, `${this.baseUrl}/files`, {
      method: "POST",
      headers: await buildHeaders(this.http),
      body: JSON.stringify({
        file: { name: file.name, content, mimeType: file.mimeType || "application/octet-stream" },
        ...(params.conversationId ? { conversationId: params.conversationId } : {}),
        ...(params.metadata ? { metadata: params.metadata } : {}),
      }),
      signal: params.signal,
    });
    if (!response.ok) throw await errorFromResponse(response);
    params.onProgress?.({ loaded: file.blob?.size ?? content.length, total: file.blob?.size ?? content.length });
    return fileFromRecord(((await response.json()) as { file?: unknown }).file);
  }

  private async uploadRaw(params: UploadFileParams, blob: Blob): Promise<FileAttachment> {
    const query = new URLSearchParams({ name: params.file.name });
    if (params.conversationId) query.set("conversationId", params.conversationId);
    const mimeType = params.file.mimeType || uploadMimeType(blob);
    // The server reads a JSON content type as its JSON form of the upload, so a JSON file goes up
    // as plain bytes and names its own type in the query instead
    const jsonLike = isJsonMimeType(mimeType);
    if (jsonLike) query.set("mimeType", mimeType.split(";")[0]!.trim().toLowerCase());
    const url = `${this.baseUrl}/files?${query.toString()}`;
    const headers = await buildHeaders(this.http, { "Content-Type": jsonLike ? "application/octet-stream" : mimeType });
    if (params.signal?.aborted) throw abortError();

    // XHR is the one browser API that reports upload progress; a host with its own `fetch` keeps using it
    const useXhr = Boolean(params.onProgress) && !this.http.fetch && typeof XMLHttpRequest !== "undefined";
    if (!useXhr) {
      const response = await uploadFetch(this.http, url, { method: "POST", headers, body: blob, signal: params.signal });
      if (!response.ok) throw await errorFromResponse(response);
      params.onProgress?.({ loaded: blob.size, total: blob.size });
      return fileFromRecord(((await response.json()) as { file?: unknown }).file);
    }

    return new Promise<FileAttachment>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const onAbort = () => xhr.abort();
      const done = () => params.signal?.removeEventListener("abort", onAbort);
      xhr.open("POST", url);
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) params.onProgress?.({ loaded: event.loaded, total: event.total });
      };
      xhr.onload = () => {
        done();
        let body: unknown;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = undefined;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          params.onProgress?.({ loaded: blob.size, total: blob.size });
          resolve(fileFromRecord((body as { file?: unknown } | undefined)?.file));
          return;
        }
        // Same shape errorFromResponse builds for fetch
        const e = (body as { error?: { message?: string; code?: string; type?: string; details?: Record<string, unknown> } | string; message?: string; code?: string } | undefined) ?? {};
        const inner = typeof e.error === "object" && e.error ? e.error : undefined;
        const message = inner?.message || (typeof e.error === "string" ? e.error : undefined) || e.message || `Request failed (${xhr.status})`;
        const error = new Error(message) as Error & { status?: number; code?: string; details?: Record<string, unknown> };
        error.status = xhr.status;
        const code = inner?.code ?? inner?.type ?? e.code;
        if (typeof code === "string") error.code = code;
        if (inner?.details && typeof inner.details === "object") error.details = inner.details;
        reject(error);
      };
      xhr.onerror = () => {
        done();
        reject(uploadNetworkError());
      };
      xhr.onabort = () => {
        done();
        reject(abortError());
      };
      params.signal?.addEventListener("abort", onAbort, { once: true });
      xhr.send(blob);
    });
  }

  async getFile(fileId: string): Promise<FileAttachment> {
    const response = await this.request<{ file: FileAttachment }>(
      "GET",
      `/files/${fileId}`
    );
    return fileFromRecord(response.file);
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.request("DELETE", `/files/${fileId}`);
  }

  /**
   * The files the conversation holds (`GET /conversations/:id/files`), oldest first, with how
   * many it may hold. The chat counts against it and shows each file's deadline.
   */
  async listFiles(conversationId: string): Promise<ListFilesResult> {
    const body = await this.request<{
      files?: unknown[];
      total?: number;
      maxFiles?: number;
      hasMore?: boolean;
    }>("GET", `/conversations/${conversationId}/files?limit=200`);
    const files = (body.files ?? []).map(fileFromRecord).filter((f) => f.id);
    return {
      files,
      total: typeof body.total === "number" ? body.total : files.length,
      ...(typeof body.maxFiles === "number" ? { maxFiles: body.maxFiles } : {}),
      ...(body.hasMore ? { hasMore: true } : {}),
    };
  }

  getFileContentUrl(fileId: string): string {
    return `${this.baseUrl}/files/${fileId}/content`;
  }

  /**
   * A URL to show or download a stored file from. With no credentials configured the file route
   * itself is the URL (a cookie session sends its cookie with an `<img>`); with `authorization`,
   * `headers`, `getHeaders` or a custom `fetch` the bytes are fetched with them and handed back as
   * a blob URL, cached per file. A blob keeps its own type only if it is a raster picture;
   * anything else becomes a plain download, so a stored HTML or SVG file never runs on the page.
   */
  async getFileUrl(
    file: { id: string },
    options: { disposition?: "inline" | "attachment" } = {}
  ): Promise<string> {
    const disposition = options.disposition ?? "inline";
    const url = `${this.baseUrl}/files/${encodeURIComponent(file.id)}/content?disposition=${disposition}`;
    const needsCredentials = Boolean(
      this.http.authorization || (this.http.headers && Object.keys(this.http.headers).length > 0) || this.http.getHeaders || this.http.fetch
    );
    if (!needsCredentials || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return url;

    const key = `${file.id}:${disposition}`;
    let pending = this.fileUrls.get(key);
    if (pending) {
      // most recently used goes last
      this.fileUrls.delete(key);
      this.fileUrls.set(key, pending);
    } else {
      pending = (async () => {
        const response = await httpFetch(this.http, url, { method: "GET", headers: await this.headersWithout("Content-Type") });
        if (!response.ok) throw await errorFromResponse(response);
        const blob = await response.blob();
        const safe = disposition === "inline" && SAFE_BLOB_TYPE.test(blob.type) ? blob : new Blob([blob], { type: "application/octet-stream" });
        return URL.createObjectURL(safe);
      })();
      this.fileUrls.set(key, pending);
      // A failed fetch must not be cached
      pending.catch(() => this.fileUrls.delete(key));
      // The blobs live in the browser until revoked: keep only the most recent ones
      while (this.fileUrls.size > MAX_FILE_URLS) {
        const oldest = this.fileUrls.keys().next().value as string;
        const evicted = this.fileUrls.get(oldest);
        this.fileUrls.delete(oldest);
        evicted?.then((url) => URL.revokeObjectURL(url)).catch(() => undefined);
      }
    }
    return pending;
  }

  /** Whether `getFileUrl` holds blob URLs that `dispose()` would release. */
  get holdsFileUrls(): boolean {
    return this.fileUrls.size > 0;
  }

  /** Release the blob URLs made by `getFileUrl`. The client stays usable. */
  dispose(): void {
    for (const pending of this.fileUrls.values()) {
      pending.then((url) => URL.revokeObjectURL(url)).catch(() => undefined);
    }
    this.fileUrls.clear();
  }
}

/** A blob as base64 (the JSON upload form for a transport that was handed the file itself). */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
