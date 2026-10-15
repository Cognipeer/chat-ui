"use client";

import React from "react";
import { cn } from "../../utils";
import { useI18n } from "../../hooks";
import { useAppearance } from "./appearance";
import { LoadingIcon } from "./Icons";

export interface ThinkingBlockProps {
  /** The model's reasoning text (shown as plain text) */
  reasoning: string;
  /** The reasoning is still arriving */
  streaming?: boolean;
  /** The answer has started; an open block closes itself unless the person opened it */
  answering?: boolean;
  className?: string;
}

/**
 * A collapsible "Thinking" block above an answer. While the model is still reasoning (no answer
 * text yet) it is open; once the answer starts it folds away, and a click always wins.
 */
export function ThinkingBlock({ reasoning, streaming = false, answering = false, className }: ThinkingBlockProps) {
  const { t } = useI18n();
  const modern = useAppearance() === "modern";
  const id = React.useId();
  const [choice, setChoice] = React.useState<boolean | null>(null);
  if (!reasoning) return null;
  const open = choice ?? (streaming && !answering);
  const live = streaming && !answering;
  if (modern) {
    // A quiet line instead of a framed box; the text opens under it, set off by a rule
    return (
      <div className={cn("text-sm", className)} data-testid="thinking-block">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          aria-label={open ? t("chat.reasoning.hide") : t("chat.reasoning.show")}
          onClick={() => setChoice(!open)}
          className="-ml-1.5 inline-flex items-center gap-2 rounded-lg px-1.5 py-1 text-left text-chat-text-secondary hover:bg-chat-bg-hover hover:text-chat-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-chat-border-secondary"
        >
          {live && <LoadingIcon className="h-4 w-4 flex-shrink-0 animate-spin text-chat-text-tertiary motion-reduce:animate-none" />}
          <span>{live ? t("chat.reasoning.thinking") : t("chat.activity.thought")}</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className={cn("h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-90")} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div
          id={id}
          role="region"
          aria-label={t("chat.reasoning.title")}
          hidden={!open}
          className="chat-scrollbar ml-[0.55rem] mt-1 max-h-80 overflow-y-auto whitespace-pre-wrap break-words border-l border-chat-border-primary pl-4 text-[13px] leading-relaxed text-chat-text-tertiary"
        >
          {reasoning}
        </div>
      </div>
    );
  }
  return (
    <div className={cn("rounded-lg border border-chat-border-primary bg-chat-bg-primary text-sm", className)} data-testid="thinking-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? t("chat.reasoning.hide") : t("chat.reasoning.show")}
        onClick={() => setChoice(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-chat-text-secondary hover:bg-chat-bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-chat-border-secondary rounded-lg"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className={cn("h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-90")} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-medium">{live ? t("chat.reasoning.thinking") : t("chat.reasoning.title")}</span>
      </button>
      <div id={id} role="region" aria-label={t("chat.reasoning.title")} hidden={!open} className="whitespace-pre-wrap break-words border-t border-chat-border-primary px-3 py-2 text-chat-text-tertiary">
        {reasoning}
      </div>
    </div>
  );
}
