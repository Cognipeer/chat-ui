// Main exports
export { Chat, ChatMinimal, type ChatProps, type ChatMinimalProps } from "./components/chat";
export { ChatMessage, type ChatMessageProps } from "./components/chat";
export { ChatMessageList, type ChatMessageListProps } from "./components/chat";
export { ChatInput, type ChatInputProps, type ChatInputHandle } from "./components/chat";
export { ChatHistory, type ChatHistoryProps } from "./components/chat";
export { ToolCall, ToolCalls, type ToolCallProps, type ToolCallsProps } from "./components/chat";
export { MessageActions, type MessageActionsProps } from "./components/chat";

// Hooks
export { useChat, type UseChatOptions, type UseChatReturn } from "./hooks";
export { useChatHistory, type UseChatHistoryOptions, type UseChatHistoryReturn } from "./hooks";

// Providers
export { ChatThemeProvider, useChatTheme, useChatThemeOptional } from "./providers";
export { ChatProvider, useChatContext, useChatContextOptional, type ChatProviderProps } from "./providers";

// API Client
export { AgentServerClient } from "./api";

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
  StreamDoneEvent,
  ChatTheme,
  ChatConfig,
  ChatCallbacks,
  MessageActionProps,
  ToolCallDisplayProps,
} from "./types";

// Icons
export {
  SendIcon,
  PaperclipIcon,
  XIcon,
  StopIcon,
  FileIcon,
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
export { cn, formatFileSize, formatRelativeTime, generateId } from "./utils";

// Theme Presets
export {
  themePresets,
  darkPresets,
  lightPresets,
  getThemePreset,
  type ThemePreset,
} from "./themes";
