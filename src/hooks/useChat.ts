"use client";

import { useState, useCallback, useRef, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import {
  actionDeadline,
  applyFileList,
  applyFollowEvent,
  countMessageFiles,
  generateId,
  isBudgetExhausted,
  isConflictCode,
  isFileTypeAllowed,
  isImageType,
  keepSettledDetail,
  localizeError,
  newFollowState,
  normalizeActions,
  normalizeBudget,
  normalizeStopReason,
  collectPendingActions,
  singleFreeTextQuestion,
  restorePendingActions,
  runtimeAfterTurn,
  setActionStates,
  stateForResolution,
  stateForSpentAction,
  uploadMimeType,
  formatFileSize,
  type FollowState,
  type PendingActionEntry,
} from "../utils";
import type {
  Message,
  FileAttachment,
  ChatConfig,
  ChatCallbacks,
  ComposerState,
  Conversation,
  ConversationBudget,
  PendingAction,
  ActionResolution,
  ActionState,
  StreamEvent,
  UserQuestion,
} from "../types";
import {
  AgentServerClient,
  type ChatTransport,
  type ListFilesResult,
  type SendMessageResponse,
  type StreamCallbacks,
} from "../api";
import { useI18n } from "./useI18n";

export interface UseChatOptions extends ChatConfig, ChatCallbacks {
  /** Initial conversation ID */
  conversationId?: string;
  /** Initial messages */
  initialMessages?: Message[];
  /**
   * What the composer does while an approval or question is waiting.
   * `block` (default) expects the user to answer the card; `cancel` lets a new
   * message through, which cancels the pending request on the server.
   */
  pendingActionComposerMode?: "block" | "cancel";
  /**
   * How long after a card's deadline the conversation is fetched again, so a server that
   * carries on by itself (deny and continue) shows its continuation. Default 1500 ms.
   */
  actionExpiryRefreshMs?: number;
  /**
   * How long to wait before looking once more for the answer of a followed turn that was not in
   * the first fetch after the turn ended. Default 1500 ms.
   */
  followSettleRetryMs?: number;
  /** A lone free-text question is answered from the composer (default true). Off: the card answers it. */
  enableQuestions?: boolean;
  /** The chat is a transcript: `composerState` is `readonly` and nothing can be sent */
  readOnly?: boolean;
}

export interface UseChatReturn {
  /** Current messages */
  messages: Message[];
  /** Current conversation */
  conversation: Conversation | null;
  /** Whether a message is being sent/streamed (backwards compat: isStreaming || isLoadingConversation) */
  isLoading: boolean;
  /** Whether the AI is currently generating a response (also true while following a turn another window started) */
  isStreaming: boolean;
  /** Whether a conversation is being loaded */
  isLoadingConversation: boolean;
  /**
   * True while this page only watches a turn that runs elsewhere: it was still running when the
   * conversation was opened (or the page was reloaded), or another window started it. The text,
   * tool calls and cards arrive from the conversation's event log.
   */
  isFollowing: boolean;
  /** Current streaming text */
  streamingText: string;
  /** Current progress message (from stream.progress events) */
  progressMessage: string;
  /** Current error */
  error: Error | null;
  /** Pending files for next message */
  pendingFiles: FileAttachment[];
  /** True while pending files are going up (to be sent, or stored as soon as they were picked) */
  isUploading: boolean;
  /** Active tool calls */
  activeToolCalls: Map<string, { name: string; args: Record<string, unknown>; result?: unknown; reasoning?: string; displayName?: string }>;
  /**
   * Send a message. Resolves `false` when it was refused before the server took it
   * (an upload or the send itself failed): nothing was added to the transcript, the
   * attached files are back in `pendingFiles` and `error` says why, so a composer can
   * keep the typed text. `true` otherwise. Empty text is fine while files are attached
   * (see `attachmentsOnlyMessage`).
   */
  sendMessage: (content: string) => Promise<boolean>;
  /** Add files to pending */
  addFiles: (files: File[]) => Promise<void>;
  /** Remove a pending file (a file already stored for the message is deleted from the server) */
  removeFile: (fileId: string) => void;
  /** Upload a pending file again after it failed */
  retryFile: (fileId: string) => Promise<void>;
  /** Clear all messages */
  clearMessages: () => void;
  /** Load a conversation */
  loadConversation: (conversationId: string) => Promise<void>;
  /** Create a new conversation */
  createConversation: (title?: string) => Promise<Conversation>;
  /** Retry the last message */
  retry: () => Promise<void>;
  /**
   * Stop the turn. Where the transport can (`ChatTransport.cancel`, agent-server) the run is
   * stopped on the server, so tools stop running and spending stops; the partial answer is kept
   * as a cancelled message. Without it only this page's connection is closed.
   */
  stop: () => void;
  /** Approvals / questions waiting for an answer, oldest first */
  pendingActions: PendingActionEntry[];
  /** True while at least one approval or question is waiting */
  awaitingAction: boolean;
  /** True while an answer is being sent and the turn continues */
  isResolvingAction: boolean;
  /** Whether the transport can answer approvals / questions at all */
  canResolveActions: boolean;
  /** The single free-text question the composer can answer, if that is the only thing pending */
  answerableQuestion: { actionId: string; question: UserQuestion } | null;
  /**
   * Answer a pending approval or question. The continuation streams into a new
   * assistant message and the card switches to its resolved state. Resolves `false`
   * when the server did not take the answer (the card is back to pending, or shows
   * that the request expired / was cancelled / was answered elsewhere).
   */
  resolveAction: (actionId: string, resolution: ActionResolution) => Promise<boolean>;
  /** What the composer is doing; one value for every reason it may not take a plain message */
  composerState: ComposerState;
  /** The conversation's spend limit, when it has one */
  budget: ConversationBudget | null;
  /** What the conversation has cost so far (USD), when the server says */
  spentUsd: number | undefined;
  /** The spend limit is used up: the composer is closed until it is raised */
  budgetExhausted: boolean;
  /** The transport can carry on a turn the budget stopped */
  canContinue: boolean;
  /** The transport can change the spend limit */
  canUpdateBudget: boolean;
  /**
   * Carry on the turn the budget stopped (the budget must have room first). The continuation streams
   * into a new assistant message. Resolves `false` when the server refused.
   */
  continueConversation: () => Promise<boolean>;
  /**
   * Set (or with `null` remove) the conversation's spend limit. With `continue: true` a conversation
   * that was paused on its budget carries on afterwards. Resolves `false` when the server refused the
   * change (`budget_forbidden`, `invalid_budget`); `error` says why. Resolves `true` once the limit is
   * changed, whatever the continuation then does (how it went is in `error`, if it failed).
   */
  updateBudget: (budget: ConversationBudget | null, options?: { continue?: boolean }) => Promise<boolean>;
  /** Files the conversation holds: the server's count, or those of the loaded messages */
  heldFiles: number;
  /** The server's own limit of files per conversation, when it says */
  heldFilesMax: number | undefined;
  /** A URL to show or download a stored file from (undefined when the transport cannot make one) */
  resolveFileUrl: ((file: FileAttachment, options?: { disposition?: "inline" | "attachment" }) => Promise<string | undefined>) | undefined;
  /** Set error */
  setError: (error: Error | null) => void;
  /** Directly override message state */
  setMessages: Dispatch<SetStateAction<Message[]>>;
  /** Directly override conversation state */
  setConversation: Dispatch<SetStateAction<Conversation | null>>;
  /** Directly override streaming state */
  setIsStreaming: Dispatch<SetStateAction<boolean>>;
  /** Directly override streaming text */
  setStreamingText: Dispatch<SetStateAction<string>>;
  /** Directly override progress message */
  setProgressMessage: Dispatch<SetStateAction<string>>;
  /** Directly override pending files */
  setPendingFiles: Dispatch<SetStateAction<FileAttachment[]>>;
  /** Directly override active tool calls */
  setActiveToolCalls: Dispatch<SetStateAction<Map<string, { name: string; args: Record<string, unknown>; result?: unknown; reasoning?: string; displayName?: string }>>>;
}

type ToolCallMap = Map<string, { name: string; args: Record<string, unknown>; result?: unknown; reasoning?: string; displayName?: string }>;

/** Attaches the pause info a non-streaming response carries next to the message. */
function withActions(
  message: Message,
  response: { status?: Message["status"]; pendingActions?: PendingAction[] }
): Message {
  const actions = normalizeActions(response.pendingActions ?? message.pendingActions);
  if (actions.length === 0) return message;
  return { ...message, pendingActions: actions, status: response.status ?? message.status ?? "requires_action" };
}

/** `setTimeout` cannot wait longer than this; a longer deadline is re-armed when it fires. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** Local preview of an image still on this device; revoked by the hook. */
function createPreviewUrl(file: File): string | undefined {
  if (!isImageType(file.type)) return undefined;
  try {
    return typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(file)
      : undefined;
  } catch {
    return undefined;
  }
}

function revokePreviewUrl(url: string) {
  try {
    if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
  } catch {
    // nothing to release
  }
}

/** The file as base64 (the JSON upload form and inline files). */
function readBase64(rawFile: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is "data:<mime>;base64,<data>" - extract just the base64 part
      const result = reader.result as string;
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(rawFile);
  });
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === "AbortError";
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Hook for managing chat state and interactions
 */
export function useChat(options: UseChatOptions): UseChatReturn {
  const { t, has } = useI18n();
  // A server error with a known code shows as a localized, friendly message
  const friendly = (err: Error) => localizeError(err, t, has);
  const {
    baseUrl,
    agentId,
    authorization,
    headers,
    getHeaders,
    fetch: customFetch,
    transport,
    streaming = true,
    enableFileUpload = true,
    allowedFileTypes,
    maxFileSize = 10 * 1024 * 1024, // 10MB
    maxFiles = 10,
    maxFilesScope = "message",
    fileTransport = "inline",
    conversationId: initialConversationId,
    initialMessages = [],
    pendingActionComposerMode = "block",
    attachmentsOnlyMessage,
    actionExpiryRefreshMs = 1500,
    followSettleRetryMs = 1500,
    enableQuestions = true,
    readOnly = false,
    onMessageSent,
    onMessageReceived,
    onStreamText,
    onToolCall,
    onToolResult,
    onError,
    onConversationCreated,
    onConversationTitleGenerated,
    onBackgroundStreamCompleted,
    onBudgetReached,
    onActionResolved,
  } = options;

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [pendingFiles, setPendingFiles] = useState<FileAttachment[]>([]);
  const [isUploadingMessage, setIsUploadingMessage] = useState(false);
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallMap>(new Map());
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [isResolvingAction, setIsResolvingAction] = useState(false);
  // What the server says the conversation holds (null: it cannot say, the messages are counted)
  const [fileList, setFileList] = useState<{ total: number; max?: number } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>("");
  const clientRef = useRef<ChatTransport | null>(null);
  const activeToolCallsRef = useRef<ToolCallMap>(new Map());
  const streamingTextRef = useRef("");
  const toolCallStartTimeRef = useRef<number | null>(null);
  // Map file attachment IDs to raw File objects so we can read base64 later
  const rawFilesRef = useRef<Map<string, File>>(new Map());
  // Pending file id -> id of its stored copy (files uploaded as soon as they were picked)
  const storedFilesRef = useRef<Map<string, string>>(new Map());
  // Uploads in flight, by pending file id (removing the chip aborts its upload)
  const uploadsRef = useRef<Map<string, AbortController>>(new Map());
  // The files of the message being sent go up under this one; Stop aborts it
  const sendUploadRef = useRef<AbortController | null>(null);
  // Object URLs made for image previews; released when the conversation is left or the hook unmounts
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const releasePreviews = useCallback(() => {
    for (const url of previewUrlsRef.current) revokePreviewUrl(url);
    previewUrlsRef.current.clear();
  }, []);

  // Session counter — incremented on every navigation (new chat, load conversation).
  // Async stream callbacks capture the value at call-time; if it differs from the
  // current ref value the callback is stale and must not touch component state.
  const sessionRef = useRef(0);

  // Latest messages for async callbacks (stream handlers outlive the render that made them)
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;
  const conversationRef = useRef<Conversation | null>(conversation);
  conversationRef.current = conversation;
  const pendingFilesRef = useRef<FileAttachment[]>(pendingFiles);
  pendingFilesRef.current = pendingFiles;
  const isStreamingRef = useRef(false);
  isStreamingRef.current = isStreaming;
  // The session (navigation counter) of the turn this page started - a message, an answer, a
  // continuation - while it is in flight. A turn left behind by switching conversations is not "active" there.
  const turnSessionRef = useRef<number | null>(null);
  // The follower of a turn that runs elsewhere
  const followRef = useRef<{ controller: AbortController } | null>(null);
  // A conversation being created for the first file, so two files do not make two
  const creatingRef = useRef<Promise<Conversation> | null>(null);
  // Actions announced by `stream.action_required` during the current turn
  const streamActionsRef = useRef<PendingAction[]>([]);

  // Keep a stable client reference that updates synchronously when config changes
  useMemo(() => {
    clientRef.current = transport ?? new AgentServerClient({
      baseUrl,
      agentId: agentId || "",
      authorization,
      headers,
      getHeaders,
      fetch: customFetch,
    });
  }, [transport, baseUrl, agentId, authorization, headers, getHeaders, customFetch]);

  /** Stop watching a turn that runs elsewhere (the run itself goes on). */
  const stopFollowing = useCallback(() => {
    if (followRef.current) {
      followRef.current.controller.abort();
      followRef.current = null;
    }
    setIsFollowing(false);
  }, []);

  /**
   * Reset transient streaming UI state without aborting the HTTP request.
   * The in-flight stream continues in the background so the server can
   * finish processing and persist the assistant message. The `isStale()`
   * guards inside `sendMessage` callbacks prevent the old stream from
   * polluting the new session's state.
   */
  const resetStreamingState = useCallback(() => {
    stopFollowing();
    streamingTextRef.current = "";
    setStreamingText("");
    activeToolCallsRef.current = new Map();
    toolCallStartTimeRef.current = null;
    setActiveToolCalls(new Map());
    setProgressMessage("");
    setIsStreaming(false);
  }, [stopFollowing]);

  useEffect(
    () => () => {
      releasePreviews();
      if (followRef.current) {
        followRef.current.controller.abort();
        followRef.current = null;
      }
      for (const controller of uploadsRef.current.values()) controller.abort();
      uploadsRef.current.clear();
      // The blob URLs of a client this hook made itself
      if (!transport) (clientRef.current as AgentServerClient | null)?.dispose?.();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [releasePreviews]
  );

  // ---------------------------------------------------------------------------
  // Loading, refreshing and following a conversation
  // ---------------------------------------------------------------------------

  const listFilesFor = useCallback(async (conversationId: string): Promise<ListFilesResult | undefined> => {
    const client = clientRef.current;
    if (!client?.listFiles) return undefined;
    try {
      return await client.listFiles(conversationId);
    } catch {
      // the count falls back to the loaded messages
      return undefined;
    }
  }, []);

  /** Messages as loaded, with how the listed files stand (deadlines, gone files). */
  const withFileList = useCallback((loaded: Message[], listing: ListFilesResult | undefined): Message[] => {
    return listing ? applyFileList(loaded, listing.files, !listing.hasMore) : loaded;
  }, []);

  // Set by the follower below; the loaders start it, and it loads again when the turn ends
  const followRunRef = useRef<(conversationId: string, after: number, session: number) => Promise<void>>(async () => {});

  /** Start following when the server says a turn is running here that we are not part of. */
  const followIfRunning = useCallback((loaded: Conversation | undefined, session: number) => {
    const client = clientRef.current;
    if (!loaded || !client?.followEvents) return;
    if (loaded.runtime?.status !== "running") return;
    if (turnSessionRef.current === session || followRef.current) return;
    void followRunRef.current(loaded.id, loaded.runtime.lastEventSeq ?? 0, session);
  }, []);

  /** Throw away eagerly stored files that belong to the conversation being left. */
  const discardStoredFiles = useCallback(() => {
    const client = clientRef.current;
    for (const controller of uploadsRef.current.values()) controller.abort();
    uploadsRef.current.clear();
    for (const stored of storedFilesRef.current.values()) void client?.deleteFile?.(stored).catch(() => undefined);
    storedFilesRef.current.clear();
  }, []);

  const loadConversation = useCallback(async (conversationId: string) => {
    if (!clientRef.current) return;

    // Detach from any in-flight stream (don't abort — let it complete in
    // the background so the server persists the response). Session counter
    // invalidates all stale callbacks.
    resetStreamingState();
    releasePreviews();
    if (fileTransport === "upload-on-select") {
      // files stored for this conversation's next message do not follow us to another one
      discardStoredFiles();
      rawFilesRef.current.clear();
      setPendingFiles([]);
    }
    sessionRef.current += 1;
    const capturedSession = sessionRef.current;

    try {
      setIsLoadingConversation(true);
      setMessages([]);
      setConversation(null);
      setFileList(null);
      setError(null);
      const [data, listing] = await Promise.all([
        clientRef.current.getConversation(conversationId),
        listFilesFor(conversationId),
      ]);
      // If user navigated away while we were loading, discard the result
      if (sessionRef.current !== capturedSession) return;
      setConversation(data.conversation);
      setMessages(
        withFileList(
          restorePendingActions(data.messages, data.pendingActions ?? data.conversation?.pendingActions),
          listing
        )
      );
      setFileList(listing ? { total: listing.total, max: listing.maxFiles } : null);
      // A turn that was still running when the page opened: pick it up
      followIfRunning(data.conversation, capturedSession);
    } catch (err) {
      if (sessionRef.current !== capturedSession) return;
      if (isAbort(err)) return;
      const error = friendly(err instanceof Error ? err : new Error(t("chat.error.loadConversationFailed")));
      setError(error);
      onError?.(error);
    } finally {
      if (sessionRef.current === capturedSession) {
        setIsLoadingConversation(false);
      }
    }
  }, [t, has, fileTransport, onError, resetStreamingState, releasePreviews, discardStoredFiles, listFilesFor, withFileList, followIfRunning]);

  // Load initial conversation if provided
  useEffect(() => {
    if (initialConversationId && clientRef.current) {
      loadConversation(initialConversationId);
    }
  }, [initialConversationId]);

  /**
   * Fetches the conversation again and shows what the server says: used when a send was
   * refused because a card is waiting or a turn is running (the page did not know), after a
   * card's deadline, and when a followed turn ended. A turn that is running somewhere else is
   * followed (unless `follow` is false). Quiet on failure: the error that led here is already
   * shown. Resolves with the messages it loaded, or undefined when it could not.
   */
  const refreshConversation = useCallback(async (
    conversationId: string,
    session: number,
    options: { follow?: boolean } = {}
  ): Promise<Message[] | undefined> => {
    const client = clientRef.current;
    if (!client) return undefined;
    try {
      const [data, listing] = await Promise.all([client.getConversation(conversationId), listFilesFor(conversationId)]);
      if (sessionRef.current !== session) return undefined;
      const restored = withFileList(
        restorePendingActions(data.messages, data.pendingActions ?? data.conversation?.pendingActions),
        listing
      );
      setConversation(data.conversation);
      setMessages((prev) => keepSettledDetail(restored, prev));
      if (listing) setFileList({ total: listing.total, max: listing.maxFiles });
      if (options.follow !== false) followIfRunning(data.conversation, session);
      return restored;
    } catch {
      // the banner already says what went wrong
      return undefined;
    }
  }, [listFilesFor, withFileList, followIfRunning]);

  /** Looks at what the conversation holds after files were attached to a message. */
  const refreshFileList = useCallback(async (conversationId: string, session: number) => {
    const listing = await listFilesFor(conversationId);
    if (listing && sessionRef.current === session) setFileList({ total: listing.total, max: listing.maxFiles });
  }, [listFilesFor]);

  /**
   * The connection broke while the server was answering. Where runs outlive their connection
   * (the transport can follow events) the turn is still going, or is done: look at the conversation
   * instead of reporting a failure. Only a conversation that cannot be reached shows the error.
   */
  const dropped = useCallback((err: unknown): boolean => {
    const e = err as { code?: unknown; status?: unknown } | null;
    return typeof clientRef.current?.followEvents === "function" && !e?.code && !e?.status;
  }, []);

  const recoverDroppedTurn = useCallback((conversationId: string, session: number, original: Error) => {
    void (async () => {
      const loaded = await refreshConversation(conversationId, session);
      if (loaded === undefined && sessionRef.current === session) {
        const shown = friendly(original);
        setError(shown);
        onError?.(shown);
      }
    })();
  }, [refreshConversation, onError, t, has]); // eslint-disable-line react-hooks/exhaustive-deps

  const createConversation = useCallback(async (title?: string, overrideAgentId?: string): Promise<Conversation> => {
    if (!clientRef.current) {
      throw new Error(t("chat.error.clientNotInitialized"));
    }

    const conv = await clientRef.current.createConversation({
      agentId: overrideAgentId || agentId || "",
      title,
    });
    // The ref is what other callers look at before the next render
    conversationRef.current = conv;
    setConversation(conv);
    setMessages([]);
    onConversationCreated?.(conv);
    return conv;
  }, [t, agentId, onConversationCreated]);

  // ---------------------------------------------------------------------------
  // Handlers shared by sendMessage, resolveAction and continueConversation
  // ---------------------------------------------------------------------------

  // All three stream a turn into the transcript. Kept in a ref so they always see the latest callback props.
  const createStreamCallbacksRef = useRef<(isStale: () => boolean) => StreamCallbacks>(
    () => ({})
  );
  createStreamCallbacksRef.current = (isStale: () => boolean): StreamCallbacks => (
    {
            onStart: () => {
              // Stream started
            },
            onText: (text, fullText) => {
              if (isStale()) return;
              // Use flushSync to force immediate render during streaming
              setProgressMessage(""); // Clear progress when text arrives
              streamingTextRef.current = fullText;
              flushSync(() => {
                setStreamingText(fullText);
              });
              onStreamText?.(text, fullText);
            },
            onProgress: (event) => {
              if (isStale()) return;
              if (event.type === "stream.progress") {
                setProgressMessage((event as any).message || "");
              }
            },
            onToolCall: (event) => {
              if (isStale()) return;
              if (event.type === "stream.tool_call") {
                // Track when the first tool call starts
                if (toolCallStartTimeRef.current === null) {
                  toolCallStartTimeRef.current = Date.now();
                }
                flushSync(() => {
                  setActiveToolCalls((prev) => {
                    const next = new Map(prev);
                    next.set(event.toolCallId, {
                      name: event.toolName,
                      args: event.args,
                      reasoning: (event as any).reasoning || undefined,
                      displayName: (event as any).displayName || undefined,
                    });
                    activeToolCallsRef.current = next;
                    return next;
                  });
                });
                onToolCall?.(event.toolName, event.args);
              }
            },
            onToolResult: (event) => {
              if (isStale()) return;
              if (event.type === "stream.tool_result") {
                flushSync(() => {
                  setActiveToolCalls((prev) => {
                    const next = new Map(prev);
                    const existing = next.get(event.toolCallId);
                    if (existing) {
                      next.set(event.toolCallId, { ...existing, result: event.result });
                    }
                    activeToolCallsRef.current = next;
                    return next;
                  });
                });
                onToolResult?.(event.toolName, event.result);
              }
            },
            onError: (err) => {
              if (isStale()) return;
              const shown = friendly(err);
              setError(shown);
              setIsStreaming(false);
              onError?.(shown);
            },
            onDone: (event) => {
              if (event.type === "stream.done") {
                // If user navigated away, the server has already persisted the
                // assistant message. Notify the host so it can refresh the
                // sidebar, but do NOT touch component state.
                if (isStale()) {
                  onBackgroundStreamCompleted?.(event.conversationId);
                  return;
                }
                // Snapshot tool calls before clearing
                const currentToolCalls = activeToolCallsRef.current;
                const toolCallsForMessage = currentToolCalls.size > 0
                  ? Array.from(currentToolCalls.entries()).map(([id, call]) => ({
                      id,
                      name: call.name,
                      arguments: typeof call.args === "string" ? call.args : JSON.stringify(call.args),
                    }))
                  : undefined;

                // Calculate tool call duration
                const toolCallDurationSeconds = toolCallStartTimeRef.current
                  ? Math.round((Date.now() - toolCallStartTimeRef.current) / 1000)
                  : undefined;

                // Approvals / questions this turn paused for. When resolving one of
                // several actions the server repeats the rest; those already have a card.
                const announced = new Map<string, PendingAction>();
                for (const a of [...streamActionsRef.current, ...normalizeActions(event.pendingActions)]) {
                  announced.set(a.id, a);
                }
                streamActionsRef.current = [];
                const shown = new Set(
                  collectPendingActions(messagesRef.current).map((e) => e.action.id)
                );
                const freshActions = Array.from(announced.values()).filter((a) => !shown.has(a.id));
                const paused = event.status === "requires_action" || announced.size > 0;
                const hasBody = Boolean(event.content) || currentToolCalls.size > 0 || Boolean(event.files?.length);
                const stopReason = normalizeStopReason(event.stopReason);
                const shownStop = stopReason && stopReason !== "end_turn" && stopReason !== "requires_action" ? stopReason : undefined;
                const warnings = Array.isArray(event.warnings) && event.warnings.length > 0 ? event.warnings : undefined;

                const assistantMessage: Message = {
                  id: event.messageId,
                  conversationId: event.conversationId,
                  role: "assistant",
                  content: event.content,
                  citations: event.citations,
                  citationMarks: event.citationMarks,
                  files: event.files,
                  toolCalls: toolCallsForMessage,
                  ...(paused && freshActions.length > 0
                    ? { pendingActions: freshActions, status: "requires_action" as const }
                    : event.status && event.status !== "completed" && event.status !== "requires_action"
                      ? { status: event.status }
                      : {}),
                  ...(shownStop ? { stopReason: shownStop } : {}),
                  metadata: currentToolCalls.size > 0 || warnings
                    ? {
                        ...(currentToolCalls.size > 0
                          ? {
                              toolCallDetails: Array.from(currentToolCalls.entries()).map(([id, call]) => ({
                                id,
                                name: call.name,
                                args: call.args,
                                result: call.result,
                              })),
                              toolCallDurationSeconds,
                            }
                          : {}),
                        ...(warnings ? { warnings } : {}),
                      }
                    : undefined,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
                // Clear streaming first, then add message
                streamingTextRef.current = "";
                setStreamingText("");
                activeToolCallsRef.current = new Map();
                toolCallStartTimeRef.current = null;
                setActiveToolCalls(new Map());
                setProgressMessage("");
                setIsStreaming(false);
                // The conversation after this turn: title, spend limit and where it is in its life
                const budget = event.budget === undefined ? undefined : normalizeBudget(event.budget);
                setConversation((prev) => {
                  if (!prev) return prev;
                  const nextBudget = budget === undefined ? prev.budget : budget;
                  return {
                    ...prev,
                    ...(event.title ? { title: event.title } : {}),
                    ...(nextBudget !== undefined ? { budget: nextBudget } : {}),
                    ...(typeof event.spentUsd === "number" ? { spentUsd: event.spentUsd } : {}),
                    runtime: runtimeAfterTurn(prev.runtime, {
                      stopReason: paused ? "requires_action" : stopReason,
                      pendingActionIds: paused ? Array.from(announced.keys()) : [],
                      budget: nextBudget,
                      seq: event.seq,
                    }),
                  };
                });
                if (event.title) {
                  onConversationTitleGenerated?.(event.conversationId, event.title);
                }
                if (stopReason === "budget_reached") {
                  onBudgetReached?.({
                    conversationId: event.conversationId,
                    budget: budget ?? undefined,
                    spentUsd: event.spentUsd,
                  });
                }
                // Nothing new to show: the answer only left other actions waiting
                if (paused && freshActions.length === 0 && !hasBody) return;
                // The server repeats the paused message's id (and stored content) when
                // some of its actions are still waiting: it is already on screen.
                if (messagesRef.current.some((m) => m.id === event.messageId)) {
                  if (freshActions.length > 0) {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === event.messageId
                          ? { ...m, pendingActions: [...(m.pendingActions ?? []), ...freshActions], status: "requires_action" as const }
                          : m
                      )
                    );
                  }
                  return;
                }
                setMessages((prev) => [...prev, assistantMessage]);
                onMessageReceived?.(assistantMessage);
              }
            },
            onActionRequired: (event: StreamEvent) => {
              if (isStale()) return;
              if (event.type !== "stream.action_required") return;
              streamActionsRef.current = [
                ...streamActionsRef.current,
                ...normalizeActions(event.actions),
              ];
            },
            onActionResolved: (event: StreamEvent) => {
              if (isStale()) return;
              if (event.type !== "stream.action_resolved") return;
              // Answered elsewhere (or by this app): settle the card. Detail already
              // known from this app's own answer is kept.
              const r = event.resolution;
              const cancelled = Boolean(r?.cancelled);
              const thin: ActionResolution | undefined =
                r?.type === "tool_approval"
                  ? r.decision ? { type: "tool_approval", decision: r.decision } : undefined
                  : r?.type === "user_question"
                    ? { type: "user_question", answers: {}, cancelled }
                    : undefined;
              setMessages((prev) =>
                prev.map((m) => {
                  const existing = m.actionStates?.[event.actionId];
                  if (!m.pendingActions?.some((a) => a.id === event.actionId)) return m;
                  if (existing && (existing.status === "resolved" || existing.status === "cancelled")) return m;
                  const next: ActionState = {
                    status: cancelled ? "cancelled" : "resolved",
                    resolution: existing?.resolution ?? thin,
                  };
                  return { ...m, actionStates: { ...m.actionStates, [event.actionId]: next } };
                })
              );
            },
          }
  );

  /** Shows the reply of a non-streaming answer / continuation (a new message, or more cards on the paused one). */
  const showReply = useCallback((response: SendMessageResponse | undefined) => {
    if (!response?.response) return;
    const reply = withActions(response.response, response);
    const shown = new Set(collectPendingActions(messagesRef.current).map((e) => e.action.id));
    const fresh = (reply.pendingActions ?? []).filter((a) => !shown.has(a.id));
    const onScreen = messagesRef.current.some((m) => m.id === reply.id);
    if (onScreen) {
      if (fresh.length > 0) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === reply.id
              ? { ...m, pendingActions: [...(m.pendingActions ?? []), ...fresh], status: "requires_action" as const }
              : m
          )
        );
      }
    } else if (fresh.length > 0 || reply.content) {
      const stopReason = normalizeStopReason(response.stopReason ?? reply.stopReason);
      const message: Message = {
        ...reply,
        pendingActions: fresh.length > 0 ? fresh : undefined,
        ...(stopReason && stopReason !== "end_turn" && stopReason !== "requires_action" ? { stopReason } : {}),
      };
      setMessages((prev) => [...prev, message]);
      onMessageReceived?.(message);
    }
  }, [onMessageReceived]);

  // ---------------------------------------------------------------------------
  // Following a turn that runs elsewhere
  // ---------------------------------------------------------------------------

  followRunRef.current = async (conversationId: string, after: number, session: number) => {
    const client = clientRef.current;
    if (!client?.followEvents || followRef.current || sessionRef.current !== session) return;
    const controller = new AbortController();
    followRef.current = { controller };
    const stale = () => sessionRef.current !== session;

    let state: FollowState = newFollowState();
    streamActionsRef.current = [];
    streamingTextRef.current = "";
    setStreamingText("");
    activeToolCallsRef.current = new Map();
    setActiveToolCalls(new Map());
    setProgressMessage("");
    setIsStreaming(true);
    setIsFollowing(true);

    const onEvent = (event: Parameters<typeof applyFollowEvent>[1]) => {
      if (stale()) {
        controller.abort();
        return;
      }
      state = applyFollowEvent(state, event);
      switch (event.type) {
        case "user.message": {
          const user = state.userMessage;
          if (user && !messagesRef.current.some((m) => m.id === user.id)) {
            const at = new Date();
            setMessages((prev) => [
              ...prev,
              { id: user.id, conversationId, role: "user", content: user.content, files: user.files, createdAt: at, updatedAt: at },
            ]);
          }
          break;
        }
        case "session.status_running":
          streamingTextRef.current = "";
          setStreamingText("");
          activeToolCallsRef.current = new Map();
          setActiveToolCalls(new Map());
          break;
        case "agent.message.delta":
        case "agent.message":
          setProgressMessage("");
          streamingTextRef.current = state.text;
          setStreamingText(state.text);
          break;
        case "agent.tool_use":
        case "agent.tool_result":
          activeToolCallsRef.current = new Map(state.tools);
          setActiveToolCalls(new Map(state.tools));
          break;
        case "session.status_idle":
          // The turn is over; the rest is loaded below
          controller.abort();
          break;
        default:
          break;
      }
    };

    let failed = false;
    try {
      await client.followEvents(conversationId, { after, signal: controller.signal, onEvent });
    } catch (err) {
      if (!stale() && !isAbort(err)) {
        failed = true;
        // A refusal with a code (404, 403, ...) says why; a connection that kept dropping does not
        const coded = Boolean((err as { code?: string } | null)?.code);
        const shown = friendly(err instanceof Error && coded ? err : new Error(t("chat.error.followFailed")));
        setError(shown);
        onError?.(shown);
      }
    }
    if (followRef.current?.controller === controller) followRef.current = null;
    if (stale()) return;

    if (state.error) {
      // the run failed: say so, the stored state follows below
      const shown = friendly(Object.assign(new Error(state.error.message), state.error.code ? { code: state.error.code } : {}));
      setError(shown);
      onError?.(shown);
    }

    // The turn ended (or the connection is gone): what the server stored is the truth now. A follower
    // that was stopped on purpose has nothing to settle; looking again would only attach to the same run.
    if (state.idle || failed) {
      const loaded = await refreshConversation(conversationId, session, { follow: Boolean(state.idle) });
      if (stale()) return;
      if (loaded && state.messageId && !loaded.some((m) => m.id === state.messageId)) {
        // the answer was not stored yet when we looked
        await sleep(followSettleRetryMs);
        if (stale()) return;
        await refreshConversation(conversationId, session, { follow: true });
        if (stale()) return;
      }
      if (state.idle?.stopReason === "budget_reached") {
        const c = conversationRef.current;
        onBudgetReached?.({ conversationId, budget: c?.budget ?? undefined, spentUsd: c?.spentUsd });
      }
    }
    streamingTextRef.current = "";
    setStreamingText("");
    activeToolCallsRef.current = new Map();
    setActiveToolCalls(new Map());
    setProgressMessage("");
    // A new turn may have started right after this one: refreshConversation picked it up
    if (!followRef.current) {
      setIsStreaming(false);
      setIsFollowing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Files
  // ---------------------------------------------------------------------------

  const patchPendingFile = useCallback((fileId: string, patch: Partial<FileAttachment>) => {
    setPendingFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, ...patch } : f)));
  }, []);

  /** Store one file on the server: its bytes as the body where the transport takes them, else base64. */
  const uploadOne = useCallback(
    async (
      rawFile: File,
      name: string,
      conversationId: string,
      onProgress: (fraction: number) => void,
      signal: AbortSignal
    ): Promise<FileAttachment> => {
      const uploader = clientRef.current;
      if (!uploader?.uploadFile) throw new Error(t("chat.error.sendFailed"));
      const mimeType = uploadMimeType(rawFile);
      if (uploader.supportsRawUpload) {
        return uploader.uploadFile({
          file: { name, mimeType, blob: rawFile },
          conversationId,
          signal,
          onProgress: ({ loaded, total }) => onProgress(total > 0 ? Math.min(1, loaded / total) : 0),
        });
      }
      const content = await readBase64(rawFile);
      const stored = await uploader.uploadFile({ file: { name, mimeType, content }, conversationId, signal });
      onProgress(1);
      return stored;
    },
    [t]
  );

  /** The conversation the first picked file is stored in: created now when the chat has none. */
  const ensureConversation = useCallback(async (): Promise<Conversation | null> => {
    if (conversationRef.current) return conversationRef.current;
    if (!creatingRef.current) {
      creatingRef.current = createConversation().finally(() => {
        creatingRef.current = null;
      });
    }
    try {
      return await creatingRef.current;
    } catch (err) {
      const shown = friendly(err instanceof Error ? err : new Error(t("chat.error.sendFailed")));
      setError(shown);
      onError?.(shown);
      return null;
    }
  }, [createConversation, t, has, onError]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Eager mode: store the given pending files, one after the other, each chip showing its progress. */
  const uploadPending = useCallback(
    async (fileIds: string[]) => {
      const session = sessionRef.current;
      const conv = await ensureConversation();
      if (!conv || sessionRef.current !== session) {
        if (!conv) for (const id of fileIds) patchPendingFile(id, { status: "failed", uploadError: t("chat.file.uploadFailed") });
        return;
      }
      for (const id of fileIds) {
        if (sessionRef.current !== session) return;
        const raw = rawFilesRef.current.get(id);
        const chip = pendingFilesRef.current.find((f) => f.id === id);
        if (!raw || !chip) continue;
        const controller = new AbortController();
        uploadsRef.current.set(id, controller);
        patchPendingFile(id, { status: "uploading", progress: 0, uploadError: undefined });
        try {
          const stored = await uploadOne(raw, chip.name, conv.id, (fraction) => patchPendingFile(id, { progress: fraction }), controller.signal);
          uploadsRef.current.delete(id);
          if (!rawFilesRef.current.has(id)) {
            // removed while it was going up
            void clientRef.current?.deleteFile?.(stored.id).catch(() => undefined);
            continue;
          }
          storedFilesRef.current.set(id, stored.id);
          patchPendingFile(id, {
            status: "ready",
            progress: 1,
            ...(stored.expiresAt ? { expiresAt: stored.expiresAt } : {}),
            ...(stored.conversionStatus ? { conversionStatus: stored.conversionStatus } : {}),
          });
        } catch (err) {
          uploadsRef.current.delete(id);
          if (isAbort(err)) continue;
          if (sessionRef.current !== session) return;
          const shown = friendly(err instanceof Error ? err : new Error(t("chat.file.uploadFailed")));
          patchPendingFile(id, { status: "failed", uploadError: shown.message });
          setError(shown);
          onError?.(shown);
        }
      }
    },
    [ensureConversation, uploadOne, patchPendingFile, t, has, onError] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const eagerUploads = fileTransport === "upload-on-select";

  // What the conversation holds: the server's count, or the files of the loaded messages (never fewer than those)
  const heldFiles = useMemo(
    () => Math.max(fileList?.total ?? 0, countMessageFiles(messages)),
    [fileList, messages]
  );

  const addFiles = useCallback(async (files: File[]) => {
    if (!enableFileUpload) return;

    const validFiles: FileAttachment[] = [];
    // Every refusal goes to `onError`; together they are also shown through `error`
    const refusals: Error[] = [];
    const refuse = (message: string) => {
      const error = new Error(message);
      refusals.push(error);
      onError?.(error);
    };

    // What the conversation already holds counts when the limit is per conversation
    const held = maxFilesScope === "conversation" ? heldFiles : 0;

    for (const file of files) {
      // Check file count
      if (held + pendingFiles.length + validFiles.length >= maxFiles) {
        refuse(
          maxFilesScope === "conversation"
            ? t("chat.file.tooManyInChat", { maxFiles, held })
            : t("chat.file.tooMany", { maxFiles })
        );
        break;
      }

      // The server would answer an empty file with a validation error
      if (file.size === 0) {
        refuse(t("chat.file.empty", { fileName: file.name }));
        continue;
      }

      // Check file size
      if (file.size > maxFileSize) {
        refuse(t("chat.file.tooLarge", { fileName: file.name, maxSize: formatFileSize(maxFileSize) }));
        continue;
      }

      // Check file type (a file the browser could not type is left to the server)
      if (!isFileTypeAllowed(file, allowedFileTypes)) {
        refuse(t("chat.file.invalidType", { fileType: file.type || file.name }));
        continue;
      }

      const fileId = generateId();

      // Store raw File object so sendMessage can read base64 later
      rawFilesRef.current.set(fileId, file);

      // An image shows as a thumbnail straight away, before anything is uploaded
      const previewUrl = createPreviewUrl(file);
      if (previewUrl) previewUrlsRef.current.add(previewUrl);

      validFiles.push({
        id: fileId,
        name: file.name,
        mimeType: uploadMimeType(file),
        size: file.size,
        ...(previewUrl ? { previewUrl } : {}),
        ...(eagerUploads && clientRef.current?.uploadFile ? { status: "queued" as const, progress: 0 } : {}),
      });
    }

    if (refusals.length > 0) {
      setError(refusals.length === 1 ? refusals[0] : new Error(refusals.map((e) => e.message).join("; ")));
    }
    setPendingFiles((prev) => [...prev, ...validFiles]);

    // Eager mode stores the files as soon as they are in
    if (eagerUploads && clientRef.current?.uploadFile && validFiles.length > 0) {
      pendingFilesRef.current = [...pendingFilesRef.current, ...validFiles];
      await uploadPending(validFiles.map((f) => f.id));
    }
  }, [t, enableFileUpload, eagerUploads, pendingFiles, heldFiles, maxFiles, maxFilesScope, maxFileSize, allowedFileTypes, onError, uploadPending]);

  const removeFile = useCallback((fileId: string) => {
    rawFilesRef.current.delete(fileId);
    uploadsRef.current.get(fileId)?.abort();
    uploadsRef.current.delete(fileId);
    const stored = storedFilesRef.current.get(fileId);
    if (stored) {
      storedFilesRef.current.delete(fileId);
      void clientRef.current?.deleteFile?.(stored).catch(() => undefined);
    }
    const removed = pendingFilesRef.current.find((f) => f.id === fileId);
    if (removed?.previewUrl) {
      revokePreviewUrl(removed.previewUrl);
      previewUrlsRef.current.delete(removed.previewUrl);
    }
    setPendingFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const retryFile = useCallback(async (fileId: string) => {
    if (!rawFilesRef.current.has(fileId)) return;
    setError(null);
    patchPendingFile(fileId, { status: "queued", progress: 0, uploadError: undefined });
    await uploadPending([fileId]);
  }, [patchPendingFile, uploadPending]);

  // ---------------------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(async (typed: string): Promise<boolean> => {
    // Files alone are a message: they go with the configured text (a server rejects an empty one)
    const attachmentsOnly = !typed.trim() && pendingFiles.length > 0;
    if (!clientRef.current || (!typed.trim() && !attachmentsOnly)) return false;
    const content = attachmentsOnly ? (attachmentsOnlyMessage ?? t("chat.input.attachmentsOnlyMessage")) : typed;

    // Files stored as soon as they were picked: all must be in before the message can name them
    const eager = eagerUploads && Boolean(clientRef.current.uploadFile);
    if (eager && pendingFiles.some((f) => f.status !== "ready")) return false;

    // Capture the current session so async callbacks can detect staleness
    const capturedSession = sessionRef.current;
    const isStale = () => sessionRef.current !== capturedSession;

    setError(null);
    setIsStreaming(true);
    turnSessionRef.current = capturedSession;
    lastUserMessageRef.current = content;
    streamActionsRef.current = [];

    // Sending while something is waiting cancels it (server policy `cancel`).
    // Applied only once the server has accepted the send, so a 409 leaves the cards usable.
    let cancelApplied = false;
    const applyCancel = () => {
      if (cancelApplied || pendingActionComposerMode !== "cancel") return;
      cancelApplied = true;
      const waiting = waitingBeforeSend;
      if (waiting.length === 0) return;
      const cancelled: Record<string, ActionState> = {};
      for (const e of waiting) cancelled[e.action.id] = { status: "cancelled" };
      setMessages((prev) => setActionStates(prev, cancelled));
    };
    const waitingBeforeSend = pendingActionComposerMode === "cancel"
      ? collectPendingActions(messagesRef.current)
      : [];

    // Files stored ahead of the message (`fileTransport: "upload"`); dropped again if the server never took the message
    const uploadedIds: string[] = [];
    let messageAccepted = false;
    // The files are in: from here a stopped turn is the server's to wind down
    let uploadsDone = false;
    // A refused send takes its bubble back and returns the files to the composer
    const attached = pendingFiles;
    const attachedRaw = attached.map((f) => [f.id, rawFilesRef.current.get(f.id)] as const);
    let optimisticId: string | undefined;
    let activeConversationId = conversation?.id;

    try {
      // Create conversation if needed
      let currentConversation = conversation ?? conversationRef.current;
      if (!currentConversation) {
        currentConversation = await createConversation();
        activeConversationId = currentConversation.id;
        // User navigated while we were creating the conversation
        if (isStale()) {
          setConversation(null);
          return true;
        }
      }

      // Files that travel with the message: stored first (their bytes as the body), or inline as base64
      const uploader = !eager && fileTransport === "upload" ? clientRef.current : null;
      const storeFirst = Boolean(uploader?.uploadFile) && attached.length > 0;

      // The bubble is on screen at once; for files going up its chips show how far each one is
      const userMessage: Message = {
        id: generateId(),
        conversationId: currentConversation.id,
        role: "user",
        content,
        files: attached.length > 0
          ? attached.map((f) => (storeFirst ? { ...f, status: "uploading" as const, progress: 0 } : f))
          : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      optimisticId = userMessage.id;
      setMessages((prev) => [...prev, userMessage]);
      setPendingFiles([]);

      const patchBubbleFile = (fileId: string, patch: Partial<FileAttachment>) =>
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMessage.id
              ? { ...m, files: m.files?.map((f) => (f.id === fileId ? { ...f, ...patch } : f)) }
              : m
          )
        );

      const filesToSend: Array<{ name: string; content: string; mimeType: string }> = [];
      const storedIdOf = new Map<string, string>();
      const uploadController = new AbortController();
      sendUploadRef.current = uploadController;
      if (attached.length > 0) setIsUploadingMessage(true);
      try {
        if (eager) {
          // Already stored; the message only names them
          for (const f of attached) {
            const stored = storedFilesRef.current.get(f.id);
            if (stored) {
              uploadedIds.push(stored);
              storedIdOf.set(f.id, stored);
            }
          }
        } else if (storeFirst) {
          try {
            for (const f of attached) {
              const rawFile = rawFilesRef.current.get(f.id);
              if (!rawFile) continue;
              const stored = await uploadOne(
                rawFile,
                f.name,
                currentConversation.id,
                (fraction) => patchBubbleFile(f.id, { progress: fraction }),
                uploadController.signal
              );
              uploadedIds.push(stored.id);
              storedIdOf.set(f.id, stored.id);
              patchBubbleFile(f.id, { status: "ready", progress: 1 });
            }
          } catch (uploadError) {
            // Nothing was sent: drop what already reached the server and keep the files for another try
            await Promise.all(uploadedIds.map((id) => uploader?.deleteFile?.(id).catch(() => undefined)));
            throw uploadError;
          }
        } else {
          for (const f of attached) {
            const rawFile = rawFilesRef.current.get(f.id);
            if (rawFile) {
              filesToSend.push({
                name: f.name,
                content: await readBase64(rawFile),
                mimeType: f.mimeType,
              });
            }
          }
        }
      } finally {
        setIsUploadingMessage(false);
        if (sendUploadRef.current === uploadController) sendUploadRef.current = null;
      }
      uploadsDone = true;

      // Clean up raw file references
      for (const f of attached) {
        rawFilesRef.current.delete(f.id);
      }

      // If user navigated away while we were reading files, bail out
      if (isStale()) return true;

      // The bubble's chips are plain once the files are in (and carry the stored ids, which the server's history uses)
      const sentMessage: Message = {
        ...userMessage,
        files: userMessage.files?.map((f) => {
          const { status: _status, progress: _progress, uploadError: _uploadError, ...rest } = f;
          return { ...rest, id: storedIdOf.get(f.id) ?? f.id };
        }),
      };
      setMessages((prev) => prev.map((m) => (m.id === userMessage.id ? sentMessage : m)));
      onMessageSent?.(sentMessage);

      if (streaming) {
        // Streaming mode
        setStreamingText("");
        streamingTextRef.current = "";
        setActiveToolCalls(new Map());
        setProgressMessage("");
        toolCallStartTimeRef.current = null;

        // Create an AbortController so the stop() function can cancel the stream
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        await clientRef.current.sendMessageStream(
          currentConversation.id,
          {
            message: content,
            files: filesToSend.length > 0 ? filesToSend : undefined,
            fileIds: uploadedIds.length > 0 ? uploadedIds : undefined,
          },
          (() => {
            const base = createStreamCallbacksRef.current(isStale);
            return {
              ...base,
              onStart: (e) => { messageAccepted = true; applyCancel(); base.onStart?.(e); },
              onText: (text, full) => { messageAccepted = true; applyCancel(); base.onText?.(text, full); },
              onDone: (e) => { messageAccepted = true; applyCancel(); base.onDone?.(e); },
            };
          })(),
          abortController.signal
        );
      } else {
        // Non-streaming mode
        const response = await clientRef.current.sendMessage(currentConversation.id, {
          message: content,
          files: filesToSend.length > 0 ? filesToSend : undefined,
          fileIds: uploadedIds.length > 0 ? uploadedIds : undefined,
          stream: false,
        });

        messageAccepted = true;
        if (isStale()) {
          // Server already persisted the response — notify sidebar refresh
          onBackgroundStreamCompleted?.(currentConversation!.id);
          return true;
        }

        applyCancel();
        setMessages((prev) => {
          // Replace optimistic user message with actual
          const filtered = prev.filter((m) => m.id !== userMessage.id);
          return [...filtered, response.message, withActions(response.response, response)];
        });
        // Update conversation title if server generated one
        if (response.conversationTitle) {
          setConversation((prev) => prev ? { ...prev, title: response.conversationTitle } : prev);
          if (currentConversation) {
            onConversationTitleGenerated?.(currentConversation.id, response.conversationTitle);
          }
        }
        onMessageReceived?.(withActions(response.response, response));
      }
      // The message took its files: they are no longer "for the next message"
      if (messageAccepted) {
        for (const f of attached) storedFilesRef.current.delete(f.id);
        if (attached.length > 0 && !isStale()) void refreshFileList(currentConversation.id, capturedSession);
      }
      return true;
    } catch (err) {
      // Files stored for this send only are dropped; eagerly stored ones stay for another try
      if (!messageAccepted && uploadedIds.length > 0 && !eager) {
        const client = clientRef.current;
        await Promise.all(uploadedIds.map((id) => client?.deleteFile?.(id).catch(() => undefined)));
      }
      // Ignore stale sessions (user navigated away) and abort errors (user stopped)
      if (isStale()) return true;
      if (isAbort(err)) {
        // Stopped while the files were still going up: nothing was sent, the composer gets its files (and text) back
        if (!uploadsDone && optimisticId) {
          const sentId = optimisticId;
          setMessages((prev) => prev.filter((m) => m.id !== sentId));
          for (const [id, raw] of attachedRaw) if (raw) rawFilesRef.current.set(id, raw);
          setPendingFiles((prev) => [...attached, ...prev.filter((f) => !attached.some((a) => a.id === f.id))]);
          return false;
        }
        return true;
      }
      const error = friendly(err instanceof Error ? err : new Error(t("chat.error.sendFailed")));
      if (!messageAccepted && optimisticId) {
        const sentId = optimisticId;
        setMessages((prev) => prev.filter((m) => m.id !== sentId));
        for (const [id, raw] of attachedRaw) if (raw) rawFilesRef.current.set(id, raw);
        setPendingFiles((prev) => [...attached, ...prev.filter((f) => !attached.some((a) => a.id === f.id))]);
      }
      // The server was answering and the connection broke: it goes on without us - pick it up again
      if (messageAccepted && dropped(err) && activeConversationId) {
        recoverDroppedTurn(activeConversationId, capturedSession, error);
        return true;
      }
      setError(error);
      onError?.(error);
      // A card is waiting, a turn is running or the budget is used up, and this page did not know: show it
      if (!messageAccepted && isConflictCode((err as { code?: string } | null)?.code) && activeConversationId) {
        // the turn is over for us before the conversation is fetched, so a running one can be followed
        turnSessionRef.current = null;
        void refreshConversation(activeConversationId, capturedSession);
      }
      // Once the server started answering, the message is spent even if the stream broke later
      return messageAccepted;
    } finally {
      if (turnSessionRef.current === capturedSession) turnSessionRef.current = null;
      if (!isStale()) {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    }
  }, [
    t,
    has,
    conversation,
    createConversation,
    refreshConversation,
    refreshFileList,
    dropped,
    recoverDroppedTurn,
    uploadOne,
    pendingFiles,
    fileTransport,
    eagerUploads,
    attachmentsOnlyMessage,
    streaming,
    pendingActionComposerMode,
    onMessageSent,
    onMessageReceived,
    onStreamText,
    onToolCall,
    onToolResult,
    onError,
    onConversationTitleGenerated,
    onBackgroundStreamCompleted,
  ]);

  const resolveAction = useCallback(async (actionId: string, resolution: ActionResolution): Promise<boolean> => {
    const client = clientRef.current;
    if (!client?.resolveAction || !conversation) return false;
    const entry = collectPendingActions(messagesRef.current).find((e) => e.action.id === actionId);
    if (!entry || entry.state?.status === "resolving") return false;

    const capturedSession = sessionRef.current;
    const isStale = () => sessionRef.current !== capturedSession;
    const conversationId = conversation.id;
    const patch = (state: ActionState) =>
      setMessages((prev) => setActionStates(prev, { [actionId]: state }));

    setError(null);
    streamActionsRef.current = [];
    turnSessionRef.current = capturedSession;
    patch({ status: "resolving", resolution });
    setIsResolvingAction(true);
    setIsStreaming(true);
    streamingTextRef.current = "";
    setStreamingText("");
    setActiveToolCalls(new Map());
    activeToolCallsRef.current = new Map();
    toolCallStartTimeRef.current = null;
    setProgressMessage("");

    // Once the server has started answering, the action is spent even if the stream later breaks
    let accepted = false;
    try {
      if (streaming) {
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        const base = createStreamCallbacksRef.current(isStale);
        await client.resolveAction(conversationId, actionId, resolution, {
          stream: true,
          signal: abortController.signal,
          callbacks: {
            ...base,
            onStart: (e) => { accepted = true; base.onStart?.(e); },
            onText: (text, full) => { accepted = true; base.onText?.(text, full); },
            onActionResolved: (e) => { accepted = true; base.onActionResolved?.(e); },
            onDone: (e) => { accepted = true; base.onDone?.(e); },
          },
        });
      } else {
        const response = await client.resolveAction(conversationId, actionId, resolution, { stream: false });
        accepted = true;
        if (!isStale()) showReply(response);
      }
      if (isStale()) return true;
      patch(stateForResolution(resolution));
      onActionResolved?.({ conversationId, actionId, action: entry.action, resolution });
      return true;
    } catch (err) {
      if (isStale()) return true;
      if (isAbort(err)) {
        patch(accepted ? stateForResolution(resolution) : { status: "pending" });
        return accepted;
      }
      const error = friendly(err instanceof Error ? err : new Error(t("chat.error.sendFailed")));
      const code = (err as { code?: string } | null)?.code;
      // Spent on the server's side (answered elsewhere, expired, cancelled): stop offering it,
      // which also frees the composer
      patch(stateForSpentAction(code) ?? (accepted ? stateForResolution(resolution) : { status: "pending" }));
      // The connection broke after the server took the answer: the turn goes on without us
      if (accepted && dropped(err)) {
        recoverDroppedTurn(conversationId, capturedSession, error);
        return true;
      }
      setError(error);
      onError?.(error);
      // The turn is busy elsewhere: show where it stands
      if (!accepted && isConflictCode(code)) {
        turnSessionRef.current = null;
        void refreshConversation(conversationId, capturedSession);
      }
      return accepted;
    } finally {
      if (turnSessionRef.current === capturedSession) turnSessionRef.current = null;
      if (!isStale()) {
        setIsStreaming(false);
        setIsResolvingAction(false);
        abortControllerRef.current = null;
      }
    }
  }, [t, has, conversation, streaming, refreshConversation, dropped, recoverDroppedTurn, showReply, onActionResolved, onError]);

  // ---------------------------------------------------------------------------
  // Budget
  // ---------------------------------------------------------------------------

  const continueConversation = useCallback(async (): Promise<boolean> => {
    const client = clientRef.current;
    const conv = conversationRef.current;
    if (!client?.continueConversation || !conv) return false;
    if (turnSessionRef.current === sessionRef.current || followRef.current) return false;

    const capturedSession = sessionRef.current;
    const isStale = () => sessionRef.current !== capturedSession;
    setError(null);
    streamActionsRef.current = [];
    turnSessionRef.current = capturedSession;
    setIsStreaming(true);
    streamingTextRef.current = "";
    setStreamingText("");
    setActiveToolCalls(new Map());
    activeToolCallsRef.current = new Map();
    toolCallStartTimeRef.current = null;
    setProgressMessage("");

    let accepted = false;
    try {
      if (streaming) {
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        const base = createStreamCallbacksRef.current(isStale);
        await client.continueConversation(conv.id, {
          stream: true,
          signal: abortController.signal,
          callbacks: {
            ...base,
            onStart: (e) => { accepted = true; base.onStart?.(e); },
            onText: (text, full) => { accepted = true; base.onText?.(text, full); },
            onDone: (e) => { accepted = true; base.onDone?.(e); },
          },
        });
      } else {
        const response = await client.continueConversation(conv.id, { stream: false });
        accepted = true;
        if (!isStale()) showReply(response);
      }
      return true;
    } catch (err) {
      if (isStale()) return true;
      if (isAbort(err)) return accepted;
      const code = (err as { code?: string } | null)?.code?.toLowerCase();
      turnSessionRef.current = null;
      if (code === "nothing_to_continue") {
        // Someone carried it on already, or there is nothing stopped to carry on: just show where it stands
        void refreshConversation(conv.id, capturedSession);
        return false;
      }
      const shown = friendly(err instanceof Error ? err : new Error(t("chat.error.sendFailed")));
      if (accepted && dropped(err)) {
        recoverDroppedTurn(conv.id, capturedSession, shown);
        return true;
      }
      setError(shown);
      onError?.(shown);
      if (!accepted && isConflictCode(code)) void refreshConversation(conv.id, capturedSession);
      return accepted;
    } finally {
      if (turnSessionRef.current === capturedSession) turnSessionRef.current = null;
      if (!isStale()) {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    }
  }, [t, has, streaming, showReply, refreshConversation, dropped, recoverDroppedTurn, onError]);

  const updateBudget = useCallback(
    async (next: ConversationBudget | null, opts: { continue?: boolean } = {}): Promise<boolean> => {
      const client = clientRef.current;
      const conv = conversationRef.current;
      if (!client?.updateBudget || !conv) return false;
      const capturedSession = sessionRef.current;
      const wasPaused = conv.runtime?.status === "budget_paused";
      setError(null);
      try {
        const updated = await client.updateBudget(conv.id, next);
        if (sessionRef.current !== capturedSession) return true;
        const budget = updated.budget === undefined ? next : normalizeBudget(updated.budget) ?? next;
        setConversation((prev) => {
          if (!prev) return prev;
          const spentUsd = typeof updated.spentUsd === "number" ? updated.spentUsd : prev.spentUsd;
          const stillUsedUp = Boolean(budget && typeof spentUsd === "number" && spentUsd >= budget.maxCostUsd);
          return {
            ...prev,
            budget,
            ...(spentUsd !== undefined ? { spentUsd } : {}),
            // The server reports the runtime once the limit changed; without it a raised limit frees a paused chat
            runtime:
              updated.runtime ??
              (prev.runtime?.status === "budget_paused" && !stillUsedUp ? { ...prev.runtime, status: "idle" } : prev.runtime),
          };
        });
        // The limit is changed. Carrying on is a turn of its own: how it went is in `error` (and nothing
        // to carry on, a handler agent that cannot be continued, is not worth one)
        if (opts.continue && wasPaused) await continueConversation();
        return true;
      } catch (err) {
        if (sessionRef.current !== capturedSession) return true;
        const shown = friendly(err instanceof Error ? err : new Error(t("chat.error.sendFailed")));
        setError(shown);
        onError?.(shown);
        return false;
      }
    },
    [t, has, continueConversation, onError]
  );

  // ---------------------------------------------------------------------------
  // Stop, clear, retry
  // ---------------------------------------------------------------------------

  const clearMessages = useCallback(() => {
    resetStreamingState();
    releasePreviews();
    discardStoredFiles();
    sessionRef.current += 1;
    setMessages([]);
    setConversation(null);
    setFileList(null);
    setError(null);
    setPendingFiles([]);
    rawFilesRef.current.clear();
    lastUserMessageRef.current = "";
  }, [resetStreamingState, releasePreviews, discardStoredFiles]);

  const retry = useCallback(async () => {
    if (lastUserMessageRef.current) {
      // Remove the last assistant message if it exists
      setMessages((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].role === "assistant") {
          return prev.slice(0, -1);
        }
        return prev;
      });
      await sendMessage(lastUserMessageRef.current);
    }
  }, [sendMessage]);

  /** Tell the server to stop the run. Quiet when the route is missing (an older server); anything else is shown. */
  const cancelOnServer = useCallback(
    async (conversationId: string, session: number, thenRefresh: boolean) => {
      const client = clientRef.current;
      if (!client?.cancel) return;
      try {
        const result = await client.cancel(conversationId);
        if (sessionRef.current !== session) return;
        if (result.runtime) {
          setConversation((prev) => (prev && prev.id === conversationId ? { ...prev, runtime: result.runtime } : prev));
        }
      } catch (err) {
        const status = (err as { status?: number } | null)?.status;
        if (sessionRef.current === session && status !== 404 && status !== 405 && status !== 501) {
          const shown = friendly(err instanceof Error ? err : new Error(t("chat.error.sendFailed")));
          setError(shown);
          onError?.(shown);
        }
      }
      // What the server kept (the cancelled answer, with its stop reason) replaces the local partial
      if (thenRefresh && sessionRef.current === session) await refreshConversation(conversationId, session);
    },
    [t, has, onError, refreshConversation] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const stop = useCallback(() => {
    const conv = conversationRef.current;
    const session = sessionRef.current;
    const canCancel = Boolean(clientRef.current?.cancel && conv);

    // Watching a turn that runs elsewhere: stopping it is the server's job; the follower then sees it end
    if (followRef.current) {
      if (canCancel && conv) void cancelOnServer(conv.id, session, false);
      else stopFollowing();
      if (!canCancel) {
        setIsStreaming(false);
        streamingTextRef.current = "";
        setStreamingText("");
        activeToolCallsRef.current = new Map();
        setActiveToolCalls(new Map());
      }
      return;
    }

    // Files of the message being sent stop going up
    sendUploadRef.current?.abort();
    // The server stops the run (this page's connection is closed too, right below)
    if (canCancel && conv) void cancelOnServer(conv.id, session, true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Keep what was streamed so far as a message, marked as stopped
    const partial = streamingTextRef.current;
    if (partial) {
      const at = new Date();
      const toolCalls = activeToolCallsRef.current;
      const partialMessage: Message = {
        id: generateId(),
        conversationId: conv?.id || "",
        role: "assistant",
        content: partial,
        status: "cancelled",
        stopReason: "cancelled",
        metadata: toolCalls.size > 0
          ? {
              toolCallDetails: Array.from(toolCalls.entries()).map(([id, call]) => ({
                id, name: call.name, args: call.args, result: call.result,
              })),
            }
          : undefined,
        createdAt: at,
        updatedAt: at,
      };
      setMessages((prev) => [...prev, partialMessage]);
    }
    streamingTextRef.current = "";
    setStreamingText("");
    activeToolCallsRef.current = new Map();
    toolCallStartTimeRef.current = null;
    setActiveToolCalls(new Map());
    setProgressMessage("");
    setIsStreaming(false);
  }, [cancelOnServer, stopFollowing]);

  const pendingActions = useMemo(() => collectPendingActions(messages), [messages]);

  // A card past its deadline stops being answerable on its own: it turns Expired (which frees the
  // composer) and, shortly after, the conversation is fetched again in case the server went on without us.
  const [expiryTick, setExpiryTick] = useState(0);
  const expiryRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (expiryRefreshRef.current) clearTimeout(expiryRefreshRef.current);
  }, []);
  useEffect(() => {
    let next: number | undefined;
    for (const entry of pendingActions) {
      if (entry.state?.status === "resolving") continue;
      const at = actionDeadline(entry.action);
      if (at !== undefined && (next === undefined || at < next)) next = at;
    }
    if (next === undefined) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      const expired: Record<string, ActionState> = {};
      for (const entry of collectPendingActions(messagesRef.current)) {
        const at = actionDeadline(entry.action);
        if (at !== undefined && at <= now && entry.state?.status !== "resolving") {
          expired[entry.action.id] = { status: "expired" };
        }
      }
      if (Object.keys(expired).length === 0) {
        setExpiryTick((tick) => tick + 1); // a deadline further away than a timer can wait
        return;
      }
      setMessages((prev) => setActionStates(prev, expired));
      const conversationId = conversationRef.current?.id;
      const session = sessionRef.current;
      if (conversationId) {
        if (expiryRefreshRef.current) clearTimeout(expiryRefreshRef.current);
        expiryRefreshRef.current = setTimeout(() => {
          expiryRefreshRef.current = null;
          if (isStreamingRef.current || abortControllerRef.current) return; // a turn of our own is running; it brings the news itself
          void refreshConversation(conversationId, session);
        }, actionExpiryRefreshMs);
      }
    }, Math.min(Math.max(next - Date.now(), 0), MAX_TIMER_MS));
    return () => clearTimeout(timer);
  }, [pendingActions, expiryTick, actionExpiryRefreshMs, refreshConversation]);

  const answerable = useMemo(() => singleFreeTextQuestion(pendingActions), [pendingActions]);
  const canResolveActions = typeof clientRef.current?.resolveAction === "function";
  const awaitingAction = pendingActions.length > 0 && !isLoadingConversation;

  const budget = conversation?.budget ?? null;
  const budgetExhausted = isBudgetExhausted(conversation);

  const composerState: ComposerState = readOnly
    ? "readonly"
    : isFollowing
      ? "following"
      : awaitingAction
        ? enableQuestions && canResolveActions && answerable !== null
          ? "answer"
          : pendingActionComposerMode === "cancel"
            ? "cancel"
            : "blocked"
        : budgetExhausted
          ? "budget_paused"
          : "open";

  const canGetFileUrl = typeof clientRef.current?.getFileUrl === "function";
  const resolveFileUrl = useMemo(
    () =>
      canGetFileUrl
        ? async (file: FileAttachment, opts?: { disposition?: "inline" | "attachment" }) => {
            try {
              return await clientRef.current?.getFileUrl?.(file, opts);
            } catch {
              return undefined;
            }
          }
        : undefined,
    [canGetFileUrl]
  );

  return {
    messages,
    conversation,
    isLoading: isStreaming || isLoadingConversation,
    isStreaming,
    isLoadingConversation,
    isFollowing,
    streamingText,
    progressMessage,
    error,
    pendingFiles,
    isUploading:
      isUploadingMessage || pendingFiles.some((f) => f.status === "uploading" || f.status === "queued"),
    activeToolCalls,
    sendMessage,
    addFiles,
    removeFile,
    retryFile,
    clearMessages,
    loadConversation,
    createConversation,
    retry,
    stop,
    pendingActions,
    awaitingAction,
    isResolvingAction,
    canResolveActions,
    answerableQuestion: answerable ? { actionId: answerable.action.id, question: answerable.question } : null,
    resolveAction,
    composerState,
    budget,
    spentUsd: conversation?.spentUsd,
    budgetExhausted,
    canContinue: typeof clientRef.current?.continueConversation === "function",
    canUpdateBudget: typeof clientRef.current?.updateBudget === "function",
    continueConversation,
    updateBudget,
    heldFiles,
    heldFilesMax: fileList?.max,
    resolveFileUrl,
    setError,
    setMessages,
    setConversation,
    setIsStreaming,
    setStreamingText,
    setProgressMessage,
    setPendingFiles,
    setActiveToolCalls,
  };
}
