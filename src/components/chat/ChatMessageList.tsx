"use client";

import React, { useRef, useEffect } from "react";
import { cn } from "../../utils";
import type { Message, MessageActionProps } from "../../types";
import { ChatMessage } from "./ChatMessage";
import { ToolCalls } from "./ToolCall";

export interface ChatMessageListProps {
  /** Messages to display */
  messages: Message[];
  /** Whether currently streaming */
  isStreaming?: boolean;
  /** Current streaming text */
  streamingText?: string;
  /** Current progress/status message */
  progressMessage?: string;
  /** Active tool calls during streaming */
  activeToolCalls?: Map<string, { name: string; args: Record<string, unknown>; result?: unknown; reasoning?: string; displayName?: string }>;
  /** Custom class name */
  className?: string;
  /** Auto-scroll to bottom on new messages */
  autoScroll?: boolean;
  /** Render custom message actions */
  renderActions?: (props: MessageActionProps) => React.ReactNode;
  /** Render custom avatar */
  renderAvatar?: (role: Message["role"]) => React.ReactNode;
  /** Show avatars */
  showAvatars?: boolean;
  /** Show timestamps */
  showTimestamps?: boolean;
  /** Empty state content */
  emptyState?: React.ReactNode;
  /** Show citations section under assistant messages */
  enableCitations?: boolean;
}

/**
 * List of chat messages with auto-scroll
 */
export function ChatMessageList({
  messages,
  isStreaming = false,
  streamingText,
  progressMessage,
  activeToolCalls,
  className,
  autoScroll = true,
  renderActions,
  renderAvatar,
  showAvatars = true,
  showTimestamps = false,
  emptyState,
  enableCitations = true,
}: ChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingText, activeToolCalls, autoScroll]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className={cn("flex-1 flex items-center justify-center", className)}>
        {emptyState || <DefaultEmptyState />}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex-1 overflow-y-auto chat-scrollbar",
        className
      )}
    >
      <div className="max-w-3xl mx-auto">
        {messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            message={message}
            isStreaming={
              isStreaming &&
              index === messages.length - 1 &&
              message.role === "assistant"
            }
            streamingText={
              index === messages.length - 1 && message.role === "assistant"
                ? streamingText
                : undefined
            }
            renderActions={renderActions}
            renderAvatar={renderAvatar}
            showAvatar={showAvatars}
            showTimestamp={showTimestamps}
            enableCitations={enableCitations}
          />
        ))}

        {/* Streaming placeholder for new assistant message */}
        {isStreaming && streamingText && (
          <ChatMessage
            message={{
              id: "streaming",
              conversationId: "",
              role: "assistant",
              content: "",
              createdAt: new Date(),
              updatedAt: new Date(),
            }}
            isStreaming={true}
            streamingText={streamingText}
            renderAvatar={renderAvatar}
            showAvatar={showAvatars}
            enableCitations={enableCitations}
          />
        )}

        {/* Thinking / loading indicator when streaming but no text yet */}
        {isStreaming && !streamingText && (
          <div className="flex gap-4 px-4 py-6 bg-chat-bg-secondary animate-fade-in">
            {showAvatars && (
              <div className="flex-shrink-0">
                {renderAvatar ? renderAvatar("assistant") : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium bg-chat-bg-tertiary text-chat-text-primary">
                    AI
                  </div>
                )}
              </div>
            )}
            <div className="flex-1 min-w-0 flex flex-col gap-3 py-1">
              {/* Active tool calls during streaming */}
              {activeToolCalls && activeToolCalls.size > 0 && (
                <ToolCalls
                  toolCalls={activeToolCalls}
                  isExecuting={true}
                />
              )}
              {/* Show loading dots only when no tool calls are active */}
              {(!activeToolCalls || activeToolCalls.size === 0) && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-chat-text-tertiary rounded-full animate-pulse-dot" />
                  <div className="w-2 h-2 bg-chat-text-tertiary rounded-full animate-pulse-dot animation-delay-200" />
                  <div className="w-2 h-2 bg-chat-text-tertiary rounded-full animate-pulse-dot animation-delay-400" />
                </div>
              )}
              {progressMessage && (
                <div className="text-xs text-chat-text-tertiary">{progressMessage}</div>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/**
 * Default empty state
 */
function DefaultEmptyState() {
  return (
    <div className="text-center">
      <div className="text-chat-text-secondary text-lg mb-2">
        Start a conversation
      </div>
      <div className="text-chat-text-tertiary text-sm">
        Type a message below to begin chatting
      </div>
    </div>
  );
}
