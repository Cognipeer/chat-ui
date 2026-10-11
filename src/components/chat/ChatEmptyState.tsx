"use client";

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, makeInfoUrlTransform } from "../../utils";
import type { ConversationStarter } from "../../types";
import { useI18n } from "../../hooks/useI18n";
import { DefaultEmptyState } from "./ChatMessageList";
import { FOCUS_RING } from "./styles";

/** Markdown the portal controls (a welcome text, an announcement): links open in a new tab, images are checked. */
export function InfoMarkdown({
  children,
  allowedImageHosts,
  className,
  inline = false,
}: {
  children: string;
  /** Hosts a picture may come from (https only); without it any https host is allowed */
  allowedImageHosts?: readonly string[];
  className?: string;
  /** Only text, emphasis, code and links: no headings, lists, tables or pictures */
  inline?: boolean;
}) {
  const urlTransform = useMemo(() => makeInfoUrlTransform(allowedImageHosts), [allowedImageHosts]);
  const components = useMemo(
    () => ({
      a: ({ href, children: label }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      ),
      img: ({ src, alt }: React.ImgHTMLAttributes<HTMLImageElement>) =>
        src ? <img src={src as string} alt={alt ?? ""} loading="lazy" className="mx-auto my-2 max-h-64 max-w-full rounded-lg object-contain" /> : null,
    }),
    []
  );
  return (
    <div className={cn("chat-markdown", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={urlTransform}
        {...(inline
          ? { allowedElements: ["p", "a", "strong", "em", "del", "code", "br"], unwrapDisallowed: true }
          : {})}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export interface ChatEmptyStateProps {
  /** The host's own empty state (`renderEmptyState`); replaces the welcome text and the default */
  custom?: React.ReactNode;
  /** Markdown shown before the first message */
  welcome?: string;
  /** Hosts a picture of the welcome text may come from */
  allowedImageHosts?: readonly string[];
  starters?: ConversationStarter[];
  /** A chip was chosen */
  onPick?: (starter: ConversationStarter) => void;
  /** The chips are not offered now (the composer is closed) */
  disabled?: boolean;
}

/**
 * What the chat shows before the first message: the host's own empty state, or the Markdown welcome,
 * or the default text - and under it the suggested first messages as chips.
 */
export function ChatEmptyState({ custom, welcome, allowedImageHosts, starters = [], onPick, disabled = false }: ChatEmptyStateProps) {
  const { t } = useI18n();
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-6 px-4 py-8 text-center">
      {custom ?? (welcome ? <InfoMarkdown allowedImageHosts={allowedImageHosts} className="text-left">{welcome}</InfoMarkdown> : <DefaultEmptyState />)}
      {starters.length > 0 && onPick && (
        <ul aria-label={t("chat.starters.label")} className="m-0 flex w-full list-none flex-wrap justify-center gap-2 p-0">
          {starters.map((starter, index) => (
            <li key={`${index}-${starter.text}`} className="max-w-full">
              <button
                type="button"
                disabled={disabled}
                title={starter.label ? starter.text : undefined}
                onClick={() => onPick(starter)}
                data-chat-starter
                className={cn(
                  "max-w-full truncate rounded-full border border-chat-border-primary bg-chat-bg-secondary px-4 py-2 text-sm text-chat-text-primary transition-colors",
                  "hover:bg-chat-bg-hover disabled:cursor-not-allowed disabled:opacity-50",
                  FOCUS_RING
                )}
              >
                {starter.label ?? starter.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
