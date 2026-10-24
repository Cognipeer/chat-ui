// Main exports
export { Chat, ChatMinimal, type ChatProps, type ChatMinimalProps } from "./components/chat";
export { ChatMessage, type ChatMessageProps, type ImageRenderProps, type ResolveFileUrl } from "./components/chat";
export { ChatMessageList, type ChatMessageListProps } from "./components/chat";
export { ChatInput, type ChatInputProps, type ChatInputHandle } from "./components/chat";
export { ChatHistory, type ChatHistoryProps } from "./components/chat";
export { ModelPicker, type ModelPickerProps } from "./components/chat";
export { ThinkingBlock, type ThinkingBlockProps } from "./components/chat";
export { BudgetBanner, type BudgetBannerProps } from "./components/chat";
export {
  AnnouncementBanner,
  type AnnouncementBannerProps,
  TermsGate,
  type TermsGateProps,
  LegalFooter,
  type LegalFooterProps,
  ChatEmptyState,
  InfoMarkdown,
  type ChatEmptyStateProps,
  MessageToolbar,
  type MessageToolbarProps,
  type MessageToolbarConfig,
  FeedbackSheet,
  type FeedbackSheetProps,
  MessageEditor,
  type MessageEditorProps,
  ExportMenu,
  type ExportMenuProps,
  FilePreview,
  type FilePreviewProps,
  NotificationsMenu,
  type NotificationsMenuProps,
  type ListToolbarConfig,
  ChatAppearanceProvider,
  useAppearance,
  AgentBadge,
  type ChatAppearance,
  TurnActivity,
  type TurnActivityProps,
  type ActivityItem,
  PlanCard,
  type PlanCardProps,
} from "./components/chat";
export { MessageStopNotice, MessageWarnings, InterruptedNotice, type MessageStopNoticeProps, type InterruptedNoticeProps } from "./components/chat";
export { ToolCall, ToolCalls, type ToolCallProps, type ToolCallsProps } from "./components/chat";
export { MessageActions, type MessageActionsProps } from "./components/chat";
export {
  ToolApprovalCard,
  QuestionCard,
  MessageActionCards,
  type ToolApprovalCardProps,
  type QuestionCardProps,
  type ChatActionsConfig,
} from "./components/chat";

// Hooks
export { useChat, type UseChatOptions, type UseChatReturn, type SendUserMessageOptions } from "./hooks";
export { useChatHistory, type UseChatHistoryOptions, type UseChatHistoryReturn } from "./hooks";
export { useI18n, type UseI18nReturn } from "./hooks";
export {
  useBackgroundAlerts,
  formatBadgeTitle,
  type BackgroundAlerts,
  type BackgroundAlertsConfig,
  type UseBackgroundAlertsOptions,
} from "./hooks";

// Embedding the chat in another page (iframe) with an identity token the host signs
export {
  EmbedChat,
  EmbedBridge,
  EMBED_PROTOCOL_VERSION,
  EMBED_EVENTS,
  MAX_TOKEN_CHARS,
  MAX_CONTEXT_BYTES,
  MAX_TOOL_OUTPUT_BYTES,
  isAllowedOrigin,
  normalizeOrigin,
  parseHostMessage,
  exchangeToken,
  parseExchangeResponse,
  renewalLeadMs,
  type EmbedChatProps,
  type EmbedClientToolDeclaration,
  type EmbedSessionApi,
  type EmbedBridgeOptions,
  type BridgeRefusal,
  type EmbedEventName,
  type EmbedToHostMessage,
  type HostToEmbedMessage,
  type TokenRequestReason,
  type EmbedSession,
  type ExchangeError,
  type ExchangeOptions,
} from "./embed";

// Providers
export { ChatThemeProvider, useChatTheme, useChatThemeOptional } from "./providers";
export { ChatProvider, useChatContext, useChatContextOptional, type ChatProviderProps } from "./providers";
export {
  ChatI18nProvider,
  useI18nContext,
  useI18nContextOptional,
  type ChatI18nProviderProps,
  type ChatMessages,
  type BuiltInLocale,
  type SupportedLocale,
} from "./providers";

// API Client
export {
  AgentServerClient,
  type AgentServerClientOptions,
  type FollowReconnectOptions,
  ChatCompletionsTransport,
  ResponsesTransport,
  A2ATransport,
  AgentSdkTransport,
  StatelessTransport,
  MemoryThreadStore,
  LocalStorageThreadStore,
} from "./api";
export type {
  ChatTransport,
  SendMessageOptions,
  SendMessageResponse,
  StreamCallbacks,
  ResolveActionOptions,
  ContinueOptions,
  FollowEventsOptions,
  CancelResult,
  ListFilesResult,
  EditMessageInput,
  BulkDeleteResult,
  ExportRequest,
  ExportResult,
  UploadFileParams,
  ResolveInput,
  HttpOptions,
  ThreadStore,
  StoredThread,
  ChatCompletionsTransportOptions,
  ResponsesTransportOptions,
  A2ATransportOptions,
  AgentSdkTransportOptions,
  AgentSdkAgent,
  AgentSdkEntry,
  RunInput,
  RunResult,
  RunEmit,
  StatelessTransportOptions,
} from "./api";

// Types
export type {
  Message,
  ContentPart,
  ToolCall as ToolCallType,
  FileAttachment,
  Conversation,
  ConversationListItem,
  ConversationReminder,
  ConversationSearchMatch,
  ConversationSearchMode,
  AgentInfo,
  ChatAccount,
  ChatBrand,
  AgentModelOption,
  ReasoningEffort,
  StreamEvent,
  StreamStartEvent,
  StreamTextEvent,
  StreamToolCallEvent,
  StreamToolResultEvent,
  StreamProgressEvent,
  StreamErrorEvent,
  StreamActionRequiredEvent,
  StreamActionResolvedEvent,
  StreamDoneEvent,
  StreamPlanEvent,
  StreamCompactionEvent,
  PlanStep,
  PlanStepStatus,
  PlanOperation,
  PlanSnapshot,
  ActivityEntry,
  UserQuestionOption,
  UserQuestion,
  PendingAction,
  ActionResolution,
  ActionState,
  ActionStatus,
  MessageStatus,
  StopReason,
  RuntimeStatus,
  ConversationRuntime,
  MessagesPage,
  ConversationBudget,
  ConversationEvent,
  TurnWarning,
  ComposerState,
  StopNoticeRenderProps,
  AgentCapabilities,
  AgentAttachmentsCapability,
  FileStatus,
  FileConversionStatus,
  ToolApprovalRenderProps,
  QuestionRenderProps,
  ChatTheme,
  ChatConfig,
  ChatCallbacks,
  MessageActionProps,
  ToolCallDisplayProps,
  Citation,
  CitationMark,
  FeedbackRating,
  FeedbackReasonId,
  FeedbackInput,
  MessageFeedback,
  ConversationStarter,
  Announcement,
  AnnouncementSeverity,
  LegalLinks,
  DisclosureConfig,
  MessageActionsConfig,
  FeedbackConfig,
  HistoryActionsConfig,
  ExportFormat,
  ExportConfig,
  NotificationsConfig,
  ClientToolCall,
  ClientToolResult,
  ChatController,
} from "./types";

// Icons
export {
  SendIcon,
  PaperclipIcon,
  XIcon,
  StopIcon,
  FileIcon,
  ImageIcon,
  ChatIcon,
  TrashIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ToolIcon,
  CheckIcon,
  LoadingIcon,
  MenuIcon,
  RefreshIcon,
  CopyIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  AlertIcon,
  PencilIcon,
  PinIcon,
  DownloadIcon,
  BellIcon,
  InfoIcon,
  ListCheckIcon,
} from "./components/chat/Icons";

// Utils
export { cn, formatFileSize, formatRelativeTime, generateId, isImageFile } from "./utils";
export {
  restorePendingActions,
  collectPendingActions,
  normalizeActions,
  isQuestionRequired,
  type PendingActionEntry,
} from "./utils/actions";
export {
  normalizeStopReason,
  messageStopReason,
  stopNoticeKind,
  isBudgetExhausted,
  canContinueAfterRaise,
  readContinuable,
  formatUsd,
  type StopNoticeKind,
} from "./utils/runtime";
export { resolveAgentSettings, type AgentSettings, type AgentSettingsDefaults } from "./utils/agent";
export { fileFromRecord, applyFileList, isFileExpired, isFileTypeAllowed } from "./utils/files";
export { applyFollowEvent, newFollowState, type FollowState, type FollowedTool } from "./utils/follow";
export { normalizePlan, planProgress, readPlan, readActivity, type TurnFlowState } from "./utils/plan";
export { pendingActionFromWire, pendingActionsFromWire, resolutionToWire } from "./utils/wire";
export { validateAgainstSchema, type SchemaIssue } from "./utils/jsonSchema";
export { localizeError, normalizeErrorCode, type CodedError } from "./utils/errors";
export { safeImageSrc, safeFileHref } from "./utils/images";
export {
  normalizeStarters,
  normalizeFeedback,
  readFeedback,
  activeAnnouncements,
  safeLegalHref,
  legalLinkEntries,
  isPinned,
  pinnedFirst,
  resolveExperience,
  DEFAULT_FEEDBACK_REASONS,
  MAX_FEEDBACK_COMMENT,
  MAX_STARTERS,
  MAX_ANNOUNCEMENTS,
  type Experience,
  type ExperienceInput,
} from "./utils/experience";
export { conversationToMarkdown, conversationToJson, conversationToPrintHtml, exportFilename } from "./utils/export";
export { filePreviewKind, type FilePreviewKind } from "./utils/filePreview";
export { exportMarkdown, markdownExportName, type MarkdownExportFormat } from "./utils/markdownExport";
export { copyText } from "./utils/clipboard";
export {
  insertCitationMarkers,
  parseCitationHref,
  safeExternalHref,
  citationUrlTransform,
} from "./utils/citations";

// Theme Presets
export {
  themePresets,
  darkPresets,
  lightPresets,
  getThemePreset,
  type ThemePreset,
} from "./themes";
