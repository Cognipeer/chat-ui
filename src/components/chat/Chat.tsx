"use client";

import React, { useState, useCallback, useEffect, useImperativeHandle, useRef, useMemo } from "react";
import {
  cn,
  conversationToJson,
  conversationToMarkdown,
  conversationToPrintHtml,
  downloadBlob,
  EXPORT_MIME,
  exportFilename,
  localizeError,
  printHtml,
  resolveAgentSettings,
  resolveExperience,
} from "../../utils";
import type {
  Announcement,
  Message,
  Conversation,
  ConversationBudget,
  ConversationListItem,
  ConversationStarter,
  AgentInfo,
  ChatConfig,
  ChatCallbacks,
  ChatController,
  ChatTheme,
  ClientToolCall,
  ClientToolResult,
  DisclosureConfig,
  ExportConfig,
  ExportFormat,
  FeedbackConfig,
  HistoryActionsConfig,
  MessageActionProps,
  MessageActionsConfig,
  NotificationsConfig,
  RuntimeStatus,
  StopNoticeRenderProps,
  ToolApprovalRenderProps,
  QuestionRenderProps,
} from "../../types";
import { ChatThemeProvider, ChatI18nProvider, type ChatMessages, type SupportedLocale } from "../../providers";
import { AgentServerClient, type ChatTransport } from "../../api";
import { useBackgroundAlerts, useChat, useChatHistory, useI18n } from "../../hooks";
import { ChatMessageList, type ListToolbarConfig } from "./ChatMessageList";
import { ChatEmptyState } from "./ChatEmptyState";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { ExportMenu } from "./ExportMenu";
import { NotificationsMenu } from "./NotificationsMenu";
import { LegalFooter } from "./LegalFooter";
import type { ImageRenderProps } from "./ChatMessage";
import type { ChatActionsConfig } from "./ActionCards";
import { ChatInput } from "./ChatInput";
import type { ChatInputHandle } from "./ChatInput";
import { ChatHistory } from "./ChatHistory";
import { BudgetBanner, type BudgetBannerProps } from "./BudgetBanner";
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
  /**
   * Custom theme colors: any key of `ChatTheme["colors"]`, including the status colours
   * (`success`, `danger`, `warning`, `info` and their `...Bg` tints).
   */
  themeColors?: NonNullable<ChatTheme["colors"]>;
  /** Render custom message actions */
  renderMessageActions?: (props: MessageActionProps) => React.ReactNode;
  /** Render custom avatar */
  renderAvatar?: (role: Message["role"]) => React.ReactNode;
  /** Render custom empty state */
  renderEmptyState?: () => React.ReactNode;
  /**
   * Render custom header. `actions` holds the built-in header buttons that are switched on (export,
   * notifications): put them where they belong in your header.
   */
  renderHeader?: (props: {
    onMenuClick?: () => void;
    agents?: AgentInfo[];
    selectedAgentId?: string;
    onAgentChange?: (id: string) => void;
    actions?: React.ReactNode;
  }) => React.ReactNode;
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
  /**
   * Let the user approve or deny tool calls in this app (default true). When
   * off, approvals show a read-only "waiting in another app" notice.
   */
  enableToolApprovals?: boolean;
  /**
   * Let the user answer the assistant's questions in this app (default true).
   * When off, questions show a read-only notice.
   */
  enableQuestions?: boolean;
  /** Replace the approval card */
  renderToolApproval?: (props: ToolApprovalRenderProps) => React.ReactNode;
  /** Replace the question card */
  renderQuestion?: (props: QuestionRenderProps) => React.ReactNode;
  /**
   * Let the person edit a tool call's arguments in the approval card before approving
   * (default false). An agent's `capabilities.approvalArgsEdit` overrides it. The edit is
   * checked against the action's `argsSchema` when it has one.
   */
  allowArgumentEdit?: boolean;
  /** Approval and question cards turn amber when less than this many seconds are left (default 600) */
  expiryWarningSeconds?: number;
  /** Replace how an image in a message is drawn, e.g. to fetch it with credentials */
  renderImage?: (props: ImageRenderProps) => React.ReactNode;
  /** Replace the notice under an answer that stopped early (stopped, a limit, the usage limit, an error) */
  renderStopNotice?: (props: StopNoticeRenderProps) => React.ReactNode;
  /**
   * Show the conversation's spent / limit bar when it has a spend limit (default true; the server only
   * sends a limit for conversations that have one). Turn it off where people should not see amounts.
   */
  showBudgetMeter?: boolean;
  /**
   * Offer "Continue" once a paused conversation's limit has room again (default false). An agent's
   * `capabilities.budget.allowContinue` overrides it.
   */
  allowBudgetContinue?: boolean;
  /**
   * Let the person raise or remove the conversation's usage limit from the banner, then carry on
   * (default false; the server may still refuse with `budget_forbidden`). An agent's
   * `capabilities.budget.allowEdit` overrides it.
   */
  allowBudgetEdit?: boolean;
  /** Replace the usage-limit banner (the meter and the "limit reached" notice) */
  renderBudgetBanner?: (props: BudgetBannerProps) => React.ReactNode;
  /** Show a badge on history rows that are working, waiting for the person or stopped on their limit (default true) */
  showStatus?: boolean;
  /** The chat is a transcript: the composer is closed with a notice (default false) */
  readOnly?: boolean;
  /**
   * What the composer does while an approval or question is waiting.
   * `block` (default) disables it until answered; `cancel` lets a new message
   * through, which cancels the pending request. An agent's own
   * `metadata.pendingActionComposerMode` (`"block"` | `"cancel"`) overrides this.
   */
  pendingActionComposerMode?: "block" | "cancel";
  /**
   * Show agent name below the conversation title in the history sidebar.
   * - `true`  → always show
   * - `false` → never show
   * - `undefined` (default) → show only when there are multiple agents
   */
  showAgentName?: boolean;
  /** Called when selected agent changes (multi-agent mode) */
  onAgentChange?: (agentId: string) => void;
  // --- Portal experience: every feature below is off until it is switched on here (or by the agent's `metadata.experience`) ---
  /**
   * The built-in buttons under each message: `copy`; `regenerate` (the newest answer, needs a transport
   * with `regenerateMessage`); `edit` (your own messages, needs `editMessage`). All off by default.
   */
  messageActions?: MessageActionsConfig;
  /** Thumbs up / down on answers, with reasons and an optional comment (needs a transport with `sendFeedback`) */
  feedback?: boolean | FeedbackConfig;
  /** Rename, pin and select-to-delete in the history sidebar (rename and pin need the matching transport methods) */
  historyActions?: HistoryActionsConfig;
  /** Suggested first messages shown as chips on the empty chat (an agent's `metadata.starters` wins) */
  starters?: ConversationStarter[];
  /** Markdown shown on the empty chat (an agent's `metadata.welcome` wins). Replaced by `renderEmptyState`. */
  welcome?: string;
  /** Hosts a picture of the welcome text may come from (https only; default: any https host) */
  welcomeImageHosts?: string[];
  /** Label answers as AI-generated and show a row of legal links under the composer */
  disclosure?: DisclosureConfig;
  /** A short notice under the composer (the older single footer line) */
  footerText?: string;
  /** Notices above the chat; only the ones due now are shown, at most five */
  announcements?: Announcement[];
  /** A person closed an announcement (the choice is kept on their device either way) */
  onAnnouncementDismiss?: (announcement: Announcement) => void;
  /** A header menu to download the conversation as Markdown, JSON or PDF */
  exportMenu?: boolean | ExportConfig;
  /** Tab-title badge, sound and desktop notification when the tab is in the background and a turn finished or something waits */
  notifications?: NotificationsConfig;
  /**
   * Open on this agent when the page loads (a deep link). Unlike `agentId` it is only the first choice:
   * the person can switch agents. Ignored when the agent does not exist or `agentId` is set.
   */
  initialAgentId?: string;
  /** Put this text in the composer when the page loads (a deep link) */
  initialInput?: string;
  /** Send `initialInput` as soon as the chat is ready instead of only filling the composer (default false) */
  autoSend?: boolean;
  /** Receives a handle to prefill the composer, start a new chat or focus it */
  controllerRef?: React.Ref<ChatController>;
  /**
   * Runs a tool of the host page (an embedded chat): the agent's call arrives here and the result
   * answers it, after which the turn goes on. See `EmbedChat`.
   */
  onClientToolCall?: (call: ClientToolCall) => Promise<ClientToolResult>;
  /** Extra `metadata` sent with every message (an embedded page's unsigned UI context) */
  getMessageMetadata?: () => Record<string, unknown> | undefined;
  /**
   * Language/locale. Without it, the locale of an enclosing `ChatI18nProvider` applies, or
   * else it is auto-detected from the `?lang` query param.
   */
  locale?: SupportedLocale;
  /** Default locale when no query parameter is found */
  defaultLocale?: SupportedLocale;
  /** Callback when locale changes */
  onLocaleChange?: (locale: SupportedLocale) => void;
  /**
   * Replace or add UI strings per locale, merged over the built-in ones and over those of an
   * enclosing `ChatI18nProvider`. A locale other than `en` / `tr` only needs the keys it
   * translates; the rest fall back to English.
   */
  customMessages?: ChatMessages;
}

/**
 * Main Chat component with history sidebar support.
 *
 * When `agentId` is omitted the component will fetch the list of agents from
 * `GET /agents` and display a selector in the header when there are multiple.
 *
 * It works on its own and inside a `ChatI18nProvider`: the provider's locale and custom
 * messages apply, and `locale` / `customMessages` props refine them.
 */
export function Chat({ locale, defaultLocale, onLocaleChange, customMessages, ...props }: ChatProps) {
  return (
    <ChatI18nProvider
      locale={locale}
      defaultLocale={defaultLocale}
      onLocaleChange={onLocaleChange}
      customMessages={customMessages}
    >
      <ChatContent {...props} />
    </ChatI18nProvider>
  );
}

type ChatContentProps = Omit<ChatProps, "locale" | "defaultLocale" | "onLocaleChange" | "customMessages">;

function ChatContent({
  // Config
  baseUrl,
  transport,
  agentId: externalAgentId,
  authorization,
  headers,
  getHeaders,
  fetch: customFetch,
  streaming = true,
  enableFileUpload = true,
  allowedFileTypes,
  maxFileSize,
  maxFiles,
  maxFilesScope,
  fileTransport,
  attachmentsOnlyMessage,
  // Callbacks
  onMessageSent,
  onMessageReceived,
  onStreamText,
  onToolCall,
  onToolResult,
  onError,
  onConversationCreated,
  onConversationSelected,
  onConversationTitleGenerated,
  onBudgetReached,
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
  enableToolApprovals = true,
  enableQuestions = true,
  renderToolApproval,
  renderQuestion,
  allowArgumentEdit = false,
  expiryWarningSeconds,
  renderImage,
  renderStopNotice,
  showBudgetMeter = true,
  allowBudgetContinue = false,
  allowBudgetEdit = false,
  renderBudgetBanner,
  showStatus = true,
  readOnly = false,
  pendingActionComposerMode = "block",
  onActionResolved,
  onActionRequired,
  onFeedback,
  showAgentName,
  messageActions,
  feedback,
  historyActions,
  starters,
  welcome,
  welcomeImageHosts,
  disclosure,
  footerText,
  announcements,
  onAnnouncementDismiss,
  exportMenu,
  notifications,
  initialAgentId,
  initialInput,
  autoSend = false,
  controllerRef,
  onClientToolCall,
  getMessageMetadata,
}: ChatContentProps) {
  const { t, has } = useI18n();
  const [historyOpen, setHistoryOpen] = useState(defaultHistoryOpen);

  // Ref for the ChatInput so we can focus it programmatically
  const inputRef = useRef<ChatInputHandle>(null);

  // ---- Multi-agent support ----
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  // The agent list has been asked for (it may have come back empty or failed): a deep link waits for this
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(externalAgentId);

  // Keep a ref-based client for agent fetching
  const agentClientRef = useRef<ChatTransport | null>(null);
  useMemo(() => {
    agentClientRef.current = transport ?? new AgentServerClient({
      baseUrl,
      agentId: selectedAgentId || "",
      authorization,
      headers,
      getHeaders,
      fetch: customFetch,
    });
  }, [transport, baseUrl, authorization, headers, getHeaders, customFetch, selectedAgentId]);

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
        // If no agentId was provided, a deep link's agent comes first, then the first agent
        if (!externalAgentId && agentList.length > 0 && !selectedAgentId) {
          const linked = initialAgentId ? agentList.find((a) => a.id === initialAgentId) : undefined;
          setSelectedAgentId((linked ?? agentList[0]).id);
        }
        setAgentsLoaded(true);
      } catch (err) {
        // Agents endpoint is optional — ignore errors silently
        console.warn("Failed to fetch agents:", err);
        if (!cancelled) setAgentsLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [transport, baseUrl, authorization]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAgentChange = useCallback((newAgentId: string) => {
    setSelectedAgentId(newAgentId);
    onAgentChange?.(newAgentId);
  }, [onAgentChange]);

  // The agentId actually used by the hooks
  const effectiveAgentId = selectedAgentId || externalAgentId || "";

  // A conversation belongs to one agent: opening it selects that agent, so the header and
  // the per-agent settings (paperclip, limits, composer mode) match it. Unknown agents are ignored.
  const followConversationAgent = useCallback((conversationAgentId?: string) => {
    if (!conversationAgentId || conversationAgentId === effectiveAgentId) return;
    if (!agents.some((a) => a.id === conversationAgentId)) return;
    handleAgentChange(conversationAgentId);
  }, [effectiveAgentId, agents, handleAgentChange]);

  // How the composer, the cards and the budget banner adapt to this agent: what it says
  // (`capabilities`, then its `metadata`) refines the props
  const selectedAgent = agents.find(a => a.id === effectiveAgentId);
  const settings = resolveAgentSettings(selectedAgent, {
    enableFileUpload,
    allowedFileTypes,
    maxFileSize,
    maxFiles,
    maxFilesScope,
    pendingActionComposerMode,
    allowArgumentEdit,
    allowBudgetContinue,
    allowBudgetEdit,
  });
  const effectiveFileUpload = settings.fileUpload;
  const effectiveComposerMode = settings.composerMode;
  const effectiveArgEdit = settings.argumentEdit;
  // `acceptsImages: false` warns on an attached picture
  const imagesIgnored = settings.acceptsImages === false;
  // Which parts of the portal experience are on (the agent's `metadata.experience` refines the props)
  const experience = resolveExperience(selectedAgent, {
    messageActions,
    feedback,
    historyActions,
    exportMenu,
    notifications,
    disclosure,
    starters,
    welcome,
  });

  // Use refs for callbacks that will depend on history (defined later)
  const onMessageReceivedRef = useRef(onMessageReceived);
  onMessageReceivedRef.current = onMessageReceived;
  const onConversationCreatedRef = useRef(onConversationCreated);
  onConversationCreatedRef.current = onConversationCreated;
  const onConversationTitleGeneratedRef = useRef(onConversationTitleGenerated);
  onConversationTitleGeneratedRef.current = onConversationTitleGenerated;
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

  const wrappedOnConversationTitleGenerated = useCallback((conversationId: string, title: string) => {
    onConversationTitleGeneratedRef.current?.(conversationId, title);
    if (showHistory) {
      historyRef.current?.updateConversation(conversationId, { title });
    }
  }, [showHistory]);

  // When a background stream completes (user navigated away), refresh sidebar
  // so the conversation entry reflects the latest server state.
  const wrappedOnBackgroundStreamCompleted = useCallback((_conversationId: string) => {
    if (showHistory) {
      historyRef.current?.refresh();
    }
  }, [showHistory]);

  // Chat state
  const chat = useChat({
    baseUrl,
    transport,
    agentId: effectiveAgentId,
    authorization,
    headers,
    getHeaders,
    fetch: customFetch,
    streaming,
    enableFileUpload: effectiveFileUpload,
    allowedFileTypes: settings.allowedFileTypes,
    maxFileSize: settings.maxFileSize,
    maxFiles: settings.maxFiles,
    maxFilesScope: settings.maxFilesScope,
    fileTransport,
    attachmentsOnlyMessage,
    conversationId,
    initialMessages,
    onMessageSent,
    onMessageReceived: wrappedOnMessageReceived,
    onStreamText,
    onToolCall,
    onToolResult,
    onError,
    onConversationCreated: wrappedOnConversationCreated,
    onConversationTitleGenerated: wrappedOnConversationTitleGenerated,
    onBackgroundStreamCompleted: wrappedOnBackgroundStreamCompleted,
    onBudgetReached,
    onActionResolved,
    pendingActionComposerMode: effectiveComposerMode,
    enableQuestions,
    readOnly,
    onActionRequired,
    onFeedback,
    onClientToolCall,
    getMessageMetadata,
  });

  // Approval / question cards
  const actionsConfig = useMemo<ChatActionsConfig>(
    () => ({
      enableToolApprovals,
      enableQuestions,
      canResolve: chat.canResolveActions,
      renderToolApproval,
      renderQuestion,
      onResolve: chat.resolveAction,
      allowArgumentEdit: effectiveArgEdit,
      expiryWarningSeconds,
    }),
    [
      enableToolApprovals,
      enableQuestions,
      chat.canResolveActions,
      renderToolApproval,
      renderQuestion,
      chat.resolveAction,
      effectiveArgEdit,
      expiryWarningSeconds,
    ]
  );

  // What the composer is doing ("answer" when a lone free-text question is answered from it)
  const composerState = chat.composerState;
  // Once the last card is answered (or lapses) the keyboard goes back to the composer
  const wasAwaiting = useRef(false);
  useEffect(() => {
    if (wasAwaiting.current && !chat.awaitingAction) {
      const active = document.activeElement;
      if (!active || active === document.body || active.closest("[data-chat-card]")) {
        inputRef.current?.focus();
      }
    }
    wasAwaiting.current = chat.awaitingAction;
  }, [chat.awaitingAction]);

  // The last message never got its answer (the run was cut off): sending it again
  const retryInterrupted = useCallback(() => {
    void chat.retryInterrupted();
  }, [chat.retryInterrupted]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(
    (text: string) => {
      const q = chat.answerableQuestion;
      // The composer keeps the text when the answer / message is refused
      if (composerState === "answer" && q) {
        return chat.resolveAction(q.actionId, {
          type: "user_question",
          answers: { [q.question.question]: text },
        });
      }
      return chat.sendMessage(text);
    },
    [chat.answerableQuestion, chat.resolveAction, chat.sendMessage, composerState]
  );

  // History state — when there are multiple agents, don't filter by agentId
  // so we can see all portal conversations
  const history = useChatHistory({
    baseUrl,
    transport,
    agentId: agents.length > 1 ? undefined : effectiveAgentId,
    authorization,
    headers,
    getHeaders,
    fetch: customFetch,
    autoLoad: showHistory,
  });

  // Keep historyRef in sync so the wrapped callbacks can refresh
  historyRef.current = history;

  const handleConversationSelect = useCallback(
    (conversation: ConversationListItem) => {
      followConversationAgent(conversation.agentId);
      chat.loadConversation(conversation.id);
      onConversationSelected?.(conversation);
      setHistoryOpen(false);
      // Focus the input after selecting a conversation
      if (autoFocusInput) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    },
    [chat, onConversationSelected, autoFocusInput, followConversationAgent]
  );

  // The same for a conversation opened without the sidebar (the `conversationId` prop)
  const loadedAgentId = chat.conversation?.agentId;
  useEffect(() => {
    followConversationAgent(loadedAgentId);
  }, [loadedAgentId, chat.conversation?.id, agents]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      const ok = await history.renameConversation(id, title);
      if (ok) chat.setConversation((prev) => (prev && prev.id === id ? { ...prev, title: title.trim() } : prev));
      return ok;
    },
    [history, chat]
  );

  const handleBulkDelete = useCallback(
    async (ids: string[]) => {
      const outcome = await history.deleteConversations(ids);
      if (chat.conversation && outcome.deleted.includes(chat.conversation.id)) chat.clearMessages();
      return outcome;
    },
    [history, chat]
  );

  const showAgentSelector = !chat.isLoadingConversation && chat.messages.length === 0;

  // The usage-limit banner. What a person may do about a used-up limit is the host's call (props, or the agent's capabilities)
  const budgetBannerProps: BudgetBannerProps = {
    budget: chat.budget,
    spentUsd: chat.spentUsd,
    exhausted: chat.budgetExhausted,
    showMeter: showBudgetMeter,
    canContinue: settings.budgetContinue && chat.canContinue,
    canEdit: settings.budgetEdit && chat.canUpdateBudget,
    busy: chat.isStreaming,
    onContinue: () => {
      void chat.continueConversation();
    },
    onUpdate: (budget: ConversationBudget | null, options) => {
      void chat.updateBudget(budget, options);
    },
  };

  // What the selected conversation is doing, as this page knows it (the list from the server may be older)
  const selectedStatus: RuntimeStatus | undefined = !chat.conversation
    ? undefined
    : chat.isStreaming || chat.isFollowing
      ? "running"
      : chat.awaitingAction
        ? "requires_action"
        : chat.budgetExhausted
          ? "budget_paused"
          : "idle";

  // A turn ended (finished, stopped, paused): the history rows' badges are looked up again
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !chat.isStreaming && showHistory) historyRef.current?.refresh();
    wasBusy.current = chat.isStreaming;
  }, [chat.isStreaming, showHistory]);

  // ---- Portal experience ----

  // Regenerate and edit change the conversation: only while nothing runs and no card waits
  const canAct = composerState === "open" && !chat.isStreaming && !chat.isFollowing && !readOnly;

  const toolbar = useMemo<ListToolbarConfig | undefined>(() => {
    const { messageActions: actions, feedback: rating } = experience;
    const regenerate = actions.regenerate && chat.canRegenerate;
    const edit = actions.edit && chat.canEdit;
    // a transcript is not rated by the person reading it
    const rate = rating.enabled && chat.canRate && !readOnly;
    if (!actions.copy && !regenerate && !edit && !rate) return undefined;
    return {
      copy: actions.copy,
      regenerate: regenerate ? () => void chat.regenerate() : undefined,
      edit: edit ? (id: string, content: string) => chat.editMessage(id, content) : undefined,
      feedback: rate
        ? {
            comments: rating.comments,
            reasons: rating.reasons,
            onSubmit: (id: string, input: Parameters<typeof chat.submitFeedback>[1]) => chat.submitFeedback(id, input),
          }
        : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    JSON.stringify(experience.messageActions),
    JSON.stringify(experience.feedback),
    chat.canRegenerate,
    chat.canEdit,
    chat.canRate,
    chat.regenerate,
    chat.editMessage,
    chat.submitFeedback,
    readOnly,
  ]);

  // A suggested first message: fill the composer, or send it when the starter says so
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  const composerStateRef = useRef(composerState);
  composerStateRef.current = composerState;
  const pickStarter = useCallback((starter: ConversationStarter) => {
    if (starter.autoSend && (composerStateRef.current === "open" || composerStateRef.current === "answer")) {
      void handleSendRef.current(starter.text);
    } else {
      inputRef.current?.setValue(starter.text);
    }
  }, []);

  // A deep link: the text lands in the composer once, and is sent when the link says so
  const linkedInputRef = useRef(false);
  useEffect(() => {
    if (linkedInputRef.current || !initialInput?.trim() || autoSend) return;
    linkedInputRef.current = true;
    inputRef.current?.setValue(initialInput, { focus: autoFocusInput });
  }, [initialInput, autoSend, autoFocusInput]);
  const autoSentRef = useRef(false);
  const agentReady = Boolean(externalAgentId) || agentsLoaded;
  useEffect(() => {
    if (!autoSend || autoSentRef.current || !initialInput?.trim()) return;
    // an existing conversation was asked for, or something is already going on: leave it alone
    if (conversationId || chat.messages.length > 0 || chat.isLoadingConversation || chat.isStreaming) return;
    if (!agentReady || composerState !== "open") return;
    autoSentRef.current = true;
    void handleSendRef.current(initialInput);
  }, [autoSend, initialInput, conversationId, chat.messages.length, chat.isLoadingConversation, chat.isStreaming, agentReady, composerState]);

  // What a host can do to the chat from outside
  const handleNewChatRef = useRef(handleNewChat);
  handleNewChatRef.current = handleNewChat;
  useImperativeHandle(
    controllerRef,
    (): ChatController => ({
      prefill: (text, options) => {
        const state = composerStateRef.current;
        if (options?.send && (state === "open" || state === "answer")) void handleSendRef.current(text);
        else inputRef.current?.setValue(text);
      },
      newChat: () => handleNewChatRef.current(),
      focus: () => inputRef.current?.focus(),
    }),
    []
  );

  // The tab is in the background and a turn ended or something waits
  const alerts = useBackgroundAlerts({
    config: experience.notifications,
    busy: chat.isStreaming,
    waiting: chat.awaitingAction,
    heading: chat.conversation?.title || selectedAgent?.name || t("chat.history.newChat"),
    doneText: t("chat.notifications.done"),
    waitingText: t("chat.notifications.waiting"),
  });

  // Download the conversation: from the server where it can, else from the messages on screen
  const handleExport = useCallback(
    async (format: ExportFormat) => {
      const conv = chat.conversation;
      if (!conv) return;
      const includeTools = experience.exportMenu.includeTools;
      const client = agentClientRef.current;
      try {
        if (client?.exportConversation) {
          try {
            const result = await client.exportConversation(conv.id, { format, includeTools });
            if (result.contentType === "text/html") printHtml(await result.blob.text());
            else downloadBlob(result.blob, result.filename || exportFilename(conv.title, format));
            return;
          } catch (err) {
            const status = (err as { status?: number } | null)?.status;
            // a server without the route is served from the messages on screen
            if (status !== 404 && status !== 405 && status !== 501) throw err;
          }
        }
        const labels = {
          user: t("chat.export.you"),
          assistant: t("chat.export.assistant"),
          system: t("chat.export.system"),
          tool: t("chat.export.tool"),
          input: t("chat.toolCall.input"),
          output: t("chat.toolCall.output"),
          exportedOn: t("chat.export.exportedOn"),
          untitled: t("chat.history.newChat"),
        };
        const built = { includeTools, labels };
        if (format === "pdf") {
          printHtml(conversationToPrintHtml(conv, chat.messages, built));
        } else {
          const body = format === "json" ? conversationToJson(conv, chat.messages, built) : conversationToMarkdown(conv, chat.messages, built);
          downloadBlob(new Blob([body], { type: EXPORT_MIME[format] }), exportFilename(conv.title, format));
        }
      } catch (err) {
        const shown = localizeError(err instanceof Error ? err : new Error(t("chat.export.failed")), t, has);
        chat.setError(shown);
        onError?.(shown);
      }
    },
    [chat, experience.exportMenu.includeTools, t, has, onError]
  );

  const exportAvailable =
    experience.exportMenu.enabled && Boolean(chat.conversation) && chat.messages.length > 0 && !chat.isLoadingConversation;
  const headerActions =
    exportAvailable || alerts.available ? (
      <>
        {alerts.available && (
          <NotificationsMenu
            alerts={alerts}
            offer={{ sound: experience.notifications.sound, desktop: experience.notifications.desktop === "opt_in" }}
          />
        )}
        {exportAvailable && <ExportMenu formats={experience.exportMenu.formats} onExport={handleExport} disabled={chat.isStreaming} />}
      </>
    ) : undefined;

  const aiLabelText = experience.disclosure.aiLabel ? experience.disclosure.labelText ?? t("chat.aiLabel.default") : undefined;
  const legalFooter = <LegalFooter links={experience.disclosure.links} text={footerText} />;

  // The empty chat: the host's own, the Markdown welcome or the default text - and the starters under it
  const hasStarters = experience.starters.length > 0;
  const customEmpty = renderEmptyState?.();
  // A host that draws its own empty state and offers no starters keeps exactly what it drew
  const emptyState =
    hasStarters || (!renderEmptyState && experience.welcome) ? (
      <ChatEmptyState
        custom={customEmpty}
        welcome={experience.welcome}
        allowedImageHosts={welcomeImageHosts}
        starters={experience.starters}
        onPick={pickStarter}
        disabled={composerState !== "open" && composerState !== "answer"}
      />
    ) : (
      customEmpty
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
            enableSearch={enableMessageSearch}
            showAgentName={showAgentName ?? false}
            showStatus={showStatus}
            selectedStatus={selectedStatus}
            onRename={experience.historyActions.rename && history.canRename ? handleRenameConversation : undefined}
            onPin={experience.historyActions.pin && history.canPin ? history.pinConversation : undefined}
            onBulkDelete={experience.historyActions.bulkDelete ? handleBulkDelete : undefined}
            error={
              (experience.historyActions.rename || experience.historyActions.pin || experience.historyActions.bulkDelete) && history.error
                ? history.error.message
                : undefined
            }
          />
        )}

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Notices from the operator */}
          {announcements && announcements.length > 0 && (
            <AnnouncementBanner announcements={announcements} onDismiss={onAnnouncementDismiss} />
          )}

          {/* Header */}
          {renderHeader ? (
            renderHeader({
              onMenuClick: showHistory ? () => setHistoryOpen(true) : undefined,
              agents,
              selectedAgentId: effectiveAgentId,
              onAgentChange: handleAgentChange,
              actions: headerActions,
            })
          ) : (
            <DefaultHeader
              showMenuButton={showHistory}
              onMenuClick={() => setHistoryOpen(true)}
              title={chat.conversation?.title || t("chat.history.newChat")}
              agents={agents}
              selectedAgentId={effectiveAgentId}
              onAgentChange={handleAgentChange}
              showAgentSelector={showAgentSelector}
              actions={headerActions}
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
                <span className="text-sm text-chat-text-tertiary">{t("chat.loading.conversation")}</span>
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
              actions={actionsConfig}
              renderImage={renderImage}
              renderStopNotice={renderStopNotice}
              resolveFileUrl={chat.resolveFileUrl}
              hasEarlier={chat.hasEarlierMessages}
              isLoadingEarlier={chat.isLoadingEarlierMessages}
              onLoadEarlier={chat.loadEarlierMessages}
              interrupted={chat.interrupted}
              onRetryInterrupted={composerState === "open" ? retryInterrupted : undefined}
              emptyState={emptyState}
              toolbar={toolbar}
              canAct={canAct}
              aiLabel={aiLabelText}
            />
          )}

          {/* Error Display */}
          {chat.error && (
            <div className="px-4 py-2">
              <div className="max-w-3xl mx-auto">
                <div
                  role="alert"
                  className="bg-chat-danger-bg border border-chat-danger rounded-lg px-4 py-3 text-chat-danger text-sm flex items-center justify-between gap-3"
                >
                  <span className="min-w-0 break-words">{chat.error.message}</span>
                  <button
                    type="button"
                    onClick={() => chat.setError(null)}
                    className="flex-shrink-0 text-chat-danger underline-offset-2 hover:underline"
                  >
                    {t("chat.error.dismiss")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Where the conversation stands against its usage limit */}
          {(chat.budget || chat.budgetExhausted) && (
            <div className="px-4 pt-2">
              <div className="max-w-3xl mx-auto">
                {renderBudgetBanner ? renderBudgetBanner(budgetBannerProps) : <BudgetBanner {...budgetBannerProps} />}
              </div>
            </div>
          )}

          {/* Input */}
          <ChatInput
            ref={inputRef}
            onSend={handleSend}
            onStop={chat.stop}
            onFilesAdd={effectiveFileUpload ? chat.addFiles : undefined}
            onFileRemove={chat.removeFile}
            onFileRetry={chat.retryFile}
            isLoading={chat.isStreaming}
            isUploading={chat.isUploading}
            pendingFiles={chat.pendingFiles}
            placeholder={inputPlaceholder}
            enableFileUpload={effectiveFileUpload}
            allowedFileTypes={settings.allowedFileTypes}
            maxFiles={settings.maxFiles}
            filesHeld={settings.maxFilesScope === "conversation" ? chat.heldFiles : 0}
            fileCounter={settings.maxFilesScope === "conversation" && settings.maxFiles !== undefined}
            retentionDays={settings.retentionDays}
            imagesIgnored={imagesIgnored}
            autoFocus={autoFocusInput}
            state={composerState}
            footer={legalFooter}
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
  /** Buttons at the right end (export, notifications) */
  actions?: React.ReactNode;
}

const CHAT_HEADER_HEIGHT = "h-[58px]";

function DefaultHeader({ showMenuButton, onMenuClick, title, agents = [], selectedAgentId, onAgentChange, showAgentSelector = true, actions }: DefaultHeaderProps) {
  const { t } = useI18n();
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
          type="button"
          onClick={onMenuClick}
          className="md:hidden p-2 hover:bg-chat-bg-hover rounded-lg"
          aria-label={t("chat.header.menu")}
        >
          <MenuIcon className="w-5 h-5" />
        </button>
      )}

      {/* Agent selector or simple title */}
      {showAgentPicker ? (
        <div className="relative flex-1 min-w-0" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-chat-bg-hover transition-colors max-w-full"
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
            title={t("chat.header.changeAgent")}
          >
            <BotIcon className="w-4 h-4 text-chat-accent-primary flex-shrink-0" />
            <span className="text-sm font-medium truncate">
              {selectedAgent?.name || t("chat.header.selectAgent")}
            </span>
            <ChevronDownIcon className={cn("w-3 h-3 text-chat-text-tertiary transition-transform flex-shrink-0", dropdownOpen && "rotate-180")} />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-chat-bg-secondary border border-chat-border-primary rounded-lg shadow-xl z-50 py-1 max-h-60 overflow-y-auto">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  aria-current={agent.id === selectedAgentId ? "true" : undefined}
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
      {actions && <div className="flex flex-shrink-0 items-center gap-1">{actions}</div>}
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
