/**
 * Server error codes → friendly, localized messages.
 *
 * Servers answer with a `code` (`conversation_busy`, `RATE_LIMITED`, ...) and an
 * English `message`. Every code the agent server, the Console client API and the
 * portal use has a `chat.error.code.<code>` string (lower-cased code); `{detail}` in
 * a string is replaced with the server's own message. A code without a string keeps
 * the server's message.
 */

export interface CodedError extends Error {
  code?: string;
  status?: number;
  /** The server's own message, when the shown one was replaced by a localized string */
  serverMessage?: string;
  /** The error as it arrived, when the shown one was replaced by a localized string */
  cause?: unknown;
  /** What the server attached to the refusal (`activeRunId`, `spentUsd`, `maxCostUsd`, ...) */
  details?: Record<string, unknown>;
}

/** `PENDING_ACTION` and `pending_action` are the same code. */
export function normalizeErrorCode(code: unknown): string | undefined {
  return typeof code === "string" && code.trim() ? code.trim().toLowerCase() : undefined;
}

/** The conversation cannot take a message because a card is waiting, a turn is running or its budget is used up. */
const CONFLICT_CODES: ReadonlySet<string> = new Set([
  "action_pending",
  "pending_action",
  "conversation_busy",
  // the spend limit is used up: the conversation on screen does not know yet
  "budget_reached",
]);

/** After these the conversation on screen is stale (a card or a running turn the page does not show). */
export function isConflictCode(code: unknown): boolean {
  const normalized = normalizeErrorCode(code);
  return normalized !== undefined && CONFLICT_CODES.has(normalized);
}

/**
 * The error with its message replaced by the localized string for its code, when there
 * is one. The code and status stay on the returned error, the server's wording moves to
 * `serverMessage`. Errors without a known code come back unchanged.
 */
export function localizeError(
  error: Error,
  t: (id: string, values?: Record<string, unknown>) => string,
  has: (id: string) => boolean
): Error {
  const coded = error as CodedError;
  const code = normalizeErrorCode(coded.code);
  if (!code) return error;
  const key = `chat.error.code.${code}`;
  if (!has(key)) return error;
  const message = t(key, { detail: error.message }).trim();
  if (!message) return error;
  const localized = new Error(message) as CodedError;
  localized.cause = error;
  localized.code = coded.code;
  if (coded.status !== undefined) localized.status = coded.status;
  if (coded.details !== undefined) localized.details = coded.details;
  localized.serverMessage = error.message;
  return localized;
}
