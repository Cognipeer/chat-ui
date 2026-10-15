"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  actionDeadline,
  cn,
  isActionPending,
  isQuestionRequired,
  jsonEqual,
  optionValue,
  parseArgsText,
  splitRemaining,
  validateAgainstSchema,
} from "../../utils";
import type {
  ActionResolution,
  ActionState,
  Message,
  PendingAction,
  QuestionRenderProps,
  ToolApprovalRenderProps,
  UserQuestion,
} from "../../types";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, LoadingIcon, ToolIcon, XIcon } from "./Icons";
import { useI18n } from "../../hooks";
import { FOCUS_RING, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./styles";

type ToolApprovalAction = Extract<PendingAction, { type: "tool_approval" }>;
type QuestionAction = Extract<PendingAction, { type: "user_question" }>;
type ToolApprovalResolution = Extract<ActionResolution, { type: "tool_approval" }>;
type QuestionResolution = Extract<ActionResolution, { type: "user_question" }>;

const CARD = "rounded-xl border border-chat-border-primary bg-chat-bg-primary p-4 text-sm text-chat-text-primary";

// ============================================================================
// Shared pieces
// ============================================================================

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="flex items-center gap-2 text-xs text-chat-text-secondary">
      {children}
    </div>
  );
}

function Spinner() {
  return <LoadingIcon className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" />;
}

/** How a settled card reads: green for a yes, red for a no, amber for a lapse, grey otherwise. */
type OutcomeTone = "success" | "danger" | "warning" | "neutral";

const OUTCOME_ICON_COLOR: Record<OutcomeTone, string> = {
  success: "text-chat-success",
  danger: "text-chat-danger",
  warning: "text-chat-warning",
  neutral: "text-chat-text-tertiary",
};

/** One line saying how a settled card ended. */
function Outcome({ tone, children }: { tone: OutcomeTone; children: React.ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-2 text-xs text-chat-text-secondary">
      {tone === "success" ? (
        <CheckIcon className={cn("w-3.5 h-3.5 mt-px flex-shrink-0", OUTCOME_ICON_COLOR[tone])} />
      ) : (
        <XIcon className={cn("w-3.5 h-3.5 mt-px flex-shrink-0", OUTCOME_ICON_COLOR[tone])} />
      )}
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

/** A small label next to an outcome or a draft ("Arguments edited", "Remembered for this chat"). */
function Badge({ tone = "neutral", children }: { tone?: "neutral" | "warning"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
        tone === "warning" ? "bg-chat-warning-bg text-chat-warning" : "bg-chat-bg-tertiary text-chat-text-secondary"
      )}
    >
      {children}
    </span>
  );
}

/**
 * Counts down to a card's deadline. Ticks every 30 s, every second in the last two
 * minutes, and stops at the deadline. Undefined when the action has no usable deadline.
 */
function useDeadline(expiresAt: string | undefined, active: boolean): { remainingMs: number; expired: boolean } | undefined {
  const at = useMemo(() => actionDeadline({ expiresAt }), [expiresAt]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === undefined || !active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= at) return;
      const remaining = at - current;
      timer = setTimeout(tick, Math.min(remaining <= 120_000 ? 1000 : 30_000, remaining));
    };
    tick();
    return () => clearTimeout(timer);
  }, [at, active]);
  if (at === undefined) return undefined;
  return { remainingMs: Math.max(0, at - now), expired: now >= at };
}

/** "Expires in 23 hours", amber once less than `warnSeconds` is left. */
function Countdown({ remainingMs, warnSeconds }: { remainingMs: number; warnSeconds: number }) {
  const { t, formatRelativeTime } = useI18n();
  const { value, unit } = splitRemaining(remainingMs);
  const urgent = remainingMs <= warnSeconds * 1000;
  return (
    <div className={cn("text-xs", urgent ? "text-chat-warning" : "text-chat-text-secondary")}>
      {t("chat.action.expiresIn", { time: formatRelativeTime(value, unit) })}
    </div>
  );
}

const TEXT_ENTRY = /^(text|search|email|url|tel|password|number)$/i;

/** True when the person is typing somewhere, so a card that appears must not steal the keyboard. */
function isTyping(el: Element | null): boolean {
  if (!el || el === document.body) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return TEXT_ENTRY.test(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * Moves focus into a card that has just appeared, unless the person is typing.
 * A question lands on its first control. An approval lands on the card itself: every
 * control inside it either decides or changes what is decided, and a stray Enter or
 * Space must not do that. Tab then goes to the first control.
 */
function useFocusOnAppear(ref: React.RefObject<HTMLElement>, enabled: boolean, firstControl: boolean) {
  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root || isTyping(document.activeElement)) return;
    const target = firstControl
      ? root.querySelector<HTMLElement>("input:not([disabled]), button:not([disabled]), textarea:not([disabled])")
      : root;
    target?.focus();
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ============================================================================
// Tool approval
// ============================================================================

export interface ToolApprovalCardProps {
  action: ToolApprovalAction;
  /** Where the card is in its life; absent means waiting for an answer */
  state?: ActionState;
  /** True when this app cannot answer; shows a notice instead of the buttons */
  readOnly?: boolean;
  /**
   * Let the person edit the call's arguments before approving. The edit is checked as
   * JSON (an object) and against `action.argsSchema` when there is one; the answer then
   * carries `approvedArgs`, only when they differ from what was proposed.
   */
  allowArgumentEdit?: boolean;
  /** Turn amber when less than this many seconds are left before the deadline (default 600) */
  expiryWarningSeconds?: number;
  /** Move focus to the card when it mounts (a card that just appeared) */
  autoFocus?: boolean;
  onResolve: (resolution: ToolApprovalResolution) => void;
  className?: string;
}

/**
 * Asks the user to allow or deny a tool call. Arguments are tucked behind a
 * "Details" toggle so the default view stays readable; with `allowArgumentEdit` the
 * same toggle opens a JSON editor.
 */
export function ToolApprovalCard({
  action,
  state,
  readOnly = false,
  allowArgumentEdit = false,
  expiryWarningSeconds = 600,
  autoFocus = false,
  onResolve,
  className,
}: ToolApprovalCardProps) {
  const { t } = useI18n();
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");
  const [remember, setRemember] = useState(false);
  const proposed = useMemo(() => JSON.stringify(action.args ?? {}, null, 2), [action.args]);
  const [draft, setDraft] = useState(proposed);

  const status = state?.status ?? "pending";
  const resolving = status === "resolving";
  const deadline = useDeadline(action.expiresAt, status === "pending" || resolving);
  // Past its deadline the card stops taking answers even before the app hears it expired
  const lapsed = status === "pending" && deadline?.expired === true;
  const waiting = (status === "pending" && !lapsed) || resolving;
  const resolution = state?.resolution?.type === "tool_approval" ? state.resolution : undefined;
  const hasArgs = Boolean(action.args && Object.keys(action.args).length > 0);
  const editable = allowArgumentEdit && hasArgs && waiting && !readOnly;

  useFocusOnAppear(rootRef, autoFocus && waiting && !readOnly, false);

  // The edit: what the text says, whether it is a valid call, and whether it differs from the proposal
  const parsed = useMemo(() => parseArgsText(draft), [draft]);
  const issues = useMemo(
    () => (parsed.ok ? validateAgainstSchema(parsed.value, action.argsSchema) : []),
    [parsed, action.argsSchema]
  );
  const edited = editable && parsed.ok && !jsonEqual(parsed.value, action.args ?? {});
  const invalid = editable && (!parsed.ok || issues.length > 0);
  const problems = !editable
    ? []
    : !parsed.ok
      ? [parsed.reason === "syntax" ? t("chat.action.argsInvalid.syntax") : t("chat.action.argsInvalid.notObject")]
      : issues.map((issue) =>
          t(`chat.action.schema.${issue.code}`, {
            path: issue.path || t("chat.action.schema.root"),
            expected: issue.expected ?? "",
          })
        );

  const title = action.title ?? t("chat.action.approval.title", { tool: action.toolName });
  const summary = action.summary ?? t("chat.action.approval.summary");

  const submit = (decision: "allow" | "deny") => {
    const comment = decision === "deny" ? reason.trim() : "";
    onResolve({
      type: "tool_approval",
      decision,
      ...(comment ? { comment } : {}),
      ...(decision === "allow" && remember ? { rememberForSession: true } : {}),
      ...(decision === "allow" && edited && parsed.ok ? { approvedArgs: parsed.value } : {}),
    });
  };

  // What the card shows as the call: the edited arguments once it was approved with them
  const shownArgs = resolution?.approvedArgs ?? action.args;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      data-chat-card="tool_approval"
      role="group"
      aria-labelledby={`${uid}-title`}
      className={cn(CARD, "focus:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent-primary", className)}
    >
      <div className="flex items-start gap-2.5">
        <ToolIcon className="w-4 h-4 mt-0.5 text-chat-accent-primary flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div id={`${uid}-title`} className="font-medium break-words">
            {title}
          </div>
          <div className="mt-0.5 text-chat-text-secondary break-words">{summary}</div>
          {waiting && deadline && !deadline.expired && (
            <div className="mt-1">
              <Countdown remainingMs={deadline.remainingMs} warnSeconds={expiryWarningSeconds} />
            </div>
          )}
        </div>
      </div>

      {hasArgs && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded text-xs text-chat-text-secondary hover:text-chat-text-primary",
                FOCUS_RING
              )}
              aria-expanded={showDetails}
              aria-controls={`${uid}-details`}
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
              {editable ? t("chat.action.editArgs") : showDetails ? t("chat.action.hideDetails") : t("chat.action.details")}
            </button>
            {edited && <Badge tone="warning">{t("chat.action.argsEdited")}</Badge>}
          </div>
          {/* Why Approve is off must be readable with the editor closed too */}
          {problems.length > 0 && (
            <ul id={`${uid}-problems`} role="alert" className="mt-2 space-y-0.5 text-xs text-chat-danger">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          {showDetails && editable && (
            <div id={`${uid}-details`} className="mt-2 space-y-2">
              <textarea
                value={draft}
                disabled={resolving}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                rows={Math.min(14, Math.max(4, draft.split("\n").length))}
                aria-label={t("chat.action.argsLabel")}
                aria-invalid={invalid}
                aria-describedby={problems.length > 0 ? `${uid}-problems` : undefined}
                className={cn(
                  "w-full resize-y rounded-lg border bg-chat-bg-tertiary p-3 font-mono text-xs text-chat-text-primary",
                  invalid ? "border-chat-danger" : "border-chat-border-primary",
                  FOCUS_RING
                )}
              />
              {draft !== proposed && (
                <button
                  type="button"
                  disabled={resolving}
                  onClick={() => setDraft(proposed)}
                  className={cn(
                    "rounded text-xs text-chat-text-secondary hover:text-chat-text-primary underline underline-offset-2",
                    FOCUS_RING
                  )}
                >
                  {t("chat.action.argsReset")}
                </button>
              )}
            </div>
          )}
          {showDetails && !editable && (
            <pre
              id={`${uid}-details`}
              tabIndex={0}
              className={cn(
                "mt-2 max-h-60 overflow-auto rounded-lg bg-chat-bg-tertiary p-3 text-xs font-mono text-chat-text-primary whitespace-pre-wrap break-words",
                FOCUS_RING
              )}
            >
              {JSON.stringify(shownArgs, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="mt-3 space-y-3">
        {waiting && readOnly && <Notice>{t("chat.action.waitingElsewhere.approval")}</Notice>}

        {waiting && !readOnly && (
          <>
            {showReason && (
              <input
                type="text"
                value={reason}
                disabled={resolving}
                onChange={(e) => setReason(e.target.value)}
                aria-label={t("chat.action.reasonPlaceholder")}
                placeholder={t("chat.action.reasonPlaceholder")}
                className={cn(
                  "w-full rounded-lg border border-chat-border-primary bg-chat-bg-tertiary px-3 py-1.5 text-sm text-chat-text-primary placeholder:text-chat-text-tertiary",
                  FOCUS_RING
                )}
              />
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="inline-flex items-center gap-2 text-xs text-chat-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  disabled={resolving}
                  onChange={(e) => setRemember(e.target.checked)}
                  className={cn("accent-[var(--chat-accent-primary)]", FOCUS_RING)}
                />
                {t("chat.action.remember")}
              </label>
              {!showReason && (
                <button
                  type="button"
                  disabled={resolving}
                  onClick={() => setShowReason(true)}
                  className={cn(
                    "rounded text-xs text-chat-text-secondary hover:text-chat-text-primary underline underline-offset-2",
                    FOCUS_RING
                  )}
                >
                  {t("chat.action.addReason")}
                </button>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              {resolving && (
                <span role="status" className="mr-auto inline-flex items-center gap-1.5 text-xs text-chat-text-secondary">
                  <Spinner />
                  {t("chat.action.sending")}
                </span>
              )}
              <button type="button" className={SECONDARY_BUTTON} disabled={resolving} onClick={() => submit("deny")}>
                {t("chat.action.deny")}
              </button>
              <button
                type="button"
                className={PRIMARY_BUTTON}
                disabled={resolving || invalid}
                aria-describedby={invalid ? `${uid}-problems` : undefined}
                onClick={() => submit("allow")}
              >
                {t("chat.action.approve")}
              </button>
            </div>
          </>
        )}

        {status === "resolved" && (
          <>
            {resolution?.decision === "deny" ? (
              <Outcome tone="danger">
                {t("chat.action.denied")}
                {resolution.comment ? ` — ${resolution.comment}` : ""}
              </Outcome>
            ) : resolution?.decision === "allow" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Outcome tone="success">
                  {resolution.approvedArgs ? t("chat.action.approvedEdited") : t("chat.action.approved")}
                </Outcome>
                {resolution.rememberForSession && <Badge>{t("chat.action.remembered")}</Badge>}
              </div>
            ) : (
              <Outcome tone="neutral">{t("chat.action.resolvedElsewhere")}</Outcome>
            )}
          </>
        )}
        {status === "cancelled" && <Outcome tone="neutral">{t("chat.action.cancelled")}</Outcome>}
        {(status === "expired" || lapsed) && <Outcome tone="warning">{t("chat.action.expired")}</Outcome>}
      </div>
    </div>
  );
}

// ============================================================================
// Questions
// ============================================================================

export interface QuestionCardProps {
  action: QuestionAction;
  state?: ActionState;
  readOnly?: boolean;
  /** Turn amber when less than this many seconds are left before the deadline (default 600) */
  expiryWarningSeconds?: number;
  /** Move focus to the card's first control when it mounts (a card that just appeared) */
  autoFocus?: boolean;
  onResolve: (resolution: QuestionResolution) => void;
  className?: string;
}

interface Draft {
  selected: string[];
  text: string;
}

/** The answer a draft stands for, or undefined while it is empty. */
function answerOf(question: UserQuestion, draft: Draft | undefined): string | string[] | undefined {
  const selected = draft?.selected ?? [];
  const text = draft?.text.trim() ?? "";
  if (question.multiSelect) {
    const all = text ? [...selected, text] : selected;
    return all.length > 0 ? all : undefined;
  }
  if (text) return text;
  return selected[0];
}

/**
 * Shows the questions the assistant asked. A lone single-choice question
 * submits as soon as an option is picked; anything else collects answers and
 * waits for Send. A question is required unless the server says `required: false`;
 * Skip is offered only when none is.
 */
export function QuestionCard({
  action,
  state,
  readOnly = false,
  expiryWarningSeconds = 600,
  autoFocus = false,
  onResolve,
  className,
}: QuestionCardProps) {
  const { t } = useI18n();
  const uid = useId();
  const rootRef = useRef<HTMLFormElement>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const status = state?.status ?? "pending";
  const resolving = status === "resolving";
  const deadline = useDeadline(action.expiresAt, status === "pending" || resolving);
  // Past its deadline the card stops taking answers even before the app hears it expired
  const lapsed = status === "pending" && deadline?.expired === true;
  const waiting = (status === "pending" && !lapsed) || resolving;
  const resolution = state?.resolution?.type === "user_question" ? state.resolution : undefined;

  useFocusOnAppear(rootRef, autoFocus && waiting && !readOnly, true);

  const questions = action.questions;
  // An option with a preview needs room for it, so it is a row of the list rather than a chip that answers at once
  const hasPreviews = questions.some((q) => q.options?.some((o) => Boolean(o.preview)));
  const instant =
    questions.length === 1 && !questions[0].multiSelect && (questions[0].options?.length ?? 0) > 0 && !hasPreviews;
  const allowSkip = questions.every((q) => !isQuestionRequired(q));

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { selected: [], text: "" }), ...patch } }));

  const collect = (): Record<string, string | string[]> | null => {
    const answers: Record<string, string | string[]> = {};
    for (const q of questions) {
      const a = answerOf(q, drafts[q.question]);
      if (a === undefined) {
        if (isQuestionRequired(q)) return null;
        continue;
      }
      answers[q.question] = a;
    }
    return answers;
  };

  const answers = collect();
  const hasAnyAnswer = answers !== null && Object.keys(answers).length > 0;
  const canSend = answers !== null && hasAnyAnswer && !resolving;

  const send = () => {
    if (answers && hasAnyAnswer && !resolving) onResolve({ type: "user_question", answers });
  };

  return (
    <form
      ref={rootRef}
      data-chat-card="user_question"
      role="group"
      aria-labelledby={`${uid}-title`}
      className={cn(CARD, className)}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div id={`${uid}-title`} className="sr-only">
        {t("chat.question.title")}
      </div>

      <div className="space-y-4">
        {questions.map((q, qi) => {
          const key = q.question;
          const draft = drafts[key];
          const options = q.options ?? [];
          const showText = options.length === 0 || action.allowFreeText !== false;
          const groupName = `${uid}-q${qi}`;
          const labelId = `${groupName}-label`;
          const settledAnswer = resolution?.answers?.[key];

          return (
            <fieldset key={key} className="min-w-0 border-0 p-0 m-0" disabled={!waiting || readOnly || resolving} aria-labelledby={labelId}>
              <div className="flex flex-wrap items-center gap-2">
                {q.header && (
                  <span className="rounded-full bg-chat-bg-tertiary px-2 py-0.5 text-[0.6875rem] font-medium text-chat-text-secondary">
                    {q.header}
                  </span>
                )}
                <span id={labelId} className="font-medium break-words">
                  {q.question}
                  {isQuestionRequired(q) && (
                    <span className="ml-1 text-chat-accent-primary" aria-label={t("chat.question.required")} title={t("chat.question.required")}>
                      *
                    </span>
                  )}
                </span>
              </div>

              {waiting && !readOnly && (
                <>
                  {options.length > 0 && instant && (
                    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby={labelId}>
                      {options.map((o) => (
                        <button
                          key={o.label}
                          type="button"
                          title={o.description}
                          disabled={resolving}
                          onClick={() => onResolve({ type: "user_question", answers: { [key]: optionValue(o) } })}
                          className={cn(
                            "rounded-full border border-chat-border-primary bg-chat-bg-tertiary px-3 py-1.5 text-left text-sm text-chat-text-primary transition-colors hover:border-chat-accent-primary hover:bg-chat-bg-hover disabled:opacity-50 disabled:cursor-not-allowed",
                            FOCUS_RING
                          )}
                        >
                          <span className="block">{o.label}</span>
                          {o.description && (
                            <span className="block text-xs text-chat-text-secondary">{o.description}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {options.length > 0 && !instant && (
                    <div className="mt-2 space-y-1.5" role={q.multiSelect ? "group" : "radiogroup"} aria-labelledby={labelId}>
                      {options.map((o) => {
                        const value = optionValue(o);
                        const checked = draft?.selected.includes(value) ?? false;
                        return (
                          <label
                            key={o.label}
                            className={cn(
                              "flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors",
                              checked
                                ? "border-chat-accent-primary bg-chat-bg-tertiary"
                                : "border-chat-border-primary hover:bg-chat-bg-hover"
                            )}
                          >
                            <input
                              type={q.multiSelect ? "checkbox" : "radio"}
                              name={groupName}
                              checked={checked}
                              onChange={(e) => {
                                const current = draft?.selected ?? [];
                                if (q.multiSelect) {
                                  update(key, {
                                    selected: e.target.checked
                                      ? [...current, value]
                                      : current.filter((v) => v !== value),
                                  });
                                } else {
                                  update(key, { selected: [value], text: "" });
                                }
                              }}
                              className={cn("mt-0.5 accent-[var(--chat-accent-primary)]", FOCUS_RING)}
                            />
                            <span className="min-w-0">
                              <span className="block">{o.label}</span>
                              {o.description && (
                                <span className="block text-xs text-chat-text-secondary">{o.description}</span>
                              )}
                              {o.preview && (
                                <details className="mt-1.5 text-xs" data-chat-preview>
                                  <summary className={cn("cursor-pointer text-chat-text-secondary", FOCUS_RING)}>
                                    {t("chat.question.preview")}
                                  </summary>
                                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-chat-bg-secondary p-2 font-mono text-[0.6875rem] text-chat-text-primary">
                                    {o.preview}
                                  </pre>
                                </details>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {showText && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={draft?.text ?? ""}
                        disabled={resolving}
                        onChange={(e) =>
                          update(key, q.multiSelect || !e.target.value
                            ? { text: e.target.value }
                            : { text: e.target.value, selected: [] })
                        }
                        onKeyDown={(e) => {
                          // A lone choice question has no Send button until text is typed; Enter still sends it.
                          if (e.key === "Enter" && instant) {
                            e.preventDefault();
                            send();
                          }
                        }}
                        aria-label={q.question}
                        placeholder={
                          q.placeholder ??
                          (options.length > 0 ? t("chat.question.other") : t("chat.question.freeText"))
                        }
                        className={cn(
                          "min-w-0 flex-1 rounded-lg border border-chat-border-primary bg-chat-bg-tertiary px-3 py-1.5 text-sm text-chat-text-primary placeholder:text-chat-text-tertiary",
                          FOCUS_RING
                        )}
                      />
                    </div>
                  )}
                </>
              )}

              {status === "resolved" && settledAnswer !== undefined && (
                <div className="mt-1 text-chat-text-secondary break-words">
                  {Array.isArray(settledAnswer) ? settledAnswer.join(", ") : settledAnswer}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>

      <div className="mt-3 space-y-3">
        {waiting && deadline && !deadline.expired && (
          <Countdown remainingMs={deadline.remainingMs} warnSeconds={expiryWarningSeconds} />
        )}
        {waiting && readOnly && <Notice>{t("chat.action.waitingElsewhere.question")}</Notice>}

        {waiting && !readOnly && (
          <div className="flex items-center justify-end gap-2">
            {resolving && (
              <span role="status" className="mr-auto inline-flex items-center gap-1.5 text-xs text-chat-text-secondary">
                <Spinner />
                {t("chat.action.sending")}
              </span>
            )}
            {allowSkip && (
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={resolving}
                onClick={() => onResolve({ type: "user_question", answers: {}, cancelled: true })}
              >
                {t("chat.question.skip")}
              </button>
            )}
            {(!instant || (drafts[questions[0].question]?.text.trim() ?? "") !== "") && (
              <button type="submit" className={PRIMARY_BUTTON} disabled={!canSend}>
                {t("chat.question.send")}
              </button>
            )}
          </div>
        )}

        {status === "resolved" &&
          (resolution?.cancelled ? (
            <Outcome tone="neutral">{t("chat.question.skipped")}</Outcome>
          ) : (
            <Outcome tone="success">{t("chat.question.answered")}</Outcome>
          ))}
        {status === "cancelled" && <Outcome tone="neutral">{resolution?.cancelled ? t("chat.question.skipped") : t("chat.action.cancelled")}</Outcome>}
        {(status === "expired" || lapsed) && <Outcome tone="warning">{t("chat.action.expired")}</Outcome>}
      </div>
    </form>
  );
}

// ============================================================================
// Per-message wiring
// ============================================================================

export interface ChatActionsConfig {
  /** Answer approvals in this app (default true) */
  enableToolApprovals?: boolean;
  /** Answer questions in this app (default true) */
  enableQuestions?: boolean;
  /** False when the transport cannot resolve actions; cards become read-only */
  canResolve?: boolean;
  renderToolApproval?: (props: ToolApprovalRenderProps) => React.ReactNode;
  renderQuestion?: (props: QuestionRenderProps) => React.ReactNode;
  onResolve?: (actionId: string, resolution: ActionResolution) => void;
  /** Let the person edit a call's arguments when approving (default false) */
  allowArgumentEdit?: boolean;
  /** Cards turn amber when less than this many seconds are left before their deadline (default 600) */
  expiryWarningSeconds?: number;
  /** Cards for these actions take focus when they mount (the list sets it for cards that just appeared) */
  focusActionIds?: ReadonlySet<string>;
}

/** Cards for every action a message paused on. */
export function MessageActionCards({
  message,
  config,
  openOnly = false,
  className,
}: {
  message: Message;
  config?: ChatActionsConfig;
  /** Only the cards that still wait for an answer (the answered ones are listed elsewhere, `appearance="modern"`) */
  openOnly?: boolean;
  className?: string;
}) {
  const actions = message.pendingActions?.filter(
    (a): a is Exclude<PendingAction, { type: "client_tool" }> =>
      a.type !== "client_tool" && (!openOnly || isActionPending(message, a.id))
  );
  if (!actions || actions.length === 0) return null;

  const canResolve = config?.canResolve !== false && Boolean(config?.onResolve);

  return (
    <div className={cn("mt-3 space-y-3", className)}>
      {actions.map((action) => {
        const state = message.actionStates?.[action.id];
        if (action.type === "tool_approval") {
          const readOnly = !canResolve || config?.enableToolApprovals === false;
          const resolve = (resolution: ToolApprovalResolution) => config?.onResolve?.(action.id, resolution);
          return (
            <div key={action.id}>
              {config?.renderToolApproval ? (
                config.renderToolApproval({ action, state, readOnly, resolve })
              ) : (
                <ToolApprovalCard
                  action={action}
                  state={state}
                  readOnly={readOnly}
                  allowArgumentEdit={config?.allowArgumentEdit}
                  expiryWarningSeconds={config?.expiryWarningSeconds}
                  autoFocus={config?.focusActionIds?.has(action.id)}
                  onResolve={resolve}
                />
              )}
            </div>
          );
        }
        const readOnly = !canResolve || config?.enableQuestions === false;
        const resolve = (resolution: QuestionResolution) => config?.onResolve?.(action.id, resolution);
        return (
          <div key={action.id}>
            {config?.renderQuestion ? (
              config.renderQuestion({ action, state, readOnly, resolve })
            ) : (
              <QuestionCard
                action={action}
                state={state}
                readOnly={readOnly}
                expiryWarningSeconds={config?.expiryWarningSeconds}
                autoFocus={config?.focusActionIds?.has(action.id)}
                onResolve={resolve}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
