/**
 * The embed session: the host's signed token is exchanged once for an opaque session token that the
 * chat sends as `Authorization: Bearer ...` to the portal's chat API. It lives in memory only.
 */

export interface EmbedSession {
  /** The opaque bearer token (`cp_es_...`) */
  token: string;
  /** When it stops working, epoch milliseconds */
  expiresAt: number;
  /** When this page got it, epoch milliseconds */
  issuedAt: number;
  user?: { name?: string; email?: string };
}

/** What went wrong when the token could not be exchanged. */
export interface ExchangeError extends Error {
  /** `identity_not_found`, `token_expired`, ... or `network_error` / `invalid_response` / `auth_failed` */
  code: string;
  status?: number;
  /** The reference code the server shows next to a refusal; quote it to the administrator */
  reference?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const str = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);

/** A moment as epoch milliseconds: an ISO string, epoch seconds or epoch milliseconds. */
export function parseMoment(value: unknown): number | undefined {
  if (typeof value === "string" && value) {
    const at = Date.parse(value);
    return Number.isFinite(at) ? at : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value < 1e11 ? value * 1000 : value;
  }
  return undefined;
}

function exchangeError(message: string, code: string, status?: number, reference?: string): ExchangeError {
  const error = new Error(message) as ExchangeError;
  error.code = code;
  if (status !== undefined) error.status = status;
  if (reference) error.reference = reference;
  return error;
}

/** `{ sessionToken, expiresAt, user }` as the portal answers an exchange. */
export function parseExchangeResponse(body: unknown, now: number): EmbedSession {
  if (!isRecord(body)) throw exchangeError("The server's answer was not understood", "invalid_response");
  const token = str(body.sessionToken) ?? str(body.session_token) ?? str(body.token);
  const expiresAt = parseMoment(body.expiresAt ?? body.expires_at);
  if (!token || expiresAt === undefined || expiresAt <= now) {
    throw exchangeError("The server's answer was not understood", "invalid_response");
  }
  const user = isRecord(body.user) ? body.user : undefined;
  const name = str(user?.name);
  const email = str(user?.email);
  return { token, expiresAt, issuedAt: now, ...(name || email ? { user: { ...(name ? { name } : {}), ...(email ? { email } : {}) } } : {}) };
}

/** The code, message and reference of an error body (`{ error: { code, message, reference } }` or flat). */
export function readErrorBody(body: unknown): { code?: string; message?: string; reference?: string } {
  if (!isRecord(body)) return {};
  const inner = isRecord(body.error) ? body.error : body;
  return {
    code: str(inner.code) ?? str(inner.type) ?? str(body.code),
    message: str(inner.message) ?? (typeof body.error === "string" ? body.error : undefined) ?? str(body.message),
    reference: str(inner.reference) ?? str(inner.referenceCode) ?? str(inner.reference_code) ?? str(body.reference) ?? str(body.referenceCode),
  };
}

export interface ExchangeOptions {
  url: string;
  /** The host's signed token */
  token: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  now?: () => number;
}

/**
 * Trades the host's token for a session (`POST <url> { token }`). The request carries no cookies: the
 * token is the identity. A refusal is thrown as an `ExchangeError` with the server's code and reference.
 */
export async function exchangeToken(options: ExchangeOptions): Promise<EmbedSession> {
  const doFetch = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(options.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token: options.token }),
      credentials: "omit",
      cache: "no-store",
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw exchangeError("The server could not be reached", "network_error");
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const { code, message, reference } = readErrorBody(body);
    const fallback = response.status === 401 ? "auth_failed" : response.status === 403 ? "forbidden" : response.status === 429 ? "rate_limited" : "exchange_failed";
    throw exchangeError(message ?? `Sign-in failed (${response.status})`, (code ?? fallback).toLowerCase(), response.status, reference);
  }
  return parseExchangeResponse(body, (options.now ?? Date.now)());
}

/**
 * How long before its end a session is renewed: a fifth of its life, at least 5 seconds and at most
 * a minute, so a short session is not renewed all the time and a long one is renewed in good time.
 */
export function renewalLeadMs(session: Pick<EmbedSession, "expiresAt" | "issuedAt">): number {
  const life = Math.max(0, session.expiresAt - session.issuedAt);
  return Math.min(60_000, Math.max(5_000, Math.round(life * 0.2)));
}

/** Whether a request body can be sent a second time (a string, a Blob, a form, bytes, or none). */
export function isReplayableBody(body: RequestInit["body"] | undefined): boolean {
  if (body === undefined || body === null) return true;
  if (typeof body === "string") return true;
  if (typeof Blob !== "undefined" && body instanceof Blob) return true;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return true;
  if (typeof FormData !== "undefined" && body instanceof FormData) return true;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return true;
  return false;
}
