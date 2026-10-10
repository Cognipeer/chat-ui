import type {
  Message,
  Conversation,
  ConversationListItem,
  AgentInfo,
  FileAttachment,
  StreamEvent,
  ChatConfig,
  PendingAction,
  ActionResolution,
} from "../types";
import type {
  ChatTransport,
  PaginatedResponse,
  ResolveActionOptions,
  SendMessageOptions,
  SendMessageResponse,
  StreamCallbacks,
} from "./transport";
import {
  buildHeaders,
  errorFromResponse,
  httpFetch,
  readSSE,
  type HttpOptions,
} from "./http";

/**
 * Agent Server API client
 */
export class AgentServerClient implements ChatTransport {
  private baseUrl: string;
  private http: HttpOptions;

  constructor(config: Pick<ChatConfig, "baseUrl" | "authorization" | "headers" | "getHeaders" | "fetch"> & { agentId?: string }) {
    if (!config.baseUrl) {
      throw new Error("AgentServerClient requires a baseUrl");
    }
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.http = {
      authorization: config.authorization,
      headers: config.headers,
      getHeaders: config.getHeaders,
      fetch: config.fetch,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const response = await httpFetch(this.http, `${this.baseUrl}${path}`, {
      method,
      headers: await buildHeaders(this.http),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw await errorFromResponse(response);
    }

    // 204 No Content — no body to parse
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // ============================================================================
  // Agents
  // ============================================================================

  async getAgents(): Promise<AgentInfo[]> {
    const response = await this.request<{ agents: AgentInfo[] }>("GET", "/agents");
    return response.agents;
  }

  async getAgent(agentId: string): Promise<AgentInfo> {
    return this.request<AgentInfo>("GET", `/agents/${agentId}`);
  }

  // ============================================================================
  // Conversations
  // ============================================================================

  async getConversations(params?: {
    agentId?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<ConversationListItem> & { conversations: ConversationListItem[] }> {
    const searchParams = new URLSearchParams();
    if (params?.agentId) searchParams.set("agentId", params.agentId);
    if (params?.userId) searchParams.set("userId", params.userId);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());

    const query = searchParams.toString();
    return this.request("GET", `/conversations${query ? `?${query}` : ""}`);
  }

  async createConversation(params: {
    agentId: string;
    userId?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Conversation> {
    const response = await this.request<{ conversation: Conversation }>(
      "POST",
      "/conversations",
      params
    );
    return response.conversation;
  }

  async getConversation(conversationId: string): Promise<{
    conversation: Conversation;
    messages: Message[];
    pendingActions?: PendingAction[];
  }> {
    return this.request("GET", `/conversations/${conversationId}`);
  }

  async updateConversation(
    conversationId: string,
    params: { title?: string; metadata?: Record<string, unknown> }
  ): Promise<Conversation> {
    return this.request("PATCH", `/conversations/${conversationId}`, params);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.request("DELETE", `/conversations/${conversationId}`);
  }

  // ============================================================================
  // Messages
  // ============================================================================

  async getMessages(
    conversationId: string,
    params?: { limit?: number; offset?: number; order?: "asc" | "desc" }
  ): Promise<PaginatedResponse<Message> & { messages: Message[] }> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.order) searchParams.set("order", params.order);

    const query = searchParams.toString();
    return this.request(
      "GET",
      `/conversations/${conversationId}/messages${query ? `?${query}` : ""}`
    );
  }

  async sendMessage(
    conversationId: string,
    options: SendMessageOptions
  ): Promise<SendMessageResponse> {
    return this.request(
      "POST",
      `/conversations/${conversationId}/messages`,
      options
    );
  }

  /**
   * Send a message with streaming response
   */
  async sendMessageStream(
    conversationId: string,
    options: Omit<SendMessageOptions, "stream">,
    callbacks: StreamCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await httpFetch(
      this.http,
      `${this.baseUrl}/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: await buildHeaders(this.http),
        body: JSON.stringify({ ...options, stream: true }),
        signal,
      }
    );

    if (!response.ok) {
      throw await errorFromResponse(response);
    }

    await this.readStream(response, callbacks);
  }

  /**
   * Answer a pending approval or question
   * (`POST /conversations/:id/actions/:actionId`). With `stream: true` the
   * continuation is delivered through `options.callbacks`.
   */
  async resolveAction(
    conversationId: string,
    actionId: string,
    resolution: ActionResolution,
    options: ResolveActionOptions = {}
  ): Promise<SendMessageResponse | undefined> {
    const path = `/conversations/${conversationId}/actions/${actionId}`;

    if (!options.stream) {
      return this.request("POST", path, { resolution });
    }

    const response = await httpFetch(this.http, `${this.baseUrl}${path}`, {
      method: "POST",
      headers: await buildHeaders(this.http),
      body: JSON.stringify({ resolution, stream: true }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw await errorFromResponse(response);
    }

    await this.readStream(response, options.callbacks ?? {});
    return undefined;
  }

  private async readStream(response: Response, callbacks: StreamCallbacks): Promise<void> {
    let fullText = "";

    await readSSE(response, ({ data: raw }) => {
      const data = raw.trim();
      if (!data) return;

      try {
        const event = JSON.parse(data) as StreamEvent;

        switch (event.type) {
          case "stream.start":
            callbacks.onStart?.(event);
            break;
          case "stream.text":
            fullText += event.text;
            callbacks.onText?.(event.text, fullText);
            break;
          case "stream.thinking":
            // Treat thinking as text for now
            fullText += (event as any).thinking;
            callbacks.onText?.((event as any).thinking, fullText);
            break;
          case "stream.tool_call":
            callbacks.onToolCall?.(event);
            break;
          case "stream.tool_result":
            callbacks.onToolResult?.(event);
            break;
          case "stream.progress":
            callbacks.onProgress?.(event);
            break;
          case "stream.error": {
            // The code lets the UI show a friendly message and recover (busy, pending action, ...)
            const error = new Error(event.error) as Error & { code?: string };
            if (event.code) error.code = event.code;
            callbacks.onError?.(error);
            break;
          }
          case "stream.action_required":
            callbacks.onActionRequired?.(event);
            break;
          case "stream.action_resolved":
            callbacks.onActionResolved?.(event);
            break;
          case "stream.done":
            callbacks.onDone?.(event);
            break;
        }
      } catch {
        // Ignore parse errors
      }
    });
  }

  // ============================================================================
  // Files
  // ============================================================================

  async uploadFile(params: {
    file: { name: string; content: string; mimeType: string };
    conversationId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<FileAttachment> {
    const response = await this.request<{ file: FileAttachment }>(
      "POST",
      "/files",
      params
    );
    return response.file;
  }

  async getFile(fileId: string): Promise<FileAttachment> {
    const response = await this.request<{ file: FileAttachment }>(
      "GET",
      `/files/${fileId}`
    );
    return response.file;
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.request("DELETE", `/files/${fileId}`);
  }

  getFileContentUrl(fileId: string): string {
    return `${this.baseUrl}/files/${fileId}/content`;
  }
}
