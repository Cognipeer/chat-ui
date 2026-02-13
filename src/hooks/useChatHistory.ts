"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { ConversationListItem, ChatConfig } from "../types";
import { AgentServerClient } from "../api";
import { useI18n } from "./useI18n";

export interface UseChatHistoryOptions extends Pick<ChatConfig, "baseUrl" | "agentId" | "authorization" | "headers"> {
  /** Enable auto-loading on mount */
  autoLoad?: boolean;
  /** Items per page */
  pageSize?: number;
}

export interface UseChatHistoryReturn {
  /** Conversation list */
  conversations: ConversationListItem[];
  /** Whether loading */
  isLoading: boolean;
  /** Error if any */
  error: Error | null;
  /** Has more items */
  hasMore: boolean;
  /** Load conversations */
  load: () => Promise<void>;
  /** Load more conversations */
  loadMore: () => Promise<void>;
  /** Refresh the list */
  refresh: () => Promise<void>;
  /** Delete a conversation */
  deleteConversation: (id: string) => Promise<void>;
}

/**
 * Hook for managing chat history
 */
export function useChatHistory(options: UseChatHistoryOptions): UseChatHistoryReturn {
  const { t } = useI18n();
  const {
    baseUrl,
    agentId,
    authorization,
    headers,
    autoLoad = true,
    pageSize = 20,
  } = options;

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  // Keep a stable client reference that updates when config changes
  const clientRef = useRef<AgentServerClient | null>(null);
  useMemo(() => {
    clientRef.current = new AgentServerClient({
      baseUrl,
      agentId: agentId || "",
      authorization,
      headers,
    });
  }, [baseUrl, agentId, authorization, headers]);

  const load = useCallback(async () => {
    if (!clientRef.current) return;
    try {
      setIsLoading(true);
      setError(null);
      // When agentId is undefined/empty, don't filter — return all conversations
      const params: { agentId?: string; limit: number; offset: number } = {
        limit: pageSize,
        offset: 0,
      };
      if (agentId) params.agentId = agentId;
      const response = await clientRef.current.getConversations(params);
      setConversations(response.conversations);
      setHasMore(response.hasMore);
      setOffset(pageSize);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(t("chat.error.loadConversationsFailed")));
    } finally {
      setIsLoading(false);
    }
  }, [t, agentId, pageSize]);

  const loadMore = useCallback(async () => {
    if (!clientRef.current || isLoading || !hasMore) return;

    try {
      setIsLoading(true);
      const params: { agentId?: string; limit: number; offset: number } = {
        limit: pageSize,
        offset,
      };
      if (agentId) params.agentId = agentId;
      const response = await clientRef.current.getConversations(params);
      setConversations((prev) => [...prev, ...response.conversations]);
      setHasMore(response.hasMore);
      setOffset((prev) => prev + pageSize);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(t("chat.error.loadMoreFailed")));
    } finally {
      setIsLoading(false);
    }
  }, [t, agentId, pageSize, offset, isLoading, hasMore]);

  const refresh = useCallback(async () => {
    setOffset(0);
    await load();
  }, [load]);

  const deleteConversation = useCallback(async (id: string) => {
    if (!clientRef.current) return;
    try {
      await clientRef.current.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(t("chat.error.deleteConversationFailed")));
    }
  }, [t]);

  // Auto-load on mount and whenever agentId changes
  useEffect(() => {
    if (autoLoad) {
      load();
    }
  }, [autoLoad, load]);

  return {
    conversations,
    isLoading,
    error,
    hasMore,
    load,
    loadMore,
    refresh,
    deleteConversation,
  };
}
