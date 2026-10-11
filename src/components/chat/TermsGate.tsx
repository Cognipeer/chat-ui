"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "../../utils";
import { useI18n } from "../../hooks/useI18n";
import { InfoMarkdown } from "./ChatEmptyState";
import { AlertIcon } from "./Icons";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "./styles";

export interface TermsGateProps {
  /**
   * The person has to accept before the chat is used: they have not yet, the terms changed, or their
   * acceptance ran out. `false` shows the children at once. The host decides (and records the acceptance).
   */
  required: boolean;
  title: string;
  /** The terms, in Markdown */
  body: string;
  /** Changes whenever the terms do: a new version asks again */
  version?: string | number;
  /**
   * Records the acceptance (for the portal: a request to its server). The children appear once it
   * resolves; if it throws, the form stays and says it could not be saved.
   */
  onAccept: () => void | Promise<void>;
  /** The person pressed "Decline" */
  onDecline?: () => void;
  acceptLabel?: string;
  declineLabel?: string;
  /** Heading and text of the screen shown after declining (default: localized "You need to accept to use this portal") */
  declinedTitle?: string;
  declinedBody?: string;
  /** Hosts a picture of the terms may come from */
  allowedImageHosts?: readonly string[];
  className?: string;
  children: ReactNode;
}

/**
 * Asks the person to accept the terms (or the AI-use policy) before showing the chat. Nothing behind
 * it is mounted until they accept, so no request is made on their behalf before that. Declining shows
 * a plain "you need to accept" screen with a way back to the terms.
 */
export function TermsGate({
  required,
  title,
  body,
  version,
  onAccept,
  onDecline,
  acceptLabel,
  declineLabel,
  declinedTitle,
  declinedBody,
  allowedImageHosts,
  className,
  children,
}: TermsGateProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<"asking" | "declined" | "accepted">("asking");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();

  // New terms (or an acceptance that ran out) ask again
  useEffect(() => {
    if (required) {
      setPhase("asking");
      setFailed(false);
    }
  }, [required, version]);

  // The dialog takes the keyboard when it appears
  useEffect(() => {
    if (required && phase === "asking") dialogRef.current?.focus();
  }, [required, phase]);

  if (!required || phase === "accepted") return <>{children}</>;

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onAccept();
      setPhase("accepted");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (phase === "declined") {
    return (
      <div data-chat-terms="declined" className={cn("flex h-full w-full items-center justify-center bg-chat-bg-primary p-6 text-chat-text-primary", className)}>
        <div role="status" className="max-w-md text-center">
          <AlertIcon className="mx-auto mb-3 h-8 w-8 text-chat-warning" />
          <h2 className="mb-2 text-lg font-semibold">{declinedTitle ?? t("chat.terms.declinedTitle")}</h2>
          <p className="mb-5 text-sm text-chat-text-secondary">{declinedBody ?? t("chat.terms.declinedBody")}</p>
          <button type="button" className={PRIMARY_BUTTON} onClick={() => setPhase("asking")}>
            {t("chat.terms.review")}
          </button>
        </div>
      </div>
    );
  }

  // Tab stays inside the dialog
  const keepFocusInside = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]') ?? []
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div data-chat-terms="asking" className={cn("flex h-full w-full items-center justify-center bg-chat-bg-primary p-4 text-chat-text-primary", className)}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={keepFocusInside}
        className="flex max-h-full w-full max-w-xl flex-col rounded-2xl border border-chat-border-primary bg-chat-bg-secondary shadow-xl focus:outline-none"
      >
        <h2 id={titleId} className="flex-shrink-0 border-b border-chat-border-primary px-5 py-4 text-lg font-semibold">
          {title}
        </h2>
        <div
          id={bodyId}
          tabIndex={0}
          role="region"
          aria-label={t("chat.terms.body")}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm chat-scrollbar focus:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent-primary"
        >
          <InfoMarkdown allowedImageHosts={allowedImageHosts}>{body}</InfoMarkdown>
        </div>
        {failed && (
          <p role="alert" className="mx-5 mb-2 rounded-lg border border-chat-danger bg-chat-danger-bg px-3 py-2 text-xs text-chat-danger">
            {t("chat.terms.failed")}
          </p>
        )}
        <div className="flex flex-shrink-0 flex-wrap justify-end gap-2 border-t border-chat-border-primary px-5 py-3">
          <button
            type="button"
            className={SECONDARY_BUTTON}
            disabled={busy}
            onClick={() => {
              setPhase("declined");
              onDecline?.();
            }}
          >
            {declineLabel ?? t("chat.terms.decline")}
          </button>
          <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={accept}>
            {busy ? t("chat.terms.saving") : acceptLabel ?? t("chat.terms.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
