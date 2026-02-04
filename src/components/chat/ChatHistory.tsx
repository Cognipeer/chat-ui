"use client";

import React from "react";
import { cn, formatRelativeTime } from "../../utils";
import type { ConversationListItem } from "../../types";
import { ChatIcon, TrashIcon, PlusIcon } from "./Icons";

export interface ChatHistoryProps {
  /** Conversations list */
  conversations: ConversationListItem[];
  /** Currently selected conversation ID */
  selectedId?: string;
  /** Whether loading */
  isLoading?: boolean;
  /** Has more items to load */
  hasMore?: boolean;
  /** Callback when selecting a conversation */
  onSelect: (conversation: ConversationListItem) => void;
  /** Callback when deleting a conversation */
  onDelete?: (conversationId: string) => void;
  /** Callback when creating a new conversation */
  onNewChat?: () => void;
  /** Callback when loading more */
  onLoadMore?: () => void;
  /** Custom class name */
  className?: string;
  /** Whether sidebar is open (for mobile) */
  isOpen?: boolean;
  /** Callback to close sidebar */
  onClose?: () => void;
  /** Custom header content */
  header?: React.ReactNode;
  /** Custom footer content */
  footer?: React.ReactNode;
}

/**
 * Chat history sidebar component
 */
export function ChatHistory({
  conversations,
  selectedId,
  isLoading = false,
  hasMore = false,
  onSelect,
  onDelete,
  onNewChat,
  onLoadMore,
  className,
  isOpen = true,
  onClose,
  header,
  footer,
}: ChatHistoryProps) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && onClose && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "flex flex-col h-full bg-chat-bg-secondary border-r border-chat-border-primary",
          "w-[280px] fixed md:relative z-50 transition-transform duration-300",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          className
        )}
      >
        {/* Header — fixed height to align border with main chat header */}
        {header || (
          <div className="flex-shrink-0 flex items-center px-4 h-[58px] border-b border-chat-border-primary">
            {onNewChat && (
              <button
                onClick={onNewChat}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-chat-bg-tertiary hover:bg-chat-bg-hover rounded-lg text-chat-text-primary transition-colors"
              >
                <PlusIcon className="w-3 h-3" />
                <span>New Chat</span>
              </button>
            )}
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto chat-scrollbar">
          {conversations.length === 0 && !isLoading ? (
            <div className="p-4 text-center text-chat-text-tertiary text-sm">
              No conversations yet
            </div>
          ) : (
            <div className="p-2">
              {conversations.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isSelected={conversation.id === selectedId}
                  onSelect={() => onSelect(conversation)}
                  onDelete={onDelete ? () => onDelete(conversation.id) : undefined}
                />
              ))}

              {/* Load more button */}
              {hasMore && !isLoading && (
                <button
                  onClick={onLoadMore}
                  className="w-full py-2 text-sm text-chat-accent-primary hover:underline"
                >
                  Load more
                </button>
              )}

              {/* Loading indicator */}
              {isLoading && (
                <div className="py-4 text-center">
                  <LoadingDots />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex-shrink-0 border-t border-chat-border-primary">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Individual conversation item
 */
interface ConversationItemProps {
  conversation: ConversationListItem;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}

function ConversationItem({
  conversation,
  isSelected,
  onSelect,
  onDelete,
}: ConversationItemProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
        isSelected
          ? "bg-chat-bg-hover"
          : "hover:bg-chat-bg-tertiary"
      )}
      onClick={onSelect}
    >
      <ChatIcon className="w-4 h-4 text-chat-text-tertiary flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-chat-text-primary truncate">
          {conversation.title || "New Chat"}
        </div>
        <div className="text-xs text-chat-text-tertiary">
          {formatRelativeTime(new Date(conversation.updatedAt))}
        </div>
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-chat-bg-hover rounded transition-all"
          title="Delete conversation"
        >
          <TrashIcon className="w-4 h-4 text-chat-text-tertiary hover:text-red-400" />
        </button>
      )}
    </div>
  );
}

/**
 * Loading dots animation
 */
function LoadingDots() {
  return (
    <div className="flex justify-center gap-1">
      <div className="w-2 h-2 bg-chat-text-tertiary rounded-full animate-pulse-dot" />
      <div className="w-2 h-2 bg-chat-text-tertiary rounded-full animate-pulse-dot animation-delay-200" />
      <div className="w-2 h-2 bg-chat-text-tertiary rounded-full animate-pulse-dot animation-delay-400" />
    </div>
  );
}
