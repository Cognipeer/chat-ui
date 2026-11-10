"use client";

import React, { useRef, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { cn, collectPendingActions, messageText, modelLabel, modelOfMessage, readFeedback } from "../../utils";
import type { AgentModelOption, FeedbackInput, Message, MessageActionProps, PlanSnapshot, StopNoticeRenderProps } from "../../types";
import { ReminderNote } from "./ReminderNote";
import { isReminderMessage } from "../../utils/reminders";
import { ChatMessage, type ImageRenderProps, type ResolveFileUrl } from "./ChatMessage";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCalls, formatToolName } from "./ToolCall";
import { InterruptedNotice } from "./StopNotice";
import { MessageActionCards, type ChatActionsConfig } from "./ActionCards";
import { buildTurnBlocks, TurnActivity } from "./TurnActivity";
import { CondensingLine, PlanCard } from "./PlanCard";
import { useAppearance } from "./appearance";
import { SECONDARY_BUTTON } from "./styles";
import { LoadingIcon } from "./Icons";
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
  /**
   * The agent called a tool after writing `streamingText` (`useChat().workingAfterText`): what runs now shows under
   * the text, as it does before any words arrive.
   */
  workingAfterText?: boolean;
  /** Reasoning of the turn being streamed (`useChat().streamingReasoning`) */
  streamingReasoning?: string;
  /** Show the collapsible "Thinking" block (default true) */
  showReasoning?: boolean;
  /** Current progress/status message */
  progressMessage?: string;
  /** Active tool calls during streaming */
  activeToolCalls?: Map<string, { name: string; args: Record<string, unknown>; result?: unknown; reasoning?: string; displayName?: string }>;
  /** The agent's plan for the turn being streamed (`useChat().plan`): a card above the live answer */
  plan?: PlanSnapshot;
  /** The agent is condensing its earlier context now (`useChat().isCondensing`): a line says so */
  condensing?: boolean;
  /** Custom class name */
  className?: string;
  /** Auto-scroll to bottom on new messages */
  autoScroll?: boolean;
  /**
   * A message the person sends goes to the top of the list and the answer streams in below it, instead of the list
   * following the end of the answer (default true; needs `autoScroll`).
   */
  pinSentMessage?: boolean;
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
  /** Scroll this message into view (inside the list only) and mark it for a moment */
  focusMessageId?: string;
  /** Called once `focusMessageId` was handled (found, or not in the list) */
  onFocusHandled?: () => void;
  /** How approval / question cards behave */
  actions?: ChatActionsConfig;
  /** Replace how an image in a message is drawn */
  renderImage?: (props: ImageRenderProps) => React.ReactNode;
  /** Offer a preview of attached and produced files next to Download (default true; see `ChatMessage`) */
  filePreview?: boolean;
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

// How far below the top of the list a pinned message sits
const PIN_GAP = 16;

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

const FOCUS_MARK = ["ring-2", "ring-inset", "ring-chat-accent-primary"];

/**
 * List of chat messages with auto-scroll
 */
export function ChatMessageList({
  messages,
  isStreaming = false,
  streamingText,
  workingAfterText = false,
  streamingReasoning,
  showReasoning = true,
  progressMessage,
  activeToolCalls,
  plan,
  condensing = false,
  className,
  autoScroll = true,
  pinSentMessage = true,
  renderActions,
  renderAvatar,
  showAvatars = true,
  showTimestamps = false,
  emptyState,
  enableCitations = true,
  actions,
  renderImage,
  filePreview = true,
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
  focusMessageId,
  onFocusHandled,
}: ChatMessageListProps) {
  const { t } = useI18n();
  const modern = useAppearance() === "modern";
  const containerRef = useRef<HTMLDivElement>(null);
  // What the list looked like at the last render, and where it was scrolled when older messages were asked for
  const shown = useRef<{ first?: string; last?: string; count: number; ids: ReadonlySet<string> }>({ count: 0, ids: NO_IDS });
  const anchor = useRef<{ top: number; height: number } | null>(null);
  // Whether the reader is at the end. Scrolling up while an answer streams unsticks it, so the list stops
  // pulling the reader back down; reaching the end again (or sending a message) sticks it again.
  const stuck = useRef(true);
  // The list's own smooth scrolling also moves it away from the end for a moment, so only a scroll that follows
  // the reader's own input (wheel, touch, keys, the scrollbar) unsticks it.
  const userInput = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markUserInput = () => {
    if (userInput.current) clearTimeout(userInput.current);
    userInput.current = setTimeout(() => (userInput.current = null), 300);
  };
  useEffect(() => () => { if (userInput.current) clearTimeout(userInput.current); }, []);
  const onScroll = () => {
    const c = containerRef.current;
    if (!c) return;
    if (c.scrollHeight - c.scrollTop - c.clientHeight < 40) {
      // A pinned message stays put until the reader scrolls down to the end of an answer that has outgrown the
      // room under it: from there the list follows the answer again.
      if (!pinned.current) stuck.current = true;
      else if (userInput.current && (parseFloat(spacerRef.current?.style.height ?? "") || 0) === 0) {
        setPinned(false);
        stuck.current = true;
      }
    } else if (userInput.current) stuck.current = false;
  };
  const { focusIds, announcement } = useNewCards(messages);
  const cardActions = useMemo(
    () => (actions ? { ...actions, focusActionIds: actions.focusActionIds ?? focusIds } : actions),
    [actions, focusIds]
  );

  // Pinned: the person's last message sits at the top of the list and the answer fills the room below it.
  // The ref steers the scrolling, the state draws the spacer that makes that room.
  const pinned = useRef(false);
  const [pinnedView, setPinnedView] = useState(false);
  const pinPending = useRef(false);
  const pinViewport = useRef(0);
  const mounted = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const setPinned = (on: boolean) => {
    pinned.current = on;
    pinPending.current = on;
    if (!on) pinViewport.current = 0;
    setPinnedView(on);
  };
  const lastUserId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return messages[i].id;
    return undefined;
  }, [messages]);
  const pinRow = () => {
    const container = containerRef.current;
    if (!container || !lastUserId) return null;
    const row = Array.from(container.querySelectorAll<HTMLElement>("[data-chat-message-id]")).find(
      (el) => el.getAttribute("data-chat-message-id") === lastUserId
    );
    return row ?? null;
  };
  /** Where an element starts inside the scrolled content of the list */
  const offsetIn = (container: HTMLElement, el: HTMLElement) =>
    el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
  /** Sizes the spacer so the pinned message can reach the top; the largest height the list had counts, a keyboard must not shrink it */
  const reserveRoom = () => {
    const container = containerRef.current;
    const spacer = spacerRef.current;
    const end = endRef.current;
    const row = pinRow();
    if (!container || !spacer || !end || !row) return null;
    pinViewport.current = Math.max(pinViewport.current, container.clientHeight);
    const rowTop = offsetIn(container, row);
    spacer.style.height = `${Math.max(0, pinViewport.current - PIN_GAP - (offsetIn(container, end) - rowTop))}px`;
    return rowTop;
  };

  // Auto-scroll to bottom. Older messages added in front keep the reader where they were instead.
  useIsomorphicLayoutEffect(() => {
    const first = messages[0]?.id;
    const last = messages[messages.length - 1]?.id;
    const before = shown.current;
    const ids = new Set(messages.map((m) => m.id));
    // a list that opens with its messages is not a message being sent
    const opening = !mounted.current;
    mounted.current = true;
    shown.current = { first, last, count: messages.length, ids };
    const prepended = before.count > 0 && last === before.last && first !== before.first && messages.length > before.count;
    const container = containerRef.current;
    const canPin = autoScroll && pinSentMessage;
    // the same conversation unless it had messages and none of them is left
    const continued = before.count === 0 || Array.from(before.ids).some((id) => ids.has(id));
    if (pinned.current && (!canPin || prepended || !continued || messages.length === 0)) {
      if (!prepended) stuck.current = true;
      setPinned(false);
    }
    if (prepended) {
      if (container && anchor.current) {
        container.scrollTop = anchor.current.top + (container.scrollHeight - anchor.current.height);
      }
      anchor.current = null;
      return;
    }
    const sent = before.last !== last && messages[messages.length - 1]?.role === "user";
    // The person's own new message always brings the end back into view
    if (sent) stuck.current = true;
    if (canPin && !opening && sent && continued && messages.length > before.count && (before.count > 0 || messages.length === 1)) {
      setPinned(true);
      return;
    }
    // while pinned the answer fills the room below the message; nothing follows it
    if (pinned.current) return;
    if (autoScroll && container && stuck.current) {
      // Scroll the message list itself. `scrollIntoView` would also scroll every scrollable ancestor,
      // the page included, so a host page a little taller than the window would jump on every answer.
      if (typeof container.scrollTo === "function") {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [messages, streamingText, streamingReasoning, activeToolCalls, plan, condensing, autoScroll, pinSentMessage]);

  // Pinned: keep the room under the message, and scroll the message to the top when it was just sent
  useIsomorphicLayoutEffect(() => {
    if (!pinned.current || !pinnedView) return;
    const rowTop = reserveRoom();
    if (!pinPending.current) return;
    const container = containerRef.current;
    if (!container || rowTop === null) return;
    pinPending.current = false;
    const top = Math.max(0, rowTop - PIN_GAP);
    const calm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    if (typeof container.scrollTo === "function") {
      container.scrollTo({ top, behavior: calm ? "auto" : "smooth" });
    } else {
      container.scrollTop = top;
    }
  }, [messages, streamingText, streamingReasoning, activeToolCalls, plan, condensing, pinnedView]); // eslint-disable-line react-hooks/exhaustive-deps

  // The list or its content changing size (the keyboard, an image, a token) resizes the room, without a render
  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!pinnedView || typeof ResizeObserver === "undefined" || !container || !content) return;
    const observer = new ResizeObserver(() => {
      if (pinned.current) reserveRoom();
    });
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [pinnedView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jump to the message a search hit pointed at: the list is scrolled, never the page
  const handledFocus = useRef(onFocusHandled);
  handledFocus.current = onFocusHandled;
  const marked = useRef<{ el: HTMLElement; timer: ReturnType<typeof setTimeout> } | null>(null);
  const unmark = () => {
    if (!marked.current) return;
    clearTimeout(marked.current.timer);
    marked.current.el.classList.remove(...FOCUS_MARK);
    marked.current = null;
  };
  useEffect(() => unmark, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const container = containerRef.current;
    if (!focusMessageId || !container) return;
    const target = Array.from(container.querySelectorAll<HTMLElement>("[data-chat-message-id]")).find(
      (el) => el.getAttribute("data-chat-message-id") === focusMessageId
    );
    if (target) {
      const top = container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top - 16;
      if (typeof container.scrollTo === "function") container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      else container.scrollTop = Math.max(0, top);
      unmark();
      target.classList.add(...FOCUS_MARK);
      marked.current = { el: target, timer: setTimeout(unmark, 2000) };
    }
    handledFocus.current?.();
  }, [focusMessageId, messages]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // appearance="modern": the steps of each turn folded into one line (see `buildTurnBlocks`)
  const blocks = useMemo(
    () => (modern ? buildTurnBlocks(messages, t, { reasoning: showReasoning }) : []),
    [modern, messages, t, showReasoning]
  );

  /** One stored message, with the "model changed" divider before it and "answered with" after it. */
  const messageRow = (message: Message, index: number) => {
    const model = answerModels.get(message.id);
    return (
      <React.Fragment key={message.id}>
        {model?.switched && model.label && (
          <div role="separator" aria-label={t("chat.model.switched", { model: model.label })} className="mx-4 my-2 flex items-center gap-3 text-xs text-chat-text-tertiary">
            <span className="h-px flex-1 bg-chat-border-primary" />
            <span>{t("chat.model.switched", { model: model.label })}</span>
            <span className="h-px flex-1 bg-chat-border-primary" />
          </div>
        )}
        {isReminderMessage(message) ? (
          <ReminderNote message={message} />
        ) : (
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
          filePreview={filePreview}
          renderStopNotice={renderStopNotice}
          resolveFileUrl={resolveFileUrl}
          showReasoning={showReasoning}
          hideActivity={modern && message.role === "assistant"}
        />
        )}
        {showAnsweredWith && model?.label && (
          <p className={cn("px-4 text-xs text-chat-text-tertiary", modern ? "-mt-2 mb-3" : cn("-mt-4 mb-6", showAvatars && "pl-16"))}>
            {t("chat.model.answeredWith", { model: model.label })}
          </p>
        )}
      </React.Fragment>
    );
  };

  // What the turn being streamed is doing now, before any words arrive (modern)
  const latestTool = activeToolCalls && activeToolCalls.size > 0 ? Array.from(activeToolCalls.values()).pop() : undefined;
  const liveLabel = latestTool
    ? t("chat.activity.running", { tool: latestTool.displayName || formatToolName(latestTool.name) })
    : t("chat.activity.working");

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
      onScroll={onScroll}
      onWheel={markUserInput}
      onTouchMove={markUserInput}
      onKeyDown={markUserInput}
      onPointerDown={markUserInput}
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
      <div ref={contentRef} className={cn("max-w-3xl mx-auto", modern && "px-1 py-4 sm:px-3")}>
        {hasEarlier && onLoadEarlier && (
          <div className="flex justify-center px-4 pt-4">
            <button type="button" className={SECONDARY_BUTTON} disabled={isLoadingEarlier} onClick={loadEarlier}>
              {isLoadingEarlier ? t("chat.messages.loadingEarlier") : t("chat.messages.loadEarlier")}
            </button>
          </div>
        )}
        {/* A stored message always shows what was stored; the turn being streamed is drawn below, never in one of them */}
        {modern
          ? blocks.map((block) =>
              block.kind === "message" ? (
                messageRow(block.message, block.index)
              ) : block.kind === "activity" ? (
                <React.Fragment key={block.key}>
                  <TurnActivity items={block.items} durationMs={block.durationMs} className="px-4 pt-3" />
                  {/* the turn's plan, folded unless it was left unfinished, right above what the turn said */}
                  {block.plan && <PlanCard plan={block.plan} className="mx-4 mt-2" />}
                </React.Fragment>
              ) : (
                <div key={`cards:${block.message.id}`} data-chat-message-id={block.message.id} className="px-4">
                  <MessageActionCards message={block.message} config={cardActions} openOnly className="mt-2" />
                </div>
              )
            )
          : messages.map((message, index) => messageRow(message, index))}

        {/* The run that was answering the last message was cut off before it wrote anything */}
        {interrupted && !isStreaming && messages.length > 0 && messages[messages.length - 1].role === "user" && (
          // lined up with the text of the message above it (avatar width and gap); a host's own render owns its layout
          <InterruptedNotice
            message={messages[messages.length - 1]}
            onRetry={onRetryInterrupted}
            render={renderStopNotice}
            className={cn("mx-4 mb-6", showAvatars && !modern && "ml-16")}
          />
        )}

        {/* The plan of the turn that is running, and a note while the agent condenses what came before */}
        {isStreaming && (plan || condensing) && (
          <div className={cn("space-y-2 px-4 pb-2 animate-fade-in", modern ? "pt-1" : "pt-3")}>
            {plan && <PlanCard plan={plan} live />}
            {condensing && <CondensingLine />}
          </div>
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
            streamingReasoning={streamingReasoning}
            showReasoning={showReasoning}
            aiLabel={aiLabel}
            renderAvatar={renderAvatar}
            showAvatar={showAvatars}
            enableCitations={enableCitations}
            renderImage={renderImage}
          />
        )}

        {/* Modern: one live line - the reasoning as it arrives, or what runs now (also under words written before a call;
            the message above shows their reasoning) */}
        {modern && isStreaming && (!streamingText || workingAfterText) && (
          <div className="space-y-2 px-4 py-3 animate-fade-in">
            {showReasoning && streamingReasoning && !streamingText && <ThinkingBlock reasoning={streamingReasoning} streaming />}
            {(latestTool || streamingText || !(showReasoning && streamingReasoning)) && (
              <div role="status" className="inline-flex items-center gap-2 text-sm text-chat-text-secondary">
                <LoadingIcon className="h-4 w-4 animate-spin text-chat-text-tertiary motion-reduce:animate-none" />
                <span>{liveLabel}</span>
              </div>
            )}
            {progressMessage && <div className="text-xs text-chat-text-tertiary">{progressMessage}</div>}
          </div>
        )}

        {/* Thinking / loading indicator when streaming but no text yet, or under words written before a call */}
        {!modern && isStreaming && (!streamingText || workingAfterText) && (
          <div className={cn("flex gap-4 px-4 bg-chat-bg-secondary animate-fade-in", streamingText ? "pb-6" : "py-6")}>
            {showAvatars && (
              <div className="flex-shrink-0">
                {/* the message above has the avatar: lined up with its text */}
                {streamingText ? <div aria-hidden="true" className="w-8" /> : renderAvatar ? renderAvatar("assistant") : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium bg-chat-bg-tertiary text-chat-text-primary">
                    {t("chat.message.ai")}
                  </div>
                )}
              </div>
            )}
            <div className="flex-1 min-w-0 flex flex-col gap-3 py-1">
              {showReasoning && streamingReasoning && !streamingText && (
                <ThinkingBlock reasoning={streamingReasoning} streaming />
              )}
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
      </div>
      {pinnedView && (
        <>
          <div ref={endRef} aria-hidden="true" data-chat-pin-end style={{ height: 0 }} />
          <div ref={spacerRef} aria-hidden="true" data-chat-pin-space style={{ height: 0 }} />
        </>
      )}
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
