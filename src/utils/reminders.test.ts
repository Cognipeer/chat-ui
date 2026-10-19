import { describe, expect, it } from "vitest";
import {
  isReminderMessage,
  nextReminder,
  normalizeReminders,
  reminderMessageOf,
  reminderWatchMode,
  shouldPollReminders,
} from "./reminders";

const r = (id: string, fireAt: number) => ({ id, fireAt, message: id });

describe("normalizeReminders", () => {
  it("reads fire_at in seconds, sorts and drops malformed entries", () => {
    expect(normalizeReminders([{ id: "b", fire_at: 200, message: "B" }, { id: "a", fire_at: 100, message: "A" }, { nope: 1 }])).toEqual([
      { id: "a", fireAt: 100000, message: "A" },
      { id: "b", fireAt: 200000, message: "B" },
    ]);
  });
  it("is undefined for a non-list", () => {
    expect(normalizeReminders(undefined)).toBeUndefined();
    expect(normalizeReminders({})).toBeUndefined();
  });
});

describe("nextReminder", () => {
  it("returns the soonest and the rest count", () => {
    expect(nextReminder([r("b", 20), r("a", 10), r("c", 30)])).toEqual({ next: r("a", 10), more: 2 });
    expect(nextReminder([])).toBeUndefined();
  });
});

describe("reminder messages", () => {
  it("recognises the wake-up message and reads its text", () => {
    const m = { role: "user" as const, metadata: { origin: "reminder", reminder: { message: "check build" } } };
    expect(isReminderMessage(m)).toBe(true);
    expect(reminderMessageOf(m)).toBe("check build");
    expect(isReminderMessage({ role: "user", metadata: {} })).toBe(false);
    expect(isReminderMessage({ role: "assistant", metadata: { origin: "reminder" } })).toBe(false);
  });
});

describe("reminderWatchMode", () => {
  const base = { capability: true, reminders: [r("a", 1)], idle: true, canFollow: true };
  it("streams when idle with a reminder and a follow-capable transport", () => {
    expect(reminderWatchMode(base)).toBe("stream");
  });
  it("polls without followEvents", () => {
    expect(reminderWatchMode({ ...base, canFollow: false })).toBe("poll");
  });
  it("does nothing without capability, reminders, or while busy", () => {
    expect(reminderWatchMode({ ...base, capability: false })).toBe("none");
    expect(reminderWatchMode({ ...base, reminders: [] })).toBe("none");
    expect(reminderWatchMode({ ...base, reminders: undefined })).toBe("none");
    expect(reminderWatchMode({ ...base, idle: false })).toBe("none");
  });
});

describe("shouldPollReminders", () => {
  const now = 1_000_000;
  it("polls when due within 2 minutes or overdue, only while visible", () => {
    expect(shouldPollReminders([r("a", now + 60_000)], now, true)).toBe(true);
    expect(shouldPollReminders([r("a", now - 5_000)], now, true)).toBe(true);
    expect(shouldPollReminders([r("a", now + 10 * 60_000)], now, true)).toBe(false);
    expect(shouldPollReminders([r("a", now + 60_000)], now, false)).toBe(false);
    expect(shouldPollReminders([], now, true)).toBe(false);
  });
});
