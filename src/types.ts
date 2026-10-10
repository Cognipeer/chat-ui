/**
 * Type definitions for chat-ui
 */

import type { ChatTransport } from "./api/transport";

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
  citations?: Citation[];
  citationMarks?: CitationMark[];
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  files?: FileAttachment[];
  metadata?: Record<string, unknown>;
  /**
   * Approvals / questions the assistant is waiting on. Set when the turn paused
   * (`status: "requires_action"`); the cards render from this list.
   */
  pendingActions?: PendingAction[];
  /** How the turn ended. Absent means a normal, completed answer. */
  status?: MessageStatus;
  /** Client-side state of each action in `pendingActions`, keyed by action id */
  actionStates?: Record<string, ActionState>;
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

export interface Citation {
  id?: string;
  title?: string;
  image?: string;
  description?: string;
  link?: string;
}

/**
 * Where in the answer a citation was named. `offset` is a character index into
 * the message content, so a marker can be placed at the statement it supports
 * instead of only listing sources at the end.
 */
export interface CitationMark {
  offset: number;
  citationId: string;
}

// ============================================================================
// Human-in-the-loop Types (mirror @cognipeer/agent-server >= 0.3.0)
// ============================================================================

export interface UserQuestionOption {
  label: string;
  value?: string;
  description?: string;
}

export interface UserQuestion {
  question: string;
  header?: string;
  multiSelect?: boolean;
  placeholder?: string;
  required?: boolean;
  options?: UserQuestionOption[];
}

export type PendingAction =
  | {
      id: string;
      type: "tool_approval";
      toolName: string;
      toolCallId?: string;
      title?: string;
      summary?: string;
      args?: Record<string, unknown>;
      expiresAt?: string;
    }
  | {
      id: string;
      type: "user_question";
      questions: UserQuestion[];
      allowFreeText?: boolean;
      expiresAt?: string;
    };

export type ActionResolution =
  | {
      type: "tool_approval";
      decision: "allow" | "deny";
      comment?: string;
      approvedArgs?: Record<string, unknown>;
      rememberForSession?: boolean;
    }
  | {
      type: "user_question";
      answers: Record<string, string | string[]>;
      cancelled?: boolean;
    };

export type MessageStatus = "completed" | "requires_action" | "incomplete" | "cancelled";

/** Where an action card is in its life, as tracked by the UI. */
export type ActionStatus = "pending" | "resolving" | "resolved" | "cancelled" | "expired";

export interface ActionState {
  status: ActionStatus;
  /** What was answered; absent when it was resolved somewhere else */
  resolution?: ActionResolution;
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
  /** Actions still waiting for an answer (set by agent-server >= 0.3.0) */
  pendingActions?: PendingAction[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationListItem {
  id: string;
  title?: string;
  /** Agent display name, populated by the server */
  agentName?: string;
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
  /** What the agent can pause for; absent when the server does not say */
  capabilities?: {
    toolApproval?: boolean;
    askUser?: boolean;
  };
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

export interface StreamActionRequiredEvent extends StreamEventBase {
  type: "stream.action_required";
  conversationId: string;
  messageId: string;
  actions: PendingAction[];
}

export interface StreamActionResolvedEvent extends StreamEventBase {
  type: "stream.action_resolved";
  conversationId: string;
  actionId: string;
  resolution: {
    type: "tool_approval" | "user_question";
    decision?: "allow" | "deny";
    cancelled?: boolean;
  };
}

export interface StreamDoneEvent extends StreamEventBase {
  type: "stream.done";
  conversationId: string;
  messageId: string;
  content: string;
  citations?: Citation[];
  citationMarks?: CitationMark[];
  /** Files/artifacts generated by the assistant during this turn, if any */
  files?: FileAttachment[];
  /** Auto-generated title from the server (only on first message) */
  title?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  /** `requires_action` when the turn paused for an approval or an answer */
  status?: MessageStatus;
  pendingActions?: PendingAction[];
}

export type StreamEvent =
  | StreamStartEvent
  | StreamTextEvent
  | StreamThinkingEvent
  | StreamToolCallEvent
  | StreamToolResultEvent
  | StreamProgressEvent
  | StreamErrorEvent
  | StreamActionRequiredEvent
  | StreamActionResolvedEvent
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
  /** Base URL for the agent server API. Not needed when `transport` is given. */
  baseUrl?: string;
  /**
   * Custom backend. When set, `baseUrl`, `authorization`, `headers`,
   * `getHeaders` and `fetch` are ignored and the transport is used for every
   * call. See the adapters (`AgentSdkTransport`, `ChatCompletionsTransport`,
   * `ResponsesTransport`, `A2ATransport`) or implement `ChatTransport`.
   */
  transport?: ChatTransport;
  /** Agent ID to use for conversations. When omitted, the Chat component will
   *  auto-fetch agents via GET /agents and let the user pick one. */
  agentId?: string;
  /** Authorization header value (e.g., "Bearer token") */
  authorization?: string;
  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
  /** Called before each request; return fresh headers (e.g. a renewed token) */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  /** Replacement for `fetch` (proxies, cookie auth, tests) */
  fetch?: typeof fetch;
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
  /** Called when the server auto-generates a conversation title (first message) */
  onConversationTitleGenerated?: (conversationId: string, title: string) => void;
  /** Called when a background stream completes after the user navigated away.
   *  Receives the conversationId so the host can refresh sidebar / state. */
  onBackgroundStreamCompleted?: (conversationId: string) => void;
  /** Called after the user's answer to an approval or question was accepted */
  onActionResolved?: (info: {
    conversationId: string;
    actionId: string;
    action?: PendingAction;
    resolution: ActionResolution;
  }) => void;
}

export interface MessageActionProps {
  message: Message;
  isStreaming: boolean;
}

/** Props handed to `renderToolApproval` */
export interface ToolApprovalRenderProps {
  action: Extract<PendingAction, { type: "tool_approval" }>;
  state?: ActionState;
  /** True when this app cannot answer (feature off or transport unsupported) */
  readOnly: boolean;
  resolve: (resolution: Extract<ActionResolution, { type: "tool_approval" }>) => void;
}

/** Props handed to `renderQuestion` */
export interface QuestionRenderProps {
  action: Extract<PendingAction, { type: "user_question" }>;
  state?: ActionState;
  readOnly: boolean;
  resolve: (resolution: Extract<ActionResolution, { type: "user_question" }>) => void;
}

export interface ToolCallDisplayProps {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
  result?: unknown;
  isExpanded: boolean;
  onToggle: () => void;
}
