import type {
  Message,
  Conversation,
  ConversationListItem,
  AgentInfo,
  FileAttachment,
  StreamEvent,
  ChatConfig,
} from "../types";

interface PaginatedResponse<T> {
  data?: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface SendMessageOptions {
  message: string;
  files?: Array<{
    name: string;
    content: string; // base64
    mimeType: string;
  }>;
  metadata?: Record<string, unknown>;
  stream?: boolean;
}

interface SendMessageResponse {
  message: Message;
  response: Message;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Agent Server API client
 */
export class AgentServerClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: ChatConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.headers = {
      "Content-Type": "application/json",
      ...(config.authorization ? { Authorization: config.authorization } : {}),
      ...config.headers,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Request failed" }));
      throw new Error(error.error?.message || error.message || "Request failed");
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
    callbacks: {
      onStart?: (event: StreamEvent) => void;
      onText?: (text: string, fullText: string) => void;
      onToolCall?: (event: StreamEvent) => void;
      onToolResult?: (event: StreamEvent) => void;
      onProgress?: (event: StreamEvent) => void;
      onError?: (error: Error) => void;
      onDone?: (event: StreamEvent) => void;
    },
    signal?: AbortSignal
  ): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ ...options, stream: true }),
        signal,
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Request failed" }));
      throw new Error(error.error?.message || error.message || "Request failed");
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (!data) continue;

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
                case "stream.error":
                  callbacks.onError?.(new Error(event.error));
                  break;
                case "stream.done":
                  callbacks.onDone?.(event);
                  break;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
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
