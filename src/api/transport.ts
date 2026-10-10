import type {
  Message,
  Conversation,
  ConversationListItem,
  AgentInfo,
  StreamEvent,
  PendingAction,
  ActionResolution,
  MessageStatus,
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
}
