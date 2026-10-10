"use client";

import React, { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef, KeyboardEvent, ChangeEvent, ClipboardEvent, DragEvent } from "react";
import { cn, formatFileSize, isImageType, safeImageSrc } from "../../utils";
import type { FileAttachment } from "../../types";
import { SendIcon, PaperclipIcon, XIcon, StopIcon, FileIcon, ImageIcon, LoadingIcon } from "./Icons";
import { useI18n } from "../../hooks";

export interface ChatInputHandle {
  /** Programmatically focus the textarea */
  focus: () => void;
}

export interface ChatInputProps {
  /**
   * Callback when sending a message. The composer clears at once; if this returns
   * (or resolves to) `false` the message was refused, and the typed text comes
   * back unless something new was typed meanwhile. With files attached the text
   * may be empty.
   */
  onSend: (message: string) => void | boolean | Promise<void | boolean>;
  /** Callback when stopping generation */
  onStop?: () => void;
  /** Callback when files are added (picked, dropped or pasted) */
  onFilesAdd?: (files: File[]) => void;
  /** Callback when a pending file is removed */
  onFileRemove?: (fileId: string) => void;
  /** Whether currently loading/streaming */
  isLoading?: boolean;
  /** True while the attached files are being uploaded for a message: attaching and sending wait */
  isUploading?: boolean;
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
  /** Warn that an attached image may be ignored (the agent does not read images) */
  imagesIgnored?: boolean;
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

/** True when a drag carries files (not text or a link). */
function dragHasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

/** "image.png" is what a browser calls any pasted screenshot; give each its own name. */
function nameForPasted(file: File, index: number): File {
  if (!/^image\.[a-z0-9]+$/i.test(file.name)) return file;
  const ext = file.name.slice(file.name.lastIndexOf("."));
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return new File([file], `pasted-${stamp}${index > 0 ? `-${index + 1}` : ""}${ext}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

/**
 * Chat input component with file upload support: pick, drop or paste files, send
 * files without text.
 */
export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput({
  onSend,
  onStop,
  onFilesAdd,
  onFileRemove,
  isLoading = false,
  isUploading = false,
  pendingFiles = [],
  placeholder,
  enableFileUpload = true,
  allowedFileTypes,
  maxFiles = 10,
  imagesIgnored = false,
  disabled = false,
  className,
  renderSendButton,
  renderStopButton,
  autoFocus = false,
  pendingMode,
}, ref) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
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

  // Files can be added unless the composer is closed or a message is still uploading them
  const attachable = enableFileUpload && Boolean(onFilesAdd) && !disabled && !blocked && !isUploading;
  const canAddMore = pendingFiles.length < maxFiles;
  // Files alone make a message, except as the answer to a question (that needs words)
  const hasSendable = value.trim().length > 0 || (pendingFiles.length > 0 && pendingMode !== "answer");
  const hasImages = pendingFiles.some((f) => isImageType(f.mimeType));

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
    if (hasSendable && !isLoading && !isUploading && !disabled && !blocked) {
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
  }, [value, hasSendable, isLoading, isUploading, disabled, blocked, onSend]);

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

  // A screenshot or a copied file pastes as an attachment; pasted text stays text
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      if (!attachable) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0 || e.clipboardData.getData("text/plain")) return;
      e.preventDefault();
      onFilesAdd?.(files.map(nameForPasted));
    },
    [attachable, onFilesAdd]
  );

  const handleDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!dragHasFiles(e)) return;
      dragDepth.current += 1;
      if (attachable) setDragging(true);
    },
    [attachable]
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      // Always claim a file drag over the composer: dropping must not make the browser open the file
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = attachable ? "copy" : "none";
    },
    [attachable]
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!dragHasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (attachable && files.length > 0) onFilesAdd?.(files);
    },
    [attachable, onFilesAdd]
  );

  const canSend = hasSendable && !isLoading && !isUploading && !disabled && !blocked;
  const attachDisabled = !attachable || !canAddMore;

  return (
    <div
      className={cn("relative border-t border-chat-border-primary bg-chat-bg-primary p-4", className)}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragging && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-chat-accent-primary bg-chat-bg-primary text-sm font-medium text-chat-accent-primary"
        >
          {t("chat.input.dropFiles")}
        </div>
      )}
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
          <ul aria-label={t("chat.input.files")} className="flex flex-wrap gap-2 mb-3 list-none p-0 m-0">
            {pendingFiles.map((file) => {
              const isImage = isImageType(file.mimeType);
              const thumb = isImage ? safeImageSrc(file.previewUrl ?? file.url) : undefined;
              const ignored = imagesIgnored && isImage;
              return (
                <li
                  key={file.id}
                  title={ignored ? t("chat.input.imageIgnored", { fileName: file.name }) : undefined}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 bg-chat-bg-tertiary rounded-lg text-sm border",
                    ignored ? "border-chat-warning" : "border-transparent"
                  )}
                >
                  {thumb ? (
                    <img src={thumb} alt="" className="h-8 w-8 flex-shrink-0 rounded object-cover" />
                  ) : isImage ? (
                    <ImageIcon className="w-4 h-4 flex-shrink-0 text-chat-text-secondary" />
                  ) : (
                    <FileIcon className="w-4 h-4 flex-shrink-0 text-chat-text-secondary" />
                  )}
                  <span className="text-chat-text-primary truncate max-w-[150px]">
                    {file.name}
                  </span>
                  <span className="text-chat-text-tertiary text-xs">
                    {formatFileSize(file.size)}
                  </span>
                  {isUploading && (
                    <span role="status" aria-label={t("chat.input.fileUploading", { fileName: file.name })}>
                      <LoadingIcon className="w-3.5 h-3.5 text-chat-text-tertiary animate-spin motion-reduce:animate-none" />
                    </span>
                  )}
                  {onFileRemove && !isUploading && (
                    <button
                      type="button"
                      onClick={() => onFileRemove(file.id)}
                      className="p-0.5 hover:bg-chat-bg-hover rounded"
                      title={t("chat.input.removeFile")}
                      aria-label={`${t("chat.input.removeFile")}: ${file.name}`}
                    >
                      <XIcon className="w-3.5 h-3.5 text-chat-text-tertiary" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* An attached image the agent may not read */}
        {imagesIgnored && hasImages && (
          <div
            role="status"
            className="mb-3 rounded-lg border border-chat-warning bg-chat-warning-bg px-3 py-2 text-xs text-chat-warning"
          >
            {t("chat.input.imageNotSeen")}
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
                tabIndex={-1}
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={handleFileSelect}
                disabled={attachDisabled}
                className={cn(
                  "flex-shrink-0 p-3 text-chat-text-secondary hover:text-chat-text-primary transition-colors",
                  attachDisabled && "opacity-50 cursor-not-allowed"
                )}
                title={t("chat.input.attachFiles")}
                aria-label={t("chat.input.attachFiles")}
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
            onPaste={handlePaste}
            placeholder={defaultPlaceholder}
            aria-label={t("chat.input.label")}
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
                  type="button"
                  onClick={onStop}
                  className="p-2 bg-chat-text-secondary hover:bg-chat-text-primary text-chat-bg-primary rounded-lg transition-colors"
                  title={t("chat.input.stop")}
                  aria-label={t("chat.input.stop")}
                >
                  <StopIcon className="w-4 h-4" />
                </button>
              )
            ) : renderSendButton ? (
              renderSendButton({ onClick: handleSend, disabled: !canSend })
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  canSend
                    ? "bg-chat-text-primary text-chat-bg-primary hover:bg-chat-text-secondary"
                    : "bg-chat-bg-hover text-chat-text-tertiary cursor-not-allowed"
                )}
                title={t("chat.input.send")}
                aria-label={t("chat.input.send")}
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
