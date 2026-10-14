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
  /** Responses API image input; `image_url` is the URL itself or `{ url }` */
  | { type: "input_image"; image_url: string | { url: string } }
  /** Anthropic-style image: inline base64 or a URL */
  | {
      type: "image";
      source:
        | { type: "base64"; media_type: string; data: string }
        | { type: "url"; url: string };
    }
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
  /**
   * Why the turn that wrote this message stopped (`cancelled`, `limit`, `budget_reached`, ...). Read
   * from `metadata.stopReason` when the server only sends it there. Absent for a plain answer.
   */
  stopReason?: StopReason;
  /** The runtime's own wording for the stop, when it gives one (shown only through `renderStopNotice`) */
  stopDetail?: string;
  /**
   * How each action in `pendingActions` ended or stands, keyed by action id. Kept by this
   * app as cards settle; a server may also send it (or settled entries in
   * `metadata.pendingActions`, each with a `status` and `resolution`) so a reloaded history
   * shows what was decided. See `restorePendingActions`.
   */
  actionStates?: Record<string, ActionState>;
  /**
   * The signed-in person's rating of this answer (thumbs up / down with reasons). Read from
   * `message.feedback` or `message.metadata.feedback`; kept by this app as the person rates.
   */
  feedback?: MessageFeedback;
  /**
   * The model's reasoning ("thinking") for this answer, shown in a collapsible block above it.
   * Streamed from `stream.thinking`; also read from `metadata.reasoning` / `metadata.thinking`
   * when a stored message carries it.
   */
  reasoning?: string;
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
  /**
   * Object URL of a file that is still on this device, so an image can be shown before (or
   * without) a server URL. Revoked when the conversation is left; never sent to the server.
   */
  previewUrl?: string;
  /**
   * Where a file attached in the composer is: waiting for its turn, going up, stored and
   * ready for the message, or refused by the server. Absent for files that are simply there.
   */
  status?: FileStatus;
  /** Upload progress, 0 to 1, while `status` is `uploading` */
  progress?: number;
  /** Why an upload failed (localized), while `status` is `failed` */
  uploadError?: string;
  /** When the server deletes the file (ISO 8601); a chip turns "expired" once it has passed */
  expiresAt?: string;
  /** The file is gone from the server (expired, deleted); set when a conversation is loaded */
  expired?: boolean;
  /**
   * Whether the text of the file could be read for the agent. `failed` / `skipped` tint the chip
   * with "no readable text". Set by servers and hosts that convert files.
   */
  conversionStatus?: FileConversionStatus;
}

export type FileStatus = "queued" | "uploading" | "ready" | "failed";
export type FileConversionStatus = "pending" | "succeeded" | "failed" | "skipped";

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
  /** A code or text preview of what the option leads to, shown in a collapsed panel */
  preview?: string;
}

export interface UserQuestion {
  question: string;
  header?: string;
  multiSelect?: boolean;
  placeholder?: string;
  /** Default `true`: a question must be answered unless the server says `required: false` */
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
      /**
       * JSON Schema of `args`. When the card lets the person edit the arguments, the edit
       * is checked against it (type, properties, required, enum, ranges, lengths, pattern,
       * items, additionalProperties, anyOf / oneOf).
       */
      argsSchema?: Record<string, unknown>;
      expiresAt?: string;
    }
  | {
      id: string;
      type: "user_question";
      questions: UserQuestion[];
      allowFreeText?: boolean;
      expiresAt?: string;
    }
  | {
      /**
       * A tool the host page of an embedded chat runs (`embed.clientTools`). No card is drawn for it:
       * `<EmbedChat>` hands the call to the host page and answers with its result.
       */
      id: string;
      type: "client_tool";
      toolName: string;
      toolCallId?: string;
      args?: Record<string, unknown>;
      /** How long the host page has to answer, in seconds */
      timeoutSeconds?: number;
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
    }
  | {
      /** The host page's answer to a `client_tool` action: its JSON `output`, or an `error` text */
      type: "client_tool";
      output?: unknown;
      error?: string;
    };

export type MessageStatus = "completed" | "requires_action" | "incomplete" | "cancelled";

/** Why a turn stopped (agent-server >= 0.3.0 `stopReason`). */
export type StopReason =
  | "end_turn"
  | "requires_action"
  | "cancelled"
  | "max_turns"
  | "limit"
  | "budget_reached"
  | "error";

/** Where a conversation is in its run lifecycle. */
export type RuntimeStatus = "idle" | "running" | "requires_action" | "budget_paused";

/** `conversation.runtime` as agent-server reports it. */
export interface ConversationRuntime {
  status: RuntimeStatus;
  /** Why the last turn stopped; absent while a turn is running */
  stopReason?: StopReason;
  /** `seq` of the newest event in the conversation's log: follow from here */
  lastEventSeq?: number;
  /** The actions the conversation waits on */
  pendingActionIds?: string[];
  /** The run executing now (on this or another node) */
  activeRunId?: string;
}

/**
 * Which part of a conversation's history a `getConversation` answer holds. agent-server sends the
 * newest page (`limits.messagePageSize`, 100 by default) and says whether older messages exist;
 * they are fetched with `before=<id of the oldest message shown>`.
 */
export interface MessagesPage {
  limit: number;
  order: "asc" | "desc";
  /** Older messages exist than the ones returned */
  hasMoreBefore: boolean;
  /** Newer messages exist than the ones returned */
  hasMoreAfter: boolean;
}

/** A spend limit on a conversation. */
export interface ConversationBudget {
  maxCostUsd: number;
  /** `pause`: wait for a higher limit, then carry on. `stop`: end the conversation until it is raised. */
  onReach: "pause" | "stop";
}

/** Something worth knowing about a turn that still completed (`file_truncated`, `images_not_supported`, ...). */
export interface TurnWarning {
  code: string;
  message?: string;
  [key: string]: unknown;
}

/** One entry of a conversation's event log, as `GET /conversations/:id/events` returns it. */
export interface ConversationEvent {
  /** Absent for live-only frames such as `agent.message.delta` */
  seq?: number;
  type: string;
  data: Record<string, unknown>;
  runId?: string;
  createdAt?: string;
}

/**
 * What the composer is doing. `open` takes a message; every other state says why not (or what
 * a message would do): `blocked` / `cancel` / `answer` while a card waits, `following` while a
 * turn runs somewhere else, `budget_paused` once the spend limit is used up, `readonly` when
 * the host turned the chat into a transcript.
 */
export type ComposerState =
  | "open"
  | "blocked"
  | "cancel"
  | "answer"
  | "following"
  | "budget_paused"
  | "readonly";

/** Where an action card is in its life, as tracked by the UI. */
export type ActionStatus = "pending" | "resolving" | "resolved" | "cancelled" | "expired";

export interface ActionState {
  status: ActionStatus;
  /** What was answered; absent when it was resolved somewhere else */
  resolution?: ActionResolution;
  /** Who settled it and when, when the server says (shown nowhere by default) */
  resolvedBy?: string;
  resolvedAt?: string;
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
  /** Whether a turn is running, waiting for a person, or idle (agent-server >= 0.3.0) */
  runtime?: ConversationRuntime;
  /** The spend limit of the conversation, when it has one; `null`: removed on purpose */
  budget?: ConversationBudget | null;
  /** What the conversation's turns have cost so far, in USD */
  spentUsd?: number;
  /**
   * A turn the budget stopped midway can be carried on (`POST /continue`). It stays `budget_paused`
   * after the limit was raised until it is continued or a new message abandons it. `false`: the
   * turn had finished its answer before the limit, so raising the limit only reopens the
   * conversation. Absent when the server does not say (older servers: `runtime.status` decides).
   */
  continuable?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationListItem {
  id: string;
  title?: string;
  /** Agent display name, populated by the server */
  agentName?: string;
  agentId: string;
  /** Shown as a status badge in the history (running / waiting for you / budget reached) */
  runtime?: ConversationRuntime;
  budget?: ConversationBudget | null;
  spentUsd?: number;
  /** Pinned conversations are listed first (`metadata.pinned` on the server) */
  pinned?: boolean;
  metadata?: Record<string, unknown>;
  /** Only in a search response: where the conversation matched the search text */
  searchMatch?: ConversationSearchMatch;
  createdAt: Date;
  updatedAt: Date;
}

/** Where a conversation matched a search (`GET /conversations?q=`, agent-server >= 0.7.0). */
export interface ConversationSearchMatch {
  field: "title" | "message";
  /** The message that matched (`field: "message"`) */
  messageId?: string;
  role?: "user" | "assistant";
  /** Plain text, at most 160 characters around the first match; `…` marks a cut end */
  snippet: string;
}

/** What the server searches: titles and message text (`full`), or titles only (`title`). */
export type ConversationSearchMode = "full" | "title";

// ============================================================================
// Agent Types
// ============================================================================

/** One model a person can pick for a message (`AgentInfo.models`, agent-server >= 0.4.0). */
export interface AgentModelOption {
  /** What is sent as `model` with the message */
  key: string;
  /** What the picker shows */
  label: string;
  /** One line under the label */
  description?: string;
  /** The model the agent uses when none is picked */
  default: boolean;
}

export interface AgentInfo {
  id: string;
  name: string;
  description?: string;
  version?: string;
  /** `false` hides the model's reasoning (the "Thinking" block) for this agent. Absent or `true` shows it. */
  showReasoning?: boolean;
  /**
   * Models the person can choose between per message. The `ModelPicker` shows only with two or
   * more. Absent when the agent offers no choice.
   */
  models?: AgentModelOption[];
  /**
   * Free-form. `Chat` reads these keys to adapt itself to the agent (each overrides
   * the matching prop): `enableFileUpload`, `maxFileSize`, `maxFiles`,
   * `allowedFileTypes`, `pendingActionComposerMode` (`"block"` | `"cancel"`),
   * `acceptsImages` (`false` warns on image attachments), `maxFilesScope` and
   * `fileRetentionDays`. `capabilities.attachments` says the same in one place and wins.
   *
   * The portal experience reads three more: `starters` (suggested first messages, see
   * `ConversationStarter`), `welcome` (Markdown shown on the empty chat) and `experience` (an
   * object whose `messageActions`, `feedback`, `history`, `export`, `notifications` and
   * `disclosure` keys override the matching `<Chat>` props).
   */
  metadata?: Record<string, unknown>;
  /** What the agent can pause for or take; absent when the server does not say */
  capabilities?: AgentCapabilities;
}

/**
 * What an agent takes as attachments (`AgentInfo.capabilities.attachments`). agent-server fills `enabled`,
 * `maxFiles`, `maxFileSize`, `allowedMimeTypes` and `acceptsImages`; the other fields (`retentionDays`,
 * `maxFilesScope`) are read when the server or the host sets them.
 */
export interface AgentAttachmentsCapability {
  /** `false` hides the paperclip */
  enabled?: boolean;
  /** Files one conversation may hold (see `maxFilesScope`) */
  maxFiles?: number;
  /** Largest file, in bytes */
  maxFileSize?: number;
  /** Accepted MIME types, `image/*` style wildcards allowed; empty or absent means any */
  allowedMimeTypes?: string[];
  /** `false`: the agent's model does not look at images; an attached image gets a warning */
  acceptsImages?: boolean;
  /**
   * Days an uploaded file is kept; shown as a hint under the composer ("Files are kept for 30 days")
   * when present. A host can also set `metadata.fileRetentionDays`; without either there is no hint.
   */
  retentionDays?: number;
  /** What `maxFiles` counts: files per `conversation` (agent-server) or per `message`. Default `conversation`. */
  maxFilesScope?: "conversation" | "message";
}

export interface AgentCapabilities {
  toolApproval?: boolean;
  askUser?: boolean;
  /** The approval card may edit a call's arguments (overrides `allowArgumentEdit`) */
  approvalArgsEdit?: boolean;
  /** `false`: the agent does not read images (the older place for `attachments.acceptsImages`) */
  acceptsImages?: boolean;
  attachments?: AgentAttachmentsCapability;
  /** What a person may do once the spend limit is reached (override `allowBudgetContinue` / `allowBudgetEdit`) */
  budget?: {
    allowContinue?: boolean;
    allowEdit?: boolean;
  };
}

// ============================================================================
// Stream Event Types
// ============================================================================

export interface StreamEventBase {
  type: string;
  timestamp: number;
  /**
   * Position in the conversation's event log at this frame (agent-server >= 0.3.0). A client
   * that loses the connection follows on from the last one it saw.
   */
  seq?: number;
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

/** How much effort the model puts into reasoning (sent as `reasoningEffort`; the agent must support it) */
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high";

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
    type: "tool_approval" | "user_question" | "client_tool";
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
    cachedInputTokens?: number;
    costUsd?: number;
  };
  /** `requires_action` when the turn paused for an approval or an answer */
  status?: MessageStatus;
  pendingActions?: PendingAction[];
  /** Why the turn stopped (`cancelled`, `limit`, `budget_reached`, ...) */
  stopReason?: StopReason;
  /** The run that executed the turn */
  runId?: string;
  /** The conversation's spend limit and what it has cost, this turn included */
  budget?: ConversationBudget;
  spentUsd?: number;
  /** Things worth knowing about a turn that still completed */
  warnings?: TurnWarning[];
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
// Portal experience types
// ============================================================================

/** Thumbs up / down on an answer. */
export type FeedbackRating = "up" | "down";

/** The reasons offered with a thumbs-down (each has a `chat.feedback.reason.<id>` string). */
export type FeedbackReasonId = "inaccurate" | "incomplete" | "off_topic" | "too_long" | "unsafe" | "other";

/** A person's rating of one answer. */
export interface MessageFeedback {
  rating: FeedbackRating;
  reasons?: string[];
  comment?: string;
}

/** What `ChatTransport.sendFeedback` is given. `rating: null` withdraws the rating. */
export interface FeedbackInput {
  rating: FeedbackRating | null;
  reasons?: string[];
  comment?: string;
}

/** A suggested first message, shown as a chip on the empty chat. */
export interface ConversationStarter {
  /** The message the chip puts in the composer (or sends, with `autoSend`) */
  text: string;
  /** What the chip says, when shorter than `text` */
  label?: string;
  /** Send at once instead of only filling the composer (default false) */
  autoSend?: boolean;
}

export type AnnouncementSeverity = "info" | "warning" | "critical";

/** A dismissible notice above the chat (maintenance, a new agent, a policy change). */
export interface Announcement {
  id: string;
  severity?: AnnouncementSeverity;
  /** Short Markdown */
  text: string;
  /** ISO 8601; shown from this moment on */
  startsAt?: string;
  /** ISO 8601; hidden after this moment */
  endsAt?: string;
  /** Default true */
  dismissible?: boolean;
}

/** Links of the legal footer. `mailto:` is allowed for `support`. */
export interface LegalLinks {
  privacy?: string;
  terms?: string;
  support?: string;
  aboutAi?: string;
}

/** AI disclosure: a label on every answer and a row of legal links under the composer. */
export interface DisclosureConfig {
  /** Label answers as AI-generated (default false) */
  aiLabel?: boolean;
  /** Replaces the localized "AI-generated" text */
  labelText?: string;
  links?: LegalLinks;
}

/** Which actions the toolbar under a message offers. */
export interface MessageActionsConfig {
  /** Copy the text of a message */
  copy?: boolean;
  /** Run the last answer again (needs a transport with `regenerateMessage`) */
  regenerate?: boolean;
  /** Edit one of your messages and send it again (needs a transport with `editMessage`) */
  edit?: boolean;
}

/** Thumbs up / down on answers. */
export interface FeedbackConfig {
  enabled?: boolean;
  /** Offer the free-text comment with a thumbs-down (default true) */
  comments?: boolean;
  /** The reasons offered (default: all of `FeedbackReasonId`) */
  reasons?: string[];
}

/** What the history sidebar lets the person do besides open and delete one conversation. */
export interface HistoryActionsConfig {
  rename?: boolean;
  pin?: boolean;
  bulkDelete?: boolean;
}

export type ExportFormat = "md" | "json" | "pdf";

/** Download a conversation as a file. */
export interface ExportConfig {
  enabled?: boolean;
  /** Default: all three */
  formats?: ExportFormat[];
  /** Include the tool calls and their results (default false) */
  includeTools?: boolean;
}

/** Alerts while the tab is in the background and a turn finished or an approval waits. */
export interface NotificationsConfig {
  /** Put "(1)" in front of the tab title */
  tabBadge?: boolean;
  /** A short sound (the person can mute it in the bell menu) */
  sound?: boolean;
  /** `opt_in`: the bell menu offers desktop notifications; the permission is asked only when the person turns them on */
  desktop?: "off" | "opt_in";
}

/** The host page's answer to a tool call (`<Chat onClientToolCall>`). */
export type ClientToolResult = { ok: true; output?: unknown } | { ok: false; error: string };

/** A call the agent made to a tool of the host page. */
export interface ClientToolCall {
  actionId: string;
  toolCallId?: string;
  name: string;
  args: Record<string, unknown>;
  timeoutSeconds?: number;
}

/** What a host can do to a running `<Chat>` (see its `controllerRef` prop). */
export interface ChatController {
  /** Put text in the composer; with `send` it is sent at once */
  prefill: (text: string, options?: { send?: boolean }) => void;
  /** Start a new, empty conversation */
  newChat: () => void;
  focus: () => void;
}

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
    /** Status colours: the text/icon colour and a tinted background for each */
    success?: string;
    successBg?: string;
    danger?: string;
    dangerBg?: string;
    warning?: string;
    warningBg?: string;
    info?: string;
    infoBg?: string;
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
    success: "#34d399",
    successBg: "rgba(16, 185, 129, 0.12)",
    danger: "#f87171",
    dangerBg: "rgba(239, 68, 68, 0.12)",
    warning: "#fbbf24",
    warningBg: "rgba(245, 158, 11, 0.14)",
    info: "#60a5fa",
    infoBg: "rgba(59, 130, 246, 0.12)",
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
    success: "#047857",
    successBg: "rgba(16, 185, 129, 0.12)",
    danger: "#b91c1c",
    dangerBg: "rgba(239, 68, 68, 0.1)",
    warning: "#92400e",
    warningBg: "rgba(245, 158, 11, 0.16)",
    info: "#1d4ed8",
    infoBg: "rgba(59, 130, 246, 0.1)",
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
  /**
   * How files reach the server. `inline` (default) sends them base64 in the
   * message body. `upload` first uploads each file with `POST /files`
   * (`conversationId` set) and sends only their ids with the message
   * (`fileIds`), so the message route needs no large body limit. Needs a
   * transport with `uploadFile` (`AgentServerClient` has it); otherwise inline.
   * `upload-on-select` stores each file as soon as it is picked, dropped or pasted, with a
   * progress bar on its chip, and the message carries only the ids; the conversation is
   * created at the first file. Where the transport takes the file as itself (agent-server
   * does), the bytes go up as the request body instead of base64.
   */
  fileTransport?: "inline" | "upload" | "upload-on-select";
  /**
   * What `maxFiles` counts. `message` (default for the prop): files one message may carry.
   * `conversation`: files the whole chat may hold, counted from the server's file list (or the
   * loaded history). An agent's own `maxFiles` is per conversation unless its metadata says
   * `maxFilesScope: "message"`.
   */
  maxFilesScope?: "conversation" | "message";
  /**
   * The text sent when a message carries files and nothing else. Default: a short,
   * localized "please review the attached files" (servers reject an empty message).
   * Set `""` to send no text and let the server decide.
   */
  attachmentsOnlyMessage?: string;
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
  /** Called when a turn ends because the conversation's spend limit is used up */
  onBudgetReached?: (info: {
    conversationId: string;
    budget?: ConversationBudget;
    spentUsd?: number;
  }) => void;
  /** Called after the user's answer to an approval or question was accepted */
  onActionResolved?: (info: {
    conversationId: string;
    actionId: string;
    action?: PendingAction;
    resolution: ActionResolution;
  }) => void;
  /** Called when a turn pauses for an approval or a question (not for a host-page tool, which has no card) */
  onActionRequired?: (info: { conversationId: string; action: PendingAction }) => void;
  /** Called after the person rated an answer (and again when they change or withdraw the rating) */
  onFeedback?: (info: {
    conversationId: string;
    messageId: string;
    feedback: MessageFeedback | null;
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

/** Props handed to `renderStopNotice` */
export interface StopNoticeRenderProps {
  message: Message;
  stopReason: StopReason | "incomplete";
  /** The runtime's own wording, for operators; end users get the localized notice */
  detail?: string;
  /** The message has text (a partial answer) */
  hasText: boolean;
  /**
   * Present when the notice is for a turn that was cut off before it wrote anything (the stored
   * conversation ends on the person's own message): `message` is that message, and this sends it again.
   * Absent where sending is not possible (a transcript, a turn that is running).
   */
  onRetry?: () => void;
}

export interface ToolCallDisplayProps {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
  result?: unknown;
  isExpanded: boolean;
  onToggle: () => void;
}
