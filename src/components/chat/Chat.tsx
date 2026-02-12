"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { cn } from "../../utils";
import type {
  Message,
  Conversation,
  ConversationListItem,
  AgentInfo,
  ChatConfig,
  ChatCallbacks,
  MessageActionProps,
} from "../../types";
import { ChatThemeProvider } from "../../providers";
import { AgentServerClient } from "../../api";
import { useChat, useChatHistory } from "../../hooks";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import type { ChatInputHandle } from "./ChatInput";
import { ChatHistory } from "./ChatHistory";
import { MenuIcon, ChevronDownIcon } from "./Icons";

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
  renderHeader?: (props: { onMenuClick?: () => void; agents?: AgentInfo[]; selectedAgentId?: string; onAgentChange?: (id: string) => void }) => React.ReactNode;
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
  /** Auto-focus the chat input on mount and after actions (new chat, conversation select) */
  autoFocusInput?: boolean;
  /** Enable search input in chat history sidebar */
  enableMessageSearch?: boolean;
  /** Show citations section under assistant messages */
  enableCitations?: boolean;
  /** Called when selected agent changes (multi-agent mode) */
  onAgentChange?: (agentId: string) => void;
}

/**
 * Main Chat component with history sidebar support.
 *
 * When `agentId` is omitted the component will fetch the list of agents from
 * `GET /agents` and display a selector in the header when there are multiple.
 */
export function Chat({
  // Config
  baseUrl,
  agentId: externalAgentId,
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
  onAgentChange,
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
  autoFocusInput = false,
  enableMessageSearch = false,
  enableCitations = true,
}: ChatProps) {
  const [historyOpen, setHistoryOpen] = useState(defaultHistoryOpen);

  // Ref for the ChatInput so we can focus it programmatically
  const inputRef = useRef<ChatInputHandle>(null);

  // ---- Multi-agent support ----
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(externalAgentId);

  // Keep a ref-based client for agent fetching
  const agentClientRef = useRef<AgentServerClient | null>(null);
  useMemo(() => {
    agentClientRef.current = new AgentServerClient({
      baseUrl,
      agentId: selectedAgentId || "",
      authorization,
      headers,
    });
  }, [baseUrl, authorization, headers, selectedAgentId]);

  // Sync external agentId prop
  useEffect(() => {
    if (externalAgentId) {
      setSelectedAgentId(externalAgentId);
    }
  }, [externalAgentId]);

  // Fetch agents on mount
  useEffect(() => {
    if (!agentClientRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const agentList = await agentClientRef.current!.getAgents();
        if (cancelled) return;
        setAgents(agentList);
        // If no agentId was provided, default to first agent
        if (!externalAgentId && agentList.length > 0 && !selectedAgentId) {
          setSelectedAgentId(agentList[0].id);
        }
      } catch (err) {
        // Agents endpoint is optional — ignore errors silently
        console.warn("Failed to fetch agents:", err);
      }
    })();

    return () => { cancelled = true; };
  }, [baseUrl, authorization]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAgentChange = useCallback((newAgentId: string) => {
    setSelectedAgentId(newAgentId);
    onAgentChange?.(newAgentId);
  }, [onAgentChange]);

  // The agentId actually used by the hooks
  const effectiveAgentId = selectedAgentId || externalAgentId || "";

  // Compute effective file upload setting from agent metadata (peer-based toggle)
  const selectedAgent = agents.find(a => a.id === effectiveAgentId);
  const effectiveFileUpload = selectedAgent?.metadata?.enableFileUpload !== undefined
    ? Boolean(selectedAgent.metadata.enableFileUpload)
    : enableFileUpload;

  // Use refs for callbacks that will depend on history (defined later)
  const onMessageReceivedRef = useRef(onMessageReceived);
  onMessageReceivedRef.current = onMessageReceived;
  const onConversationCreatedRef = useRef(onConversationCreated);
  onConversationCreatedRef.current = onConversationCreated;
  const historyRef = useRef<ReturnType<typeof useChatHistory> | null>(null);

  const wrappedOnMessageReceived = useCallback((message: Message) => {
    onMessageReceivedRef.current?.(message);
    if (showHistory) {
      historyRef.current?.refresh();
    }
  }, [showHistory]);

  const wrappedOnConversationCreated = useCallback((conv: Conversation) => {
    onConversationCreatedRef.current?.(conv);
    if (showHistory) {
      historyRef.current?.refresh();
    }
  }, [showHistory]);

  // Chat state
  const chat = useChat({
    baseUrl,
    agentId: effectiveAgentId,
    authorization,
    headers,
    streaming,
    enableFileUpload: effectiveFileUpload,
    allowedFileTypes,
    maxFileSize,
    maxFiles,
    conversationId,
    initialMessages,
    onMessageSent,
    onMessageReceived: wrappedOnMessageReceived,
    onStreamText,
    onToolCall,
    onToolResult,
    onError,
    onConversationCreated: wrappedOnConversationCreated,
  });

  // History state — when there are multiple agents, don't filter by agentId
  // so we can see all portal conversations
  const history = useChatHistory({
    baseUrl,
    agentId: agents.length > 1 ? undefined : effectiveAgentId,
    authorization,
    headers,
    autoLoad: showHistory,
  });

  // Keep historyRef in sync so the wrapped callbacks can refresh
  historyRef.current = history;

  const handleConversationSelect = useCallback(
    (conversation: ConversationListItem) => {
      chat.loadConversation(conversation.id);
      onConversationSelected?.(conversation);
      setHistoryOpen(false);
      // Focus the input after selecting a conversation
      if (autoFocusInput) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    },
    [chat, onConversationSelected, autoFocusInput]
  );

  const handleNewChat = useCallback(() => {
    chat.clearMessages();
    setHistoryOpen(false);
    // Focus the input after starting a new chat
    if (autoFocusInput) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [chat, autoFocusInput]);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await history.deleteConversation(id);
      if (chat.conversation?.id === id) {
        chat.clearMessages();
      }
    },
    [history, chat]
  );

  const showAgentSelector = !chat.isLoadingConversation && chat.messages.length === 0;

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
            enableSearch={enableMessageSearch}
          />
        )}

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          {renderHeader ? (
            renderHeader({
              onMenuClick: showHistory ? () => setHistoryOpen(true) : undefined,
              agents,
              selectedAgentId: effectiveAgentId,
              onAgentChange: handleAgentChange,
            })
          ) : (
            <DefaultHeader
              showMenuButton={showHistory}
              onMenuClick={() => setHistoryOpen(true)}
              title={chat.conversation?.title || "New Chat"}
              agents={agents}
              selectedAgentId={effectiveAgentId}
              onAgentChange={handleAgentChange}
              showAgentSelector={showAgentSelector}
            />
          )}

          {/* Messages */}
          {chat.isLoadingConversation ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 bg-chat-text-tertiary rounded-full animate-pulse-dot" />
                  <div className="w-2.5 h-2.5 bg-chat-text-tertiary rounded-full animate-pulse-dot animation-delay-200" />
                  <div className="w-2.5 h-2.5 bg-chat-text-tertiary rounded-full animate-pulse-dot animation-delay-400" />
                </div>
                <span className="text-sm text-chat-text-tertiary">Loading conversation...</span>
              </div>
            </div>
          ) : (
            <ChatMessageList
              messages={chat.messages}
              isStreaming={chat.isStreaming}
              streamingText={chat.streamingText}
              progressMessage={chat.progressMessage}
              activeToolCalls={chat.activeToolCalls}
              autoScroll={autoScroll}
              renderActions={renderMessageActions}
              renderAvatar={renderAvatar}
              showAvatars={showAvatars}
              showTimestamps={showTimestamps}
              enableCitations={enableCitations}
              emptyState={renderEmptyState?.()}
            />
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
            ref={inputRef}
            onSend={chat.sendMessage}
            onStop={chat.stop}
            onFilesAdd={effectiveFileUpload ? chat.addFiles : undefined}
            onFileRemove={chat.removeFile}
            isLoading={chat.isStreaming}
            pendingFiles={chat.pendingFiles}
            placeholder={inputPlaceholder}
            enableFileUpload={effectiveFileUpload}
            allowedFileTypes={allowedFileTypes}
            maxFiles={maxFiles}
            autoFocus={autoFocusInput}
          />
        </div>
      </div>
    </ChatThemeProvider>
  );
}

/**
 * Default header component with optional agent selector
 */
interface DefaultHeaderProps {
  showMenuButton: boolean;
  onMenuClick: () => void;
  title: string;
  agents?: AgentInfo[];
  selectedAgentId?: string;
  onAgentChange?: (id: string) => void;
  /** When false, hides the agent selector dropdown even if multiple agents exist */
  showAgentSelector?: boolean;
}

const CHAT_HEADER_HEIGHT = "h-[58px]";

function DefaultHeader({ showMenuButton, onMenuClick, title, agents = [], selectedAgentId, onAgentChange, showAgentSelector = true }: DefaultHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const showAgentPicker = agents.length > 1 && showAgentSelector;
  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [dropdownOpen]);

  return (
    <div className={cn("flex-shrink-0 flex items-center gap-3 px-4 border-b border-chat-border-primary", CHAT_HEADER_HEIGHT)}>
      {showMenuButton && (
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 hover:bg-chat-bg-hover rounded-lg"
        >
          <MenuIcon className="w-5 h-5" />
        </button>
      )}

      {/* Agent selector or simple title */}
      {showAgentPicker ? (
        <div className="relative flex-1 min-w-0" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-chat-bg-hover transition-colors max-w-full"
          >
            <BotIcon className="w-4 h-4 text-chat-accent-primary flex-shrink-0" />
            <span className="text-sm font-medium truncate">
              {selectedAgent?.name || "Select Agent"}
            </span>
            <ChevronDownIcon className={cn("w-3 h-3 text-chat-text-tertiary transition-transform flex-shrink-0", dropdownOpen && "rotate-180")} />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-chat-bg-secondary border border-chat-border-primary rounded-lg shadow-xl z-50 py-1 max-h-60 overflow-y-auto">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => {
                    onAgentChange?.(agent.id);
                    setDropdownOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm hover:bg-chat-bg-hover transition-colors flex items-center gap-2",
                    agent.id === selectedAgentId && "bg-chat-bg-tertiary"
                  )}
                >
                  <BotIcon className="w-4 h-4 text-chat-accent-primary flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{agent.name}</div>
                    {agent.description && (
                      <div className="text-xs text-chat-text-tertiary truncate">{agent.description}</div>
                    )}
                  </div>
                  {agent.id === selectedAgentId && (
                    <div className="w-1.5 h-1.5 rounded-full bg-chat-accent-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <h1 className="text-lg font-medium truncate flex-1">{selectedAgent?.name || (agents.length === 1 ? agents[0].name : title)}</h1>
      )}
    </div>
  );
}

/**
 * Bot / Agent icon
 */
function BotIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

// Export minimal version without history
export interface ChatMinimalProps extends Omit<ChatProps, "showHistory"> {}

export function ChatMinimal(props: ChatMinimalProps) {
  return <Chat {...props} showHistory={false} />;
}
