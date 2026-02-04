"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
  /** Whether a message is being sent/streamed */
  isLoading: boolean;
  /** Current streaming text */
  streamingText: string;
  /** Current error */
  error: Error | null;
  /** Pending files for next message */
  pendingFiles: FileAttachment[];
  /** Active tool calls */
  activeToolCalls: Map<string, { name: string; args: Record<string, unknown>; result?: unknown }>;
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
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [pendingFiles, setPendingFiles] = useState<FileAttachment[]>([]);
  const [activeToolCalls, setActiveToolCalls] = useState<
    Map<string, { name: string; args: Record<string, unknown>; result?: unknown }>
  >(new Map());

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>("");
  const clientRef = useRef<AgentServerClient | null>(null);

  // Initialize API client
  useEffect(() => {
    clientRef.current = new AgentServerClient({
      baseUrl,
      agentId,
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
      setIsLoading(true);
      setError(null);
      const data = await clientRef.current.getConversation(conversationId);
      setConversation(data.conversation);
      setMessages(data.messages);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to load conversation");
      setError(error);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  const createConversation = useCallback(async (title?: string): Promise<Conversation> => {
    if (!clientRef.current) {
      throw new Error("API client not initialized");
    }

    const conv = await clientRef.current.createConversation({
      agentId,
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
    setIsLoading(true);
    lastUserMessageRef.current = content;

    try {
      // Create conversation if needed
      let currentConversation = conversation;
      if (!currentConversation) {
        currentConversation = await createConversation();
      }

      // Prepare files for upload
      const filesToSend = pendingFiles.map((f) => ({
        name: f.name,
        content: "", // Would be base64 encoded
        mimeType: f.mimeType,
      }));

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
              flushSync(() => {
                setStreamingText(fullText);
              });
              onStreamText?.(text, fullText);
            },
            onToolCall: (event) => {
              if (event.type === "stream.tool_call") {
                setActiveToolCalls((prev) => {
                  const next = new Map(prev);
                  next.set(event.toolCallId, {
                    name: event.toolName,
                    args: event.args,
                  });
                  return next;
                });
                onToolCall?.(event.toolName, event.args);
              }
            },
            onToolResult: (event) => {
              if (event.type === "stream.tool_result") {
                setActiveToolCalls((prev) => {
                  const next = new Map(prev);
                  const existing = next.get(event.toolCallId);
                  if (existing) {
                    next.set(event.toolCallId, { ...existing, result: event.result });
                  }
                  return next;
                });
                onToolResult?.(event.toolName, event.result);
              }
            },
            onError: (err) => {
              setError(err);
              setIsLoading(false);
              onError?.(err);
            },
            onDone: (event) => {
              if (event.type === "stream.done") {
                const assistantMessage: Message = {
                  id: event.messageId,
                  conversationId: event.conversationId,
                  role: "assistant",
                  content: event.content,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
                // Clear streaming first, then add message
                setStreamingText("");
                setActiveToolCalls(new Map());
                setIsLoading(false);
                setMessages((prev) => [...prev, assistantMessage]);
                onMessageReceived?.(assistantMessage);
              }
            },
          }
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
      setIsLoading(false);
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

      validFiles.push({
        id: generateId(),
        name: file.name,
        mimeType: file.type,
        size: file.size,
      });
    }

    setPendingFiles((prev) => [...prev, ...validFiles]);
  }, [enableFileUpload, pendingFiles, maxFiles, maxFileSize, allowedFileTypes, onError]);

  const removeFile = useCallback((fileId: string) => {
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
    setIsLoading(false);
  }, []);

  return {
    messages,
    conversation,
    isLoading,
    streamingText,
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
  };
}
