import type { ConversationReminder, Message } from "../types";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/**
 * Reads a conversation's reminders off the wire (`{ id, fire_at (epoch s), message }`; `fireAt`
 * in milliseconds is accepted too), soonest first. Malformed entries are dropped.
 * `undefined` when the value is not a list.
 */
export function normalizeReminders(raw: unknown): ConversationReminder[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ConversationReminder[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    const id = typeof r.id === "string" ? r.id : undefined;
    const at = typeof r.fire_at === "number" ? r.fire_at * 1000 : typeof r.fireAt === "number" ? r.fireAt : undefined;
    if (!id || at === undefined || !Number.isFinite(at)) continue;
    out.push({ id, fireAt: at, message: typeof r.message === "string" ? r.message : "" });
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}

/** The reminder that fires first, and how many more follow it. */
export function nextReminder(reminders: ConversationReminder[] | undefined): { next: ConversationReminder; more: number } | undefined {
  if (!reminders || reminders.length === 0) return undefined;
  const sorted = [...reminders].sort((a, b) => a.fireAt - b.fireAt);
  return { next: sorted[0], more: sorted.length - 1 };
}

/** A stored message the server wrote when a reminder woke the agent up. */
export function isReminderMessage(message: Pick<Message, "role" | "metadata">): boolean {
  return message.role === "user" && message.metadata?.origin === "reminder";
}

/** What the agent asked to be reminded of, from `metadata.reminder.message`. */
export function reminderMessageOf(message: Pick<Message, "metadata">): string {
  const text = asRecord(message.metadata?.reminder).message;
  return typeof text === "string" ? text : "";
}

export type ReminderWatch = "stream" | "poll" | "none";

/** The fallback poll runs only when a reminder is due within this window (or overdue). */
export const REMINDER_POLL_WINDOW_MS = 2 * 60 * 1000;
export const REMINDER_POLL_INTERVAL_MS = 30 * 1000;

/**
 * How an idle, open conversation waits for a reminder to fire: `stream` (a passive event
 * follower), `poll` (the transport cannot follow events: look again from time to time) or
 * `none` (nothing to wait for, or the agent has no reminders).
 */
export function reminderWatchMode(input: {
  capability: boolean;
  reminders: ConversationReminder[] | undefined;
  idle: boolean;
  canFollow: boolean;
}): ReminderWatch {
  if (!input.capability || !input.idle) return "none";
  if (!input.reminders || input.reminders.length === 0) return "none";
  return input.canFollow ? "stream" : "poll";
}

/** Whether a poll tick should refresh: the tab is visible and a reminder is due soon or overdue. */
export function shouldPollReminders(reminders: ConversationReminder[] | undefined, now: number, visible: boolean): boolean {
  if (!visible || !reminders || reminders.length === 0) return false;
  return reminders.some((r) => r.fireAt - now <= REMINDER_POLL_WINDOW_MS);
}

/** "14:30", or "Oct 21, 14:30" when it is not today. */
export function formatReminderTime(ms: number, locale?: string, now: number = Date.now()): string {
  const date = new Date(ms);
  const sameDay = date.toDateString() === new Date(now).toDateString();
  try {
    return date.toLocaleString(locale, sameDay
      ? { hour: "2-digit", minute: "2-digit" }
      : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return date.toLocaleString();
  }
}
