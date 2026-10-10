"use client";

import React, { useId, useState } from "react";
import { cn, optionValue } from "../../utils";
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

type ToolApprovalAction = Extract<PendingAction, { type: "tool_approval" }>;
type QuestionAction = Extract<PendingAction, { type: "user_question" }>;
type ToolApprovalResolution = Extract<ActionResolution, { type: "tool_approval" }>;
type QuestionResolution = Extract<ActionResolution, { type: "user_question" }>;

const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent-primary focus-visible:ring-offset-1 focus-visible:ring-offset-chat-bg-secondary";

const BUTTON_BASE = cn(
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
  "disabled:opacity-50 disabled:cursor-not-allowed",
  FOCUS_RING
);

const PRIMARY_BUTTON = cn(
  BUTTON_BASE,
  "bg-chat-accent-primary text-chat-text-inverse hover:bg-chat-accent-secondary"
);

const SECONDARY_BUTTON = cn(
  BUTTON_BASE,
  "border border-chat-border-primary bg-chat-bg-primary text-chat-text-primary hover:bg-chat-bg-hover"
);

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
  return <LoadingIcon className="w-3.5 h-3.5 animate-spin" />;
}

/** One line saying how a settled card ended. */
function Outcome({ icon, children }: { icon: "ok" | "no"; children: React.ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-2 text-xs text-chat-text-secondary">
      {icon === "ok" ? (
        <CheckIcon className="w-3.5 h-3.5 mt-px text-chat-accent-primary flex-shrink-0" />
      ) : (
        <XIcon className="w-3.5 h-3.5 mt-px text-chat-text-tertiary flex-shrink-0" />
      )}
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
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
  onResolve: (resolution: ToolApprovalResolution) => void;
  className?: string;
}

/**
 * Asks the user to allow or deny a tool call. Arguments are tucked behind a
 * "Details" toggle so the default view stays readable.
 */
export function ToolApprovalCard({
  action,
  state,
  readOnly = false,
  onResolve,
  className,
}: ToolApprovalCardProps) {
  const { t } = useI18n();
  const uid = useId();
  const [showDetails, setShowDetails] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");
  const [remember, setRemember] = useState(false);

  const status = state?.status ?? "pending";
  const resolving = status === "resolving";
  const waiting = status === "pending" || resolving;
  const resolution = state?.resolution?.type === "tool_approval" ? state.resolution : undefined;
  const hasArgs = Boolean(action.args && Object.keys(action.args).length > 0);

  const title = action.title ?? t("chat.action.approval.title", { tool: action.toolName });
  const summary = action.summary ?? t("chat.action.approval.summary");

  const submit = (decision: "allow" | "deny") => {
    const comment = decision === "deny" ? reason.trim() : "";
    onResolve({
      type: "tool_approval",
      decision,
      ...(comment ? { comment } : {}),
      ...(decision === "allow" && remember ? { rememberForSession: true } : {}),
    });
  };

  return (
    <div role="group" aria-labelledby={`${uid}-title`} className={cn(CARD, className)}>
      <div className="flex items-start gap-2.5">
        <ToolIcon className="w-4 h-4 mt-0.5 text-chat-accent-primary flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div id={`${uid}-title`} className="font-medium break-words">
            {title}
          </div>
          <div className="mt-0.5 text-chat-text-secondary break-words">{summary}</div>
        </div>
      </div>

      {hasArgs && (
        <div className="mt-3">
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
            {showDetails ? t("chat.action.hideDetails") : t("chat.action.details")}
          </button>
          {showDetails && (
            <pre
              id={`${uid}-details`}
              tabIndex={0}
              className={cn(
                "mt-2 max-h-60 overflow-auto rounded-lg bg-chat-bg-tertiary p-3 text-xs font-mono text-chat-text-primary whitespace-pre-wrap break-words",
                FOCUS_RING
              )}
            >
              {JSON.stringify(action.args, null, 2)}
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
              <button type="button" className={PRIMARY_BUTTON} disabled={resolving} onClick={() => submit("allow")}>
                {t("chat.action.approve")}
              </button>
            </div>
          </>
        )}

        {status === "resolved" && (
          <>
            {resolution?.decision === "deny" ? (
              <Outcome icon="no">
                {t("chat.action.denied")}
                {resolution.comment ? ` — ${resolution.comment}` : ""}
              </Outcome>
            ) : resolution?.decision === "allow" ? (
              <Outcome icon="ok">{t("chat.action.approved")}</Outcome>
            ) : (
              <Outcome icon="ok">{t("chat.action.resolvedElsewhere")}</Outcome>
            )}
          </>
        )}
        {status === "cancelled" && <Outcome icon="no">{t("chat.action.cancelled")}</Outcome>}
        {status === "expired" && <Outcome icon="no">{t("chat.action.expired")}</Outcome>}
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
 * waits for Send.
 */
export function QuestionCard({
  action,
  state,
  readOnly = false,
  onResolve,
  className,
}: QuestionCardProps) {
  const { t } = useI18n();
  const uid = useId();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const status = state?.status ?? "pending";
  const resolving = status === "resolving";
  const waiting = status === "pending" || resolving;
  const resolution = state?.resolution?.type === "user_question" ? state.resolution : undefined;

  const questions = action.questions;
  const instant =
    questions.length === 1 && !questions[0].multiSelect && (questions[0].options?.length ?? 0) > 0;
  const allowSkip = !questions.some((q) => q.required);

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { selected: [], text: "" }), ...patch } }));

  const collect = (): Record<string, string | string[]> | null => {
    const answers: Record<string, string | string[]> = {};
    for (const q of questions) {
      const a = answerOf(q, drafts[q.question]);
      if (a === undefined) {
        if (q.required) return null;
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
                  {q.required && (
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
            <Outcome icon="no">{t("chat.question.skipped")}</Outcome>
          ) : (
            <Outcome icon="ok">{t("chat.question.answered")}</Outcome>
          ))}
        {status === "cancelled" && <Outcome icon="no">{resolution?.cancelled ? t("chat.question.skipped") : t("chat.action.cancelled")}</Outcome>}
        {status === "expired" && <Outcome icon="no">{t("chat.action.expired")}</Outcome>}
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
}

/** Cards for every action a message paused on. */
export function MessageActionCards({
  message,
  config,
}: {
  message: Message;
  config?: ChatActionsConfig;
}) {
  const actions = message.pendingActions;
  if (!actions || actions.length === 0) return null;

  const canResolve = config?.canResolve !== false && Boolean(config?.onResolve);

  return (
    <div className="mt-3 space-y-3">
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
                <ToolApprovalCard action={action} state={state} readOnly={readOnly} onResolve={resolve} />
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
              <QuestionCard action={action} state={state} readOnly={readOnly} onResolve={resolve} />
            )}
          </div>
        );
      })}
    </div>
  );
}
