"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { ConversationListItem, ChatConfig } from "../types";
import { AgentServerClient, type ChatTransport } from "../api";
import { useI18n } from "./useI18n";
import { localizeError } from "../utils/errors";

// Survives Strict Mode remount so we only ever fire one initial load per config
const initialLoadDoneKeys = new Set<string>();

function getLoadKey(baseUrl: string | undefined, agentId?: string): string {
  return `${baseUrl}|${agentId ?? ""}`;
}

export interface UseChatHistoryOptions extends Pick<ChatConfig, "baseUrl" | "agentId" | "authorization" | "headers" | "getHeaders" | "fetch" | "transport"> {
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
  /** Load conversations (showLoading: false for silent refresh, e.g. after new message) */
  load: (options?: { showLoading?: boolean }) => Promise<void>;
  /** Load more conversations */
  loadMore: () => Promise<void>;
  /** Refresh the list (silent: no loading indicator) */
  refresh: () => Promise<void>;
  /** Delete a conversation */
  deleteConversation: (id: string) => Promise<void>;
  /** Update a conversation in the list (e.g. title change). Local-only, no API call. */
  updateConversation: (id: string, data: Partial<ConversationListItem>) => void;
  /** The transport can rename a conversation */
  canRename: boolean;
  /** The transport can pin a conversation */
  canPin: boolean;
  /**
   * Change a conversation's title. The list shows the new title at once and takes it back when the
   * server refuses (`error` says why). Resolves `false` for an empty title, an unchanged one or a refusal.
   */
  renameConversation: (id: string, title: string) => Promise<boolean>;
  /** Pin or unpin a conversation; same optimistic handling as `renameConversation`. */
  pinConversation: (id: string, pinned: boolean) => Promise<boolean>;
  /**
   * Delete several conversations (the transport's bulk route, or one by one). Resolves with the ids
   * that are gone and those that are not; the list drops the first.
   */
  deleteConversations: (ids: string[]) => Promise<{ deleted: string[]; failed: string[] }>;
}

/**
 * Hook for managing chat history
 */
export function useChatHistory(options: UseChatHistoryOptions): UseChatHistoryReturn {
  const { t, has } = useI18n();
  // A server error with a known code shows as a localized, friendly message (a refused rename or pin, a full bulk delete ...)
  const friendly = (err: unknown, fallback: string): Error => localizeError(err instanceof Error ? err : new Error(fallback), t, has);
  // (read through a ref by the callbacks that outlive a render, so they speak the language of the moment)
  const friendlyRef = useRef(friendly);
  friendlyRef.current = friendly;
  const {
    baseUrl,
    agentId,
    authorization,
    headers,
    getHeaders,
    fetch: customFetch,
    transport,
    autoLoad = true,
    pageSize = 20,
  } = options;

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const conversationsRef = useRef<ConversationListItem[]>([]);
  conversationsRef.current = conversations;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  // Keep a stable client reference that updates when config changes
  const clientRef = useRef<ChatTransport | null>(null);
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

  const load = useCallback(async (options?: { showLoading?: boolean }) => {
    if (!clientRef.current) return;
    const showLoading = options?.showLoading !== false;
    try {
      if (showLoading) setIsLoading(true);
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
      setError(friendlyRef.current(err, t("chat.error.loadConversationsFailed")));
    } finally {
      if (showLoading) setIsLoading(false);
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
      setError(friendlyRef.current(err, t("chat.error.loadMoreFailed")));
    } finally {
      setIsLoading(false);
    }
  }, [t, agentId, pageSize, offset, isLoading, hasMore]);

  const refresh = useCallback(async () => {
    setOffset(0);
    await load({ showLoading: false });
  }, [load]);

  const deleteConversation = useCallback(async (id: string) => {
    if (!clientRef.current) return;
    try {
      await clientRef.current.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(friendlyRef.current(err, t("chat.error.deleteConversationFailed")));
    }
  }, [t]);

  const updateConversation = useCallback((id: string, data: Partial<ConversationListItem>) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...data } : c))
    );
  }, []);

  const canRename = typeof clientRef.current?.renameConversation === "function";
  const canPin = typeof clientRef.current?.pinConversation === "function";

  /**
   * Shows `patch` on a row, and puts the row back as it was if `commit` fails - or if the server's
   * answer (what `commit` resolves with) is one `accepted` refuses: a server can answer 200 and still
   * not have done what was asked.
   */
  const optimistically = useCallback(
    async <R>(
      id: string,
      patch: Partial<ConversationListItem>,
      commit: () => Promise<R>,
      failure: string,
      accepted?: (answer: R) => boolean
    ): Promise<boolean> => {
      // the row as it is now, read before the list changes
      const before = conversationsRef.current.find((c) => c.id === id);
      const undo = () => {
        if (before) setConversations((prev) => prev.map((c) => (c.id === id ? before : c)));
      };
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      try {
        const answer = await commit();
        if (accepted && !accepted(answer)) {
          undo();
          setError(new Error(failure));
          return false;
        }
        return true;
      } catch (err) {
        undo();
        setError(friendlyRef.current(err, failure));
        return false;
      }
    },
    []
  );

  const renameConversation = useCallback(
    async (id: string, title: string): Promise<boolean> => {
      const client = clientRef.current;
      const next = title.trim();
      if (!client?.renameConversation || !next) return false;
      const current = conversationsRef.current.find((c) => c.id === id);
      if (current && (current.title ?? "") === next) return false;
      setError(null);
      return optimistically(id, { title: next }, () => client.renameConversation!(id, next), t("chat.error.renameFailed"));
    },
    [optimistically, t]
  );

  const pinConversation = useCallback(
    async (id: string, pinned: boolean): Promise<boolean> => {
      const client = clientRef.current;
      if (!client?.pinConversation) return false;
      setError(null);
      return optimistically(
        id,
        { pinned, metadata: { ...conversationsRef.current.find((c) => c.id === id)?.metadata, pinned } },
        () => client.pinConversation!(id, pinned),
        t("chat.error.pinFailed"),
        // the pin the server stored, when it says, has to be the one that was asked for
        (stored) => typeof stored !== "boolean" || stored === pinned
      );
    },
    [optimistically, t]
  );

  const deleteConversations = useCallback(
    async (ids: string[]): Promise<{ deleted: string[]; failed: string[] }> => {
      const client = clientRef.current;
      const unique = Array.from(new Set(ids));
      if (!client || unique.length === 0) return { deleted: [], failed: unique };
      setError(null);
      let deleted: string[] = [];
      let failed: string[] = [];
      try {
        if (client.deleteConversations) {
          const result = await client.deleteConversations(unique);
          deleted = result.deleted;
          failed = result.failed.map((f) => f.id);
        } else {
          for (const id of unique) {
            try {
              await client.deleteConversation(id);
              deleted.push(id);
            } catch {
              failed.push(id);
            }
          }
        }
      } catch (err) {
        setError(friendlyRef.current(err, t("chat.error.deleteConversationFailed")));
        return { deleted: [], failed: unique };
      }
      if (deleted.length > 0) {
        const gone = new Set(deleted);
        setConversations((prev) => prev.filter((c) => !gone.has(c.id)));
      }
      if (failed.length > 0) setError(new Error(t("chat.error.deleteSomeFailed", { count: failed.length })));
      return { deleted, failed };
    },
    [t]
  );

  const prevKeyRef = useRef(getLoadKey(baseUrl, agentId));

  useEffect(() => {
    const key = getLoadKey(baseUrl, agentId);
    if (prevKeyRef.current !== key) {
      initialLoadDoneKeys.delete(prevKeyRef.current);
      prevKeyRef.current = key;
    }
    if (autoLoad && !initialLoadDoneKeys.has(key)) {
      initialLoadDoneKeys.add(key);
      load();
    }
  }, [autoLoad, load, baseUrl, agentId]);

  return {
    conversations,
    isLoading,
    error,
    hasMore,
    load,
    loadMore,
    refresh,
    deleteConversation,
    updateConversation,
    canRename,
    canPin,
    renameConversation,
    pinConversation,
    deleteConversations,
  };
}
