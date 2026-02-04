/**
 * Type definitions for chat-ui
 */

// ============================================================================
// Message Types
// ============================================================================

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
  | { type: "file"; file: { id: string; name: string; mimeType: string; url?: string } }
  | { type: string; [key: string]: unknown };

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentPart[];
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  files?: FileAttachment[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface FileAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
  storageKey?: string;
}

// ============================================================================
// Conversation Types
// ============================================================================

export interface Conversation {
  id: string;
  agentId: string;
  userId?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  state?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationListItem {
  id: string;
  title?: string;
  agentId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentInfo {
  id: string;
  name: string;
  description?: string;
  version?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Stream Event Types
// ============================================================================

export interface StreamEventBase {
  type: string;
  timestamp: number;
}

export interface StreamStartEvent extends StreamEventBase {
  type: "stream.start";
  conversationId: string;
  messageId: string;
}

export interface StreamTextEvent extends StreamEventBase {
  type: "stream.text";
  text: string;
  isFinal?: boolean;
}

export interface StreamThinkingEvent extends StreamEventBase {
  type: "stream.thinking";
  thinking: string;
}

export interface StreamToolCallEvent extends StreamEventBase {
  type: "stream.tool_call";
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
}

export interface StreamToolResultEvent extends StreamEventBase {
  type: "stream.tool_result";
  toolName: string;
  toolCallId: string;
  result: unknown;
}

export interface StreamProgressEvent extends StreamEventBase {
  type: "stream.progress";
  stage?: string;
  message?: string;
  percent?: number;
}

export interface StreamErrorEvent extends StreamEventBase {
  type: "stream.error";
  error: string;
  code?: string;
}

export interface StreamDoneEvent extends StreamEventBase {
  type: "stream.done";
  conversationId: string;
  messageId: string;
  content: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export type StreamEvent =
  | StreamStartEvent
  | StreamTextEvent
  | StreamThinkingEvent
  | StreamToolCallEvent
  | StreamToolResultEvent
  | StreamProgressEvent
  | StreamErrorEvent
  | StreamDoneEvent;

// ============================================================================
// Theme Types
// ============================================================================

export interface ChatTheme {
  mode: "light" | "dark";
  colors?: {
    bgPrimary?: string;
    bgSecondary?: string;
    bgTertiary?: string;
    bgHover?: string;
    textPrimary?: string;
    textSecondary?: string;
    textTertiary?: string;
    textInverse?: string;
    borderPrimary?: string;
    borderSecondary?: string;
    accentPrimary?: string;
    accentSecondary?: string;
  };
  borderRadius?: {
    message?: string;
    input?: string;
    button?: string;
  };
  spacing?: {
    messagePadding?: string;
    inputPadding?: string;
  };
  fonts?: {
    primary?: string;
    mono?: string;
  };
}

export const defaultDarkTheme: ChatTheme = {
  mode: "dark",
  colors: {
    bgPrimary: "#212121",
    bgSecondary: "#171717",
    bgTertiary: "#2f2f2f",
    bgHover: "#3f3f3f",
    textPrimary: "#ececec",
    textSecondary: "#b4b4b4",
    textTertiary: "#8e8e8e",
    textInverse: "#171717",
    borderPrimary: "#3f3f3f",
    borderSecondary: "#2f2f2f",
    accentPrimary: "#10a37f",
    accentSecondary: "#1a7f64",
  },
};

export const defaultLightTheme: ChatTheme = {
  mode: "light",
  colors: {
    bgPrimary: "#ffffff",
    bgSecondary: "#f7f7f8",
    bgTertiary: "#ececec",
    bgHover: "#e3e3e3",
    textPrimary: "#171717",
    textSecondary: "#6b6b6b",
    textTertiary: "#8e8e8e",
    textInverse: "#ffffff",
    borderPrimary: "#e3e3e3",
    borderSecondary: "#ececec",
    accentPrimary: "#10a37f",
    accentSecondary: "#1a7f64",
  },
};

// ============================================================================
// Component Props Types
// ============================================================================

export interface ChatConfig {
  /** Base URL for the agent server API */
  baseUrl: string;
  /** Agent ID to use for conversations */
  agentId: string;
  /** Authorization header value (e.g., "Bearer token") */
  authorization?: string;
  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
  /** Enable streaming responses */
  streaming?: boolean;
  /** Enable file uploads */
  enableFileUpload?: boolean;
  /** Allowed file types for upload */
  allowedFileTypes?: string[];
  /** Maximum file size in bytes */
  maxFileSize?: number;
  /** Maximum number of files per message */
  maxFiles?: number;
}

export interface ChatCallbacks {
  /** Called when a message is sent */
  onMessageSent?: (message: Message) => void;
  /** Called when a response is received */
  onMessageReceived?: (message: Message) => void;
  /** Called when streaming text is received */
  onStreamText?: (text: string, fullText: string) => void;
  /** Called when a tool call is made */
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  /** Called when a tool result is received */
  onToolResult?: (toolName: string, result: unknown) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
  /** Called when a conversation is created */
  onConversationCreated?: (conversation: Conversation) => void;
  /** Called when a conversation is selected from history */
  onConversationSelected?: (conversation: ConversationListItem) => void;
}

export interface MessageActionProps {
  message: Message;
  isStreaming: boolean;
}

export interface ToolCallDisplayProps {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
  result?: unknown;
  isExpanded: boolean;
  onToggle: () => void;
}
