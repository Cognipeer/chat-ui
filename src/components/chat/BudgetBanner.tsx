"use client";

import { useId, useState } from "react";
import { cn, formatUsd } from "../../utils";
import type { ConversationBudget } from "../../types";
import { AlertIcon, LoadingIcon } from "./Icons";
import { PRIMARY_BUTTON, SECONDARY_BUTTON, FOCUS_RING } from "./styles";
import { useI18n } from "../../hooks/useI18n";

export interface BudgetBannerProps {
  /** The conversation's spend limit; nothing is shown without one unless it is `exhausted` */
  budget: ConversationBudget | null;
  /** What the conversation has cost so far, in USD */
  spentUsd?: number;
  /** The limit is used up: the conversation is paused (or ended) and the composer is closed */
  exhausted: boolean;
  /** Show the spent / limit bar (also while there is room left) */
  showMeter?: boolean;
  /** Offer "Continue": for a paused conversation whose limit has room again (raised somewhere else) */
  canContinue?: boolean;
  /** Offer a field to raise the limit, with "Increase and continue" / "Remove limit" */
  canEdit?: boolean;
  /** A continuation or a change is being sent */
  busy?: boolean;
  onContinue?: () => void;
  /** Raise (or with `null` remove) the limit; `continue` carries a paused conversation on afterwards */
  onUpdate?: (budget: ConversationBudget | null, options: { continue: boolean }) => void;
  className?: string;
}

/**
 * Where a conversation stands against its spend limit: a thin meter while there is room, and
 * a notice once it is used up. A `pause` budget waits for a higher limit and then carries on from
 * where it stopped; a `stop` budget ended and only a higher limit reopens it, so it never
 * promises to carry on. What a person may do about it is the host's call (`canContinue`, `canEdit`):
 * without either the notice tells them to ask an administrator.
 */
export function BudgetBanner({
  budget,
  spentUsd,
  exhausted,
  showMeter = true,
  canContinue = false,
  canEdit = false,
  busy = false,
  onContinue,
  onUpdate,
  className,
}: BudgetBannerProps) {
  const { t, locale } = useI18n();
  const fieldId = useId();
  const [draft, setDraft] = useState("");
  const [touched, setTouched] = useState(false);

  const meter = showMeter && budget !== null && typeof spentUsd === "number";
  if (!exhausted && !meter) return null;

  const stops = budget?.onReach === "stop";
  const spent = typeof spentUsd === "number" ? spentUsd : 0;
  const money = (amount: number) => formatUsd(amount, locale);
  const parsed = Number(draft.replace(",", "."));
  const valid = draft.trim() !== "" && Number.isFinite(parsed) && parsed > spent;

  const submit = (continueAfter: boolean) => {
    setTouched(true);
    if (!valid || !onUpdate) return;
    onUpdate({ maxCostUsd: parsed, onReach: budget?.onReach ?? "pause" }, { continue: continueAfter });
    setDraft("");
    setTouched(false);
  };

  const fraction = budget && budget.maxCostUsd > 0 ? Math.min(1, spent / budget.maxCostUsd) : 0;

  return (
    <div className={cn("space-y-2", className)} data-chat-budget={exhausted ? (stops ? "stopped" : "paused") : "ok"}>
      {meter && budget && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-chat-text-secondary">
            <span>{t("chat.budget.meterLabel")}</span>
            <span>{t("chat.budget.meter", { spent: money(spent), max: money(budget.maxCostUsd) })}</span>
          </div>
          <div
            role="progressbar"
            aria-label={t("chat.budget.meterLabel")}
            aria-valuemin={0}
            aria-valuemax={budget.maxCostUsd}
            aria-valuenow={Math.min(spent, budget.maxCostUsd)}
            aria-valuetext={t("chat.budget.meter", { spent: money(spent), max: money(budget.maxCostUsd) })}
            className="h-1.5 overflow-hidden rounded-full bg-chat-bg-tertiary"
          >
            <div
              className={cn("h-full rounded-full transition-all", exhausted ? "bg-chat-warning" : "bg-chat-accent-primary")}
              style={{ width: `${Math.round(fraction * 100)}%` }}
            />
          </div>
        </div>
      )}

      {exhausted && (
        <div role="status" className="rounded-lg border border-chat-warning bg-chat-warning-bg px-3 py-3 text-sm text-chat-warning">
          <div className="flex items-start gap-2">
            <AlertIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="font-medium">{t("chat.budget.pausedTitle")}</div>
              <div className="text-xs opacity-90">
                {stops ? t("chat.budget.stoppedBody") : t("chat.budget.pausedBody")}
                {!canEdit && !canContinue ? ` ${t("chat.budget.contactAdmin")}` : ""}
              </div>
            </div>
          </div>

          {canContinue && !canEdit && !stops && (
            <div className="mt-3">
              <button type="button" onClick={onContinue} disabled={busy} className={PRIMARY_BUTTON}>
                {busy && <LoadingIcon className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />}
                {t("chat.budget.continue")}
              </button>
            </div>
          )}

          {canEdit && (
            <div className="mt-3 space-y-2 text-chat-text-primary">
              <label htmlFor={fieldId} className="block text-xs text-chat-text-secondary">
                {t("chat.budget.newLimit")}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id={fieldId}
                  type="number"
                  inputMode="decimal"
                  min={spent}
                  step="0.01"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-invalid={touched && !valid}
                  aria-describedby={touched && !valid ? `${fieldId}-error` : undefined}
                  className={cn(
                    "w-32 rounded-lg border border-chat-border-primary bg-chat-bg-primary px-2 py-1.5 text-sm text-chat-text-primary",
                    FOCUS_RING
                  )}
                />
                <button type="button" onClick={() => submit(!stops)} disabled={busy} className={PRIMARY_BUTTON}>
                  {busy && <LoadingIcon className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />}
                  {stops ? t("chat.budget.increase") : t("chat.budget.increaseAndContinue")}
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate?.(null, { continue: !stops })}
                  disabled={busy}
                  className={SECONDARY_BUTTON}
                >
                  {t("chat.budget.remove")}
                </button>
              </div>
              {touched && !valid && (
                <div id={`${fieldId}-error`} role="alert" className="text-xs text-chat-danger">
                  {t("chat.budget.invalid", { spent: money(spent) })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
