import type {
  ReasoningEffort,
  FileAttachment,
  Message,
  Conversation,
  ConversationBudget,
  ConversationEvent,
  ConversationListItem,
  ConversationRuntime,
  MessagesPage,
  AgentInfo,
  StreamEvent,
  PendingAction,
  ActionResolution,
  MessageStatus,
  StopReason,
  TurnWarning,
  FeedbackInput,
  MessageFeedback,
  ExportFormat,
} from "../types";

/** What `ChatTransport.getConversation` can be asked for besides the conversation. */
export interface GetConversationOptions {
  /** Id of the oldest message already shown: the page of messages just older than it is returned */
  before?: string;
  /** How many messages (default: the server's page size) */
  limit?: number;
}

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
  /** The model to answer with: a key of `AgentInfo.models` */
  model?: string;
  /** How much the model reasons for this message (agent-server 0.5.0+) */
  reasoningEffort?: ReasoningEffort;
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
  /** The model's reasoning ("thinking"), kept apart from the answer text */
  onThinking?: (text: string, fullThinking: string) => void;
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
  /** The model to answer with (`regenerateMessage` only; a key of `AgentInfo.models`) */
  model?: string;
  /** Reasoning effort for the run (`regenerateMessage` only) */
  reasoningEffort?: ReasoningEffort;
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

/** What `ChatTransport.editMessage` sends in place of the message being edited. */
export interface EditMessageInput {
  /** The new text of the message */
  content: string;
  /** Files stored earlier that go with the edited message (the ones it already carried stay unless named here) */
  fileIds?: string[];
  /** The model to answer with: a key of `AgentInfo.models` */
  model?: string;
  /** Reasoning effort for the run */
  reasoningEffort?: ReasoningEffort;
}

/** The answer to deleting several conversations at once. */
export interface BulkDeleteResult {
  /** Ids that are gone */
  deleted: string[];
  /**
   * Ids that were not deleted (not the person's, busy, ...) with the server's reason (`not_found`,
   * `busy`, `error`, or an error code) and message when it gives them
   */
  failed: Array<{ id: string; code?: string; message?: string }>;
}

/** What `ChatTransport.exportConversation` is asked for. */
export interface ExportRequest {
  format: ExportFormat;
  /** Include tool calls and their results */
  includeTools?: boolean;
}

/** A file the server produced for an export. */
export interface ExportResult {
  blob: Blob;
  filename: string;
  /** `text/html` for a print-friendly page the client prints itself (a server without a PDF renderer) */
  contentType: string;
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

  /**
   * A conversation with its messages: the newest page when the server pages its history
   * (see `messagesPage`), or with `options.before` the page just older than that message.
   */
  getConversation(conversationId: string, options?: GetConversationOptions): Promise<{
    conversation: Conversation;
    messages: Message[];
    /** Actions still waiting for an answer, when the server reports them */
    pendingActions?: PendingAction[];
    /** Which part of the history `messages` is, when the server pages it */
    messagesPage?: MessagesPage;
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

  /**
   * Run the conversation's last answer again from the message that asked for it (`POST
   * /conversations/:id/messages/:messageId/regenerate`). Streams or returns the new answer like
   * `resolveAction`. Optional: without it the chat offers no "regenerate".
   */
  regenerateMessage?(
    conversationId: string,
    messageId: string,
    options?: ResolveActionOptions
  ): Promise<SendMessageResponse | undefined>;

  /**
   * Replace one of the person's messages and run the turn again from it (`POST
   * /conversations/:id/messages/:messageId/edit`); everything after the message is dropped. Streams
   * or returns the new answer like `resolveAction`. Optional: without it the chat offers no "edit".
   */
  editMessage?(
    conversationId: string,
    messageId: string,
    input: EditMessageInput,
    options?: ResolveActionOptions
  ): Promise<SendMessageResponse | undefined>;

  /**
   * Rate an answer (`POST /conversations/:id/messages/:messageId/feedback`); `rating: null`
   * withdraws the rating. One rating per person per message, replaced by the next one. Optional:
   * without it the chat shows no thumbs.
   */
  sendFeedback?(conversationId: string, messageId: string, input: FeedbackInput): Promise<MessageFeedback | null | undefined>;

  /** Change a conversation's title. Optional: without it the history offers no rename. */
  renameConversation?(conversationId: string, title: string): Promise<void>;

  /**
   * Pin or unpin a conversation (`PATCH /conversations/:id { pinned }`). Optional: without it the history
   * offers no pin. Resolves with the pin the server stored when it says (the list takes the row back
   * when that is not what was asked for), `undefined` when it does not. For an unpin, a transport whose answer can
   * echo the conversation as it was before the write reads it again first (`AgentServerClient` does).
   */
  pinConversation?(conversationId: string, pinned: boolean): Promise<boolean | void>;

  /**
   * Delete several conversations at once (`POST /conversations/bulk-delete`, at most 100 ids).
   * Optional: without it the history deletes them one by one with `deleteConversation`.
   */
  deleteConversations?(ids: string[]): Promise<BulkDeleteResult>;

  /**
   * A conversation as a file (`GET /conversations/:id/export`). Optional: without it the chat
   * builds Markdown and JSON from the messages it has loaded, and prints for a PDF.
   */
  exportConversation?(conversationId: string, request: ExportRequest): Promise<ExportResult>;
}
