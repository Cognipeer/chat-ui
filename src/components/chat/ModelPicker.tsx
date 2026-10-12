"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "../../utils";
import type { AgentModelOption } from "../../types";
import { CheckIcon, ChevronDownIcon } from "./Icons";
import { FOCUS_RING } from "./styles";
import { useI18n } from "../../hooks/useI18n";

export interface ModelPickerProps {
  /** The models on offer (`AgentInfo.models`). Nothing is drawn with fewer than two. */
  models: AgentModelOption[];
  /** The key picked now; defaults to the entry marked `default` */
  value?: string;
  /** Called with the key the person picked */
  onChange: (key: string) => void;
  /** Closes the control (a turn is running, the composer is closed) */
  disabled?: boolean;
  /** Custom class name for the pill */
  className?: string;
}

/**
 * A compact pill that opens a list of the agent's models: label, one line of description and a check on
 * the picked one. Arrow keys move, Enter picks, Escape closes; on a narrow screen the list is a bottom
 * sheet. Drawn only when the agent offers two or more models.
 */
export function ModelPicker({ models, value, onChange, disabled = false, className }: ModelPickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = models.find((m) => m.key === value) ?? models.find((m) => m.default) ?? models[0];
  const selectedIndex = Math.max(0, models.findIndex((m) => m.key === selected?.key));

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  const openMenu = useCallback(() => {
    setActive(selectedIndex);
    setOpen(true);
  }, [selectedIndex]);

  // The list takes focus when it opens, so the arrow keys work at once
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  // A click outside closes it
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  // Closed from outside while it is open (a turn started)
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  if (models.length < 2 || !selected) return null;

  const pick = (index: number) => {
    const model = models[index];
    if (model) onChange(model.key);
    close(true);
  };

  const onButtonKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
    }
  };

  const onListKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => (i + 1) % models.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => (i - 1 + models.length) % models.length);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(models.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        pick(active);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  };

  const optionId = (index: number) => `${listId}-opt-${index}`;

  return (
    <div ref={rootRef} className="relative" data-chat-model-picker>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${t("chat.model.label")}: ${selected.label}`}
        title={t("chat.model.choose")}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onButtonKeyDown}
        className={cn(
          "inline-flex max-w-[11rem] items-center gap-1 rounded-full border border-chat-border-primary bg-chat-bg-primary px-2.5 py-1 text-xs font-medium text-chat-text-secondary transition-colors",
          "hover:bg-chat-bg-hover hover:text-chat-text-primary disabled:cursor-not-allowed disabled:opacity-50",
          FOCUS_RING,
          className
        )}
      >
        <span className="truncate">{selected.label}</span>
        <ChevronDownIcon className="h-3 w-3 flex-shrink-0" />
      </button>

      {open && (
        <>
          {/* Dims the page behind the bottom sheet of a narrow screen */}
          <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/30 sm:hidden" onClick={() => close(false)} />
          <div
            className={cn(
              "z-50 border border-chat-border-primary bg-chat-bg-primary shadow-lg",
              // narrow: a sheet at the bottom of the screen; wide: a menu above the pill
              "fixed inset-x-0 bottom-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]",
              "sm:absolute sm:inset-x-auto sm:bottom-full sm:right-0 sm:mb-2 sm:w-72 sm:rounded-xl sm:pb-0"
            )}
          >
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-label={t("chat.model.choose")}
              aria-activedescendant={optionId(active)}
              onKeyDown={onListKeyDown}
              className="max-h-[60vh] overflow-y-auto p-1 outline-none chat-scrollbar"
            >
              {models.map((model, index) => {
                const on = model.key === selected.key;
                return (
                  <li
                    key={model.key}
                    id={optionId(index)}
                    role="option"
                    aria-selected={on}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(index)}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2",
                      index === active ? "bg-chat-bg-hover" : "bg-transparent"
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-chat-text-primary">{model.label}</span>
                      {model.description && (
                        <span className="block truncate text-xs text-chat-text-tertiary">{model.description}</span>
                      )}
                    </span>
                    {on && <CheckIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-chat-accent-primary" />}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
