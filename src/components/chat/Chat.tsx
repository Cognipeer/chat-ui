"use client";

import React, { useState, useCallback } from "react";
import { cn } from "../../utils";
import type {
  Message,
  ConversationListItem,
  ChatConfig,
  ChatCallbacks,
  MessageActionProps,
} from "../../types";
import { ChatThemeProvider } from "../../providers";
import { useChat, useChatHistory } from "../../hooks";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { ChatHistory } from "./ChatHistory";
import { ToolCalls } from "./ToolCall";
import { MenuIcon } from "./Icons";

export interface ChatProps extends ChatConfig, ChatCallbacks {
  /** Custom class name for the container */
  className?: string;
  /** Show chat history sidebar */
  showHistory?: boolean;
  /** Default sidebar open state (mobile) */
  defaultHistoryOpen?: boolean;
  /** Initial conversation ID */
  conversationId?: string;
  /** Initial messages */
  initialMessages?: Message[];
  /** Theme mode */
  theme?: "light" | "dark";
  /** Custom theme colors */
  themeColors?: {
    bgPrimary?: string;
    bgSecondary?: string;
    bgTertiary?: string;
    textPrimary?: string;
    textSecondary?: string;
    accentPrimary?: string;
  };
  /** Render custom message actions */
  renderMessageActions?: (props: MessageActionProps) => React.ReactNode;
  /** Render custom avatar */
  renderAvatar?: (role: Message["role"]) => React.ReactNode;
  /** Render custom empty state */
  renderEmptyState?: () => React.ReactNode;
  /** Render custom header */
  renderHeader?: (props: { onMenuClick?: () => void }) => React.ReactNode;
  /** Render custom history header */
  renderHistoryHeader?: () => React.ReactNode;
  /** Render custom history footer */
  renderHistoryFooter?: () => React.ReactNode;
  /** Show avatars in messages */
  showAvatars?: boolean;
  /** Show timestamps in messages */
  showTimestamps?: boolean;
  /** Placeholder text for input */
  inputPlaceholder?: string;
  /** Whether to auto-scroll to new messages */
  autoScroll?: boolean;
}

/**
 * Main Chat component with history sidebar support
 */
export function Chat({
  // Config
  baseUrl,
  agentId,
  authorization,
  headers,
  streaming = true,
  enableFileUpload = true,
  allowedFileTypes,
  maxFileSize,
  maxFiles,
  // Callbacks
  onMessageSent,
  onMessageReceived,
  onStreamText,
  onToolCall,
  onToolResult,
  onError,
  onConversationCreated,
  onConversationSelected,
  // UI options
  className,
  showHistory = true,
  defaultHistoryOpen = false,
  conversationId,
  initialMessages,
  theme = "dark",
  themeColors,
  renderMessageActions,
  renderAvatar,
  renderEmptyState,
  renderHeader,
  renderHistoryHeader,
  renderHistoryFooter,
  showAvatars = true,
  showTimestamps = false,
  inputPlaceholder,
  autoScroll = true,
}: ChatProps) {
  const [historyOpen, setHistoryOpen] = useState(defaultHistoryOpen);

  // Chat state
  const chat = useChat({
    baseUrl,
    agentId,
    authorization,
    headers,
    streaming,
    enableFileUpload,
    allowedFileTypes,
    maxFileSize,
    maxFiles,
    conversationId,
    initialMessages,
    onMessageSent,
    onMessageReceived,
    onStreamText,
    onToolCall,
    onToolResult,
    onError,
    onConversationCreated,
  });

  // History state
  const history = useChatHistory({
    baseUrl,
    agentId,
    authorization,
    headers,
    autoLoad: showHistory,
  });

  const handleConversationSelect = useCallback(
    (conversation: ConversationListItem) => {
      chat.loadConversation(conversation.id);
      onConversationSelected?.(conversation);
      setHistoryOpen(false);
    },
    [chat, onConversationSelected]
  );

  const handleNewChat = useCallback(() => {
    chat.clearMessages();
    setHistoryOpen(false);
  }, [chat]);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await history.deleteConversation(id);
      if (chat.conversation?.id === id) {
        chat.clearMessages();
      }
    },
    [history, chat]
  );

  return (
    <ChatThemeProvider
      defaultMode={theme}
      theme={{
        mode: theme,
        colors: themeColors,
      }}
    >
      <div
        className={cn(
          "chat-container flex h-full bg-chat-bg-primary text-chat-text-primary",
          className
        )}
      >
        {/* History Sidebar */}
        {showHistory && (
          <ChatHistory
            conversations={history.conversations}
            selectedId={chat.conversation?.id}
            isLoading={history.isLoading}
            hasMore={history.hasMore}
            onSelect={handleConversationSelect}
            onDelete={handleDeleteConversation}
            onNewChat={handleNewChat}
            onLoadMore={history.loadMore}
            isOpen={historyOpen}
            onClose={() => setHistoryOpen(false)}
            header={renderHistoryHeader?.()}
            footer={renderHistoryFooter?.()}
          />
        )}

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          {renderHeader ? (
            renderHeader({
              onMenuClick: showHistory ? () => setHistoryOpen(true) : undefined,
            })
          ) : (
            <DefaultHeader
              showMenuButton={showHistory}
              onMenuClick={() => setHistoryOpen(true)}
              title={chat.conversation?.title || "New Chat"}
            />
          )}

          {/* Messages */}
          <ChatMessageList
            messages={chat.messages}
            isStreaming={chat.isLoading}
            streamingText={chat.streamingText}
            autoScroll={autoScroll}
            renderActions={renderMessageActions}
            renderAvatar={renderAvatar}
            showAvatars={showAvatars}
            showTimestamps={showTimestamps}
            emptyState={renderEmptyState?.()}
          />

          {/* Active Tool Calls */}
          {chat.activeToolCalls.size > 0 && (
            <div className="px-4 py-2 border-t border-chat-border-primary">
              <div className="max-w-3xl mx-auto">
                <ToolCalls
                  toolCalls={chat.activeToolCalls}
                  isExecuting={chat.isLoading}
                />
              </div>
            </div>
          )}

          {/* Error Display */}
          {chat.error && (
            <div className="px-4 py-2">
              <div className="max-w-3xl mx-auto">
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center justify-between">
                  <span>{chat.error.message}</span>
                  <button
                    onClick={() => chat.setError(null)}
                    className="text-red-400 hover:text-red-300"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Input */}
          <ChatInput
            onSend={chat.sendMessage}
            onStop={chat.stop}
            onFilesAdd={enableFileUpload ? chat.addFiles : undefined}
            onFileRemove={chat.removeFile}
            isLoading={chat.isLoading}
            pendingFiles={chat.pendingFiles}
            placeholder={inputPlaceholder}
            enableFileUpload={enableFileUpload}
            allowedFileTypes={allowedFileTypes}
            maxFiles={maxFiles}
          />
        </div>
      </div>
    </ChatThemeProvider>
  );
}

/**
 * Default header component
 */
interface DefaultHeaderProps {
  showMenuButton: boolean;
  onMenuClick: () => void;
  title: string;
}

function DefaultHeader({ showMenuButton, onMenuClick, title }: DefaultHeaderProps) {
  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-chat-border-primary">
      {showMenuButton && (
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 hover:bg-chat-bg-hover rounded-lg"
        >
          <MenuIcon className="w-5 h-5" />
        </button>
      )}
      <h1 className="text-lg font-medium truncate">{title}</h1>
    </div>
  );
}

// Export minimal version without history
export interface ChatMinimalProps extends Omit<ChatProps, "showHistory"> {}

export function ChatMinimal(props: ChatMinimalProps) {
  return <Chat {...props} showHistory={false} />;
}
