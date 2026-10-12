"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn, MAX_FEEDBACK_COMMENT } from "../../utils";
import type { MessageFeedback } from "../../types";
import { useI18n } from "../../hooks/useI18n";
import { FOCUS_RING, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./styles";

export interface FeedbackSheetProps {
  /** The reasons to choose from (ids; each has a `chat.feedback.reason.<id>` string, others show as written) */
  reasons: string[];
  /** Offer the free-text comment */
  comments: boolean;
  /** What the person said before, when they come back to change it */
  initial?: Pick<MessageFeedback, "reasons" | "comment">;
  /** The rating is being sent */
  busy?: boolean;
  onSubmit: (details: { reasons: string[]; comment: string }) => void;
  onCancel: () => void;
  className?: string;
}

/**
 * The small form that opens with a thumbs-down: why it was not a good answer (any number of reasons)
 * and, if the host allows it, a comment. It is not modal - the conversation stays readable - but it
 * takes focus when it opens, closes on Escape and says what it is to a screen reader.
 */
export function FeedbackSheet({ reasons, comments, initial, busy = false, onSubmit, onCancel, className }: FeedbackSheetProps) {
  const { t, has } = useI18n();
  const titleId = useId();
  const [chosen, setChosen] = useState<string[]>(initial?.reasons ?? []);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const firstRef = useRef<HTMLButtonElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (firstRef.current ?? commentRef.current)?.focus();
  }, []);

  const label = (reason: string) => (has(`chat.feedback.reason.${reason}`) ? t(`chat.feedback.reason.${reason}`) : reason);
  const toggle = (reason: string) =>
    setChosen((prev) => (prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]));

  return (
    <form
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-chat-feedback-sheet
      className={cn("mt-2 max-w-md rounded-xl border border-chat-border-primary bg-chat-bg-primary p-3 shadow-lg", className)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onSubmit({ reasons: chosen, comment: comment.trim() });
      }}
    >
      <p id={titleId} className="mb-2 text-sm font-medium text-chat-text-primary">
        {t("chat.feedback.title")}
      </p>

      {reasons.length > 0 && (
        <div role="group" aria-label={t("chat.feedback.reasons")} className="mb-3 flex flex-wrap gap-1.5">
          {reasons.map((reason, index) => {
            const on = chosen.includes(reason);
            return (
              <button
                key={reason}
                ref={index === 0 ? firstRef : undefined}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(reason)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  FOCUS_RING,
                  on
                    ? "border-chat-accent-primary bg-chat-accent-primary text-chat-text-inverse"
                    : "border-chat-border-primary text-chat-text-secondary hover:bg-chat-bg-hover"
                )}
              >
                {label(reason)}
              </button>
            );
          })}
        </div>
      )}

      {comments && (
        <div className="mb-3">
          <label className="mb-1 block text-xs text-chat-text-secondary" htmlFor={`${titleId}-comment`}>
            {t("chat.feedback.comment")}
          </label>
          <textarea
            id={`${titleId}-comment`}
            ref={commentRef}
            value={comment}
            maxLength={MAX_FEEDBACK_COMMENT}
            rows={3}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t("chat.feedback.commentPlaceholder")}
            className="w-full resize-none rounded-lg border border-chat-border-primary bg-chat-bg-tertiary px-2.5 py-2 text-sm text-chat-text-primary placeholder:text-chat-text-tertiary focus:border-chat-accent-primary focus:outline-none"
          />
          <div className="mt-0.5 text-right text-[11px] tabular-nums text-chat-text-tertiary" aria-hidden="true">
            {comment.length}/{MAX_FEEDBACK_COMMENT}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className={SECONDARY_BUTTON} onClick={onCancel} disabled={busy}>
          {t("chat.feedback.cancel")}
        </button>
        <button type="submit" className={PRIMARY_BUTTON} disabled={busy}>
          {busy ? t("chat.feedback.sending") : t("chat.feedback.submit")}
        </button>
      </div>
    </form>
  );
}
