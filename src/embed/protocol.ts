/**
 * The messages an embedded chat (an iframe) and the page that embeds it (the host) exchange with
 * `window.postMessage`. Every message is a plain object `{ type: "cp:...", v: 1, ... }`.
 *
 * iframe -> host
 *   cp:ready          the chat loaded and wants a token (repeated until the host answers)
 *   cp:token_request  the chat needs a fresh token: `reason` is `expiring`, `expired` or `rejected`
 *   cp:event          something happened in the chat: `event` is one of `EMBED_EVENTS`, with `data`
 *   cp:tool_call      the agent calls a tool of the host page: `callId`, `name`, `args`
 *
 * host -> iframe
 *   cp:auth           a signed identity token (`token`); answers cp:ready and cp:token_request
 *   cp:tool_result    the result of a cp:tool_call: `callId`, then `ok` + `output` or `error`
 *   cp:prefill        put `text` in the composer, `send: true` sends it
 *   cp:context        unsigned UI context (`context` object, or null to clear) sent with every message
 *   cp:logout         sign out: the chat forgets the session and asks the server to revoke it
 *
 * A token never travels in a URL, and neither side accepts a message from an origin other than the
 * one it was set up for (see `EmbedBridge`).
 */

export const EMBED_PROTOCOL_VERSION = 1 as const;

/** The events a chat reports to its host page (`cp:event`). */
export const EMBED_EVENTS = [
  "ready",
  "auth:required",
  "auth:error",
  "conversation:started",
  "message:sent",
  "message:completed",
  "action:required",
  "action:resolved",
  "limit:reached",
  "error",
] as const;

export type EmbedEventName = (typeof EMBED_EVENTS)[number];

/** Why the chat asks for a new token. */
export type TokenRequestReason = "expiring" | "expired" | "rejected";

export type EmbedToHostMessage =
  | { type: "cp:ready"; v: 1 }
  | { type: "cp:token_request"; v: 1; reason: TokenRequestReason }
  | { type: "cp:event"; v: 1; event: EmbedEventName; data: Record<string, unknown> }
  | { type: "cp:tool_call"; v: 1; callId: string; name: string; args: Record<string, unknown> };

export type HostToEmbedMessage =
  | { type: "cp:auth"; v: 1; token: string }
  | { type: "cp:tool_result"; v: 1; callId: string; ok: boolean; output?: unknown; error?: string }
  | { type: "cp:prefill"; v: 1; text: string; send?: boolean }
  | { type: "cp:context"; v: 1; context: Record<string, unknown> | null }
  | { type: "cp:logout"; v: 1 };

/** A signed token is a few hundred bytes; anything this long is not one. */
export const MAX_TOKEN_CHARS = 8192;
/** The most unsigned UI context a message carries (JSON, in bytes). */
export const MAX_CONTEXT_BYTES = 8 * 1024;
/** The most a host tool may hand back (JSON, in bytes). */
export const MAX_TOOL_OUTPUT_BYTES = 64 * 1024;
/** The longest a prefilled text may be. */
export const MAX_PREFILL_CHARS = 8000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** `https://host.example:8443/path?x` -> `https://host.example:8443`; undefined for anything but an http(s) URL. */
export function normalizeOrigin(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/** Whether `origin` is exactly one of the allowed origins (no wildcards, no subdomain matching). */
export function isAllowedOrigin(origin: unknown, allowed: readonly string[]): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return allowed.some((entry) => normalizeOrigin(entry) === normalized);
}

/** Size of a string in UTF-8 bytes. */
export function byteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value).length;
  return unescape(encodeURIComponent(value)).length;
}

/** Why a value cannot be handed over as a tool result (not JSON, or too big), or undefined when it can. */
export function jsonPayloadError(value: unknown, maxBytes: number): "not_json" | "too_large" | undefined {
  if (value === undefined) return undefined;
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    return "not_json";
  }
  if (text === undefined) return "not_json";
  return byteLength(text) > maxBytes ? "too_large" : undefined;
}

/**
 * A message from the host page, or undefined when it is not one of ours (wrong shape, wrong
 * version, oversized). Unknown keys are dropped.
 */
export function parseHostMessage(data: unknown): HostToEmbedMessage | undefined {
  if (!isRecord(data) || typeof data.type !== "string" || data.v !== EMBED_PROTOCOL_VERSION) return undefined;
  switch (data.type) {
    case "cp:auth":
      return typeof data.token === "string" && data.token.length > 0 && data.token.length <= MAX_TOKEN_CHARS
        ? { type: "cp:auth", v: 1, token: data.token }
        : undefined;
    case "cp:tool_result": {
      if (typeof data.callId !== "string" || !data.callId || typeof data.ok !== "boolean") return undefined;
      return {
        type: "cp:tool_result",
        v: 1,
        callId: data.callId,
        ok: data.ok,
        ...(data.ok && data.output !== undefined ? { output: data.output } : {}),
        ...(!data.ok ? { error: typeof data.error === "string" && data.error ? data.error.slice(0, 2000) : "The host page reported an error" } : {}),
      };
    }
    case "cp:prefill":
      return typeof data.text === "string" && data.text.length <= MAX_PREFILL_CHARS
        ? { type: "cp:prefill", v: 1, text: data.text, ...(data.send === true ? { send: true } : {}) }
        : undefined;
    case "cp:context":
      if (data.context === null) return { type: "cp:context", v: 1, context: null };
      return isRecord(data.context) && !jsonPayloadError(data.context, MAX_CONTEXT_BYTES) && JSON.stringify(data.context) !== undefined
        ? { type: "cp:context", v: 1, context: data.context }
        : undefined;
    case "cp:logout":
      return { type: "cp:logout", v: 1 };
    default:
      return undefined;
  }
}
