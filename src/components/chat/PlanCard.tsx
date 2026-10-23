"use client";

import React from "react";
import { cn, planProgress } from "../../utils";
import type { PlanSnapshot, PlanStepStatus } from "../../types";
import { AlertIcon, ChevronRightIcon, RefreshIcon } from "./Icons";
import { useI18n } from "../../hooks/useI18n";
import { FOCUS_RING } from "./styles";

export interface PlanCardProps {
  plan: PlanSnapshot;
  /**
   * The card of a turn that is still running: open to start with, and told apart for a screen reader (its changes
   * are not announced step by step). A finished turn's card starts open only while its plan is not complete.
   */
  live?: boolean;
  className?: string;
}

/**
 * What the agent plans to do and how far it is: "Plan · 2 of 5", a thin progress bar and one row per step
 * with its status. Only titles and status are shown. A click on the chevron folds the steps away.
 */
export function PlanCard({ plan, live = false, className }: PlanCardProps) {
  const { t } = useI18n();
  const { done, total, complete } = planProgress(plan);
  const [open, setOpen] = React.useState(live || !complete);
  const listId = React.useId();
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const progress = t("chat.plan.progress", { done, total });
  // a finished plan that is folded away shows its verdict instead of a bar
  const showBar = open || !complete;

  return (
    <div
      data-chat-plan
      aria-live={live ? "off" : undefined}
      className={cn("rounded-xl border border-chat-border-primary bg-chat-bg-primary px-4 py-3 text-sm", className)}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-semibold text-chat-text-primary">{t("chat.plan.title")}</span>
        {complete ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-chat-bg-tertiary px-2 py-0.5 text-xs text-chat-text-secondary">
            <CheckGlyph className="h-3 w-3 text-chat-accent-primary" />
            {t("chat.plan.done", { done, total })}
          </span>
        ) : (
          <span className="text-chat-text-secondary">{progress}</span>
        )}
        {showBar ? (
          <div
            role="progressbar"
            aria-label={t("chat.plan.title")}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-valuetext={progress}
            className="h-2 min-w-[6rem] flex-1 overflow-hidden rounded-full border border-chat-border-primary"
          >
            <div
              className="h-full bg-chat-accent-primary transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={open ? t("chat.plan.collapse") : t("chat.plan.expand")}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-chat-text-secondary transition-colors",
            "hover:bg-chat-bg-hover hover:text-chat-text-primary",
            FOCUS_RING
          )}
        >
          <ChevronRightIcon className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", open && "rotate-90")} />
        </button>
      </div>
      <ol id={listId} hidden={!open} aria-label={t("chat.plan.steps")} className="m-0 mt-3 list-none space-y-1.5 p-0">
        {plan.steps.map((step, index) => (
          <li key={`${index}:${step.id ?? ""}`} aria-current={step.status === "in-progress" ? "step" : undefined} className="flex items-start gap-2.5">
            <StatusMark status={step.status} label={statusLabel(step.status, t)} />
            <span
              className={cn(
                "min-w-0 break-words",
                step.status === "in-progress" && "font-semibold text-chat-text-primary",
                step.status === "completed" && "text-chat-text-tertiary",
                step.status === "blocked" && "text-chat-warning",
                step.status === "not-started" && "text-chat-text-primary"
              )}
            >
              {step.title}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

type Translate = ReturnType<typeof useI18n>["t"];

function statusLabel(status: PlanStepStatus, t: Translate): string {
  switch (status) {
    case "completed":
      return t("chat.plan.status.completed");
    case "in-progress":
      return t("chat.plan.status.inProgress");
    case "blocked":
      return t("chat.plan.status.blocked");
    default:
      return t("chat.plan.status.notStarted");
  }
}

/** The status of a step: a drawn mark for the eye, its name for a screen reader. */
function StatusMark({ status, label }: { status: PlanStepStatus; label: string }) {
  return (
    <span className="mt-[0.2rem] inline-flex h-4 w-4 flex-shrink-0 items-center justify-center">
      <span aria-hidden="true" className="inline-flex">
        {status === "blocked" ? (
          <AlertIcon className="h-4 w-4 text-chat-warning" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-chat-text-tertiary">
            <circle cx="12" cy="12" r="9" className={status === "completed" ? "text-chat-accent-primary" : undefined} />
            {status === "in-progress" && <path d="M12 3a9 9 0 0 1 9 9h-9Z" fill="currentColor" className="text-chat-accent-primary" />}
            {status === "completed" && <path d="m8.5 12.5 2.5 2.5 4.5-5" className="text-chat-accent-primary" />}
          </svg>
        )}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/** "Condensing earlier context…": the agent is making room by summarizing what came before. */
export function CondensingLine({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      data-chat-condensing
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-dashed border-chat-border-primary px-2.5 py-1 text-sm text-chat-text-secondary",
        className
      )}
    >
      <span aria-hidden="true" className="inline-flex">
        <RefreshIcon className="h-3.5 w-3.5 animate-spin text-chat-text-tertiary motion-reduce:animate-none" />
      </span>
      <span>{t("chat.live.condensing")}</span>
    </div>
  );
}
