"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../../utils";
import type { BackgroundAlerts } from "../../hooks/useBackgroundAlerts";
import { useI18n } from "../../hooks/useI18n";
import { BellIcon } from "./Icons";
import { FOCUS_RING } from "./styles";

export interface NotificationsMenuProps {
  alerts: BackgroundAlerts;
  /** What the host offers */
  offer: { sound: boolean; desktop: boolean };
  className?: string;
}

function Switch({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (on: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span id={id} className="text-sm text-chat-text-primary">
          {label}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={id}
          onClick={() => onChange(!checked)}
          className={cn("relative h-5 w-9 flex-shrink-0 rounded-full transition-colors", FOCUS_RING, checked ? "bg-chat-accent-primary" : "bg-chat-bg-hover")}
        >
          <span
            aria-hidden="true"
            className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", checked ? "left-[1.1rem]" : "left-0.5")}
          />
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-chat-text-tertiary">{hint}</p>}
    </div>
  );
}

/**
 * The bell in the header: a small panel where the person chooses how a finished answer or a waiting
 * approval reaches them while the tab is in the background. Desktop notifications ask the browser for
 * permission only when the person turns them on here.
 */
export function NotificationsMenu({ alerts, offer, className }: NotificationsMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const desktopHint =
    !alerts.desktopSupported || alerts.permission === "unsupported"
      ? t("chat.notifications.unsupported")
      : alerts.permission === "denied"
        ? t("chat.notifications.denied")
        : undefined;
  const anyOn = (offer.sound && alerts.prefs.sound) || (offer.desktop && alerts.prefs.desktop);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={t("chat.notifications.label")}
        aria-label={t("chat.notifications.label")}
        onClick={() => setOpen((current) => !current)}
        className={cn("relative rounded-lg p-2 text-chat-text-secondary hover:bg-chat-bg-hover", FOCUS_RING)}
      >
        <BellIcon className="h-5 w-5" />
        {anyOn && <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-chat-accent-primary" />}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t("chat.notifications.label")}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              buttonRef.current?.focus();
            }
          }}
          className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-chat-border-primary bg-chat-bg-secondary py-1 shadow-xl"
        >
          <p className="px-3 py-2 text-xs text-chat-text-secondary">{t("chat.notifications.intro")}</p>
          {offer.sound && <Switch label={t("chat.notifications.sound")} checked={alerts.prefs.sound} onChange={alerts.setSound} />}
          {offer.desktop && (
            <Switch
              label={t("chat.notifications.desktop")}
              checked={alerts.prefs.desktop}
              onChange={(on) => void alerts.setDesktop(on)}
              hint={desktopHint}
            />
          )}
        </div>
      )}
    </div>
  );
}
