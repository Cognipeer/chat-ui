"use client";

import { cn, formatReminderTime, reminderMessageOf } from "../../utils";
import type { Message } from "../../types";
import { useI18n } from "../../hooks/useI18n";
import { ClockIcon } from "./Icons";

export interface ReminderNoteProps {
  message: Pick<Message, "createdAt" | "metadata">;
  className?: string;
}

/**
 * The wake-up of a reminder, in place of a user bubble: small, gray, one clock icon. The stored
 * content is a framed note for the model; what the agent asked to be reminded of is
 * `metadata.reminder.message`.
 */
export function ReminderNote({ message, className }: ReminderNoteProps) {
  const { t, locale } = useI18n();
  const text = reminderMessageOf(message);
  const created = message.createdAt ? new Date(message.createdAt).getTime() : NaN;
  const label = Number.isFinite(created)
    ? t("chat.reminder.labelAt", { time: formatReminderTime(created, locale) })
    : t("chat.reminder.label");
  return (
    <div
      data-chat-reminder
      className={cn(
        "mx-4 my-2 flex items-start gap-2 rounded-lg border border-chat-border-primary bg-chat-bg-secondary px-3 py-2 text-xs text-chat-text-secondary",
        className
      )}
    >
      <ClockIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-chat-text-tertiary" />
      <div className="min-w-0">
        <div className="font-medium text-chat-text-tertiary">{label}</div>
        {text && <div className="whitespace-pre-wrap break-words">{text}</div>}
      </div>
    </div>
  );
}
