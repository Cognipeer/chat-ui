"use client";

import React, { useRef, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { cn, collectPendingActions, messageText, modelLabel, modelOfMessage, readFeedback } from "../../utils";
import type { AgentModelOption, FeedbackInput, Message, MessageActionProps, StopNoticeRenderProps } from "../../types";
import { ChatMessage, type ImageRenderProps, type ResolveFileUrl } from "./ChatMessage";
import { ToolCalls } from "./ToolCall";
import { InterruptedNotice } from "./StopNotice";
import type { ChatActionsConfig } from "./ActionCards";
import { SECONDARY_BUTTON } from "./styles";
import { useI18n } from "../../hooks/useI18n";

/** What the list adds under its messages (see `ChatMessageListProps.toolbar`). */
export interface ListToolbarConfig {
  /** A copy button on every message with text */
  copy: boolean;
  /** Run the last answer again (offered under the newest answer only) */
  regenerate?: () => void;
  /** Edit one of the person's messages; resolves `false` when refused */
  edit?: (messageId: string, content: string) => Promise<boolean> | boolean | void;
  /** Thumbs up / down on answers */
  feedback?: {
    comments: boolean;
    reasons: string[];
    onSubmit: (messageId: string, input: FeedbackInput) => Promise<boolean> | boolean | void;
  };
}

export interface ChatMessageListProps {
  /** Messages to display */
  messages: Message[];
  /** Whether currently streaming */
  isStreaming?: boolean;
  /** Current streaming text */
  streamingText?: string;
  /** Current progress/status message */
  progressMessage?: string;
  /** Active tool calls during streaming */
  activeToolCalls?: Map<string, { name: string; args: Record<string, unknown>; result?: unknown; reasoning?: string; displayName?: string }>;
  /** Custom class name */
  className?: string;
  /** Auto-scroll to bottom on new messages */
  autoScroll?: boolean;
  /** Render custom message actions */
  renderActions?: (props: MessageActionProps) => React.ReactNode;
  /** Render custom avatar */
  renderAvatar?: (role: Message["role"]) => React.ReactNode;
  /** Show avatars */
  showAvatars?: boolean;
  /** Show timestamps */
  showTimestamps?: boolean;
  /** Empty state content */
  emptyState?: React.ReactNode;
  /** Show citations section under assistant messages */
  enableCitations?: boolean;
  /** How approval / question cards behave */
  actions?: ChatActionsConfig;
  /** Replace how an image in a message is drawn */
  renderImage?: (props: ImageRenderProps) => React.ReactNode;
  /** Replace the notice under an answer that stopped early */
  renderStopNotice?: (props: StopNoticeRenderProps) => React.ReactNode;
  /** How to get a URL for a stored file that has none of its own (images are fetched this way to be shown) */
  resolveFileUrl?: ResolveFileUrl;
  /** Older messages exist than the ones in `messages`: a button above the first one fetches them */
  hasEarlier?: boolean;
  /** The older messages are being fetched */
  isLoadingEarlier?: boolean;
  /** Fetch the older messages (the button shows only together with `hasEarlier`) */
  onLoadEarlier?: () => void;
  /**
   * The list ends on a message of the person's that the run never answered (it was cut off): a
   * "the reply was interrupted" notice follows it (see `useChat().interrupted`).
   */
  interrupted?: boolean;
  /** Sends the interrupted message again; the notice offers a retry button only with it */
  onRetryInterrupted?: () => void;
  /** The built-in buttons under the messages (copy, regenerate, edit, thumbs) */
  toolbar?: ListToolbarConfig;
  /** Regenerate and edit change the conversation: only while nothing runs and no card waits */
  canAct?: boolean;
  /** Label every answer as AI-generated with this text */
  aiLabel?: string;
  /** The agent's models (`AgentInfo.models`). With two or more, a change of model shows as a divider and answers can say which model wrote them. */
  models?: AgentModelOption[];
  /** Under each answer, "Answered with <model>" when the answer reports its model (needs `models`; default true) */
  showAnsweredWith?: boolean;
}

// A layout effect keeps the scroll position steady before the browser paints; on a server there is nothing to scroll
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const NO_IDS: ReadonlySet<string> = new Set();

/**
 * Notices the approval / question cards that appear while the list is on screen (not the ones a
 * loaded conversation arrives with): the first gets keyboard focus, and a screen reader is told.
 * A different set of messages (a conversation opened, a chat cleared) starts over without a fuss.
 * `Chat` takes this list off screen while it loads a conversation, so those cards are never "new".
 */
function useNewCards(messages: Message[]): { focusIds: ReadonlySet<string>; announcement: string } {
  const { t } = useI18n();
  const known = useRef<{ messages: Set<string>; actions: Set<string> } | null>(null);
  const [fresh, setFresh] = useState<{ ids: ReadonlySet<string>; announcement: string; count: number }>({
    ids: NO_IDS,
    announcement: "",
    count: 0,
  });

  useEffect(() => {
    const waiting = collectPendingActions(messages);
    const messageIds = new Set(messages.map((m) => m.id));
    const before = known.current;
    // The first render only takes stock. After that it is the same conversation unless it had
    // messages and none of them is left (another conversation opened, the chat cleared).
    const continued =
      before !== null && (before.messages.size === 0 || Array.from(before.messages).some((id) => messageIds.has(id)));
    const added = continued ? waiting.filter((e) => !before!.actions.has(e.action.id)) : [];
    known.current = {
      messages: messageIds,
      actions: new Set([...(continued ? before!.actions : []), ...waiting.map((e) => e.action.id)]),
    };
    if (added.length === 0) {
      setFresh((current) => (current.ids.size === 0 ? current : { ...current, ids: NO_IDS }));
      return;
    }
    const first = added[0].action;
    setFresh((current) => ({
      ids: new Set([first.id]),
      announcement:
        first.type === "tool_approval"
          ? t("chat.a11y.newApproval", { tool: first.title ?? first.toolName })
          : t("chat.question.title"),
      count: current.count + 1,
    }));
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // A live region only speaks when its text changes: a zero-width space on every other
  // announcement lets the same sentence be read again for the next card
  return {
    focusIds: fresh.ids,
    announcement: fresh.count > 1 && fresh.count % 2 === 0 ? `${fresh.announcement}\u200b` : fresh.announcement,
  };
}

/**
 * List of chat messages with auto-scroll
 */
export function ChatMessageList({
  messages,
  isStreaming = false,
  streamingText,
  progressMessage,
  activeToolCalls,
  className,
  autoScroll = true,
  renderActions,
  renderAvatar,
  showAvatars = true,
  showTimestamps = false,
  emptyState,
  enableCitations = true,
  actions,
  renderImage,
  renderStopNotice,
  resolveFileUrl,
  hasEarlier = false,
  isLoadingEarlier = false,
  onLoadEarlier,
  interrupted = false,
  onRetryInterrupted,
  toolbar,
  canAct = false,
  aiLabel,
  models,
  showAnsweredWith = true,
}: ChatMessageListProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // What the list looked like at the last render, and where it was scrolled when older messages were asked for
  const shown = useRef<{ first?: string; last?: string; count: number }>({ count: 0 });
  const anchor = useRef<{ top: number; height: number } | null>(null);
  const { focusIds, announcement } = useNewCards(messages);
  const cardActions = useMemo(
    () => (actions ? { ...actions, focusActionIds: actions.focusActionIds ?? focusIds } : actions),
    [actions, focusIds]
  );

  // Auto-scroll to bottom. Older messages added in front keep the reader where they were instead.
  useIsomorphicLayoutEffect(() => {
    const first = messages[0]?.id;
    const last = messages[messages.length - 1]?.id;
    const before = shown.current;
    shown.current = { first, last, count: messages.length };
    const prepended = before.count > 0 && last === before.last && first !== before.first && messages.length > before.count;
    const container = containerRef.current;
    if (prepended) {
      if (container && anchor.current) {
        container.scrollTop = anchor.current.top + (container.scrollHeight - anchor.current.height);
      }
      anchor.current = null;
      return;
    }
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingText, activeToolCalls, autoScroll]);

  /** The toolbar of one message: copy everywhere, the rest only where the action makes sense */
  const toolbarFor = (message: Message, index: number) => {
    if (!toolbar) return {};
    const text = messageText(message.content).trim();
    if (!text) return {};
    // an answer this page wrote itself (a stopped turn the server has not stored yet) has no server id to act on
    const local = message.metadata?.localOnly === true;
    if (message.role === "assistant") {
      if (message.status === "requires_action") return {};
      const newest = index === messages.length - 1;
      return {
        toolbar: {
          copy: toolbar.copy,
          persistent: newest,
          onRegenerate: newest && canAct && toolbar.regenerate && !local ? toolbar.regenerate : undefined,
          feedback:
            toolbar.feedback && !local
              ? {
                  comments: toolbar.feedback.comments,
                  reasons: toolbar.feedback.reasons,
                  current: readFeedback(message),
                  onSubmit: (input: FeedbackInput) => toolbar.feedback!.onSubmit(message.id, input),
                }
              : undefined,
        },
      };
    }
    if (message.role === "user") {
      const sending = Boolean(message.files?.some((f) => f.status));
      const edit = canAct && toolbar.edit && !sending ? toolbar.edit : undefined;
      return {
        toolbar: { copy: toolbar.copy, onEdit: edit ? () => undefined : undefined },
        onSaveEdit: edit ? (content: string) => edit(message.id, content) : undefined,
      };
    }
    return {};
  };

  const offered = models && models.length > 1 ? models : undefined;
  /** For each answer: the model it reports and whether that differs from the answer before it */
  const answerModels = useMemo(() => {
    const out = new Map<string, { label?: string; switched: boolean }>();
    if (!offered) return out;
    let previous: string | undefined;
    for (const message of messages) {
      const key = modelOfMessage(message);
      if (!key) continue;
      out.set(message.id, { label: modelLabel(offered, key), switched: previous !== undefined && previous !== key });
      previous = key;
    }
    return out;
  }, [messages, offered]);

  const loadEarlier = () => {
    const container = containerRef.current;
    anchor.current = container ? { top: container.scrollTop, height: container.scrollHeight } : null;
    onLoadEarlier?.();
  };

  if (messages.length === 0 && !isStreaming) {
    return (
      // scrolls when a long welcome text does not fit; `min-h-full` keeps a short one centred
      <div className={cn("flex-1 overflow-y-auto chat-scrollbar", className)}>
        <div className="flex min-h-full items-center justify-center">{emptyState || <DefaultEmptyState />}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      // A log announces what is added; while a reply streams it is busy, so the finished
      // answer is read once instead of every word
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-busy={isStreaming}
      aria-label={t("chat.a11y.messages")}
      className={cn(
        "flex-1 overflow-y-auto chat-scrollbar",
        className
      )}
    >
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      <div className="max-w-3xl mx-auto">
        {hasEarlier && onLoadEarlier && (
          <div className="flex justify-center px-4 pt-4">
            <button type="button" className={SECONDARY_BUTTON} disabled={isLoadingEarlier} onClick={loadEarlier}>
              {isLoadingEarlier ? t("chat.messages.loadingEarlier") : t("chat.messages.loadEarlier")}
            </button>
          </div>
        )}
        {/* A stored message always shows what was stored; the turn being streamed is drawn below, never in one of them */}
        {messages.map((message, index) => (
          <React.Fragment key={message.id}>
          {answerModels.get(message.id)?.switched && answerModels.get(message.id)?.label && (
            <div role="separator" aria-label={t("chat.model.switched", { model: answerModels.get(message.id)!.label! })} className="mx-4 my-2 flex items-center gap-3 text-xs text-chat-text-tertiary">
              <span className="h-px flex-1 bg-chat-border-primary" />
              <span>{t("chat.model.switched", { model: answerModels.get(message.id)!.label! })}</span>
              <span className="h-px flex-1 bg-chat-border-primary" />
            </div>
          )}
          <ChatMessage
            message={message}
            aiLabel={aiLabel}
            {...toolbarFor(message, index)}
            renderActions={renderActions}
            renderAvatar={renderAvatar}
            showAvatar={showAvatars}
            showTimestamp={showTimestamps}
            enableCitations={enableCitations}
            actions={cardActions}
            renderImage={renderImage}
            renderStopNotice={renderStopNotice}
            resolveFileUrl={resolveFileUrl}
          />
          {showAnsweredWith && answerModels.get(message.id)?.label && (
            <p className={cn("-mt-4 mb-6 px-4 text-xs text-chat-text-tertiary", showAvatars && "pl-16")}>
              {t("chat.model.answeredWith", { model: answerModels.get(message.id)!.label! })}
            </p>
          )}
          </React.Fragment>
        ))}

        {/* The run that was answering the last message was cut off before it wrote anything */}
        {interrupted && !isStreaming && messages.length > 0 && messages[messages.length - 1].role === "user" && (
          // lined up with the text of the message above it (avatar width and gap); a host's own render owns its layout
          <InterruptedNotice
            message={messages[messages.length - 1]}
            onRetry={onRetryInterrupted}
            render={renderStopNotice}
            className={cn("mx-4 mb-6", showAvatars && "ml-16")}
          />
        )}

        {/* Streaming placeholder for new assistant message */}
        {isStreaming && streamingText && (
          <ChatMessage
            message={{
              id: "streaming",
              conversationId: "",
              role: "assistant",
              content: "",
              createdAt: new Date(),
              updatedAt: new Date(),
            }}
            isStreaming={true}
            streamingText={streamingText}
            aiLabel={aiLabel}
            renderAvatar={renderAvatar}
            showAvatar={showAvatars}
            enableCitations={enableCitations}
            renderImage={renderImage}
          />
        )}

        {/* Thinking / loading indicator when streaming but no text yet */}
        {isStreaming && !streamingText && (
          <div className="flex gap-4 px-4 py-6 bg-chat-bg-secondary animate-fade-in">
            {showAvatars && (
              <div className="flex-shrink-0">
                {renderAvatar ? renderAvatar("assistant") : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium bg-chat-bg-tertiary text-chat-text-primary">
                    {t("chat.message.ai")}
                  </div>
                )}
              </div>
            )}
            <div className="flex-1 min-w-0 flex flex-col gap-3 py-1">
              {/* Active tool calls during streaming */}
              {activeToolCalls && activeToolCalls.size > 0 && (
                <ToolCalls
                  toolCalls={activeToolCalls}
                  isExecuting={true}
                />
              )}
              {/* Show loading dots only when no tool calls are active */}
              {(!activeToolCalls || activeToolCalls.size === 0) && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-chat-text-tertiary rounded-full animate-pulse-dot motion-reduce:animate-none" />
                  <div className="w-2 h-2 bg-chat-text-tertiary rounded-full animate-pulse-dot animation-delay-200 motion-reduce:animate-none" />
                  <div className="w-2 h-2 bg-chat-text-tertiary rounded-full animate-pulse-dot animation-delay-400 motion-reduce:animate-none" />
                </div>
              )}
              {progressMessage && (
                <div className="text-xs text-chat-text-tertiary">{progressMessage}</div>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/**
 * Default empty state
 */
export function DefaultEmptyState() {
  const { t } = useI18n();
  
  return (
    <div className="text-center">
      <div className="text-chat-text-secondary text-lg mb-2">
        {t("chat.empty.subtitle")}
      </div>
      <div className="text-chat-text-tertiary text-sm">
        {t("chat.empty.startTyping")}
      </div>
    </div>
  );
}
