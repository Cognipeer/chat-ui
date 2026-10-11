"use client";

import React from "react";
import { cn, messageStopDetail, messageWarnings, stopNoticeKind, type StopNoticeKind } from "../../utils";
import type { Message, StopNoticeRenderProps, TurnWarning } from "../../types";
import { AlertIcon } from "./Icons";
import { SECONDARY_BUTTON } from "./styles";
import { useI18n } from "../../hooks/useI18n";

/** The localized sentence for a stop; `budget_reached` and `error` are the ones that are not just "stopped". */
const STOP_KEYS: Record<StopNoticeKind, string> = {
  cancelled: "chat.stop.cancelled",
  limit: "chat.stop.limit",
  max_turns: "chat.stop.maxTurns",
  budget_reached: "chat.stop.budgetReached",
  error: "chat.stop.error",
  incomplete: "chat.stop.incomplete",
};

export interface MessageStopNoticeProps {
  message: Message;
  /** Whether the message has text of its own (a stopped answer is partial; with no text nothing was written) */
  hasText: boolean;
  /** Replace the notice */
  render?: (props: StopNoticeRenderProps) => React.ReactNode;
  className?: string;
}

/**
 * Says why an answer ends where it does: stopped by the person, a run limit, the conversation's
 * usage limit, an error. A plain answer, and a turn that paused for a person (the cards say that),
 * get nothing. The runtime's own wording (`stopDetail`) is not shown here, only through `render`.
 */
export function MessageStopNotice({ message, hasText, render, className }: MessageStopNoticeProps) {
  const { t } = useI18n();
  const kind = stopNoticeKind(message);
  if (!kind) return null;

  if (render) {
    return (
      <>
        {render({ message, stopReason: kind, detail: messageStopDetail(message), hasText })}
      </>
    );
  }

  const danger = kind === "error";
  return (
    <div
      role="status"
      data-chat-stop={kind}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        danger
          ? "border-chat-danger bg-chat-danger-bg text-chat-danger"
          : "border-chat-warning bg-chat-warning-bg text-chat-warning",
        className
      )}
    >
      <AlertIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="min-w-0">
        <div className="font-medium">{t(STOP_KEYS[kind])}</div>
        {/* a stop that left text behind: it is not a final answer; one that left none says so */}
        {kind !== "budget_reached" && (
          <div className="text-xs opacity-90">{hasText ? t("chat.stop.partialText") : t("chat.stop.noText")}</div>
        )}
      </div>
    </div>
  );
}

export interface InterruptedNoticeProps {
  /** The person's last message, the one that was left without an answer */
  message: Message;
  /** Send it again; without it (a transcript) the notice only says what happened */
  onRetry?: () => void;
  /** Replace the notice */
  render?: (props: StopNoticeRenderProps) => React.ReactNode;
  className?: string;
}

/**
 * Under a person's message the run never answered (it was cut off, say by a restart): says the reply
 * was interrupted and offers to send the message again.
 */
export function InterruptedNotice({ message, onRetry, render, className }: InterruptedNoticeProps) {
  const { t } = useI18n();
  if (render) {
    return <>{render({ message, stopReason: "error", detail: messageStopDetail(message), hasText: false, ...(onRetry ? { onRetry } : {}) })}</>;
  }
  return (
    <div
      role="status"
      data-chat-stop="interrupted"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-chat-danger bg-chat-danger-bg px-3 py-2 text-sm text-chat-danger",
        className
      )}
    >
      <AlertIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{t("chat.stop.interrupted")}</div>
        <div className="text-xs opacity-90">{t("chat.stop.interruptedBody")}</div>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className={cn(SECONDARY_BUTTON, "flex-shrink-0 !py-1 text-xs")}>
          {t("chat.error.retry")}
        </button>
      )}
    </div>
  );
}

function warningText(warning: TurnWarning, t: (id: string, values?: Record<string, string | number>) => string, has: (id: string) => boolean): string {
  const key = `chat.warning.${warning.code}`;
  if (has(key)) return t(key);
  return typeof warning.message === "string" && warning.message ? warning.message : warning.code;
}

/** Things worth knowing about a turn that still completed (`metadata.warnings`): files cut short, images not seen. */
export function MessageWarnings({ message, className }: { message: Message; className?: string }) {
  const { t, has } = useI18n();
  const warnings = messageWarnings(message);
  if (warnings.length === 0) return null;
  return (
    <ul className={cn("m-0 list-none space-y-1 p-0", className)} aria-label={t("chat.message.warnings")}>
      {warnings.map((warning, index) => (
        <li key={`${warning.code}-${index}`} className="flex items-start gap-2 text-xs text-chat-text-secondary">
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-chat-warning" />
          <span>{warningText(warning, t, has)}</span>
        </li>
      ))}
    </ul>
  );
}
