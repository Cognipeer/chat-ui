"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../../hooks/useI18n";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "./styles";

export interface MessageEditorProps {
  /** The text being edited */
  initial: string;
  /** Resolves `false` when the new text was refused (the editor stays open) */
  onSave: (content: string) => Promise<boolean> | boolean | void;
  onCancel: () => void;
}

/**
 * Edits one of the person's messages in place. Saving sends it again and replaces everything the
 * conversation said after it, which the editor says before it does. Ctrl/Cmd+Enter saves, Escape cancels.
 */
export function MessageEditor({ initial, onSave, onCancel }: MessageEditorProps) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const noteId = useId();

  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 320)}px`;
  }, []);

  const save = async () => {
    const next = value.trim();
    if (!next || busy) return;
    setBusy(true);
    try {
      await onSave(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      data-chat-message-editor
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <textarea
        ref={ref}
        value={value}
        aria-label={t("chat.edit.label")}
        aria-describedby={noteId}
        rows={2}
        disabled={busy}
        onChange={(event) => {
          setValue(event.target.value);
          event.target.style.height = "auto";
          event.target.style.height = `${Math.min(event.target.scrollHeight, 320)}px`;
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void save();
          }
        }}
        className="w-full resize-none rounded-xl border border-chat-border-primary bg-chat-bg-tertiary px-3 py-2 text-chat-text-primary focus:border-chat-accent-primary focus:outline-none"
      />
      <p id={noteId} className="text-xs text-chat-text-tertiary">
        {t("chat.edit.note")}
      </p>
      <div className="flex gap-2">
        <button type="submit" className={PRIMARY_BUTTON} disabled={busy || value.trim() === ""}>
          {busy ? t("chat.edit.sending") : t("chat.edit.save")}
        </button>
        <button type="button" className={SECONDARY_BUTTON} onClick={onCancel} disabled={busy}>
          {t("chat.edit.cancel")}
        </button>
      </div>
    </form>
  );
}
