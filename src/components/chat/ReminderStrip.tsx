"use client";

import { useState } from "react";
import { cn, formatReminderTime, nextReminder } from "../../utils";
import type { ConversationReminder } from "../../types";
import { useI18n } from "../../hooks/useI18n";
import { ClockIcon } from "./Icons";
import { FOCUS_RING } from "./styles";

export interface ReminderStripProps {
  reminders: ConversationReminder[];
  /** Cancels the reminder; without it there is no Cancel button */
  onCancel?: (reminderId: string) => Promise<unknown> | void;
  className?: string;
}

/** One gray line above the composer: when the agent will check back, and a way to cancel it. */
export function ReminderStrip({ reminders, onCancel, className }: ReminderStripProps) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const upcoming = nextReminder(reminders);
  if (!upcoming) return null;
  const { next, more } = upcoming;
  const handleCancel = async () => {
    if (!onCancel || busy) return;
    setBusy(true);
    try {
      await onCancel(next.id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-chat-reminder-strip className={cn("flex items-center gap-1.5 text-xs text-chat-text-tertiary", className)}>
      <ClockIcon className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="min-w-0 truncate" title={next.message || undefined}>
        {t("chat.reminder.next", { time: formatReminderTime(next.fireAt, locale) })}
        {more > 0 && <span className="ml-1">{t("chat.reminder.more", { count: more })}</span>}
      </span>
      {onCancel && (
        <button
          type="button"
          onClick={() => void handleCancel()}
          disabled={busy}
          aria-label={t("chat.reminder.cancelLabel")}
          className={cn("flex-shrink-0 rounded px-1 underline-offset-2 hover:text-chat-text-secondary hover:underline disabled:opacity-50", FOCUS_RING)}
        >
          {t("chat.reminder.cancel")}
        </button>
      )}
    </div>
  );
}
