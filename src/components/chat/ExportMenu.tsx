"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { cn } from "../../utils";
import type { ExportFormat } from "../../types";
import { useI18n } from "../../hooks/useI18n";
import { DownloadIcon } from "./Icons";
import { FOCUS_RING } from "./styles";

export interface ExportMenuProps {
  formats: ExportFormat[];
  /** Produces the file; the menu shows it is busy until this settles */
  onExport: (format: ExportFormat) => Promise<void> | void;
  disabled?: boolean;
  className?: string;
}

/** A button that opens a small menu of file formats for downloading the conversation. */
export function ExportMenu({ formats, onExport, disabled = false, className }: ExportMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  useEffect(() => {
    if (open) rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next]!.focus();
  };

  const run = async (format: ExportFormat) => {
    close(true);
    setBusy(true);
    try {
      await onExport(format);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={t("chat.export.label")}
        aria-label={t("chat.export.label")}
        onClick={() => setOpen((current) => !current)}
        className={cn("rounded-lg p-2 text-chat-text-secondary hover:bg-chat-bg-hover disabled:opacity-50", FOCUS_RING)}
      >
        <DownloadIcon className="h-5 w-5" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t("chat.export.label")}
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-50 mt-1 min-w-[12rem] rounded-lg border border-chat-border-primary bg-chat-bg-secondary py-1 shadow-xl"
        >
          {formats.map((format) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => void run(format)}
              className={cn("block w-full px-3 py-2 text-left text-sm text-chat-text-primary hover:bg-chat-bg-hover", FOCUS_RING)}
            >
              {t(`chat.export.format.${format}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
