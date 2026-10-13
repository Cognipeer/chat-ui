"use client";

import { useState, useCallback, useRef, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import {
  actionDeadline,
  applyFileList,
  applyFollowEvent,
  countMessageFiles,
  expireLapsedActions,
  generateId,
  isBudgetExhausted,
  canContinueAfterRaise,
  isConflictCode,
  isFileExpired,
  isFileTypeAllowed,
  isInterruptedTurn,
  isRasterImageType,
  keepSettledDetail,
  localizeError,
  messageText,
  newFollowState,
  normalizeActions,
  normalizeBudget,
  normalizeStopReason,
  collectPendingActions,
  normalizeFeedback,
  readFeedback,
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
  ClientToolCall,
  ClientToolResult,
  ComposerState,
  Conversation,
  ConversationBudget,
  FeedbackInput,
  MessageFeedback,
  PendingAction,
  ReasoningEffort,
  ActionResolution,
  ActionState,
  StreamEvent,
  UserQuestion,
} from "../types";
import {
  AgentServerClient,
  type CancelResult,
  type ChatTransport,
  type ListFilesResult,
  type ResolveActionOptions,
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
  /**
   * Runs a tool of the host page (an embedded chat). When given, an agent's call to such a tool
   * (`client_tool` action) is handed to it and its result answers the action; the turn then goes on.
   * Without it these actions are left alone.
   */
  onClientToolCall?: (call: ClientToolCall) => Promise<ClientToolResult>;
  /**
   * Extra `metadata` sent with every message (an embedded page's unsigned UI context). Called per
   * message so it can change; return `undefined` for none.
   */
  getMessageMetadata?: () => Record<string, unknown> | undefined;
  /**
   * The model key to send with a message (`AgentInfo.models`); called per message. Return
   * `undefined` to let the agent use its own.
   */
  getModel?: () => string | undefined;
  /** The reasoning effort to send with a message; called per message. `undefined` sends nothing. */
  getReasoningEffort?: () => ReasoningEffort | undefined;
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
  /** The model's reasoning for the turn being streamed (kept apart from `streamingText`) */
  streamingReasoning: string;
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
  sendMessage: (content: string, options?: SendUserMessageOptions) => Promise<boolean>;
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
   * The conversation ends on a message of the person's that never got its answer: the run was cut off
   * (the runtime says it stopped on an error). `Chat` shows a "reply was interrupted" notice.
   */
  interrupted: boolean;
  /**
   * Send the message that was left without an answer again (its text and the files it carried, which are
   * stored already). Resolves `false` when it cannot be sent (nothing to retry, the composer is closed,
   * the server refused).
   */
  retryInterrupted: () => Promise<boolean>;
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
  /** The transport can run the last answer again */
  canRegenerate: boolean;
  /** The transport can replace a message of the person's and run the turn again */
  canEdit: boolean;
  /** The transport can store a rating of an answer */
  canRate: boolean;
  /**
   * Run the conversation's last answer again from the message that asked for it. The old answer is
   * replaced by the new one as it streams. Resolves `false` when it cannot (a turn runs, a card
   * waits, the last message is not an answer, the server refused: `error` says why).
   */
  regenerate: () => Promise<boolean>;
  /**
   * Replace one of the person's messages and run the turn again from it; every message after it is
   * dropped. Resolves `false` when it cannot (see `regenerate`).
   */
  editMessage: (messageId: string, content: string) => Promise<boolean>;
  /**
   * Rate an answer (`rating: null` withdraws the rating). The rating shows at once and is taken back
   * when the server refuses. Resolves `false` when it was refused or the transport cannot rate.
   */
  submitFeedback: (messageId: string, input: FeedbackInput) => Promise<boolean>;
  /** Files the conversation holds: the server's count, or those of the loaded messages */
  heldFiles: number;
  /** The server's own limit of files per conversation, when it says */
  heldFilesMax: number | undefined;
  /** The server pages a long conversation: older messages exist than the ones loaded (see `loadEarlierMessages`) */
  hasEarlierMessages: boolean;
  /** True while `loadEarlierMessages` is fetching */
  isLoadingEarlierMessages: boolean;
  /**
   * Fetch the page of history just older than the oldest message shown and put it in front. Resolves
   * `false` when there is nothing older, a fetch is already under way, or it failed (`error` says why).
   */
  loadEarlierMessages: () => Promise<boolean>;
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

/** Extra input of `sendMessage` besides the text. */
export interface SendUserMessageOptions {
  /**
   * Files already stored in the conversation that go with this message (sending an interrupted message
   * again): named in the request, shown on the bubble, and left alone when the send fails.
   */
  reuseFiles?: FileAttachment[];
}

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

/**
 * Local preview of a picture still on this device; revoked by the hook. Only raster types get one:
 * an object URL opened in its own tab belongs to the page's origin, so an SVG (which can carry
 * script) must not be given one.
 */
function createPreviewUrl(file: File): string | undefined {
  if (!isRasterImageType(file.type)) return undefined;
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
    onClientToolCall,
    getMessageMetadata,
    getModel,
    getReasoningEffort,
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
    onActionRequired,
    onFeedback,
  } = options;

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingReasoning, setStreamingReasoning] = useState("");
  const streamingReasoningRef = useRef("");
  const clearStreamingReasoning = useCallback(() => {
    streamingReasoningRef.current = "";
    setStreamingReasoning("");
  }, []);
  const [error, setError] = useState<Error | null>(null);
  const [pendingFiles, setPendingFiles] = useState<FileAttachment[]>([]);
  const [isUploadingMessage, setIsUploadingMessage] = useState(false);
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallMap>(new Map());
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [isResolvingAction, setIsResolvingAction] = useState(false);
  // What the server says the conversation holds (null: it cannot say, the messages are counted)
  const [fileList, setFileList] = useState<{ total: number; max?: number } | null>(null);
  // The server pages a long history: older messages exist than the ones loaded
  const [hasEarlierMessages, setHasEarlierMessages] = useState(false);
  const [isLoadingEarlierMessages, setIsLoadingEarlierMessages] = useState(false);

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
  /** Revoke the previews, except the ones in `keep` (pictures still waiting in the composer). */
  const releasePreviews = useCallback((keep?: ReadonlySet<string>) => {
    for (const url of Array.from(previewUrlsRef.current)) {
      if (keep?.has(url)) continue;
      revokePreviewUrl(url);
      previewUrlsRef.current.delete(url);
    }
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
  // The newest event of the last followed turn that ended as idle: a conversation the store still
  // calls running without anything newer is the store catching up, not another turn to follow
  const followedIdleRef = useRef<{ conversationId: string; seq: number } | null>(null);
  const idleGuardHitRef = useRef(false);
  // Whether older messages can be fetched, and a fetch of them is under way (for callbacks)
  const hasEarlierRef = useRef(false);
  const loadingEarlierRef = useRef(false);
  const setEarlier = useCallback((more: boolean) => {
    hasEarlierRef.current = more;
    setHasEarlierMessages(more);
  }, []);

  // Ids this page gave to the messages it sent (the server's differ): resolved when a message is edited
  const localUserIdsRef = useRef<Set<string>>(new Set());
  // Host-page tool calls already handed over, and the handler (latest props, for async callbacks)
  const dispatchedToolsRef = useRef<Set<string>>(new Set());
  const onClientToolCallRef = useRef(onClientToolCall);
  onClientToolCallRef.current = onClientToolCall;
  const getMessageMetadataRef = useRef(getMessageMetadata);
  getMessageMetadataRef.current = getMessageMetadata;
  const getModelRef = useRef(getModel);
  getModelRef.current = getModel;
  const getReasoningEffortRef = useRef(getReasoningEffort);
  getReasoningEffortRef.current = getReasoningEffort;
  const readReasoningEffort = useCallback((): ReasoningEffort | undefined => {
    try {
      return getReasoningEffortRef.current?.() || undefined;
    } catch {
      return undefined;
    }
  }, []);
  /** The model key the person picked for the next turn, if any */
  const readModel = useCallback((): string | undefined => {
    try {
      return getModelRef.current?.() || undefined;
    } catch {
      return undefined;
    }
  }, []);
  const onActionRequiredRef = useRef(onActionRequired);
  onActionRequiredRef.current = onActionRequired;
  const onFeedbackRef = useRef(onFeedback);
  onFeedbackRef.current = onFeedback;

  // The client this hook built itself (none when the host passed a transport), and the ones it replaced
  const ownClientRef = useRef<AgentServerClient | null>(null);
  const retiredClientsRef = useRef<AgentServerClient[]>([]);

  // Keep a stable client reference that updates synchronously when config changes
  useMemo(() => {
    const own = transport
      ? null
      : new AgentServerClient({
          baseUrl,
          agentId: agentId || "",
          authorization,
          headers,
          getHeaders,
          fetch: customFetch,
        });
    // A replaced client that made blob URLs is not let go at once: pictures on screen still use them.
    // (One that made none has nothing to release; a host that builds new options every render would
    // otherwise pile up a client per render.)
    const replaced = ownClientRef.current;
    if (replaced && replaced !== own && replaced.holdsFileUrls) retiredClientsRef.current.push(replaced);
    ownClientRef.current = own;
    clientRef.current = transport ?? own;
  }, [transport, baseUrl, agentId, authorization, headers, getHeaders, customFetch]);

  /** Release the blob URLs of the stored files the hook's own clients made (the pictures using them are gone). */
  const releaseFileUrls = useCallback(() => {
    for (const old of retiredClientsRef.current.splice(0)) old.dispose();
    ownClientRef.current?.dispose();
  }, []);

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
    clearStreamingReasoning();
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
      // The blob URLs of the clients this hook made itself
      releaseFileUrls();
    },
    [releasePreviews, releaseFileUrls]
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
    const idle = followedIdleRef.current;
    if (idle && idle.conversationId === loaded.id && (loaded.runtime.lastEventSeq ?? 0) <= idle.seq) {
      // The run said it was idle and nothing has happened since: the store has not caught up yet
      idleGuardHitRef.current = true;
      return;
    }
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
    if (fileTransport === "upload-on-select") {
      releasePreviews();
      // files stored for this conversation's next message do not follow us to another one
      discardStoredFiles();
      rawFilesRef.current.clear();
      setPendingFiles([]);
    } else {
      // pictures still waiting in the composer go along with the person, and keep their previews
      releasePreviews(new Set(pendingFilesRef.current.flatMap((f) => (f.previewUrl ? [f.previewUrl] : []))));
    }
    releaseFileUrls();
    sessionRef.current += 1;
    const capturedSession = sessionRef.current;

    try {
      setIsLoadingConversation(true);
      setMessages([]);
      setConversation(null);
      setFileList(null);
      setEarlier(false);
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
      setEarlier(data.messagesPage?.hasMoreBefore === true);
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
  }, [t, has, fileTransport, onError, resetStreamingState, releasePreviews, releaseFileUrls, discardStoredFiles, listFilesFor, withFileList, followIfRunning, setEarlier]);

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
      // A card past its deadline stays Expired even when the server has not swept it yet
      const restored = expireLapsedActions(
        withFileList(
          restorePendingActions(data.messages, data.pendingActions ?? data.conversation?.pendingActions),
          listing
        )
      );
      setConversation(data.conversation);
      // The fetch brings the newest page; older pages the person already scrolled back to stay in front of it
      const newest = restored[0]?.id;
      const keepsEarlier = newest !== undefined && messagesRef.current.findIndex((m) => m.id === newest) > 0;
      setMessages((prev) => {
        const next = keepSettledDetail(restored, prev);
        const at = newest === undefined ? -1 : prev.findIndex((m) => m.id === newest);
        return at > 0 ? [...prev.slice(0, at), ...next] : next;
      });
      setEarlier(keepsEarlier ? hasEarlierRef.current : data.messagesPage?.hasMoreBefore === true);
      if (listing) setFileList({ total: listing.total, max: listing.maxFiles });
      if (options.follow !== false) followIfRunning(data.conversation, session);
      return restored;
    } catch {
      // the banner already says what went wrong
      return undefined;
    }
  }, [listFilesFor, withFileList, followIfRunning, setEarlier]);

  /** Fetches the page of history just older than the oldest message shown and puts it in front. */
  const loadEarlierMessages = useCallback(async (): Promise<boolean> => {
    const client = clientRef.current;
    const conv = conversationRef.current;
    const oldest = messagesRef.current[0];
    if (!client || !conv || !oldest || !hasEarlierRef.current || loadingEarlierRef.current) return false;
    const session = sessionRef.current;
    loadingEarlierRef.current = true;
    setIsLoadingEarlierMessages(true);
    try {
      const [data, listing] = await Promise.all([client.getConversation(conv.id, { before: oldest.id }), listFilesFor(conv.id)]);
      if (sessionRef.current !== session) return false;
      // Nothing in an older page is waiting for an answer any more: an empty report settles every card in it
      const older = withFileList(restorePendingActions(data.messages, []), listing);
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const added = older.filter((m) => !known.has(m.id));
        return added.length > 0 ? [...added, ...prev] : prev;
      });
      setEarlier(data.messagesPage?.hasMoreBefore === true);
      return true;
    } catch (err) {
      if (sessionRef.current === session && !isAbort(err)) {
        const shown = friendly(err instanceof Error ? err : new Error(t("chat.error.loadEarlierFailed")));
        setError(shown);
        onError?.(shown);
      }
      return false;
    } finally {
      loadingEarlierRef.current = false;
      if (sessionRef.current === session) setIsLoadingEarlierMessages(false);
    }
  }, [t, has, onError, listFilesFor, withFileList, setEarlier]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setEarlier(false);
    onConversationCreated?.(conv);
    return conv;
  }, [t, agentId, onConversationCreated, setEarlier]);

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
            onThinking: (_text, fullThinking) => {
              if (isStale()) return;
              streamingReasoningRef.current = fullThinking;
              flushSync(() => {
                setStreamingReasoning(fullThinking);
              });
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
                // The reasoning streamed for this turn, kept with the answer
                const streamedReasoning = streamingReasoningRef.current;
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
                  ...(streamedReasoning ? { reasoning: streamedReasoning } : {}),
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
                clearStreamingReasoning();
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
                  // a new turn ended: whether an earlier stop can be carried on no longer describes the conversation
                  const { continuable: _earlier, ...current } = prev;
                  return {
                    ...current,
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
              const announced = normalizeActions(event.actions);
              streamActionsRef.current = [...streamActionsRef.current, ...announced];
              // the tools of the host page have no card, so nothing for the person to be told about
              for (const action of announced) {
                if (action.type !== "client_tool") {
                  onActionRequiredRef.current?.({ conversationId: event.conversationId, action });
                }
              }
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
    clearStreamingReasoning();
    activeToolCallsRef.current = new Map();
    setActiveToolCalls(new Map());
    setProgressMessage("");
    setIsStreaming(true);
    setIsFollowing(true);

    /** The message that started the followed turn, when the stored history does not have it yet. */
    const showFollowedUserMessage = () => {
      const user = state.userMessage;
      if (user && !messagesRef.current.some((m) => m.id === user.id)) {
        const at = new Date();
        const added: Message = { id: user.id, conversationId, role: "user", content: user.content, files: user.files, createdAt: at, updatedAt: at };
        // a snapshot and the `user.message` it stands for may both arrive before the next render
        setMessages((prev) => (prev.some((m) => m.id === added.id) ? prev : [...prev, added]));
      }
    };

    const onEvent = (event: Parameters<typeof applyFollowEvent>[1]) => {
      if (stale()) {
        controller.abort();
        return;
      }
      const previous = state;
      state = applyFollowEvent(state, event);
      switch (event.type) {
        case "user.message":
          showFollowedUserMessage();
          break;
        case "agent.message.snapshot":
          // Joined a run in progress: what it has written so far seeds the bubble (and the message that
          // started it, when the stored history lacks it); the live deltas that follow add to it
          showFollowedUserMessage();
          setProgressMessage("");
          streamingTextRef.current = state.text;
          setStreamingText(state.text);
          break;
        case "session.status_running":
          // A new turn starts empty; the run a snapshot seeded keeps what the snapshot brought
          streamingTextRef.current = state.text;
          setStreamingText(state.text);
          activeToolCallsRef.current = new Map(state.tools);
          setActiveToolCalls(new Map(state.tools));
          break;
        case "agent.message.delta":
        case "agent.message":
          setProgressMessage("");
          streamingTextRef.current = state.text;
          setStreamingText(state.text);
          // a delta of another run than the snapshot's starts that run's calls afresh
          if (state.tools !== previous.tools) {
            activeToolCallsRef.current = new Map(state.tools);
            setActiveToolCalls(new Map(state.tools));
          }
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
      if (state.idle && state.lastSeq !== undefined) followedIdleRef.current = { conversationId, seq: state.lastSeq };
      idleGuardHitRef.current = false;
      const loaded = await refreshConversation(conversationId, session, { follow: Boolean(state.idle) });
      if (stale()) return;
      const notStoredYet = loaded && state.messageId && !loaded.some((m) => m.id === state.messageId);
      if (notStoredYet || idleGuardHitRef.current) {
        // the answer was not stored yet when we looked, or the run still read as running right after it ended
        idleGuardHitRef.current = false;
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
    clearStreamingReasoning();
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
      // Check file count; the files accepted from this very batch count as attached too
      const attached = held + pendingFiles.length + validFiles.length;
      if (attached >= maxFiles) {
        refuse(
          maxFilesScope === "conversation"
            ? t("chat.file.tooManyInChat", { maxFiles, held: attached })
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

  const sendMessage = useCallback(async (typed: string, sendOptions: SendUserMessageOptions = {}): Promise<boolean> => {
    // Files already stored for this message (sending an interrupted one again)
    const reused = sendOptions.reuseFiles ?? [];
    // Files alone are a message: they go with the configured text (a server rejects an empty one)
    const attachmentsOnly = !typed.trim() && (pendingFiles.length > 0 || reused.length > 0);
    if (!clientRef.current || (!typed.trim() && !attachmentsOnly)) return false;
    const content = attachmentsOnly ? (attachmentsOnlyMessage ?? t("chat.input.attachmentsOnlyMessage")) : typed;

    // Files stored as soon as they were picked: all must be in before the message can name them
    const eager = eagerUploads && Boolean(clientRef.current.uploadFile);
    if (eager && pendingFiles.some((f) => f.status !== "ready")) return false;

    // Capture the current session so async callbacks can detect staleness
    const capturedSession = sessionRef.current;
    const isStale = () => sessionRef.current !== capturedSession;
    // What the host wants sent along with the message (an embedded page's UI context)
    const messageMetadata = (() => {
      try {
        return getMessageMetadataRef.current?.();
      } catch {
        return undefined;
      }
    })();

    const model = readModel();
    const reasoningEffort = readReasoningEffort();

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
        files: attached.length > 0 || reused.length > 0
          ? [
              ...attached.map((f) => (storeFirst ? { ...f, status: "uploading" as const, progress: 0 } : f)),
              ...reused.map((f) => ({ ...f })),
            ]
          : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      optimisticId = userMessage.id;
      localUserIdsRef.current.add(userMessage.id);
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
        clearStreamingReasoning();
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
            fileIds: uploadedIds.length + reused.length > 0 ? [...uploadedIds, ...reused.map((f) => f.id)] : undefined,
            ...(messageMetadata ? { metadata: messageMetadata } : {}),
            ...(model ? { model } : {}),
            ...(reasoningEffort ? { reasoningEffort } : {}),
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
          fileIds: uploadedIds.length + reused.length > 0 ? [...uploadedIds, ...reused.map((f) => f.id)] : undefined,
          ...(messageMetadata ? { metadata: messageMetadata } : {}),
          ...(model ? { model } : {}),
          ...(reasoningEffort ? { reasoningEffort } : {}),
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
    readModel,
    readReasoningEffort,
  ]);

  const resolveAction = useCallback(async (actionId: string, resolution: ActionResolution): Promise<boolean> => {
    const client = clientRef.current;
    if (!client?.resolveAction || !conversation) return false;
    const entry = collectPendingActions(messagesRef.current, { includeClientTools: true }).find((e) => e.action.id === actionId);
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
    clearStreamingReasoning();
    setActiveToolCalls(new Map());
    activeToolCallsRef.current = new Map();
    toolCallStartTimeRef.current = null;
    setProgressMessage("");

    // Once the server has started answering, the action is spent even if the stream later breaks.
    // `stream.start` alone does not say so (a transport may announce it before the backend has
    // looked at the answer); the first output, or the resolved event the server follows it with, does.
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
    clearStreamingReasoning();
    setActiveToolCalls(new Map());
    activeToolCallsRef.current = new Map();
    toolCallStartTimeRef.current = null;
    setProgressMessage("");

    let accepted = false;
    let carriedOn = false;
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
      carriedOn = true;
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
    // What the conversation has cost (and where it stands) after the continuation is the server's to say: not
    // every transport reports it with the turn's end
    if (carriedOn && !isStale()) await refreshConversation(conv.id, capturedSession, { follow: false });
    return true;
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
        const spentAfter = typeof updated.spentUsd === "number" ? updated.spentUsd : conversationRef.current?.spentUsd ?? conv.spentUsd;
        const usedUpAfter = Boolean(budget && typeof spentAfter === "number" && spentAfter >= budget.maxCostUsd);
        setConversation((prev) => {
          if (!prev) return prev;
          const spentUsd = typeof updated.spentUsd === "number" ? updated.spentUsd : prev.spentUsd;
          const stillUsedUp = Boolean(budget && typeof spentUsd === "number" && spentUsd >= budget.maxCostUsd);
          // what the page knew about carrying on is the server's to restate with every change
          const { continuable: _previous, ...kept } = prev;
          return {
            ...kept,
            budget,
            ...(spentUsd !== undefined ? { spentUsd } : {}),
            ...(typeof updated.continuable === "boolean" ? { continuable: updated.continuable } : {}),
            // The server reports the runtime once the limit changed; without it a raised limit frees a paused chat
            runtime:
              updated.runtime ??
              (prev.runtime?.status === "budget_paused" && !stillUsedUp ? { ...prev.runtime, status: "idle" } : prev.runtime),
          };
        });
        // The limit is changed. Carrying on is a turn of its own: how it went is in `error` (and nothing
        // to carry on, a handler agent that cannot be continued, is not worth one). The turn a budget
        // stopped midway stays paused after a raise until it is continued, and the server's answer says so
        // (`continuable`); a turn that had finished its answer before the limit is not (the raise only
        // reopens the conversation, a continue would only be refused). An older server says it with the
        // runtime it reports (still `budget_paused`), and one that reports nothing leaves it to what this
        // page knew.
        if (opts.continue && canContinueAfterRaise(updated, wasPaused && !usedUpAfter)) await continueConversation();
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
  // Regenerate, edit and resend
  // ---------------------------------------------------------------------------

  /**
   * Runs a turn the server starts from a message that is already stored (regenerate, edit): the
   * transcript is cut back first (`prepare`) and the new answer streams in. A refusal before the
   * server took the turn puts the transcript back; afterwards the stored conversation is read once
   * more, so the ids and texts on screen are the server's.
   */
  const rerunTurn = useCallback(
    async (
      start: (client: ChatTransport, conversationId: string, options: ResolveActionOptions) => Promise<SendMessageResponse | undefined>,
      prepare: (prev: Message[]) => Message[]
    ): Promise<boolean> => {
      const client = clientRef.current;
      const conv = conversationRef.current;
      if (!client || !conv) return false;
      if (turnSessionRef.current === sessionRef.current || followRef.current || isStreamingRef.current) return false;
      if (collectPendingActions(messagesRef.current).length > 0) return false;

      const capturedSession = sessionRef.current;
      const isStale = () => sessionRef.current !== capturedSession;
      const snapshot = messagesRef.current;
      const cutBack = prepare(snapshot);

      setError(null);
      streamActionsRef.current = [];
      turnSessionRef.current = capturedSession;
      setIsStreaming(true);
      streamingTextRef.current = "";
      setStreamingText("");
      clearStreamingReasoning();
      setActiveToolCalls(new Map());
      activeToolCallsRef.current = new Map();
      toolCallStartTimeRef.current = null;
      setProgressMessage("");
      // the ref is what the stream callbacks look at before the next render
      messagesRef.current = cutBack;
      setMessages(cutBack);

      let accepted = false;
      let finished = false;
      try {
        if (streaming) {
          const abortController = new AbortController();
          abortControllerRef.current = abortController;
          const base = createStreamCallbacksRef.current(isStale);
          await start(client, conv.id, {
            stream: true,
            signal: abortController.signal,
            callbacks: {
              ...base,
              onStart: (e) => { accepted = true; base.onStart?.(e); },
              onText: (text, full) => { accepted = true; base.onText?.(text, full); },
              onDone: (e) => { accepted = true; finished = true; base.onDone?.(e); },
            },
          });
        } else {
          const response = await start(client, conv.id, { stream: false });
          accepted = true;
          finished = true;
          if (!isStale()) showReply(response);
        }
      } catch (err) {
        if (isStale()) return true;
        if (isAbort(err)) return accepted;
        const code = (err as { code?: string } | null)?.code;
        const shown = friendly(err instanceof Error ? err : new Error(t("chat.error.sendFailed")));
        if (accepted && dropped(err)) {
          recoverDroppedTurn(conv.id, capturedSession, shown);
          return true;
        }
        // The server never took the turn: the transcript is as it was
        if (!accepted) {
          messagesRef.current = snapshot;
          setMessages(snapshot);
        }
        setError(shown);
        onError?.(shown);
        if (!accepted && isConflictCode(code)) {
          turnSessionRef.current = null;
          void refreshConversation(conv.id, capturedSession);
        }
        return accepted;
      } finally {
        if (turnSessionRef.current === capturedSession) turnSessionRef.current = null;
        if (!isStale()) {
          setIsStreaming(false);
          abortControllerRef.current = null;
        }
      }
      // The ids and texts on screen become the server's (an error frame ends the stream without an answer)
      if (!isStale()) await refreshConversation(conv.id, capturedSession, { follow: !finished });
      return true;
    },
    [t, has, streaming, showReply, refreshConversation, dropped, recoverDroppedTurn, onError] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const canRegenerate = typeof clientRef.current?.regenerateMessage === "function";
  const canEdit = typeof clientRef.current?.editMessage === "function";
  const canRate = typeof clientRef.current?.sendFeedback === "function";

  const regenerate = useCallback(async (): Promise<boolean> => {
    const list = messagesRef.current;
    const last = list[list.length - 1];
    if (!clientRef.current?.regenerateMessage || !last || last.role !== "assistant") return false;
    // Only the answer to a message of the person's can be asked for again
    if (!list.slice(0, -1).some((m) => m.role === "user")) return false;
    const target = last.id;
    return rerunTurn(
      (client, conversationId, opts) => {
        const model = readModel();
        const effort = readReasoningEffort();
        return client.regenerateMessage!(conversationId, target, { ...opts, ...(model ? { model } : {}), ...(effort ? { reasoningEffort: effort } : {}) });
      },
      (prev) => prev.slice(0, -1)
    );
  }, [rerunTurn, readModel, readReasoningEffort]);

  /** The server's id of a message this page numbered itself (found by position among the person's messages). */
  const serverIdOf = useCallback(
    async (messageId: string): Promise<string | undefined> => {
      if (!localUserIdsRef.current.has(messageId)) return messageId;
      const client = clientRef.current;
      const conv = conversationRef.current;
      if (!client || !conv) return undefined;
      try {
        const { messages: stored } = await client.getConversation(conv.id);
        const storedUsers = stored.filter((m) => m.role === "user");
        const shownUsers = messagesRef.current.filter((m) => m.role === "user");
        const at = shownUsers.findIndex((m) => m.id === messageId);
        if (at === -1) return undefined;
        // counted from the end: the server may page away the oldest messages
        const match = storedUsers[storedUsers.length - (shownUsers.length - at)];
        if (!match) return undefined;
        localUserIdsRef.current.delete(messageId);
        const stableId = match.id;
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, id: stableId } : m)));
        messagesRef.current = messagesRef.current.map((m) => (m.id === messageId ? { ...m, id: stableId } : m));
        return stableId;
      } catch {
        return undefined;
      }
    },
    []
  );

  const editMessage = useCallback(
    async (messageId: string, content: string): Promise<boolean> => {
      const text = content.trim();
      if (!clientRef.current?.editMessage || !text) return false;
      const shown = messagesRef.current.find((m) => m.id === messageId);
      if (!shown || shown.role !== "user") return false;
      if (turnSessionRef.current === sessionRef.current || followRef.current || isStreamingRef.current) return false;
      const id = await serverIdOf(messageId);
      if (!id) {
        const failure = friendly(new Error(t("chat.error.editUnavailable")));
        setError(failure);
        onError?.(failure);
        return false;
      }
      // Files the message carries stay with it
      const fileIds = (shown.files ?? []).filter((f) => !f.expired && !isFileExpired(f) && !f.status).map((f) => f.id);
      return rerunTurn(
        (client, conversationId, opts) => {
          const model = readModel();
          const effort = readReasoningEffort();
          return client.editMessage!(conversationId, id, { content: text, ...(fileIds.length > 0 ? { fileIds } : {}), ...(model ? { model } : {}), ...(effort ? { reasoningEffort: effort } : {}) }, opts);
        },
        (prev) => {
          const at = prev.findIndex((m) => m.id === id);
          if (at === -1) return prev;
          return [...prev.slice(0, at), { ...prev[at], content: text, updatedAt: new Date() }];
        }
      );
    },
    [rerunTurn, serverIdOf, onError, t, has] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ---------------------------------------------------------------------------
  // Feedback
  // ---------------------------------------------------------------------------

  const submitFeedback = useCallback(
    async (messageId: string, input: FeedbackInput): Promise<boolean> => {
      const client = clientRef.current;
      const conv = conversationRef.current;
      if (!client?.sendFeedback || !conv) return false;
      const target = messagesRef.current.find((m) => m.id === messageId);
      if (!target || target.role !== "assistant") return false;
      const before = readFeedback(target);
      const capturedSession = sessionRef.current;
      const optimistic: MessageFeedback | undefined = input.rating
        ? {
            rating: input.rating,
            ...(input.reasons && input.reasons.length > 0 ? { reasons: input.reasons } : {}),
            ...(input.comment ? { comment: input.comment } : {}),
          }
        : undefined;
      const show = (feedback: MessageFeedback | undefined) =>
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const { feedback: _old, ...rest } = m;
            return feedback ? { ...rest, feedback } : rest;
          })
        );
      show(optimistic);
      try {
        const stored = await client.sendFeedback(conv.id, messageId, input);
        if (sessionRef.current !== capturedSession) return true;
        // what the server kept (it may trim the comment) wins over the optimistic copy
        const kept = input.rating ? normalizeFeedback(stored) ?? optimistic : undefined;
        if (kept && kept !== optimistic) show(kept);
        onFeedbackRef.current?.({ conversationId: conv.id, messageId, feedback: kept ?? null });
        return true;
      } catch (err) {
        if (sessionRef.current !== capturedSession) return false;
        show(before);
        const shown = friendly(err instanceof Error ? err : new Error(t("chat.error.feedbackFailed")));
        setError(shown);
        onError?.(shown);
        return false;
      }
    },
    [t, has, onError] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ---------------------------------------------------------------------------
  // Tools of the host page (embedded chat)
  // ---------------------------------------------------------------------------

  const clientToolEntries = useMemo(
    () =>
      onClientToolCall
        ? collectPendingActions(messages, { includeClientTools: true }).filter((e) => e.action.type === "client_tool")
        : [],
    [messages, Boolean(onClientToolCall)] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [toolTick, setToolTick] = useState(0);
  const resolveActionRef = useRef(resolveAction);
  resolveActionRef.current = resolveAction;

  useEffect(() => {
    if (isFollowing) return;
    const due = clientToolEntries.filter(
      ({ action, state }) =>
        action.type === "client_tool" && (!state || state.status === "pending") && !dispatchedToolsRef.current.has(action.id)
    );
    if (due.length === 0) return;
    // The turn that paused for the tool is still winding down: the answer would meet its lease
    if (turnSessionRef.current !== null) {
      const timer = setTimeout(() => setToolTick((tick) => tick + 1), 25);
      return () => clearTimeout(timer);
    }
    for (const { action } of due) {
      if (action.type !== "client_tool") continue;
      dispatchedToolsRef.current.add(action.id);
      const session = sessionRef.current;
      void (async () => {
        const handler = onClientToolCallRef.current;
        if (!handler) return;
        const failure = (message: string): ActionResolution => ({ type: "client_tool", error: message, output: { error: message } });
        let resolution: ActionResolution;
        try {
          const result = await handler({
            actionId: action.id,
            ...(action.toolCallId ? { toolCallId: action.toolCallId } : {}),
            name: action.toolName,
            args: action.args ?? {},
            ...(action.timeoutSeconds ? { timeoutSeconds: action.timeoutSeconds } : {}),
          });
          resolution = result.ok ? { type: "client_tool", output: result.output } : failure(result.error);
        } catch (err) {
          resolution = failure(err instanceof Error && err.message ? err.message : "The host page could not run the tool");
        }
        // The answer can meet a server that is still letting go of the paused turn: a short second and third try
        for (let attempt = 0; attempt < 3; attempt++) {
          // The person moved to another conversation meanwhile: the server's own deadline settles it
          if (sessionRef.current !== session) return;
          if (await resolveActionRef.current(action.id, resolution)) return;
          const entry = collectPendingActions(messagesRef.current, { includeClientTools: true }).find((e) => e.action.id === action.id);
          if (!entry || (entry.state && entry.state.status !== "pending")) return;
          await sleep(400 * (attempt + 1));
        }
      })();
    }
  }, [clientToolEntries, isFollowing, toolTick]);

  // ---------------------------------------------------------------------------
  // Stop, clear, retry
  // ---------------------------------------------------------------------------

  const clearMessages = useCallback(() => {
    resetStreamingState();
    releasePreviews();
    releaseFileUrls();
    discardStoredFiles();
    sessionRef.current += 1;
    setMessages([]);
    setConversation(null);
    setFileList(null);
    setEarlier(false);
    setError(null);
    setPendingFiles([]);
    rawFilesRef.current.clear();
    lastUserMessageRef.current = "";
  }, [resetStreamingState, releasePreviews, releaseFileUrls, discardStoredFiles, setEarlier]);

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

  // The conversation ends on the person's own message, and the run that was working on it was cut off
  const interrupted =
    !isStreaming && !isFollowing && !isLoadingConversation && isInterruptedTurn(messages, conversation?.runtime);

  const retryInterrupted = useCallback(async (): Promise<boolean> => {
    const last = messagesRef.current[messagesRef.current.length - 1];
    if (!last || last.role !== "user" || isStreamingRef.current || followRef.current) return false;
    // The files it carried are stored in the conversation already; the ones the server dropped are not offered again
    const files = (last.files ?? []).filter((f) => !f.expired && !isFileExpired(f) && !f.status);
    const text = messageText(last.content);
    if (!text.trim() && files.length === 0) return false;
    return sendMessage(text, { reuseFiles: files });
  }, [sendMessage]);

  /** Tell the server to stop the run. Quiet when the route is missing (an older server); anything else is shown. */
  const cancelOnServer = useCallback(
    async (conversationId: string, session: number, thenRefresh: boolean): Promise<CancelResult | undefined> => {
      const client = clientRef.current;
      if (!client?.cancel) return undefined;
      let outcome: CancelResult | undefined;
      try {
        const result = await client.cancel(conversationId);
        if (sessionRef.current !== session) return result;
        outcome = result;
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
      return outcome;
    },
    [t, has, onError, refreshConversation] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const stop = useCallback(() => {
    const conv = conversationRef.current;
    const session = sessionRef.current;
    const canCancel = Boolean(clientRef.current?.cancel && conv);

    // Watching a turn that runs elsewhere: stopping it is the server's job; the follower then sees it end
    if (followRef.current) {
      if (canCancel && conv) {
        void cancelOnServer(conv.id, session, false).then((result) => {
          // Nothing was running to stop: the turn being watched is over already, so watching it any
          // longer would show nothing new. Look at what the server holds instead.
          if (result && !result.cancelled && sessionRef.current === session && followRef.current) {
            stopFollowing();
            void refreshConversation(conv.id, session, { follow: false });
          }
        });
      } else stopFollowing();
      if (!canCancel) {
        setIsStreaming(false);
        streamingTextRef.current = "";
        setStreamingText("");
        clearStreamingReasoning();
        activeToolCallsRef.current = new Map();
        setActiveToolCalls(new Map());
      }
      return;
    }

    // Files of the message being sent stop going up
    const uploading = sendUploadRef.current;
    uploading?.abort();
    // The server stops the run (this page's connection is closed too, right below). While the files
    // are still going up the message has not been sent: there is no run of it to stop, and a stop
    // request would end whatever else the conversation is waiting on.
    if (canCancel && conv && !uploading) void cancelOnServer(conv.id, session, true);

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
        ...(streamingReasoningRef.current ? { reasoning: streamingReasoningRef.current } : {}),
        status: "cancelled",
        stopReason: "cancelled",
        // `localOnly`: this page numbered it itself, so there is no stored answer to rate or run again yet
        metadata: {
          localOnly: true,
          ...(toolCalls.size > 0
            ? {
                toolCallDetails: Array.from(toolCalls.entries()).map(([id, call]) => ({
                  id, name: call.name, args: call.args, result: call.result,
                })),
              }
            : {}),
        },
        createdAt: at,
        updatedAt: at,
      };
      setMessages((prev) => [...prev, partialMessage]);
    }
    streamingTextRef.current = "";
    setStreamingText("");
    clearStreamingReasoning();
    activeToolCallsRef.current = new Map();
    toolCallStartTimeRef.current = null;
    setActiveToolCalls(new Map());
    setProgressMessage("");
    setIsStreaming(false);
  }, [cancelOnServer, stopFollowing, refreshConversation]);

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

  // The agent waits for the host page's answer to a tool call: the chat is working, not idle
  const hostToolBusy = clientToolEntries.length > 0 && !isFollowing;

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
    isLoading: isStreaming || hostToolBusy || isLoadingConversation,
    isStreaming: isStreaming || hostToolBusy,
    isLoadingConversation,
    isFollowing,
    streamingText,
    streamingReasoning,
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
    interrupted,
    retryInterrupted,
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
    canRegenerate,
    canEdit,
    canRate,
    regenerate,
    editMessage,
    submitFeedback,
    heldFiles,
    heldFilesMax: fileList?.max,
    hasEarlierMessages,
    isLoadingEarlierMessages,
    loadEarlierMessages,
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
