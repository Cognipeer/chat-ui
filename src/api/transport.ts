import type {
  FileAttachment,
  Message,
  Conversation,
  ConversationBudget,
  ConversationEvent,
  ConversationListItem,
  ConversationRuntime,
  AgentInfo,
  StreamEvent,
  PendingAction,
  ActionResolution,
  MessageStatus,
  StopReason,
  TurnWarning,
} from "../types";

export interface PaginatedResponse<T> {
  data?: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface SendMessageOptions {
  message: string;
  files?: Array<{
    name: string;
    content: string; // base64
    mimeType: string;
  }>;
  /** Files uploaded earlier with `uploadFile` (for this conversation) that the message attaches */
  fileIds?: string[];
  metadata?: Record<string, unknown>;
  stream?: boolean;
}

export interface SendMessageResponse {
  message: Message;
  response: Message;
  /** Auto-generated title (only on first message, when the backend generates titles) */
  conversationTitle?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  /** `requires_action` when the turn paused for an approval or an answer */
  status?: MessageStatus;
  pendingActions?: PendingAction[];
  /** Why the turn stopped (`cancelled`, `limit`, `budget_reached`, ...) */
  stopReason?: StopReason;
  /** The conversation's spend limit and what it has cost, this turn included */
  budget?: ConversationBudget;
  spentUsd?: number;
  warnings?: TurnWarning[];
}

export interface StreamCallbacks {
  onStart?: (event: StreamEvent) => void;
  onText?: (text: string, fullText: string) => void;
  onToolCall?: (event: StreamEvent) => void;
  onToolResult?: (event: StreamEvent) => void;
  onProgress?: (event: StreamEvent) => void;
  onError?: (error: Error) => void;
  onDone?: (event: StreamEvent) => void;
  /** The turn paused: these approvals / questions need an answer */
  onActionRequired?: (event: StreamEvent) => void;
  /** An action was answered (possibly from another app) */
  onActionResolved?: (event: StreamEvent) => void;
}

export interface ResolveActionOptions {
  /** Stream the continuation through `callbacks` instead of returning JSON */
  stream?: boolean;
  callbacks?: StreamCallbacks;
  signal?: AbortSignal;
}

/** Options of `ChatTransport.continueConversation` (same shape as answering an action). */
export type ContinueOptions = ResolveActionOptions;

/** What `ChatTransport.followEvents` is asked to do. */
export interface FollowEventsOptions {
  /** Only events after this `seq` (default 0). Reconnects continue from the last one seen. */
  after?: number;
  /** Only these event types (and live text deltas) */
  types?: string[];
  /** Stops following (and a pending reconnect) when aborted; `followEvents` then resolves */
  signal?: AbortSignal;
  /** Called for every event, in order, replayed or live. `agent.message.delta` frames have no `seq`. */
  onEvent: (event: ConversationEvent) => void;
  /** Called each time the connection was lost and is being re-opened, with the attempt number */
  onReconnect?: (attempt: number) => void;
}

/** The answer to cancelling a conversation's run (`POST /conversations/:id/cancel`). */
export interface CancelResult {
  /** A run was running, or actions were open, and they were cancelled */
  cancelled: boolean;
  runId?: string;
  /** The run has finished winding down (`false`: it is still stopping or runs on another node) */
  settled?: boolean;
  /** Actions that were open and are now cancelled */
  cancelledActionIds?: string[];
  stopReason?: StopReason;
  runtime?: ConversationRuntime;
}

/** The files a conversation holds (`GET /conversations/:id/files`). */
export interface ListFilesResult {
  files: FileAttachment[];
  total: number;
  /** What the conversation may hold, when the server says */
  maxFiles?: number;
  /** More files exist than this page lists */
  hasMore?: boolean;
}

/** One upload. Give the file's bytes as a `Blob` (sent as the request body) or as base64 `content`. */
export interface UploadFileParams {
  file: {
    name: string;
    mimeType: string;
    /** Base64 content: the JSON form every server takes */
    content?: string;
    /** The file itself: sent as the raw body where the transport takes it (see `supportsRawUpload`) */
    blob?: Blob;
  };
  conversationId?: string;
  metadata?: Record<string, unknown>;
  /** Called as bytes go up (raw uploads only) */
  onProgress?: (progress: { loaded: number; total: number }) => void;
  /** Aborts the upload */
  signal?: AbortSignal;
}

/**
 * Everything the chat UI needs from a backend. `AgentServerClient` implements
 * it for `@cognipeer/agent-server`; the adapters in `./adapters` implement it
 * for agent-sdk, OpenAI Chat Completions, the Responses API and A2A.
 *
 * Pass an instance as the `transport` prop of `<Chat>` (or `useChat`).
 */
export interface ChatTransport {
  getAgents(): Promise<AgentInfo[]>;

  getConversations(params?: {
    agentId?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<ConversationListItem> & { conversations: ConversationListItem[] }>;

  createConversation(params: {
    agentId: string;
    userId?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Conversation>;

  getConversation(conversationId: string): Promise<{
    conversation: Conversation;
    messages: Message[];
    /** Actions still waiting for an answer, when the server reports them */
    pendingActions?: PendingAction[];
  }>;

  deleteConversation(conversationId: string): Promise<void>;

  sendMessage(
    conversationId: string,
    options: SendMessageOptions
  ): Promise<SendMessageResponse>;

  sendMessageStream(
    conversationId: string,
    options: Omit<SendMessageOptions, "stream">,
    callbacks: StreamCallbacks,
    signal?: AbortSignal
  ): Promise<void>;

  /**
   * Answer a pending approval or question. Optional: only
   * `AgentServerClient` implements it; for other transports approvals and
   * questions are not offered.
   *
   * With `stream: true` the continuation arrives through `options.callbacks`
   * (same events as `sendMessageStream`) and the promise resolves to
   * `undefined`; otherwise the JSON response is returned.
   */
  resolveAction?(
    conversationId: string,
    actionId: string,
    resolution: ActionResolution,
    options?: ResolveActionOptions
  ): Promise<SendMessageResponse | undefined>;

  /**
   * Store a file on the server ahead of the message (`fileTransport: "upload"` and
   * `"upload-on-select"`). Optional: without it files are sent inline.
   *
   * A transport that sets `supportsRawUpload` receives the file as a `blob` (no base64) with
   * `onProgress` and `signal`; any other receives `content` in base64 and ignores both.
   */
  uploadFile?(params: UploadFileParams): Promise<FileAttachment>;

  /** `uploadFile` takes `file.blob` and reports progress (agent-server >= 0.3.0). Absent: base64 `content` only. */
  readonly supportsRawUpload?: boolean;

  /** Remove an uploaded file (best effort, used when a send fails after the upload). */
  deleteFile?(fileId: string): Promise<void>;

  /**
   * The files a conversation holds, with their deadlines. Optional: without it the chat counts
   * the files of the loaded messages.
   */
  listFiles?(conversationId: string): Promise<ListFilesResult>;

  /**
   * A URL the browser can show or download a stored file from. Needed when the file route wants
   * credentials an `<img src>` cannot send (the client fetches the bytes and hands back a blob URL).
   */
  getFileUrl?(file: Pick<FileAttachment, "id" | "name" | "mimeType">, options?: { disposition?: "inline" | "attachment" }): Promise<string>;

  /**
   * Follow a conversation's event log: replay what happened after `options.after`, then deliver
   * events live until aborted. Used to pick up a turn that is still running after a reload, and
   * to watch a turn another window started. Reconnects by itself.
   */
  followEvents?(conversationId: string, options: FollowEventsOptions): Promise<void>;

  /**
   * Stop the conversation's run on the server (not just this page's connection). Open
   * approvals / questions of a paused conversation are cancelled too.
   */
  cancel?(conversationId: string): Promise<CancelResult>;

  /**
   * Carry on a turn the conversation's spend limit stopped, with no new message. Streams or
   * returns the continuation like `resolveAction`.
   */
  continueConversation?(conversationId: string, options?: ContinueOptions): Promise<SendMessageResponse | undefined>;

  /** Set (or with `null` remove) the conversation's spend limit. Resolves to the updated conversation. */
  updateBudget?(conversationId: string, budget: ConversationBudget | null): Promise<Conversation>;
}
