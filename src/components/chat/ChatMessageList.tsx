"use client";

import React, { useRef, useEffect } from "react";
import { cn } from "../../utils";
import type { Message, MessageActionProps } from "../../types";
import { ChatMessage } from "./ChatMessage";

export interface ChatMessageListProps {
  /** Messages to display */
  messages: Message[];
  /** Whether currently streaming */
  isStreaming?: boolean;
  /** Current streaming text */
  streamingText?: string;
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
}

/**
 * List of chat messages with auto-scroll
 */
export function ChatMessageList({
  messages,
  isStreaming = false,
  streamingText,
  className,
  autoScroll = true,
  renderActions,
  renderAvatar,
  showAvatars = true,
  showTimestamps = false,
  emptyState,
}: ChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingText, autoScroll]);

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
          />
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
