"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn, formatRelativeTime, isBudgetExhausted, isPinned, pinnedFirst } from "../../utils";
import type { ConversationListItem, ConversationSearchMode, RuntimeStatus } from "../../types";
import { ChatIcon, TrashIcon, PlusIcon, SearchIcon, XIcon, PencilIcon, PinIcon, ListCheckIcon } from "./Icons";
import { useI18n } from "../../hooks";
import { FOCUS_RING, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./styles";

export interface ChatHistoryProps {
  /** Conversations list */
  conversations: ConversationListItem[];
  /** Currently selected conversation ID */
  selectedId?: string;
  /** Whether loading */
  isLoading?: boolean;
  /** Has more items to load */
  hasMore?: boolean;
  /** Callback when selecting a conversation */
  onSelect: (conversation: ConversationListItem) => void;
  /** Callback when deleting a conversation */
  onDelete?: (conversationId: string) => void;
  /**
   * Rename a conversation in place (a pencil button, F2, or a double click on the title). Resolves
   * `false` when the new title was refused. Without it the title cannot be edited.
   */
  onRename?: (conversationId: string, title: string) => Promise<boolean | void> | boolean | void;
  /** Pin or unpin a conversation; pinned ones are listed first. Without it there is no pin button. */
  onPin?: (conversationId: string, pinned: boolean) => Promise<boolean | void> | boolean | void;
  /**
   * Select several conversations and delete them together (after a confirmation). Resolves with the
   * ids that could not be deleted. Without it there is no select mode.
   */
  onBulkDelete?: (ids: string[]) => Promise<{ deleted: string[]; failed: string[] } | void> | { deleted: string[]; failed: string[] } | void;
  /** What went wrong with a rename, a pin or a bulk delete (shown under the list) */
  error?: string;
  onDismissError?: () => void;
  /** Callback when creating a new conversation */
  onNewChat?: () => void;
  /** Callback when loading more */
  onLoadMore?: () => void;
  /** Custom class name */
  className?: string;
  /** Whether sidebar is open (for mobile) */
  isOpen?: boolean;
  /** Callback to close sidebar */
  onClose?: () => void;
  /** Custom header content */
  header?: React.ReactNode;
  /** Custom footer content */
  footer?: React.ReactNode;
  /** Enable search input for filtering conversation history */
  enableSearch?: boolean;
  /**
   * Search the whole history on the server. With it (and 2+ characters typed) the box waits 250 ms
   * after the last key, cancels the request still in flight (`signal`) and lists the hits with
   * the matched text highlighted. Without it the box filters the titles that are loaded.
   */
  searchConversations?: (
    q: string,
    signal: AbortSignal
  ) => Promise<{ conversations: ConversationListItem[]; searchMode?: ConversationSearchMode }>;
  /**
   * Show agent name below the conversation title.
   * Defaults to true when not specified.
   */
  showAgentName?: boolean;
  /**
   * Show a status badge on conversations that are working, waiting for the person, or stopped on
   * their usage limit (from each item's `runtime`). Default true.
   */
  showStatus?: boolean;
  /**
   * What the selected conversation is doing right now, as this page knows it (it may be ahead of
   * the list the server sent). Replaces the badge of the selected row.
   */
  selectedStatus?: RuntimeStatus;
}

const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 250;

/**
 * `text` with every occurrence of `query` marked (case-insensitive). Built from text nodes, so
 * whatever the text holds - markup included - is shown as text.
 */
function Highlighted({ text, query }: { text: string; query?: string }) {
  const needle = query?.trim().toLowerCase();
  const lower = text.toLowerCase();
  // (a character whose lower case is longer or shorter would shift the positions: show it plain)
  if (!needle || lower.length !== text.length || !lower.includes(needle)) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-sm bg-chat-accent-primary/25 px-0.5 text-inherit">
        {text.slice(at, at + needle.length)}
      </mark>
    );
    from = at + needle.length;
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

type BadgeKind = "running" | "waiting" | "budgetPaused";

const BADGE_LABEL: Record<BadgeKind, string> = {
  running: "chat.history.status.running",
  waiting: "chat.history.status.waiting",
  budgetPaused: "chat.history.status.budgetPaused",
};

const BADGE_TONE: Record<BadgeKind, string> = {
  running: "bg-chat-info-bg text-chat-info",
  waiting: "bg-chat-warning-bg text-chat-warning",
  budgetPaused: "bg-chat-danger-bg text-chat-danger",
};

/** The badge a conversation earns, or undefined for one that is idle. */
function badgeFor(status: RuntimeStatus | undefined, exhausted: boolean): BadgeKind | undefined {
  if (status === "running") return "running";
  if (status === "requires_action") return "waiting";
  if (status === "budget_paused" || exhausted) return "budgetPaused";
  return undefined;
}

/**
 * Chat history sidebar component
 */
export function ChatHistory({
  conversations,
  selectedId,
  isLoading = false,
  hasMore = false,
  onSelect,
  onDelete,
  onNewChat,
  onLoadMore,
  className,
  isOpen = true,
  onClose,
  header,
  footer,
  enableSearch = false,
  searchConversations,
  showAgentName = false,
  showStatus = true,
  selectedStatus,
  onRename,
  onPin,
  onBulkDelete,
  error,
  onDismissError,
}: ChatHistoryProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  // Server search: the hits for `query`, whether a request is out, and whether the last one failed
  const [remote, setRemote] = useState<{ query: string; items: ConversationListItem[]; mode?: ConversationSearchMode } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Select mode (bulk delete)
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // A conversation that is gone from the list cannot stay selected
  useEffect(() => {
    setSelected((current) => {
      const ids = new Set(conversations.map((c) => c.id));
      const kept = Array.from(current).filter((id) => ids.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [conversations]);

  const leaveSelecting = () => {
    setSelecting(false);
    setConfirming(false);
    setSelected(new Set());
  };

  const toggleSelected = (id: string) => {
    setConfirming(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulkDelete = async () => {
    if (!onBulkDelete || selected.size === 0) return;
    setDeleting(true);
    try {
      const outcome = await onBulkDelete(Array.from(selected));
      const failed = outcome && typeof outcome === "object" ? outcome.failed : [];
      // what could not be deleted stays selected, so the person can try again
      setConfirming(false);
      if (failed.length > 0) setSelected(new Set(failed));
      else leaveSelecting();
    } finally {
      setDeleting(false);
    }
  };

  // Arrow keys move between the rows (each row is a real button, so Tab, Enter and Space work as well)
  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-chat-conversation]") ?? []);
    if (rows.length === 0) return;
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (at === -1 && (event.key === "ArrowDown" || event.key === "ArrowUp")) return;
    event.preventDefault();
    const next =
      event.key === "Home" ? 0
      : event.key === "End" ? rows.length - 1
      : event.key === "ArrowDown" ? Math.min(rows.length - 1, at + 1)
      : Math.max(0, at - 1);
    rows[next].focus();
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const serverSearch = Boolean(enableSearch && searchConversations) && normalizedQuery.length >= SEARCH_MIN_CHARS;
  const searchRef = useRef(searchConversations);
  searchRef.current = searchConversations;
  const trimmedQuery = searchQuery.trim();

  useEffect(() => {
    if (!serverSearch) {
      setRemote(null);
      setSearching(false);
      setSearchFailed(false);
      return;
    }
    // (the old hits stay on screen until the new ones arrive)
    setSearching(true);
    setSearchFailed(false);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchRef.current!(trimmedQuery, controller.signal).then(
        (result) => {
          if (controller.signal.aborted) return;
          setRemote({ query: trimmedQuery, items: result.conversations, mode: result.searchMode });
          setSearching(false);
        },
        () => {
          if (controller.signal.aborted) return;
          setSearchFailed(true);
          setSearching(false);
        }
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [serverSearch, trimmedQuery]);

  const showRemote = serverSearch && remote !== null && !searchFailed;
  const filteredConversations = useMemo(() => {
    // search hits are the server's order (newest first); pinned ones are not lifted
    if (showRemote) return remote!.items;
    const matching = !normalizedQuery
      ? conversations
      : conversations.filter((conversation) => {
          const title = (conversation.title || t("chat.history.newChat")).toLowerCase();
          return title.includes(normalizedQuery);
        });
    // pinned conversations are listed first (the order inside each group is the server's)
    return onPin || matching.some(isPinned) ? pinnedFirst(matching) : matching;
  }, [conversations, normalizedQuery, onPin, showRemote, remote]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && onClose && (
        <div
          aria-hidden="true"
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "flex flex-col h-full bg-chat-bg-secondary border-r border-chat-border-primary",
          "w-[280px] fixed md:relative z-50 transition-transform duration-300",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          className
        )}
        onKeyDown={(event) => {
          if (event.key === "Escape" && isOpen && onClose) onClose();
        }}
      >
        {/* Header — fixed height to align border with main chat header */}
        {header || (
          <div className="flex-shrink-0 flex items-center px-4 h-[58px] border-b border-chat-border-primary">
            {onNewChat && (
              <button
                onClick={onNewChat}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-chat-bg-tertiary hover:bg-chat-bg-hover rounded-lg text-chat-text-primary transition-colors"
              >
                <PlusIcon className="w-3 h-3" />
                <span>{t("chat.history.newChat")}</span>
              </button>
            )}
          </div>
        )}

        {enableSearch && (
          <div className="flex-shrink-0 px-3 py-2 border-b border-chat-border-primary bg-chat-bg-secondary">
            <div className="relative">
              <SearchIcon className="w-4 h-4 text-chat-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  // Escape clears the search first; the sidebar closes only on the next one
                  if (event.key === "Escape" && searchQuery) {
                    event.preventDefault();
                    event.stopPropagation();
                    setSearchQuery("");
                  }
                }}
                aria-label={t("chat.history.searchPlaceholder")}
                placeholder={t("chat.history.searchPlaceholder")}
                className="w-full bg-chat-bg-tertiary border border-chat-border-primary rounded-lg pl-9 pr-9 py-2 text-sm text-chat-text-primary placeholder:text-chat-text-tertiary focus:outline-none focus:border-chat-accent-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-chat-text-tertiary hover:text-chat-text-primary"
                  aria-label={t("chat.history.clearSearch")}
                >
                  <XIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {serverSearch && (searching || searchFailed || (showRemote && remote!.mode === "title")) && (
          <div
            role="status"
            aria-live="polite"
            className={cn("flex-shrink-0 px-4 py-1.5 text-xs", searchFailed ? "text-chat-danger" : "text-chat-text-tertiary")}
          >
            {searchFailed ? t("chat.history.searchFailed") : searching ? t("chat.history.searching") : t("chat.history.searchTitlesOnly")}
          </div>
        )}

        {/* Select mode: bulk delete */}
        {onBulkDelete && conversations.length > 0 && (
          <div className="flex-shrink-0 border-b border-chat-border-primary px-3 py-1.5">
            {!selecting ? (
              <button
                type="button"
                onClick={() => setSelecting(true)}
                className={cn("inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-chat-text-secondary hover:bg-chat-bg-hover", FOCUS_RING)}
              >
                <ListCheckIcon className="h-3.5 w-3.5" />
                {t("chat.history.select")}
              </button>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs text-chat-text-secondary">
                  <span role="status" aria-live="polite">{t("chat.history.selectedCount", { count: selected.size })}</span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      className={cn("rounded px-1.5 py-1 hover:bg-chat-bg-hover", FOCUS_RING)}
                      onClick={() => {
                        setConfirming(false);
                        setSelected(selected.size === filteredConversations.length ? new Set() : new Set(filteredConversations.map((c) => c.id)));
                      }}
                    >
                      {selected.size === filteredConversations.length && filteredConversations.length > 0 ? t("chat.history.selectNone") : t("chat.history.selectAll")}
                    </button>
                    <button type="button" className={cn("rounded px-1.5 py-1 hover:bg-chat-bg-hover", FOCUS_RING)} onClick={leaveSelecting} disabled={deleting}>
                      {t("chat.history.selectDone")}
                    </button>
                  </span>
                </div>
                {!confirming ? (
                  <button
                    type="button"
                    disabled={selected.size === 0}
                    onClick={() => setConfirming(true)}
                    className={cn(SECONDARY_BUTTON, "w-full !text-chat-danger")}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    {t("chat.history.deleteSelected", { count: selected.size })}
                  </button>
                ) : (
                  <div role="alertdialog" aria-label={t("chat.history.confirmDeleteTitle")} className="rounded-lg border border-chat-danger bg-chat-danger-bg p-2 text-xs text-chat-text-primary">
                    <p className="mb-2">{t("chat.history.confirmDelete", { count: selected.size })}</p>
                    <div className="flex gap-2">
                      <button type="button" autoFocus className={cn(PRIMARY_BUTTON, "!bg-chat-danger")} disabled={deleting} onClick={runBulkDelete}>
                        {deleting ? t("chat.history.deleting") : t("chat.history.confirmDeleteYes")}
                      </button>
                      <button type="button" className={SECONDARY_BUTTON} disabled={deleting} onClick={() => setConfirming(false)}>
                        {t("chat.history.confirmDeleteNo")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto chat-scrollbar">
          {filteredConversations.length === 0 && !isLoading && !(serverSearch && searching) ? (
            <div className="p-4 text-center text-chat-text-tertiary text-sm">
              {normalizedQuery ? t("chat.history.noMatchingConversations") : t("chat.history.noConversations")}
            </div>
          ) : (
            <div className="p-2" ref={listRef} onKeyDown={handleListKeyDown}>
              <ul aria-label={t("chat.history.list")} className="m-0 list-none space-y-0.5 p-0">
                {filteredConversations.map((conversation) => (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    isSelected={conversation.id === selectedId}
                    onSelect={() => onSelect(conversation)}
                    onDelete={onDelete ? () => onDelete(conversation.id) : undefined}
                    onRename={onRename ? (title) => onRename(conversation.id, title) : undefined}
                    onPin={onPin ? (pinned) => onPin(conversation.id, pinned) : undefined}
                    selecting={selecting}
                    checked={selected.has(conversation.id)}
                    onToggle={() => toggleSelected(conversation.id)}
                    renaming={renamingId === conversation.id}
                    onRenameStart={() => setRenamingId(conversation.id)}
                    onRenameEnd={() => setRenamingId((current) => (current === conversation.id ? null : current))}
                    showAgentName={showAgentName}
                    highlight={showRemote ? remote!.query : undefined}
                    badge={
                      showStatus
                        ? badgeFor(
                            conversation.id === selectedId && selectedStatus ? selectedStatus : conversation.runtime?.status,
                            conversation.id === selectedId && selectedStatus ? false : isBudgetExhausted(conversation)
                          )
                        : undefined
                    }
                  />
                ))}
              </ul>

              {/* Load more button */}
              {hasMore && !isLoading && !showRemote && (
                <button
                  onClick={onLoadMore}
                  className="w-full py-2 text-sm text-chat-accent-primary hover:underline"
                >
                  {t("chat.history.loadMore")}
                </button>
              )}

              {/* Loading indicator */}
              {(isLoading || (serverSearch && searching && !remote)) && (
                <div className="py-4 text-center">
                  <LoadingDots />
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="flex-shrink-0 border-t border-chat-border-primary bg-chat-danger-bg px-3 py-2 text-xs text-chat-danger">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 break-words">{error}</span>
              {onDismissError && (
                <button type="button" onClick={onDismissError} className={cn("flex-shrink-0 rounded p-0.5", FOCUS_RING)} aria-label={t("chat.error.dismiss")}>
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        {footer && (
          <div className="flex-shrink-0 border-t border-chat-border-primary">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Individual conversation item: a button to open it, and - beside it, not inside it - the buttons that
 * pin, rename or delete it. In select mode the row is a checkbox instead.
 */
interface ConversationItemProps {
  conversation: ConversationListItem;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onRename?: (title: string) => Promise<boolean | void> | boolean | void;
  onPin?: (pinned: boolean) => Promise<boolean | void> | boolean | void;
  selecting?: boolean;
  checked?: boolean;
  onToggle?: () => void;
  renaming?: boolean;
  onRenameStart?: () => void;
  onRenameEnd?: () => void;
  showAgentName?: boolean;
  badge?: BadgeKind;
  /** The search text to mark in the title and the snippet */
  highlight?: string;
}

function ConversationItem({
  conversation,
  isSelected,
  onSelect,
  onDelete,
  onRename,
  onPin,
  selecting = false,
  checked = false,
  onToggle,
  renaming = false,
  onRenameStart,
  onRenameEnd,
  showAgentName = false,
  badge,
  highlight,
}: ConversationItemProps) {
  const { t } = useI18n();
  const title = conversation.title || t("chat.history.newChat");
  const pinned = isPinned(conversation);
  const actionCount = selecting ? 0 : [onDelete, onRename, onPin].filter(Boolean).length;
  const hasActions = actionCount > 0;
  // visible on hover, and for a keyboard user as soon as the row or the button has focus
  const reveal = "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100";

  const body = (
    <>
      {pinned ? (
        <PinIcon className="w-4 h-4 text-chat-accent-primary flex-shrink-0" />
      ) : (
        <ChatIcon className="w-4 h-4 text-chat-text-tertiary flex-shrink-0" />
      )}
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-chat-text-primary truncate">
          <Highlighted text={title} query={highlight} />
        </span>
        {highlight && conversation.searchMatch?.field === "message" && conversation.searchMatch.snippet && (
          <span data-chat-snippet className="block text-xs text-chat-text-secondary line-clamp-2 break-words">
            <Highlighted text={conversation.searchMatch.snippet} query={highlight} />
          </span>
        )}
        <span className="flex items-center gap-1 min-w-0 text-xs text-chat-text-tertiary">
          {conversation.agentName && showAgentName && (
            <>
              <span className="truncate">{conversation.agentName}</span>
              <span className="flex-shrink-0 opacity-50">·</span>
            </>
          )}
          <span className="flex-shrink-0">{formatRelativeTime(new Date(conversation.updatedAt))}</span>
        </span>
      </span>
      {badge && (
        <span
          data-chat-status={badge}
          className={cn(
            "inline-flex flex-shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
            BADGE_TONE[badge]
          )}
        >
          <span
            aria-hidden="true"
            className={cn("h-1.5 w-1.5 rounded-full bg-current", badge === "running" && "animate-pulse motion-reduce:animate-none")}
          />
          <span>{t(BADGE_LABEL[badge])}</span>
        </span>
      )}
    </>
  );

  return (
    <li
      className={cn(
        "group relative flex items-center rounded-lg transition-colors",
        isSelected && !selecting ? "bg-chat-bg-hover" : "hover:bg-chat-bg-tertiary"
      )}
    >
      {selecting ? (
        <label className={cn("flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-3 py-2", checked && "bg-chat-bg-hover")}>
          <input
            type="checkbox"
            data-chat-conversation={conversation.id}
            checked={checked}
            onChange={onToggle}
            aria-label={title}
            className="h-4 w-4 flex-shrink-0 accent-[var(--chat-accent-primary)]"
          />
          {body}
        </label>
      ) : renaming && onRename ? (
        <RenameField
          initial={conversation.title ?? ""}
          onDone={async (next) => {
            // an unchanged or empty title just closes the field
            if (next !== null && next.trim() !== "" && next.trim() !== (conversation.title ?? "")) await onRename(next.trim());
            onRenameEnd?.();
          }}
        />
      ) : (
        <button
          type="button"
          data-chat-conversation={conversation.id}
          aria-current={isSelected ? "true" : undefined}
          onClick={onSelect}
          onDoubleClick={onRename ? onRenameStart : undefined}
          onKeyDown={(event) => {
            if (event.key === "F2" && onRename) {
              event.preventDefault();
              onRenameStart?.();
            }
          }}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left",
            actionCount === 1 && "pr-9",
            actionCount === 2 && "pr-16",
            actionCount >= 3 && "pr-24",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent-primary"
          )}
        >
          {body}
        </button>
      )}
      {hasActions && !renaming && (
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {onPin && (
            <button
              type="button"
              onClick={() => onPin(!pinned)}
              aria-pressed={pinned}
              className={cn("rounded p-1 transition-all hover:bg-chat-bg-hover", reveal, FOCUS_RING)}
              title={pinned ? t("chat.history.unpin") : t("chat.history.pin")}
              aria-label={`${pinned ? t("chat.history.unpin") : t("chat.history.pin")}: ${title}`}
            >
              <PinIcon className={cn("w-4 h-4", pinned ? "text-chat-accent-primary" : "text-chat-text-tertiary")} />
            </button>
          )}
          {onRename && (
            <button
              type="button"
              onClick={onRenameStart}
              className={cn("rounded p-1 transition-all hover:bg-chat-bg-hover", reveal, FOCUS_RING)}
              title={t("chat.history.rename")}
              aria-label={`${t("chat.history.rename")}: ${title}`}
            >
              <PencilIcon className="w-4 h-4 text-chat-text-tertiary" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className={cn("rounded p-1 transition-all hover:bg-chat-bg-hover", reveal, FOCUS_RING)}
              title={t("chat.history.deleteConversation")}
              aria-label={`${t("chat.history.deleteConversation")}: ${title}`}
            >
              <TrashIcon className="w-4 h-4 text-chat-text-tertiary hover:text-chat-danger" />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** The title of a row while it is renamed: Enter or leaving the field saves, Escape keeps the old title. */
function RenameField({ initial, onDone }: { initial: string; onDone: (title: string | null) => void | Promise<void> }) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const settled = useRef(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (title: string | null) => {
    if (settled.current) return;
    settled.current = true;
    void onDone(title);
  };

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      maxLength={200}
      aria-label={t("chat.history.renameLabel")}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(null);
        }
      }}
      className="mx-1 min-w-0 flex-1 rounded-md border border-chat-accent-primary bg-chat-bg-tertiary px-2 py-1.5 text-sm text-chat-text-primary focus:outline-none"
    />
  );
}

/**
 * Loading dots animation
 */
function LoadingDots() {
  return (
    <div className="flex justify-center gap-1">
      <div className="w-2 h-2 bg-chat-text-tertiary rounded-full animate-pulse-dot" />
      <div className="w-2 h-2 bg-chat-text-tertiary rounded-full animate-pulse-dot animation-delay-200" />
      <div className="w-2 h-2 bg-chat-text-tertiary rounded-full animate-pulse-dot animation-delay-400" />
    </div>
  );
}
