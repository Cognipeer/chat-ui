"use client";

import React, { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef, KeyboardEvent, ChangeEvent } from "react";
import { cn, formatFileSize } from "../../utils";
import type { FileAttachment } from "../../types";
import { SendIcon, PaperclipIcon, XIcon, StopIcon } from "./Icons";
import { useI18n } from "../../hooks";

export interface ChatInputHandle {
  /** Programmatically focus the textarea */
  focus: () => void;
}

export interface ChatInputProps {
  /**
   * Callback when sending a message. The composer clears at once; if this returns
   * (or resolves to) `false` the message was refused, and the typed text comes
   * back unless something new was typed meanwhile.
   */
  onSend: (message: string) => void | boolean | Promise<void | boolean>;
  /** Callback when stopping generation */
  onStop?: () => void;
  /** Callback when files are added */
  onFilesAdd?: (files: File[]) => void;
  /** Callback when a pending file is removed */
  onFileRemove?: (fileId: string) => void;
  /** Whether currently loading/streaming */
  isLoading?: boolean;
  /** Pending files */
  pendingFiles?: FileAttachment[];
  /** Placeholder text */
  placeholder?: string;
  /** Enable file upload */
  enableFileUpload?: boolean;
  /** Allowed file types */
  allowedFileTypes?: string[];
  /** Maximum files */
  maxFiles?: number;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
  /** Render custom send button */
  renderSendButton?: (props: { onClick: () => void; disabled: boolean }) => React.ReactNode;
  /** Render custom stop button */
  renderStopButton?: (props: { onClick: () => void }) => React.ReactNode;
  /** Auto-focus the textarea on mount */
  autoFocus?: boolean;
  /**
   * What the composer does while the assistant waits for an approval or answer.
   * `blocked` disables input, `cancel` allows a message that cancels the request,
   * `answer` sends the text as the answer to the open question.
   */
  pendingMode?: "blocked" | "cancel" | "answer";
}

/**
 * Chat input component with file upload support
 */
export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput({
  onSend,
  onStop,
  onFilesAdd,
  onFileRemove,
  isLoading = false,
  pendingFiles = [],
  placeholder,
  enableFileUpload = true,
  allowedFileTypes,
  maxFiles = 10,
  disabled = false,
  className,
  renderSendButton,
  renderStopButton,
  autoFocus = false,
  pendingMode,
}, ref) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const blocked = pendingMode === "blocked";
  const defaultPlaceholder = blocked
    ? t("chat.input.waitingPlaceholder")
    : placeholder ?? t("chat.input.placeholder");
  const pendingNotice =
    pendingMode === "blocked"
      ? t("chat.input.waitingNotice")
      : pendingMode === "cancel"
        ? t("chat.input.cancelNotice")
        : pendingMode === "answer"
          ? t("chat.input.answerNotice")
          : null;

  // Expose focus method to parent via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      textareaRef.current?.focus();
    },
  }), []);

  // Auto-focus on mount if requested
  useEffect(() => {
    if (autoFocus) {
      // Small delay to ensure the component is fully rendered
      const timer = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  const fitHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  // A refused message puts its text back (the textarea grows to fit it again)
  const restoreRef = useRef(false);
  useEffect(() => {
    if (!restoreRef.current) return;
    restoreRef.current = false;
    fitHeight();
  }, [value, fitHeight]);

  const handleSend = useCallback(() => {
    if (value.trim() && !isLoading && !disabled && !blocked) {
      const text = value.trim();
      const outcome = onSend(text);
      setValue("");
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      const keep = (refused: unknown) => {
        if (refused !== false) return;
        restoreRef.current = true;
        setValue((typed) => (typed === "" ? text : typed));
      };
      if (outcome && typeof (outcome as PromiseLike<unknown>).then === "function") {
        (outcome as PromiseLike<void | boolean>).then(keep, () => keep(false));
      } else {
        keep(outcome);
      }
    }
  }, [value, isLoading, disabled, blocked, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFilesChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0 && onFilesAdd) {
        onFilesAdd(Array.from(files));
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onFilesAdd]
  );

  const canSend = value.trim().length > 0 && !isLoading && !disabled && !blocked;

  return (
    <div className={cn("border-t border-chat-border-primary bg-chat-bg-primary p-4", className)}>
      <div className="max-w-3xl mx-auto">
        {/* Waiting on an approval or answer */}
        {pendingNotice && (
          <div
            role="status"
            className="mb-2 rounded-lg border border-chat-border-primary bg-chat-bg-secondary px-3 py-2 text-xs text-chat-text-secondary"
          >
            {pendingNotice}
          </div>
        )}

        {/* Pending files */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {pendingFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-chat-bg-tertiary rounded-lg text-sm"
              >
                <span className="text-chat-text-primary truncate max-w-[150px]">
                  {file.name}
                </span>
                <span className="text-chat-text-tertiary text-xs">
                  {formatFileSize(file.size)}
                </span>
                {onFileRemove && (
                  <button
                    onClick={() => onFileRemove(file.id)}
                    className="p-0.5 hover:bg-chat-bg-hover rounded"
                    title={t("chat.input.removeFile")}
                  >
                    <XIcon className="w-3.5 h-3.5 text-chat-text-tertiary" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="relative flex items-end gap-2 bg-chat-bg-tertiary rounded-2xl border border-chat-border-primary focus-within:border-chat-text-tertiary transition-colors">
          {/* File upload button */}
          {enableFileUpload && onFilesAdd && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={allowedFileTypes?.join(",")}
                onChange={handleFilesChange}
                className="hidden"
              />
              <button
                onClick={handleFileSelect}
                disabled={disabled || pendingFiles.length >= maxFiles}
                className={cn(
                  "flex-shrink-0 p-3 text-chat-text-secondary hover:text-chat-text-primary transition-colors",
                  (disabled || pendingFiles.length >= maxFiles) && "opacity-50 cursor-not-allowed"
                )}
                title={t("chat.input.attachFiles")}
              >
                <PaperclipIcon className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={defaultPlaceholder}
            disabled={disabled || blocked}
            rows={1}
            className={cn(
              "flex-1 bg-transparent border-none outline-none resize-none py-3 text-chat-text-primary placeholder:text-chat-text-tertiary",
              !enableFileUpload && "pl-4"
            )}
          />

          {/* Send/Stop button */}
          <div className="flex-shrink-0 p-2">
            {isLoading && onStop ? (
              renderStopButton ? (
                renderStopButton({ onClick: onStop })
              ) : (
                <button
                  onClick={onStop}
                  className="p-2 bg-chat-text-secondary hover:bg-chat-text-primary text-chat-bg-primary rounded-lg transition-colors"
                  title={t("chat.input.stop")}
                >
                  <StopIcon className="w-4 h-4" />
                </button>
              )
            ) : renderSendButton ? (
              renderSendButton({ onClick: handleSend, disabled: !canSend })
            ) : (
              <button
                onClick={handleSend}
                disabled={!canSend}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  canSend
                    ? "bg-chat-text-primary text-chat-bg-primary hover:bg-chat-text-secondary"
                    : "bg-chat-bg-hover text-chat-text-tertiary cursor-not-allowed"
                )}
                title={t("chat.input.send")}
              >
                <SendIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Helper text */}
        <div className="text-center mt-2 text-xs text-chat-text-tertiary">
          {t("chat.input.helper")}
        </div>
      </div>
    </div>
  );
});
