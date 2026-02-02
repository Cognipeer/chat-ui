"use client";

import { useState, useCallback, useEffect } from "react";
import type { ConversationListItem, ChatConfig } from "../types";
import { AgentServerClient } from "../api";

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

  const client = new AgentServerClient({
    baseUrl,
    agentId,
    authorization,
    headers,
  });

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await client.getConversations({
        agentId,
        limit: pageSize,
        offset: 0,
      });
      setConversations(response.conversations);
      setHasMore(response.hasMore);
      setOffset(pageSize);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to load conversations"));
    } finally {
      setIsLoading(false);
    }
  }, [agentId, pageSize]);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    try {
      setIsLoading(true);
      const response = await client.getConversations({
        agentId,
        limit: pageSize,
        offset,
      });
      setConversations((prev) => [...prev, ...response.conversations]);
      setHasMore(response.hasMore);
      setOffset((prev) => prev + pageSize);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to load more conversations"));
    } finally {
      setIsLoading(false);
    }
  }, [agentId, pageSize, offset, isLoading, hasMore]);

  const refresh = useCallback(async () => {
    setOffset(0);
    await load();
  }, [load]);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await client.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to delete conversation"));
    }
  }, []);

  useEffect(() => {
    if (autoLoad) {
      load();
    }
  }, [autoLoad]);

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
