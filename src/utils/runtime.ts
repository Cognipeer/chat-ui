import type {
  Conversation,
  ConversationBudget,
  ConversationListItem,
  ConversationRuntime,
  Message,
  MessagesPage,
  RuntimeStatus,
  StopReason,
  TurnWarning,
} from "../types";

const STOP_REASONS: ReadonlySet<string> = new Set([
  "end_turn",
  "requires_action",
  "cancelled",
  "max_turns",
  "limit",
  "budget_reached",
  "error",
]);

/**
 * A stop reason as a server wrote it, or undefined. Besides agent-server's own values this takes
 * the older Console spellings (`completed`, `paused`, `canceled`) so history written before the
 * protocol was settled still reads.
 */
export function normalizeStopReason(value: unknown): StopReason | undefined {
  if (typeof value !== "string") return undefined;
  const reason = value.trim().toLowerCase();
  if (STOP_REASONS.has(reason)) return reason as StopReason;
  switch (reason) {
    case "completed":
    case "stop":
      return "end_turn";
    case "paused":
      return "requires_action";
    case "canceled":
      return "cancelled";
    default:
      return undefined;
  }
}

/** Why the turn that wrote an assistant message stopped: its own field, else `metadata.stopReason`. */
export function messageStopReason(message: Pick<Message, "stopReason" | "metadata">): StopReason | undefined {
  return normalizeStopReason(message.stopReason) ?? normalizeStopReason(message.metadata?.stopReason);
}

/** The runtime's wording for a stop, from the message or its metadata. */
export function messageStopDetail(message: Pick<Message, "stopDetail" | "metadata">): string | undefined {
  const detail = message.stopDetail ?? message.metadata?.stopDetail ?? message.metadata?.stop_detail;
  return typeof detail === "string" && detail.trim() ? detail : undefined;
}

export type StopNoticeKind = "cancelled" | "limit" | "max_turns" | "budget_reached" | "error" | "incomplete";

/**
 * Which notice an assistant message needs under its text, or undefined for an answer that simply
 * finished (or paused for a person, which the cards say). A message that is `incomplete` without
 * a reason still reads as cut short.
 */
export function stopNoticeKind(
  message: Pick<Message, "role" | "status" | "stopReason" | "metadata">
): StopNoticeKind | undefined {
  if (message.role !== "assistant") return undefined;
  const reason = messageStopReason(message);
  if (reason === "cancelled" || reason === "limit" || reason === "max_turns" || reason === "budget_reached" || reason === "error") {
    return reason;
  }
  if (message.status === "cancelled") return "cancelled";
  if (message.status === "incomplete") return "incomplete";
  return undefined;
}

/** The warnings a turn left on its message (`metadata.warnings`), well-formed ones only. */
export function messageWarnings(message: Pick<Message, "metadata">): TurnWarning[] {
  const raw = message.metadata?.warnings;
  if (!Array.isArray(raw)) return [];
  const out: TurnWarning[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const code = (item as { code?: unknown }).code;
    if (typeof code !== "string" || !code) continue;
    out.push(item as TurnWarning);
  }
  return out;
}

// ----------------------------------------------------------------------------
// Runtime and budget
// ----------------------------------------------------------------------------

const STATUSES: ReadonlySet<string> = new Set(["idle", "running", "requires_action", "budget_paused"]);

/** A `runtime` object as a server sent it, or undefined when it is not one. */
export function normalizeRuntime(value: unknown): ConversationRuntime | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.status !== "string" || !STATUSES.has(raw.status)) return undefined;
  const lastEventSeq = typeof raw.lastEventSeq === "number" && Number.isFinite(raw.lastEventSeq) ? raw.lastEventSeq : undefined;
  const stopReason = normalizeStopReason(raw.stopReason);
  return {
    status: raw.status as RuntimeStatus,
    ...(stopReason ? { stopReason } : {}),
    ...(lastEventSeq !== undefined ? { lastEventSeq } : {}),
    ...(Array.isArray(raw.pendingActionIds)
      ? { pendingActionIds: raw.pendingActionIds.filter((id): id is string => typeof id === "string") }
      : {}),
    ...(typeof raw.activeRunId === "string" ? { activeRunId: raw.activeRunId } : {}),
  };
}

/** `messagesPage` of a conversation answer, or undefined when the server does not page its history. */
export function normalizeMessagesPage(value: unknown): MessagesPage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.hasMoreBefore !== "boolean") return undefined;
  return {
    limit: typeof raw.limit === "number" && Number.isFinite(raw.limit) ? raw.limit : 0,
    order: raw.order === "desc" ? "desc" : "asc",
    hasMoreBefore: raw.hasMoreBefore,
    hasMoreAfter: raw.hasMoreAfter === true,
  };
}

/** A budget as a server sent it (`onReach` defaults to `pause`), `null` when it was removed, or undefined. */
export function normalizeBudget(value: unknown): ConversationBudget | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const max = Number(raw.maxCostUsd ?? raw.max_cost_usd);
  if (!Number.isFinite(max) || max <= 0) return undefined;
  const onReach = raw.onReach ?? raw.on_reach;
  return { maxCostUsd: max, onReach: onReach === "stop" ? "stop" : "pause" };
}

type WithBudget = Pick<Conversation, "runtime" | "budget" | "spentUsd"> | Pick<ConversationListItem, "runtime" | "budget" | "spentUsd">;

/**
 * The conversation's spend limit is used up: the server says it is paused on it, or it has a
 * limit and has spent that much (a `stop` budget ends the conversation without a `budget_paused`
 * status, and the last turn may have crossed the line).
 */
export function isBudgetExhausted(conversation: WithBudget | null | undefined): boolean {
  if (!conversation) return false;
  if (conversation.runtime?.status === "budget_paused") return true;
  const budget = conversation.budget;
  return Boolean(budget && typeof conversation.spentUsd === "number" && conversation.spentUsd >= budget.maxCostUsd);
}

/**
 * The runtime a conversation is in after one of our own turns ended, from what the turn's
 * `stream.done` said. The server stays authoritative; this keeps the page right until the next load.
 */
export function runtimeAfterTurn(
  previous: ConversationRuntime | undefined,
  turn: {
    stopReason?: StopReason;
    pendingActionIds?: string[];
    budget?: ConversationBudget | null;
    seq?: number;
  }
): ConversationRuntime {
  const stopReason = turn.stopReason;
  const pending = turn.pendingActionIds ?? [];
  const status: RuntimeStatus =
    pending.length > 0 || stopReason === "requires_action"
      ? "requires_action"
      : stopReason === "budget_reached" && turn.budget?.onReach === "pause"
        ? "budget_paused"
        : "idle";
  return {
    status,
    ...(stopReason ? { stopReason } : {}),
    lastEventSeq: turn.seq ?? previous?.lastEventSeq ?? 0,
    pendingActionIds: pending,
  };
}

// ----------------------------------------------------------------------------
// Money
// ----------------------------------------------------------------------------

/** USD for a person: two decimals, more for tiny amounts so they do not read as zero. */
export function formatUsd(amount: number, locale?: string): string {
  const abs = Math.abs(amount);
  const digits = abs > 0 && abs < 0.01 ? 4 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(digits)}`;
  }
}
