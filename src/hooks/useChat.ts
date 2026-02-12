"use client";

import { useState, useCallback, useRef, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import { generateId } from "../utils";
import type { Message, FileAttachment, ChatConfig, ChatCallbacks, Conversation } from "../types";
import { AgentServerClient } from "../api";

export interface UseChatOptions extends ChatConfig, ChatCallbacks {
  /** Initial conversation ID */
  conversationId?: string;
  /** Initial messages */
  initialMessages?: Message[];
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
  /** Active tool calls */
  activeToolCalls: Map<string, { name: string; args: Record<string, unknown>; result?: unknown; reasoning?: string; displayName?: string }>;
  /** Send a message */
  sendMessage: (content: string) => Promise<void>;
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

/**
 * Hook for managing chat state and interactions
 */
export function useChat(options: UseChatOptions): UseChatReturn {
  const {
    baseUrl,
    agentId,
    authorization,
    headers,
    streaming = true,
    enableFileUpload = true,
    allowedFileTypes,
    maxFileSize = 10 * 1024 * 1024, // 10MB
    maxFiles = 10,
    conversationId: initialConversationId,
    initialMessages = [],
    onMessageSent,
    onMessageReceived,
    onStreamText,
    onToolCall,
    onToolResult,
    onError,
    onConversationCreated,
  } = options;

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [pendingFiles, setPendingFiles] = useState<FileAttachment[]>([]);
  const [activeToolCalls, setActiveToolCalls] = useState<
    Map<string, { name: string; args: Record<string, unknown>; result?: unknown; reasoning?: string; displayName?: string }>
  >(new Map());
  const [progressMessage, setProgressMessage] = useState<string>("");

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>("");
  const clientRef = useRef<AgentServerClient | null>(null);
  const activeToolCallsRef = useRef<Map<string, { name: string; args: Record<string, unknown>; result?: unknown; reasoning?: string; displayName?: string }>>(new Map());
  const toolCallStartTimeRef = useRef<number | null>(null);
  // Map file attachment IDs to raw File objects so we can read base64 later
  const rawFilesRef = useRef<Map<string, File>>(new Map());

  // Keep a stable client reference that updates synchronously when config changes
  useMemo(() => {
    clientRef.current = new AgentServerClient({
      baseUrl,
      agentId: agentId || "",
      authorization,
      headers,
    });
  }, [baseUrl, agentId, authorization, headers]);

  // Load initial conversation if provided
  useEffect(() => {
    if (initialConversationId && clientRef.current) {
      loadConversation(initialConversationId);
    }
  }, [initialConversationId]);

  const loadConversation = useCallback(async (conversationId: string) => {
    if (!clientRef.current) return;

    try {
      setIsLoadingConversation(true);
      setError(null);
      const data = await clientRef.current.getConversation(conversationId);
      setConversation(data.conversation);
      setMessages(data.messages);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to load conversation");
      setError(error);
      onError?.(error);
    } finally {
      setIsLoadingConversation(false);
    }
  }, [onError]);

  const createConversation = useCallback(async (title?: string, overrideAgentId?: string): Promise<Conversation> => {
    if (!clientRef.current) {
      throw new Error("API client not initialized");
    }

    const conv = await clientRef.current.createConversation({
      agentId: overrideAgentId || agentId || "",
      title,
    });
    setConversation(conv);
    setMessages([]);
    onConversationCreated?.(conv);
    return conv;
  }, [agentId, onConversationCreated]);

  const sendMessage = useCallback(async (content: string) => {
    if (!clientRef.current || !content.trim()) return;

    setError(null);
    setIsStreaming(true);
    lastUserMessageRef.current = content;

    try {
      // Create conversation if needed
      let currentConversation = conversation;
      if (!currentConversation) {
        currentConversation = await createConversation();
      }

      // Read base64 content from raw File objects for each pending file
      const filesToSend: Array<{ name: string; content: string; mimeType: string }> = [];
      for (const f of pendingFiles) {
        const rawFile = rawFilesRef.current.get(f.id);
        if (rawFile) {
          const base64 = await new Promise<string>((resolve, reject) => {
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
          filesToSend.push({
            name: f.name,
            content: base64,
            mimeType: f.mimeType,
          });
        }
      }

      // Clean up raw file references
      for (const f of pendingFiles) {
        rawFilesRef.current.delete(f.id);
      }

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
          },
          {
            onStart: () => {
              // Stream started
            },
            onText: (text, fullText) => {
              // Use flushSync to force immediate render during streaming
              setProgressMessage(""); // Clear progress when text arrives
              flushSync(() => {
                setStreamingText(fullText);
              });
              onStreamText?.(text, fullText);
            },
            onProgress: (event) => {
              if (event.type === "stream.progress") {
                setProgressMessage((event as any).message || "");
              }
            },
            onToolCall: (event) => {
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
              setError(err);
              setIsStreaming(false);
              onError?.(err);
            },
            onDone: (event) => {
              if (event.type === "stream.done") {
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

                const assistantMessage: Message = {
                  id: event.messageId,
                  conversationId: event.conversationId,
                  role: "assistant",
                  content: event.content,
                  citations: event.citations,
                  toolCalls: toolCallsForMessage,
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
                setMessages((prev) => [...prev, assistantMessage]);
                onMessageReceived?.(assistantMessage);
              }
            },
          },
          abortController.signal
        );
      } else {
        // Non-streaming mode
        const response = await clientRef.current.sendMessage(currentConversation.id, {
          message: content,
          files: filesToSend.length > 0 ? filesToSend : undefined,
          stream: false,
        });

        setMessages((prev) => {
          // Replace optimistic user message with actual
          const filtered = prev.filter((m) => m.id !== userMessage.id);
          return [...filtered, response.message, response.response];
        });
        onMessageReceived?.(response.response);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to send message");
      setError(error);
      onError?.(error);
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [
    conversation,
    createConversation,
    pendingFiles,
    streaming,
    onMessageSent,
    onMessageReceived,
    onStreamText,
    onToolCall,
    onToolResult,
    onError,
  ]);

  const addFiles = useCallback(async (files: File[]) => {
    if (!enableFileUpload) return;

    const validFiles: FileAttachment[] = [];

    for (const file of files) {
      // Check file count
      if (pendingFiles.length + validFiles.length >= maxFiles) {
        onError?.(new Error(`Maximum ${maxFiles} files allowed`));
        break;
      }

      // Check file size
      if (file.size > maxFileSize) {
        onError?.(new Error(`File ${file.name} exceeds maximum size`));
        continue;
      }

      // Check file type
      if (allowedFileTypes && allowedFileTypes.length > 0) {
        const isAllowed = allowedFileTypes.some(
          (type) => file.type === type || file.name.endsWith(type.replace("*", ""))
        );
        if (!isAllowed) {
          onError?.(new Error(`File type ${file.type} not allowed`));
          continue;
        }
      }

      const fileId = generateId();

      // Store raw File object so sendMessage can read base64 later
      rawFilesRef.current.set(fileId, file);

      validFiles.push({
        id: fileId,
        name: file.name,
        mimeType: file.type,
        size: file.size,
      });
    }

    setPendingFiles((prev) => [...prev, ...validFiles]);
  }, [enableFileUpload, pendingFiles, maxFiles, maxFileSize, allowedFileTypes, onError]);

  const removeFile = useCallback((fileId: string) => {
    rawFilesRef.current.delete(fileId);
    setPendingFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setConversation(null);
    setError(null);
  }, []);

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
    activeToolCalls,
    sendMessage,
    addFiles,
    removeFile,
    clearMessages,
    loadConversation,
    createConversation,
    retry,
    stop,
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
