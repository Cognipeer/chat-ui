"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn, copyText } from "../../utils";
import type { FeedbackInput, MessageFeedback } from "../../types";
import { useI18n } from "../../hooks/useI18n";
import { CheckIcon, CopyIcon, PencilIcon, RefreshIcon, ThumbsDownIcon, ThumbsUpIcon } from "./Icons";
import { FeedbackSheet } from "./FeedbackSheet";
import { FOCUS_RING } from "./styles";

/** What a message's toolbar offers; each entry is only given where the action makes sense. */
export interface MessageToolbarConfig {
  /** Copy the message text */
  copy?: boolean;
  /** Run this answer again (the last answer only) */
  onRegenerate?: () => void;
  /** Edit this message (one of the person's) */
  onEdit?: () => void;
  /** Rate this answer */
  feedback?: {
    comments: boolean;
    reasons: string[];
    current?: MessageFeedback;
    onSubmit: (input: FeedbackInput) => Promise<boolean> | boolean | void;
  };
  /** Keep the toolbar visible (the last message); otherwise it shows on hover and focus */
  persistent?: boolean;
}

export interface MessageToolbarProps extends MessageToolbarConfig {
  /** The text `copy` puts on the clipboard */
  text: string;
  className?: string;
}

function ToolbarButton({
  label,
  onClick,
  pressed,
  children,
  buttonRef,
  expanded,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
  buttonRef?: React.Ref<HTMLButtonElement>;
  expanded?: boolean;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      className={cn(
        "rounded p-1.5 transition-colors",
        FOCUS_RING,
        pressed ? "text-chat-accent-primary" : "text-chat-text-tertiary hover:bg-chat-bg-hover hover:text-chat-text-secondary"
      )}
    >
      {children}
    </button>
  );
}

/**
 * The row of small buttons under a message: copy, regenerate, edit, thumbs up / down. It shows when
 * the message is hovered or focused (always on touch screens and on the newest message), and the
 * thumbs-down opens the reasons form.
 */
export function MessageToolbar({ text, copy, onRegenerate, onEdit, feedback, persistent, className }: MessageToolbarProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);
  const downRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thanksTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (thanksTimer.current) clearTimeout(thanksTimer.current);
  }, []);

  const doCopy = useCallback(async () => {
    const ok = await copyText(text);
    setCopied(ok ? "done" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied("idle"), 2000);
  }, [text]);

  const rating = feedback?.current?.rating;
  const send = async (input: FeedbackInput): Promise<boolean> => {
    if (!feedback) return false;
    setBusy(true);
    try {
      const ok = (await feedback.onSubmit(input)) !== false;
      if (ok && input.rating) {
        setThanks(true);
        if (thanksTimer.current) clearTimeout(thanksTimer.current);
        thanksTimer.current = setTimeout(() => setThanks(false), 2500);
      }
      return ok;
    } finally {
      setBusy(false);
    }
  };

  const closeSheet = () => {
    setSheetOpen(false);
    // the keyboard goes back to where it was
    setTimeout(() => downRef.current?.focus(), 0);
  };

  const hasAnything = (copy && text) || onRegenerate || onEdit || feedback;
  if (!hasAnything) return null;

  return (
    <div className={className}>
      <div
        role="group"
        aria-label={t("chat.toolbar.label")}
        data-persist={persistent ? "true" : undefined}
        className="chat-message-actions flex items-center gap-0.5"
      >
        {copy && text && (
          <ToolbarButton label={copied === "done" ? t("chat.actions.copied") : t("chat.actions.copy")} onClick={doCopy} pressed={copied === "done" ? true : undefined}>
            {copied === "done" ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
          </ToolbarButton>
        )}
        {onEdit && (
          <ToolbarButton label={t("chat.actions.edit")} onClick={onEdit}>
            <PencilIcon className="h-4 w-4" />
          </ToolbarButton>
        )}
        {onRegenerate && (
          <ToolbarButton label={t("chat.actions.regenerate")} onClick={onRegenerate}>
            <RefreshIcon className="h-4 w-4" />
          </ToolbarButton>
        )}
        {feedback && (
          <>
            <ToolbarButton
              label={t("chat.actions.goodResponse")}
              pressed={rating === "up"}
              onClick={() => {
                setSheetOpen(false);
                void send({ rating: rating === "up" ? null : "up" });
              }}
            >
              <ThumbsUpIcon className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              buttonRef={downRef}
              label={t("chat.actions.badResponse")}
              pressed={rating === "down"}
              expanded={sheetOpen}
              onClick={() => {
                if (rating === "down") {
                  // pressing the thumb again takes the rating back
                  setSheetOpen(false);
                  void send({ rating: null });
                } else {
                  setSheetOpen((open) => !open);
                }
              }}
            >
              <ThumbsDownIcon className="h-4 w-4" />
            </ToolbarButton>
          </>
        )}
        {thanks && (
          <span aria-hidden="true" className="ml-1 text-xs text-chat-text-tertiary">
            {t("chat.feedback.thanks")}
          </span>
        )}
        {/* Spoken when the text was copied (or could not be) or a rating was taken - the icons alone change silently */}
        <span role="status" className="sr-only">
          {copied === "done"
            ? t("chat.actions.copied")
            : copied === "failed"
              ? t("chat.actions.failedToCopy")
              : thanks
                ? t("chat.feedback.thanks")
                : ""}
        </span>
      </div>

      {feedback && sheetOpen && (
        <FeedbackSheet
          reasons={feedback.reasons}
          comments={feedback.comments}
          initial={feedback.current?.rating === "down" ? feedback.current : undefined}
          busy={busy}
          onCancel={closeSheet}
          onSubmit={async ({ reasons, comment }) => {
            const ok = await send({
              rating: "down",
              ...(reasons.length > 0 ? { reasons } : {}),
              ...(comment ? { comment } : {}),
            });
            if (ok) closeSheet();
          }}
        />
      )}
    </div>
  );
}
