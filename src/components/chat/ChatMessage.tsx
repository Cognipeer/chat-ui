"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../utils";
import type { Message, MessageActionProps, FileAttachment, Citation } from "../../types";
import { FileIcon } from "./Icons";
import { ToolCalls } from "./ToolCall";
import { useI18n } from "../../hooks";

export interface ChatMessageProps {
  /** The message to display */
  message: Message;
  /** Whether this message is currently streaming */
  isStreaming?: boolean;
  /** Current streaming text (only used when isStreaming is true) */
  streamingText?: string;
  /** Custom class name */
  className?: string;
  /** Render custom message actions (like feedback buttons) */
  renderActions?: (props: MessageActionProps) => React.ReactNode;
  /** Render custom avatar */
  renderAvatar?: (role: Message["role"]) => React.ReactNode;
  /** Show avatar */
  showAvatar?: boolean;
  /** Show timestamp */
  showTimestamp?: boolean;
  /** Show sources section for assistant messages */
  enableCitations?: boolean;
}

/**
 * Individual chat message component
 */
export function ChatMessage({
  message,
  isStreaming = false,
  streamingText,
  className,
  renderActions,
  renderAvatar,
  showAvatar = true,
  showTimestamp = false,
  enableCitations = true,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const content = isStreaming && streamingText ? streamingText : getTextContent(message.content);

  return (
    <div
      className={cn(
        "group flex gap-4 px-4 py-6 animate-fade-in",
        isUser ? "bg-transparent" : "bg-chat-bg-secondary",
        className
      )}
    >
      {/* Avatar */}
      {showAvatar && (
        <div className="flex-shrink-0">
          {renderAvatar ? (
            renderAvatar(message.role)
          ) : (
            <DefaultAvatar role={message.role} />
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Tool calls from completed messages — shown above the text */}
        {isAssistant && !isStreaming && hasToolCalls(message) && (
          <MessageToolCalls message={message} />
        )}

        {/* Message content */}
        <div className="chat-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
          {isStreaming && <StreamingCursor />}
        </div>

        {/* File attachments */}
        {message.files && message.files.length > 0 && (
          <FileAttachments files={message.files} />
        )}

        {/* Sources */}
        {enableCitations && isAssistant && !isStreaming && message.citations && message.citations.length > 0 && (
          <MessageCitations citations={message.citations} />
        )}

        {/* Timestamp */}
        {showTimestamp && (
          <div className="text-xs text-chat-text-tertiary mt-2">
            {formatTime(message.createdAt)}
          </div>
        )}

        {/* Custom actions slot */}
        {isAssistant && !isStreaming && renderActions && (
          <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {renderActions({ message, isStreaming })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Default avatar component
 */
function DefaultAvatar({ role }: { role: Message["role"] }) {
  const { t } = useI18n();
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
        isUser
          ? "bg-chat-accent-primary text-chat-text-inverse"
          : "bg-chat-bg-tertiary text-chat-text-primary"
      )}
    >
      {isUser ? t("chat.message.user") : t("chat.message.ai")}
    </div>
  );
}

/**
 * Streaming cursor animation
 */
function StreamingCursor() {
  return (
    <span className="inline-block w-2 h-4 bg-chat-text-primary animate-pulse ml-0.5" />
  );
}

/**
 * File attachments display
 */
function FileAttachments({ files }: { files: FileAttachment[] }) {
  const { t } = useI18n();
  
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {files.map((file) => (
        <div
          key={file.id}
          className="flex items-center gap-2 px-3 py-2 bg-chat-bg-tertiary rounded-lg text-sm"
        >
          <FileIcon className="w-4 h-4 text-chat-text-secondary" />
          <span className="text-chat-text-primary truncate max-w-[200px]">
            {file.name}
          </span>
          {file.url && (
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-chat-accent-primary hover:underline"
            >
              {t("chat.file.download")}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function MessageCitations({ citations }: { citations: Citation[] }) {
  const { t } = useI18n();
  const DEFAULT_VISIBLE_CITATIONS = 5;
  const [showAll, setShowAll] = React.useState(false);

  const hasMoreThanDefault = citations.length > DEFAULT_VISIBLE_CITATIONS;
  const visibleCitations = showAll ? citations : citations.slice(0, DEFAULT_VISIBLE_CITATIONS);

  return (
    <div className="mt-3">
      <div className="text-xs font-medium text-chat-text-secondary mb-2">{t("chat.message.sources")}</div>
      <div className="space-y-2">
        {visibleCitations.map((citation, index) => {
          const title = citation.title?.trim() || t("chat.message.source", { index: index + 1 });
          
          return (
            <div
              key={citation.id || `${title}-${index}`}
              className="rounded-lg border border-chat-border-primary bg-chat-bg-tertiary/50 p-3"
            >
              {citation.link ? (
                <a
                  href={citation.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-chat-accent-primary hover:underline"
                >
                  {title}
                </a>
              ) : (
                <div className="text-sm font-medium text-chat-text-primary">{title}</div>
              )}

              {citation.image && (
                <img
                  src={citation.image}
                  alt={title}
                  className="mt-2 max-h-40 w-full rounded-md object-cover"
                />
              )}

              {citation.description && (
                <p className="mt-2 text-xs text-chat-text-secondary leading-relaxed">{citation.description}</p>
              )}
            </div>
          );
        })}
      </div>

      {hasMoreThanDefault && (
        <div className="mt-2">
          <button
            type="button"
            className="text-xs text-chat-accent-primary hover:underline"
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? t("chat.message.showLess") : t("chat.message.showAll", { count: citations.length })}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Extract text content from message content
 */
function getTextContent(content: Message["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  return content
    .filter((part) => part.type === "text" && "text" in part)
    .map((part) => (part as { type: "text"; text: string }).text)
    .join("");
}

/**
 * Format timestamp
 */
function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Check if a message has tool call details
 */
function hasToolCalls(message: Message): boolean {
  const details = (message.metadata as Record<string, unknown> | undefined)?.toolCallDetails;
  return Array.isArray(details) && details.length > 0;
}

/**
 * Render tool calls from a completed message's metadata
 */
function MessageToolCalls({ message }: { message: Message }) {
  const meta = message.metadata as Record<string, unknown> | undefined;
  const details = meta?.toolCallDetails as
    | Array<{ id: string; name: string; args: Record<string, unknown>; result?: unknown }>
    | undefined;
  const durationSeconds = meta?.toolCallDurationSeconds as number | undefined;

  if (!details || details.length === 0) return null;

  return (
    <div className="mt-2">
      <ToolCalls
        toolCalls={details}
        isExecuting={false}
        durationSeconds={durationSeconds}
        defaultExpanded={false}
      />
    </div>
  );
}
