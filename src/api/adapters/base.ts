import type {
  AgentInfo,
  Citation,
  CitationMark,
  Conversation,
  ConversationListItem,
  FileAttachment,
  Message,
  StreamEvent,
} from "../../types";
import type {
  ChatTransport,
  PaginatedResponse,
  SendMessageOptions,
  SendMessageResponse,
  StreamCallbacks,
} from "../transport";
import { MemoryThreadStore, type ThreadStore } from "../threadStore";
import { makeId, type InlineFile } from "./files";

/** What a backend adapter reports while a turn is running. */
export interface RunEmit {
  /** Append streamed text */
  text(delta: string): void;
  /** Replace the text so far (for backends that rewrite earlier output) */
  setText(full: string): void;
  toolCall(id: string, name: string, args: Record<string, unknown>): void;
  toolResult(id: string, name: string, result: unknown): void;
  progress(message: string): void;
}

export interface RunInput {
  conversation: Conversation;
  /** Earlier messages of the thread, without the one being sent */
  history: Message[];
  text: string;
  files?: InlineFile[];
  metadata?: Record<string, unknown>;
  stream: boolean;
  signal?: AbortSignal;
  emit: RunEmit;
}

export interface RunResult {
  /** Final answer. Defaults to the text emitted during the run. */
  content?: string;
  citations?: Citation[];
  citationMarks?: CitationMark[];
  files?: FileAttachment[];
  usage?: SendMessageResponse["usage"];
  /** Merged into `conversation.state`, e.g. a previous response id or context id */
  state?: Record<string, unknown>;
}

export interface StatelessTransportOptions {
  /** Agents offered in the picker. Defaults to a single agent named after `defaultAgentId`. */
  agents?: AgentInfo[];
  /** Id used when `agents` is not given */
  defaultAgentId?: string;
  /** Where conversations are kept. Defaults to memory (lost on reload). */
  store?: ThreadStore;
}

const TITLE_LENGTH = 60;

function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > TITLE_LENGTH ? `${oneLine.slice(0, TITLE_LENGTH - 1)}…` : oneLine;
}

/**
 * Base for backends that have no conversation API of their own. It keeps
 * threads in a `ThreadStore` and turns `run()` into the streaming contract the
 * UI expects; subclasses only talk to their backend.
 */
export abstract class StatelessTransport implements ChatTransport {
  protected readonly store: ThreadStore;
  protected readonly agents: AgentInfo[];

  constructor(options: StatelessTransportOptions = {}) {
    this.store = options.store ?? new MemoryThreadStore();
    const id = options.defaultAgentId ?? "default";
    this.agents = options.agents ?? [{ id, name: id }];
  }

  protected abstract run(input: RunInput): Promise<RunResult>;

  async getAgents(): Promise<AgentInfo[]> {
    return this.agents;
  }

  async getConversations(params?: {
    agentId?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<ConversationListItem> & { conversations: ConversationListItem[] }> {
    const limit = params?.limit ?? 20;
    const offset = params?.offset ?? 0;
    const all = (await this.store.list())
      .map((t) => t.conversation)
      .filter((c) => !params?.agentId || c.agentId === params.agentId)
      .filter((c) => !params?.userId || c.userId === params.userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    const names = new Map(this.agents.map((a) => [a.id, a.name]));
    const page = all.slice(offset, offset + limit).map<ConversationListItem>((c) => ({
      id: c.id,
      title: c.title,
      agentId: c.agentId,
      agentName: names.get(c.agentId),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    return {
      conversations: page,
      total: all.length,
      limit,
      offset,
      hasMore: offset + limit < all.length,
    };
  }

  async createConversation(params: {
    agentId: string;
    userId?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Conversation> {
    const now = new Date();
    const conversation: Conversation = {
      id: makeId(),
      agentId: params.agentId,
      userId: params.userId,
      title: params.title,
      metadata: params.metadata,
      state: {},
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save({ conversation, messages: [] });
    return conversation;
  }

  async getConversation(conversationId: string) {
    const thread = await this.requireThread(conversationId);
    return { conversation: thread.conversation, messages: thread.messages };
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.store.delete(conversationId);
  }

  async sendMessage(
    conversationId: string,
    options: SendMessageOptions
  ): Promise<SendMessageResponse> {
    const turn = await this.runTurn(conversationId, options, false, undefined, undefined);
    return {
      message: turn.userMessage,
      response: turn.assistantMessage,
      conversationTitle: turn.newTitle,
      usage: turn.usage,
    };
  }

  async sendMessageStream(
    conversationId: string,
    options: Omit<SendMessageOptions, "stream">,
    callbacks: StreamCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    const turn = await this.runTurn(conversationId, options, true, callbacks, signal);
    callbacks.onDone?.({
      type: "stream.done",
      timestamp: Date.now(),
      conversationId,
      messageId: turn.assistantMessage.id,
      content: turn.assistantMessage.content as string,
      citations: turn.assistantMessage.citations,
      citationMarks: turn.assistantMessage.citationMarks,
      files: turn.assistantMessage.files,
      title: turn.newTitle,
      usage: turn.usage,
    });
  }

  private async requireThread(id: string) {
    const thread = await this.store.get(id);
    if (!thread) throw new Error(`Conversation not found: ${id}`);
    return thread;
  }

  private async runTurn(
    conversationId: string,
    options: Omit<SendMessageOptions, "stream">,
    stream: boolean,
    callbacks: StreamCallbacks | undefined,
    signal: AbortSignal | undefined
  ) {
    const thread = await this.requireThread(conversationId);
    const { conversation } = thread;
    const history = [...thread.messages];

    const now = () => new Date();
    const userMessage: Message = {
      id: makeId(),
      conversationId,
      role: "user",
      content: options.message,
      files: options.files?.map((f) => ({
        id: makeId(),
        name: f.name,
        mimeType: f.mimeType,
        size: Math.floor((f.content.length * 3) / 4),
      })),
      metadata: options.metadata,
      createdAt: now(),
      updatedAt: now(),
    };
    thread.messages = [...history, userMessage];
    conversation.updatedAt = now();
    await this.store.save(thread);

    const assistantId = makeId();
    const event = (e: Record<string, unknown>) =>
      ({ ...e, timestamp: Date.now() }) as unknown as StreamEvent;

    callbacks?.onStart?.(
      event({ type: "stream.start", conversationId, messageId: assistantId })
    );

    let text = "";
    const toolDetails: Array<{ id: string; name: string; args: Record<string, unknown>; result?: unknown }> = [];
    const emit: RunEmit = {
      text: (delta) => {
        if (!delta) return;
        text += delta;
        callbacks?.onText?.(delta, text);
      },
      setText: (full) => {
        text = full;
        callbacks?.onText?.("", text);
      },
      toolCall: (id, name, args) => {
        const existing = toolDetails.find((t) => t.id === id);
        if (existing) existing.args = args;
        else toolDetails.push({ id, name, args });
        callbacks?.onToolCall?.(
          event({ type: "stream.tool_call", toolCallId: id, toolName: name, args })
        );
      },
      toolResult: (id, name, result) => {
        const existing = toolDetails.find((t) => t.id === id);
        if (existing) existing.result = result;
        callbacks?.onToolResult?.(
          event({ type: "stream.tool_result", toolCallId: id, toolName: name, result })
        );
      },
      progress: (message) => {
        callbacks?.onProgress?.(event({ type: "stream.progress", message }));
      },
    };

    const result = await this.run({
      conversation,
      history,
      text: options.message,
      files: options.files,
      metadata: options.metadata,
      stream,
      signal,
      emit,
    });

    const content = result.content ?? text;
    const assistantMessage: Message = {
      id: assistantId,
      conversationId,
      role: "assistant",
      content,
      citations: result.citations,
      citationMarks: result.citationMarks,
      files: result.files,
      toolCalls: toolDetails.length
        ? toolDetails.map((t) => ({ id: t.id, name: t.name, arguments: JSON.stringify(t.args) }))
        : undefined,
      metadata: toolDetails.length
        ? { toolCallDetails: toolDetails.map((t) => ({ ...t })) }
        : undefined,
      createdAt: now(),
      updatedAt: now(),
    };

    let newTitle: string | undefined;
    if (!conversation.title && history.length === 0) {
      newTitle = titleFrom(options.message);
      conversation.title = newTitle;
    }
    conversation.state = { ...conversation.state, ...result.state };
    conversation.updatedAt = now();
    thread.messages = [...thread.messages, assistantMessage];
    await this.store.save(thread);

    return { userMessage, assistantMessage, newTitle, usage: result.usage };
  }
}
