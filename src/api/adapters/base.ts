import type {
  ActionResolution,
  AgentInfo,
  Citation,
  CitationMark,
  Conversation,
  ConversationListItem,
  FileAttachment,
  Message,
  MessageStatus,
  PendingAction,
  StopReason,
  StreamEvent,
} from "../../types";
import type {
  ChatTransport,
  PaginatedResponse,
  ResolveActionOptions,
  SendMessageOptions,
  SendMessageResponse,
  StreamCallbacks,
} from "../transport";
import { MemoryThreadStore, type ThreadStore } from "../threadStore";
import { makeId, type InlineFile } from "./files";
import { isActionPending, stateForResolution } from "../../utils/actions";

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
  /**
   * The turn stopped for an approval or a question: these are waiting for an answer. The
   * message is stored `requires_action` and the cards answer through `resolveAction`.
   */
  pendingActions?: PendingAction[];
  /** How the turn ended when it was not a plain answer (`cancelled`, `limit`, ...) */
  status?: MessageStatus;
  /** Why the turn stopped; shown as a notice under the message when it is not `end_turn` */
  stopReason?: StopReason;
  /** The runtime's own wording for the stop */
  stopDetail?: string;
}

/** What `resolve` of a backend that takes answers is handed. */
export interface ResolveInput {
  conversation: Conversation;
  /** The thread up to and including the message that paused */
  history: Message[];
  /** The action being answered */
  action: PendingAction;
  /** The other actions of the same pause that still wait */
  siblings: PendingAction[];
  resolution: ActionResolution;
  stream: boolean;
  signal?: AbortSignal;
  emit: RunEmit;
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

function coded(message: string, code: string, status: number): Error {
  return Object.assign(new Error(message), { code, status });
}

/**
 * Base for backends that have no conversation API of their own. It keeps
 * threads in a `ThreadStore` and turns `run()` into the streaming contract the
 * UI expects; subclasses only talk to their backend.
 *
 * A backend that can stop for an approval or a question returns `pendingActions` from `run()`,
 * and takes the answers by implementing `resolve()` (and `canResolve()` when that depends on its
 * options). Without them the cards are read-only for that backend.
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

  /**
   * Send the person's answer to a paused turn and return what the agent did next (it may stop
   * again with `pendingActions`). Implement it in a subclass whose backend takes answers.
   */
  protected resolve?(input: ResolveInput): Promise<RunResult>;

  /** Whether `resolve` can be used with this transport's options. Default: it is implemented. */
  protected canResolve(): boolean {
    return typeof this.resolve === "function";
  }

  private readonly answerAction: NonNullable<ChatTransport["resolveAction"]> = (conversationId, actionId, resolution, options) =>
    this.runResolve(conversationId, actionId, resolution, options);

  /** Present only for backends that take answers: the chat shows read-only cards otherwise. */
  get resolveAction(): ChatTransport["resolveAction"] {
    return this.canResolve() ? this.answerAction : undefined;
  }

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
      ...this.pauseOf(turn.assistantMessage),
    };
  }

  async sendMessageStream(
    conversationId: string,
    options: Omit<SendMessageOptions, "stream">,
    callbacks: StreamCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    const turn = await this.runTurn(conversationId, options, true, callbacks, signal);
    this.finishStream(conversationId, turn.assistantMessage, callbacks, turn.usage, turn.newTitle);
  }

  private async requireThread(id: string) {
    const thread = await this.store.get(id);
    if (!thread) throw new Error(`Conversation not found: ${id}`);
    return thread;
  }

  /** `status` / `pendingActions` / `stopReason` of a stored assistant message, for responses and `stream.done`. */
  private pauseOf(message: Message): Pick<SendMessageResponse, "status" | "pendingActions" | "stopReason"> {
    return {
      ...(message.pendingActions?.length ? { pendingActions: message.pendingActions, status: "requires_action" as const } : {}),
      ...(!message.pendingActions?.length && (message.status === "cancelled" || message.status === "incomplete")
        ? { status: message.status }
        : {}),
      ...(message.stopReason ? { stopReason: message.stopReason } : {}),
    };
  }

  private finishStream(
    conversationId: string,
    message: Message,
    callbacks: StreamCallbacks | undefined,
    usage: SendMessageResponse["usage"],
    title?: string
  ) {
    const pause = this.pauseOf(message);
    if (pause.pendingActions?.length) {
      callbacks?.onActionRequired?.({
        type: "stream.action_required",
        timestamp: Date.now(),
        conversationId,
        messageId: message.id,
        actions: pause.pendingActions,
      });
    }
    callbacks?.onDone?.({
      type: "stream.done",
      timestamp: Date.now(),
      conversationId,
      messageId: message.id,
      content: message.content as string,
      citations: message.citations,
      citationMarks: message.citationMarks,
      files: message.files,
      title,
      usage,
      ...pause,
    });
  }

  /** The `RunEmit` of one turn: relays to the stream callbacks and remembers text and tool calls. */
  private makeEmit(callbacks: StreamCallbacks | undefined) {
    let text = "";
    const toolDetails: Array<{ id: string; name: string; args: Record<string, unknown>; result?: unknown }> = [];
    const event = (e: Record<string, unknown>) =>
      ({ ...e, timestamp: Date.now() }) as unknown as StreamEvent;
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
    return { emit, event, text: () => text, toolDetails };
  }

  /** The assistant message a finished run leaves in the thread. */
  private assistantFrom(
    conversationId: string,
    id: string,
    result: RunResult,
    streamed: ReturnType<StatelessTransport["makeEmit"]>
  ): Message {
    const now = new Date();
    const paused = Boolean(result.pendingActions?.length);
    const status: MessageStatus | undefined = paused
      ? "requires_action"
      : result.status && result.status !== "completed" && result.status !== "requires_action"
        ? result.status
        : result.stopReason === "cancelled"
          ? "cancelled"
          : undefined;
    const { toolDetails } = streamed;
    return {
      id,
      conversationId,
      role: "assistant",
      content: result.content ?? streamed.text(),
      citations: result.citations,
      citationMarks: result.citationMarks,
      files: result.files,
      toolCalls: toolDetails.length
        ? toolDetails.map((t) => ({ id: t.id, name: t.name, arguments: JSON.stringify(t.args) }))
        : undefined,
      metadata: toolDetails.length
        ? { toolCallDetails: toolDetails.map((t) => ({ ...t })) }
        : undefined,
      ...(paused ? { pendingActions: result.pendingActions } : {}),
      ...(status ? { status } : {}),
      ...(result.stopReason && result.stopReason !== "end_turn" ? { stopReason: result.stopReason } : {}),
      ...(result.stopDetail ? { stopDetail: result.stopDetail } : {}),
      createdAt: now,
      updatedAt: now,
    };
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
    const run = this.makeEmit(callbacks);

    callbacks?.onStart?.(
      run.event({ type: "stream.start", conversationId, messageId: assistantId })
    );

    const result = await this.run({
      conversation,
      history,
      text: options.message,
      files: options.files,
      metadata: options.metadata,
      stream,
      signal,
      emit: run.emit,
    });

    const assistantMessage = this.assistantFrom(conversationId, assistantId, result, run);

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

  /** Answers one action of a paused turn (see `resolve`). */
  private async runResolve(
    conversationId: string,
    actionId: string,
    resolution: ActionResolution,
    options: ResolveActionOptions = {}
  ): Promise<SendMessageResponse | undefined> {
    const thread = await this.requireThread(conversationId);
    const { conversation } = thread;
    const pausedIndex = [...thread.messages]
      .map((m, i) => ({ m, i }))
      .reverse()
      .find(({ m }) => m.pendingActions?.some((a) => a.id === actionId))?.i;
    const paused = pausedIndex === undefined ? undefined : thread.messages[pausedIndex];
    const action = paused?.pendingActions?.find((a) => a.id === actionId);
    if (!paused || !action || !isActionPending(paused, actionId)) {
      throw coded("That request was already answered.", "action_not_pending", 409);
    }
    if (!this.resolve) throw coded("This backend does not take answers.", "not_supported", 404);

    const callbacks = options.stream ? options.callbacks : undefined;
    const siblings = (paused.pendingActions ?? []).filter((a) => a.id !== actionId && isActionPending(paused, a.id));
    const assistantId = makeId();
    const run = this.makeEmit(callbacks);

    // The page treats `stream.start` / `stream.action_resolved` as "the backend took the answer".
    // They go out with the backend's first output, or when it returns, never before: an answer it
    // refuses must reach the caller as a plain failure, with the card still open.
    let announced = false;
    const announce = () => {
      if (announced) return;
      announced = true;
      callbacks?.onStart?.(run.event({ type: "stream.start", conversationId, messageId: paused.id }));
      callbacks?.onActionResolved?.({
        type: "stream.action_resolved",
        timestamp: Date.now(),
        conversationId,
        actionId,
        resolution: {
          type: resolution.type,
          ...(resolution.type === "tool_approval" ? { decision: resolution.decision } : {}),
          ...(resolution.type === "user_question" && resolution.cancelled ? { cancelled: true } : {}),
        },
      });
    };
    const emit: RunEmit = {
      text: (delta) => {
        if (delta) announce();
        run.emit.text(delta);
      },
      setText: (full) => {
        announce();
        run.emit.setText(full);
      },
      toolCall: (id, name, args) => {
        announce();
        run.emit.toolCall(id, name, args);
      },
      toolResult: (id, name, result) => {
        announce();
        run.emit.toolResult(id, name, result);
      },
      progress: (message) => {
        announce();
        run.emit.progress(message);
      },
    };

    const result = await this.resolve({
      conversation,
      history: thread.messages.slice(0, (pausedIndex ?? 0) + 1),
      action,
      siblings,
      resolution,
      stream: Boolean(options.stream),
      signal: options.signal,
      emit,
    });
    announce();

    // The answer was taken: the paused message remembers how the card ended
    const settledState = stateForResolution(resolution);
    paused.actionStates = { ...paused.actionStates, [actionId]: settledState };

    // The backend only reported that others still wait: nothing new to show, the same cards stay
    const stillOpen = (result.pendingActions ?? []).map((a) => a.id);
    const onlyRemaining =
      stillOpen.length > 0 &&
      stillOpen.every((id) => siblings.some((s) => s.id === id)) &&
      !result.content &&
      !(result.files?.length) &&
      run.toolDetails.length === 0 &&
      !run.text();

    let assistantMessage: Message;
    if (onlyRemaining) {
      assistantMessage = { ...paused, pendingActions: result.pendingActions, status: "requires_action" };
    } else {
      assistantMessage = this.assistantFrom(conversationId, assistantId, result, run);
      thread.messages = [...thread.messages, assistantMessage];
    }
    conversation.state = { ...conversation.state, ...result.state };
    conversation.updatedAt = new Date();
    await this.store.save(thread);

    if (options.stream) {
      this.finishStream(conversationId, onlyRemaining ? { ...assistantMessage, content: "" } : assistantMessage, callbacks, result.usage);
      return undefined;
    }
    return {
      response: onlyRemaining ? { ...assistantMessage, content: "" } : assistantMessage,
      usage: result.usage,
      ...this.pauseOf(assistantMessage),
    } as SendMessageResponse;
  }
}
