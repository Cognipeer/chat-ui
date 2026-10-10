// Main exports
export { Chat, ChatMinimal, type ChatProps, type ChatMinimalProps } from "./components/chat";
export { ChatMessage, type ChatMessageProps, type ImageRenderProps } from "./components/chat";
export { ChatMessageList, type ChatMessageListProps } from "./components/chat";
export { ChatInput, type ChatInputProps, type ChatInputHandle } from "./components/chat";
export { ChatHistory, type ChatHistoryProps } from "./components/chat";
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
export { useChat, type UseChatOptions, type UseChatReturn } from "./hooks";
export { useChatHistory, type UseChatHistoryOptions, type UseChatHistoryReturn } from "./hooks";
export { useI18n, type UseI18nReturn } from "./hooks";

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
  AgentInfo,
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
  UserQuestionOption,
  UserQuestion,
  PendingAction,
  ActionResolution,
  ActionState,
  ActionStatus,
  MessageStatus,
  ToolApprovalRenderProps,
  QuestionRenderProps,
  ChatTheme,
  ChatConfig,
  ChatCallbacks,
  MessageActionProps,
  ToolCallDisplayProps,
  Citation,
  CitationMark,
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
export { validateAgainstSchema, type SchemaIssue } from "./utils/jsonSchema";
export { localizeError, normalizeErrorCode, type CodedError } from "./utils/errors";
export { safeImageSrc, safeFileHref } from "./utils/images";
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
