/**
 * Shared HTTP plumbing for transports: per-request headers (static or async),
 * an overridable `fetch`, and a tolerant SSE reader.
 */

export interface HttpOptions {
  /** Authorization header value (e.g., "Bearer token") */
  authorization?: string;
  /** Static headers added to every request */
  headers?: Record<string, string>;
  /**
   * Called before every request. Use it to return a fresh token; its result
   * is merged over `authorization` / `headers`.
   */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  /** Replacement for `globalThis.fetch` (proxies, cookies, tests) */
  fetch?: typeof fetch;
}

export async function buildHeaders(
  opts: HttpOptions,
  extra?: Record<string, string>
): Promise<Record<string, string>> {
  return {
    "Content-Type": "application/json",
    ...(opts.authorization ? { Authorization: opts.authorization } : {}),
    ...opts.headers,
    ...(opts.getHeaders ? await opts.getHeaders() : {}),
    ...extra,
  };
}

export function httpFetch(
  opts: HttpOptions,
  url: string,
  init: RequestInit
): Promise<Response> {
  const f = opts.fetch ?? fetch;
  return f(url, init);
}

export async function errorFromResponse(response: Response): Promise<Error> {
  const body = await response.json().catch(() => ({}));
  const message =
    body?.error?.message ||
    (typeof body?.error === "string" ? body.error : undefined) ||
    body?.message ||
    `Request failed (${response.status})`;
  return new Error(message);
}

export interface SSEMessage {
  event?: string;
  data: string;
}

/** Read a text/event-stream body, calling `onMessage` for each event. */
export async function readSSE(
  response: Response,
  onMessage: (msg: SSEMessage) => void
): Promise<void> {
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event: string | undefined;
  let data: string[] = [];

  const flush = () => {
    if (data.length > 0) onMessage({ event, data: data.join("\n") });
    event = undefined;
    data = [];
  };

  const handleLine = (rawLine: string) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line === "") return flush();
    if (line.startsWith(":")) return; // comment / keep-alive
    const idx = line.indexOf(":");
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? "" : line.slice(idx + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    }
    if (buffer) handleLine(buffer);
    flush();
  } finally {
    reader.releaseLock();
  }
}
