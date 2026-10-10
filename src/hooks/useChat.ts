"use client";

import { useState, useCallback, useRef, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import {
  actionDeadline,
  generateId,
  isConflictCode,
  isImageType,
  keepSettledDetail,
  localizeError,
  normalizeActions,
  collectPendingActions,
  singleFreeTextQuestion,
  restorePendingActions,
  setActionStates,
  stateForResolution,
  stateForSpentAction,
  formatFileSize,
  type PendingActionEntry,
} from "../utils";
import type {
  Message,
  FileAttachment,
  ChatConfig,
  ChatCallbacks,
  Conversation,
  PendingAction,
  ActionResolution,
  ActionState,
  StreamEvent,
  UserQuestion,
} from "../types";
import { AgentServerClient, type ChatTransport, type StreamCallbacks } from "../api";
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
}

export interface UseChatReturn {
  /** Current messages */
  messages: Message[];
  /** Current conversation */
  conversation: Conversation | null;
  /** Whether a message is being sent/streamed (backwards compat: isStreaming || isLoadingConversation) */
  isLoading: boolean;
  /** Whether the AI is currently generating a response */
  isStreaming: boolean;
  /** Whether a conversation is being loaded */
  isLoadingConversation: boolean;
  /** Current streaming text */
  streamingText: string;
  /** Current progress message (from stream.progress events) */
  progressMessage: string;
  /** Current error */
  error: Error | null;
  /** Pending files for next message */
  pendingFiles: FileAttachment[];
  /** True while the pending files are being read or uploaded for a message that is being sent */
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
  /** Remove a pending file */
  removeFile: (fileId: string) => void;
  /** Clear all messages */
  clearMessages: () => void;
  /** Load a conversation */
  loadConversation: (conversationId: string) => Promise<void>;
  /** Create a new conversation */
  createConversation: (title?: string) => Promise<Conversation>;
  /** Retry the last message */
  retry: () => Promise<void>;
  /** Stop the current stream */
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
    fileTransport = "inline",
    conversationId: initialConversationId,
    initialMessages = [],
    pendingActionComposerMode = "block",
    attachmentsOnlyMessage,
    actionExpiryRefreshMs = 1500,
    onMessageSent,
    onMessageReceived,
    onStreamText,
    onToolCall,
    onToolResult,
    onError,
    onConversationCreated,
    onConversationTitleGenerated,
    onBackgroundStreamCompleted,
    onActionResolved,
  } = options;

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [pendingFiles, setPendingFiles] = useState<FileAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [activeToolCalls, setActiveToolCalls] = useState<
    Map<string, { name: string; args: Record<string, unknown>; result?: unknown; reasoning?: string; displayName?: string }>
  >(new Map());
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [isResolvingAction, setIsResolvingAction] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>("");
  const clientRef = useRef<ChatTransport | null>(null);
  const activeToolCallsRef = useRef<Map<string, { name: string; args: Record<string, unknown>; result?: unknown; reasoning?: string; displayName?: string }>>(new Map());
  const toolCallStartTimeRef = useRef<number | null>(null);
  // Map file attachment IDs to raw File objects so we can read base64 later
  const rawFilesRef = useRef<Map<string, File>>(new Map());
  // Object URLs made for image previews; released when the conversation is left or the hook unmounts
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const releasePreviews = useCallback(() => {
    for (const url of previewUrlsRef.current) revokePreviewUrl(url);
    previewUrlsRef.current.clear();
  }, []);
  useEffect(() => releasePreviews, [releasePreviews]);

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

  /**
   * Reset transient streaming UI state without aborting the HTTP request.
   * The in-flight stream continues in the background so the server can
   * finish processing and persist the assistant message. The `isStale()`
   * guards inside `sendMessage` callbacks prevent the old stream from
   * polluting the new session's state.
   */
  const resetStreamingState = useCallback(() => {
    setStreamingText("");
    activeToolCallsRef.current = new Map();
    toolCallStartTimeRef.current = null;
    setActiveToolCalls(new Map());
    setProgressMessage("");
    setIsStreaming(false);
  }, []);

  // Load initial conversation if provided
  useEffect(() => {
    if (initialConversationId && clientRef.current) {
      loadConversation(initialConversationId);
    }
  }, [initialConversationId]);

  const loadConversation = useCallback(async (conversationId: string) => {
    if (!clientRef.current) return;

    // Detach from any in-flight stream (don't abort — let it complete in
    // the background so the server persists the response). Session counter
    // invalidates all stale callbacks.
    resetStreamingState();
    releasePreviews();
    sessionRef.current += 1;
    const capturedSession = sessionRef.current;

    try {
      setIsLoadingConversation(true);
      setMessages([]);
      setConversation(null);
      setError(null);
      const data = await clientRef.current.getConversation(conversationId);
      // If user navigated away while we were loading, discard the result
      if (sessionRef.current !== capturedSession) return;
      setConversation(data.conversation);
      setMessages(
        restorePendingActions(
          data.messages,
          data.pendingActions ?? data.conversation?.pendingActions
        )
      );
    } catch (err) {
      if (sessionRef.current !== capturedSession) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const error = friendly(err instanceof Error ? err : new Error(t("chat.error.loadConversationFailed")));
      setError(error);
      onError?.(error);
    } finally {
      if (sessionRef.current === capturedSession) {
        setIsLoadingConversation(false);
      }
    }
  }, [t, has, onError, resetStreamingState, releasePreviews]);

  /**
   * Fetches the conversation again and shows what the server says: used when a send was
   * refused because a card is waiting or a turn is running (the page did not know), and
   * after a card's deadline. Quiet on failure: the error that led here is already shown.
   */
  const refreshConversation = useCallback(async (conversationId: string, session: number) => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const data = await client.getConversation(conversationId);
      if (sessionRef.current !== session) return;
      setConversation(data.conversation);
      setMessages((prev) =>
        keepSettledDetail(
          restorePendingActions(data.messages, data.pendingActions ?? data.conversation?.pendingActions),
          prev
        )
      );
    } catch {
      // the banner already says what went wrong
    }
  }, []);

  const createConversation = useCallback(async (title?: string, overrideAgentId?: string): Promise<Conversation> => {
    if (!clientRef.current) {
      throw new Error(t("chat.error.clientNotInitialized"));
    }

    const conv = await clientRef.current.createConversation({
      agentId: overrideAgentId || agentId || "",
      title,
    });
    setConversation(conv);
    setMessages([]);
    onConversationCreated?.(conv);
    return conv;
  }, [t, agentId, onConversationCreated]);

  // Handlers shared by sendMessage and resolveAction: both stream a turn into the
  // transcript. Kept in a ref so they always see the latest callback props.
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
                  metadata: currentToolCalls.size > 0
                    ? {
                        toolCallDetails: Array.from(currentToolCalls.entries()).map(([id, call]) => ({
                          id,
                          name: call.name,
                          args: call.args,
                          result: call.result,
                        })),
                        toolCallDurationSeconds,
                      }
                    : undefined,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
                // Clear streaming first, then add message
                setStreamingText("");
                activeToolCallsRef.current = new Map();
                toolCallStartTimeRef.current = null;
                setActiveToolCalls(new Map());
                setProgressMessage("");
                setIsStreaming(false);
                // Update conversation title if server generated one
                if (event.title) {
                  setConversation((prev) => prev ? { ...prev, title: event.title } : prev);
                  onConversationTitleGenerated?.(event.conversationId, event.title);
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

  const sendMessage = useCallback(async (typed: string): Promise<boolean> => {
    // Files alone are a message: they go with the configured text (a server rejects an empty one)
    const attachmentsOnly = !typed.trim() && pendingFiles.length > 0;
    if (!clientRef.current || (!typed.trim() && !attachmentsOnly)) return false;
    const content = attachmentsOnly ? (attachmentsOnlyMessage ?? t("chat.input.attachmentsOnlyMessage")) : typed;

    // Capture the current session so async callbacks can detect staleness
    const capturedSession = sessionRef.current;
    const isStale = () => sessionRef.current !== capturedSession;

    setError(null);
    setIsStreaming(true);
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
    // A refused send takes its bubble back and returns the files to the composer
    const attached = pendingFiles;
    const attachedRaw = attached.map((f) => [f.id, rawFilesRef.current.get(f.id)] as const);
    let optimisticId: string | undefined;
    let activeConversationId = conversation?.id;

    try {
      // Create conversation if needed
      let currentConversation = conversation;
      if (!currentConversation) {
        currentConversation = await createConversation();
        activeConversationId = currentConversation.id;
        // User navigated while we were creating the conversation
        if (isStale()) {
          setConversation(null);
          return true;
        }
      }

      // Read base64 content from raw File objects for each pending file
      const readBase64 = (rawFile: File) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            // result is "data:<mime>;base64,<data>" — extract just the base64 part
            const result = reader.result as string;
            const commaIdx = result.indexOf(",");
            resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(rawFile);
        });

      const filesToSend: Array<{ name: string; content: string; mimeType: string }> = [];
      // Upload mode: the files are stored first and the message carries their ids
      const uploader = fileTransport === "upload" ? clientRef.current : null;
      if (pendingFiles.length > 0) setIsUploading(true);
      try {
        if (uploader?.uploadFile) {
          try {
            for (const f of pendingFiles) {
              const rawFile = rawFilesRef.current.get(f.id);
              if (!rawFile) continue;
              const stored = await uploader.uploadFile({
                file: { name: f.name, content: await readBase64(rawFile), mimeType: f.mimeType },
                conversationId: currentConversation.id,
              });
              uploadedIds.push(stored.id);
            }
          } catch (uploadError) {
            // Nothing was sent: drop what already reached the server and keep the files for another try
            await Promise.all(uploadedIds.map((id) => uploader.deleteFile?.(id).catch(() => undefined)));
            throw uploadError;
          }
        } else {
          for (const f of pendingFiles) {
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
        setIsUploading(false);
      }

      // Clean up raw file references
      for (const f of pendingFiles) {
        rawFilesRef.current.delete(f.id);
      }

      // If user navigated away while we were reading files, bail out
      if (isStale()) return true;

      // Create optimistic user message
      const userMessage: Message = {
        id: generateId(),
        conversationId: currentConversation.id,
        role: "user",
        content,
        files: pendingFiles.length > 0 ? pendingFiles : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      optimisticId = userMessage.id;
      setMessages((prev) => [...prev, userMessage]);
      setPendingFiles([]);
      onMessageSent?.(userMessage);

      if (streaming) {
        // Streaming mode
        setStreamingText("");
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
      return true;
    } catch (err) {
      if (!messageAccepted && uploadedIds.length > 0) {
        const client = clientRef.current;
        await Promise.all(uploadedIds.map((id) => client?.deleteFile?.(id).catch(() => undefined)));
      }
      // Ignore stale sessions (user navigated away) and abort errors (user stopped)
      if (isStale()) return true;
      if (err instanceof DOMException && err.name === 'AbortError') return true;
      const error = friendly(err instanceof Error ? err : new Error(t("chat.error.sendFailed")));
      if (!messageAccepted && optimisticId) {
        const sentId = optimisticId;
        setMessages((prev) => prev.filter((m) => m.id !== sentId));
        for (const [id, raw] of attachedRaw) if (raw) rawFilesRef.current.set(id, raw);
        setPendingFiles((prev) => [...attached, ...prev.filter((f) => !attached.some((a) => a.id === f.id))]);
      }
      setError(error);
      onError?.(error);
      // A card is waiting or a turn is running that this page did not know about: show it
      if (!messageAccepted && isConflictCode((err as { code?: string } | null)?.code) && activeConversationId) {
        void refreshConversation(activeConversationId, capturedSession);
      }
      // Once the server started answering, the message is spent even if the stream broke later
      return messageAccepted;
    } finally {
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
    pendingFiles,
    fileTransport,
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
    patch({ status: "resolving", resolution });
    setIsResolvingAction(true);
    setIsStreaming(true);
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
        if (!isStale() && response?.response) {
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
            const message = { ...reply, pendingActions: fresh.length > 0 ? fresh : undefined };
            setMessages((prev) => [...prev, message]);
            onMessageReceived?.(message);
          }
        }
      }
      if (isStale()) return true;
      patch(stateForResolution(resolution));
      onActionResolved?.({ conversationId, actionId, action: entry.action, resolution });
      return true;
    } catch (err) {
      if (isStale()) return true;
      if (err instanceof DOMException && err.name === "AbortError") {
        patch(accepted ? stateForResolution(resolution) : { status: "pending" });
        return accepted;
      }
      const error = friendly(err instanceof Error ? err : new Error(t("chat.error.sendFailed")));
      const code = (err as { code?: string } | null)?.code;
      // Spent on the server's side (answered elsewhere, expired, cancelled): stop offering it,
      // which also frees the composer
      patch(stateForSpentAction(code) ?? (accepted ? stateForResolution(resolution) : { status: "pending" }));
      setError(error);
      onError?.(error);
      // The turn is busy elsewhere: show where it stands
      if (!accepted && isConflictCode(code)) void refreshConversation(conversationId, capturedSession);
      return accepted;
    } finally {
      if (!isStale()) {
        setIsStreaming(false);
        setIsResolvingAction(false);
        abortControllerRef.current = null;
      }
    }
  }, [t, has, conversation, streaming, refreshConversation, onMessageReceived, onActionResolved, onError]);

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

    for (const file of files) {
      // Check file count
      if (pendingFiles.length + validFiles.length >= maxFiles) {
        refuse(t("chat.file.tooMany", { maxFiles }));
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

      // Check file type
      if (allowedFileTypes && allowedFileTypes.length > 0) {
        const isAllowed = allowedFileTypes.some((type) =>
          // `image/*` matches by media-type prefix; `.pdf` / `application/pdf` as before
          type.endsWith("/*")
            ? file.type.startsWith(type.slice(0, -1))
            : file.type === type || file.name.endsWith(type.replace("*", ""))
        );
        if (!isAllowed) {
          refuse(t("chat.file.invalidType", { fileType: file.type || file.name }));
          continue;
        }
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
        mimeType: file.type,
        size: file.size,
        ...(previewUrl ? { previewUrl } : {}),
      });
    }

    if (refusals.length > 0) {
      setError(refusals.length === 1 ? refusals[0] : new Error(refusals.map((e) => e.message).join("; ")));
    }
    setPendingFiles((prev) => [...prev, ...validFiles]);
  }, [t, enableFileUpload, pendingFiles, maxFiles, maxFileSize, allowedFileTypes, onError]);

  const removeFile = useCallback((fileId: string) => {
    rawFilesRef.current.delete(fileId);
    const removed = pendingFilesRef.current.find((f) => f.id === fileId);
    if (removed?.previewUrl) {
      revokePreviewUrl(removed.previewUrl);
      previewUrlsRef.current.delete(removed.previewUrl);
    }
    setPendingFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const clearMessages = useCallback(() => {
    resetStreamingState();
    releasePreviews();
    sessionRef.current += 1;
    setMessages([]);
    setConversation(null);
    setError(null);
    setPendingFiles([]);
    rawFilesRef.current.clear();
    lastUserMessageRef.current = "";
  }, [resetStreamingState, releasePreviews]);

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

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Save any partial streaming text as a message
    setStreamingText((currentText) => {
      if (currentText) {
        const partialMessage: Message = {
          id: generateId(),
          conversationId: conversation?.id || "",
          role: "assistant",
          content: currentText,
          metadata: activeToolCallsRef.current.size > 0
            ? {
                toolCallDetails: Array.from(activeToolCallsRef.current.entries()).map(([id, call]) => ({
                  id, name: call.name, args: call.args, result: call.result,
                })),
              }
            : undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setMessages((prev) => [...prev, partialMessage]);
      }
      return "";
    });
    activeToolCallsRef.current = new Map();
    toolCallStartTimeRef.current = null;
    setActiveToolCalls(new Map());
    setProgressMessage("");
    setIsStreaming(false);
  }, [conversation]);

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

  return {
    messages,
    conversation,
    isLoading: isStreaming || isLoadingConversation,
    isStreaming,
    isLoadingConversation,
    streamingText,
    progressMessage,
    error,
    pendingFiles,
    isUploading,
    activeToolCalls,
    sendMessage,
    addFiles,
    removeFile,
    clearMessages,
    loadConversation,
    createConversation,
    retry,
    stop,
    pendingActions,
    awaitingAction: pendingActions.length > 0 && !isLoadingConversation,
    isResolvingAction,
    canResolveActions,
    answerableQuestion: answerable ? { actionId: answerable.action.id, question: answerable.question } : null,
    resolveAction,
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
