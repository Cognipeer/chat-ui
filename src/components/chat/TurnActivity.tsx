"use client";

import React from "react";
import {
  cn,
  imagePartSource,
  isActionPending,
  messageText,
  messageWarnings,
  reasoningOf,
  stopNoticeKind,
  waitingToolCallIds,
} from "../../utils";
import type { ActionState, Message, PendingAction } from "../../types";
import { storedToolCalls } from "./ChatMessage";
import { formatToolName } from "./ToolCall";
import { ChevronRightIcon, LoadingIcon } from "./Icons";
import { useI18n } from "../../hooks/useI18n";
import { FOCUS_RING } from "./styles";

type Translate = ReturnType<typeof useI18n>["t"];

/** One line of the timeline under the "worked for ..." summary. */
export type ActivityItem =
  | { kind: "thinking"; key: string; text: string }
  | { kind: "tool"; key: string; name: string; label: string; detail?: string; waiting: boolean }
  | { kind: "action"; key: string; label: string; detail?: string; tone: "positive" | "negative" | "neutral" };

/** Argument keys that say best what a call was about, in order of preference. */
const TELLING_ARGS = ["query", "q", "search", "question", "url", "path", "file", "name", "prompt", "input", "text"];

/** A short quote of what a call was asked to do (`"cognipeer pricing"`), or undefined. */
function argSummary(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined;
  const values = [...TELLING_ARGS.map((k) => args[k]), ...Object.values(args)];
  const found = values.find((v): v is string => typeof v === "string" && v.trim().length > 0);
  if (!found) return undefined;
  const flat = found.replace(/\s+/g, " ").trim();
  return `“${flat.length > 90 ? `${flat.slice(0, 89)}…` : flat}”`;
}

function actionItem(messageId: string, action: PendingAction, state: ActionState, t: Translate): ActivityItem | undefined {
  const key = `${messageId}:action:${action.id}`;
  if (action.type === "client_tool") return undefined;
  if (action.type === "tool_approval") {
    const tool = formatToolName(action.toolName);
    const resolution = state.resolution?.type === "tool_approval" ? state.resolution : undefined;
    if (state.status === "cancelled") return { kind: "action", key, label: t("chat.activity.cancelled", { tool }), tone: "neutral" };
    if (state.status === "expired") return { kind: "action", key, label: t("chat.activity.expired", { tool }), tone: "neutral" };
    if (resolution?.decision === "deny") {
      return { kind: "action", key, label: t("chat.activity.denied", { tool }), detail: resolution.comment, tone: "negative" };
    }
    if (resolution?.decision === "allow") {
      return {
        kind: "action",
        key,
        label: t("chat.activity.approved", { tool }),
        detail: resolution.rememberForSession ? t("chat.action.remembered") : undefined,
        tone: "positive",
      };
    }
    return { kind: "action", key, label: t("chat.activity.answered", { subject: tool }), tone: "neutral" };
  }
  const subject = action.questions[0]?.header || action.questions[0]?.question || t("chat.question.title");
  if (state.status === "cancelled") return { kind: "action", key, label: t("chat.activity.skipped", { subject }), tone: "neutral" };
  if (state.status === "expired") return { kind: "action", key, label: t("chat.activity.expired", { tool: subject }), tone: "neutral" };
  const resolution = state.resolution?.type === "user_question" ? state.resolution : undefined;
  if (resolution?.cancelled) return { kind: "action", key, label: t("chat.activity.skipped", { subject }), tone: "neutral" };
  const answers = resolution ? Object.values(resolution.answers).flat().filter(Boolean) : [];
  return {
    kind: "action",
    key,
    label: t("chat.activity.answered", { subject }),
    detail: answers.length > 0 ? answers.join(", ") : undefined,
    tone: "positive",
  };
}

/**
 * What an agent did in these messages, in order: the calls it made, its reasoning, and the approvals and
 * questions that were already answered (an open one is a card of its own, not a line here).
 */
export function activityItems(messages: Message[], t: Translate, options: { reasoning?: boolean } = {}): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const message of messages) {
    const calls = storedToolCalls(message);
    const waiting = waitingToolCallIds(message, calls);
    calls.forEach((call, index) => {
      items.push({
        kind: "tool",
        key: `${message.id}:tool:${call.id}:${index}`,
        name: call.name,
        label: call.displayName || formatToolName(call.name),
        detail: argSummary(call.args) ?? call.reasoning,
        waiting: waiting.has(call.id),
      });
    });
    const reasoning = options.reasoning === false ? "" : reasoningOf(message);
    if (reasoning) items.push({ kind: "thinking", key: `${message.id}:thinking`, text: reasoning });
    for (const action of message.pendingActions ?? []) {
      const state = message.actionStates?.[action.id];
      if (!state || state.status === "pending" || state.status === "resolving") continue;
      const item = actionItem(message.id, action, state, t);
      if (item) items.push(item);
    }
  }
  return items;
}

/** "24s", "2m 5s" in the chat's language. */
export function formatDuration(ms: number, t: Translate): string {
  const total = Math.max(1, Math.round(ms / 1000));
  if (total < 60) return t("chat.activity.seconds", { s: total });
  return t("chat.activity.minutes", { m: Math.floor(total / 60), s: total % 60 });
}

function timeOf(value: Date | string | undefined): number {
  if (!value) return NaN;
  return new Date(value).getTime();
}

/**
 * How long a turn worked: from the person's message to the last of these messages. Undefined when the
 * timestamps do not tell (missing, out of order, or more than a day apart).
 */
export function turnDuration(steps: Message[], startedAt?: Date | string): number | undefined {
  if (steps.length === 0) return undefined;
  const start = timeOf(startedAt ?? steps[0].createdAt);
  const last = steps[steps.length - 1];
  const end = Math.max(timeOf(last.updatedAt), timeOf(last.createdAt));
  const ms = end - start;
  if (!Number.isFinite(ms) || ms < 1000 || ms > 86_400_000) return undefined;
  return ms;
}

/**
 * An assistant message that shows something of its own: words, pictures, files, a stop notice or a
 * warning. The others are steps (a reasoning, a call, an answered approval) and only feed the activity line.
 */
export function hasVisibleBody(message: Message): boolean {
  if (message.role !== "assistant") return true;
  if (messageText(message.content).trim()) return true;
  if (typeof message.content !== "string" && message.content.some((part) => imagePartSource(part))) return true;
  if (message.files && message.files.length > 0) return true;
  if (stopNoticeKind(message)) return true;
  return messageWarnings(message).length > 0;
}

/** One thing the modern message list draws, in order. */
export type TurnBlock =
  | { kind: "message"; message: Message; index: number }
  | { kind: "activity"; key: string; items: ActivityItem[]; durationMs?: number }
  /** The open approvals and questions of a message that is otherwise only steps */
  | { kind: "cards"; message: Message; index: number };

function hasOpenCards(message: Message): boolean {
  return Boolean(message.pendingActions?.some((a) => a.type !== "client_tool" && isActionPending(message, a.id)));
}

/**
 * The messages as the modern list draws them: the person's messages as they are, and for the assistant
 * the steps of a turn folded into an activity line, followed by what the turn said (or the card it waits on).
 */
export function buildTurnBlocks(messages: Message[], t: Translate, options: { reasoning?: boolean } = {}): TurnBlock[] {
  const blocks: TurnBlock[] = [];
  let bucket: Message[] = [];
  let since: Date | string | undefined;
  const flush = () => {
    if (bucket.length === 0) return;
    const items = activityItems(bucket, t, options);
    if (items.length > 0) {
      blocks.push({ kind: "activity", key: `activity:${bucket[0].id}`, items, durationMs: turnDuration(bucket, since) });
    }
    bucket = [];
  };
  messages.forEach((message, index) => {
    if (message.role !== "assistant") {
      flush();
      blocks.push({ kind: "message", message, index });
      since = message.createdAt;
      return;
    }
    bucket.push(message);
    if (hasVisibleBody(message)) {
      flush();
      blocks.push({ kind: "message", message, index });
      since = message.updatedAt ?? message.createdAt;
    } else if (hasOpenCards(message)) {
      flush();
      blocks.push({ kind: "cards", message, index });
      since = message.updatedAt ?? message.createdAt;
    }
  });
  flush();
  return blocks;
}

export interface TurnActivityProps {
  items: ActivityItem[];
  /** Milliseconds the turn worked, when known */
  durationMs?: number;
  /** The turn is still running: the summary says so */
  live?: boolean;
  /** What the live summary says it is doing now (a running tool), instead of "Working…" */
  liveLabel?: string;
  className?: string;
}

/**
 * The agent's work in a turn, folded into one line: "Worked for 24s · Web Search ×4". A click opens the
 * timeline: each call with what it was asked, the reasoning (itself folded) and the answered approvals.
 */
export function TurnActivity({ items, durationMs, live = false, liveLabel, className }: TurnActivityProps) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  if (items.length === 0 && !live) return null;

  const tools = items.filter((item): item is Extract<ActivityItem, { kind: "tool" }> => item.kind === "tool");
  const names = Array.from(new Set(tools.map((tool) => tool.label)));
  const onlyThinking = tools.length === 0 && items.every((item) => item.kind === "thinking");
  const duration = durationMs !== undefined ? formatDuration(durationMs, t) : undefined;

  const head = live
    ? liveLabel ?? t("chat.activity.working")
    : onlyThinking
      ? duration
        ? t("chat.activity.thoughtFor", { duration })
        : t("chat.activity.thought")
      : duration
        ? t("chat.activity.workedFor", { duration })
        : t("chat.activity.worked");
  const tail =
    tools.length === 0
      ? undefined
      : names.length === 1
        ? t("chat.activity.toolTimes", { tool: names[0], count: tools.length })
        : t("chat.activity.steps", { count: tools.length });

  return (
    <div className={cn("text-sm", className)} data-chat-activity>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        disabled={items.length === 0}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "-ml-1.5 inline-flex max-w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-chat-text-secondary transition-colors",
          "hover:bg-chat-bg-hover hover:text-chat-text-primary disabled:cursor-default disabled:hover:bg-transparent",
          FOCUS_RING
        )}
      >
        {live ? (
          <LoadingIcon className="h-4 w-4 flex-shrink-0 animate-spin text-chat-text-tertiary motion-reduce:animate-none" />
        ) : (
          <CheckRing className="h-4 w-4 flex-shrink-0 text-chat-accent-primary" />
        )}
        <span className="min-w-0 truncate">
          {head}
          {tail ? <span className="text-chat-text-tertiary"> · {tail}</span> : null}
        </span>
        {items.length > 0 && (
          <ChevronRightIcon
            className={cn("h-3.5 w-3.5 flex-shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-90")}
          />
        )}
      </button>
      <ol
        id={id}
        hidden={!open}
        aria-label={t("chat.activity.label")}
        className="m-0 ml-[0.55rem] mt-1.5 list-none space-y-2.5 border-l border-chat-border-primary py-1 pl-4"
      >
        {items.map((item) => (
          <li key={item.key} className="relative">
            <span
              aria-hidden="true"
              className={cn(
                "absolute -left-[1.3rem] top-[0.45rem] h-2 w-2 rounded-full border bg-chat-bg-primary",
                item.kind === "action" && item.tone === "negative" ? "border-chat-danger" : "border-chat-text-tertiary"
              )}
            />
            {item.kind === "thinking" ? (
              <ThinkingLine text={item.text} />
            ) : (
              <>
                <div className={cn("break-words", item.kind === "action" && item.tone === "negative" ? "text-chat-danger" : "text-chat-text-primary")}>
                  {item.label}
                  {item.kind === "tool" && item.waiting ? (
                    <span className="text-chat-warning"> · {t("chat.toolCall.waiting")}</span>
                  ) : null}
                </div>
                {item.detail && <div className="break-words text-xs text-chat-text-tertiary">{item.detail}</div>}
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A reasoning step: "Thought", and the text itself one click further. */
function ThinkingLine({ text }: { text: string }) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={cn("inline-flex items-center gap-1 rounded text-chat-text-primary hover:text-chat-text-secondary", FOCUS_RING)}
      >
        {t("chat.activity.thought")}
        <ChevronRightIcon className={cn("h-3 w-3 transition-transform motion-reduce:transition-none", open && "rotate-90")} />
      </button>
      <div
        id={id}
        hidden={!open}
        role="region"
        aria-label={t("chat.reasoning.title")}
        className="mt-1 max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-chat-text-tertiary chat-scrollbar"
      >
        {text}
      </div>
    </div>
  );
}

function CheckRing({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}
