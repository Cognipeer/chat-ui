"use client";

import React, { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef, KeyboardEvent, ChangeEvent, ClipboardEvent, DragEvent } from "react";
import { cn, formatFileSize, isImageType, safeImageSrc } from "../../utils";
import type { ComposerState, FileAttachment } from "../../types";
import { SendIcon, PaperclipIcon, PlusIcon, XIcon, StopIcon, FileIcon, ImageIcon, LoadingIcon, CheckIcon, RefreshIcon } from "./Icons";
import { useI18n } from "../../hooks";
import { useAppearance } from "./appearance";

export interface ChatInputHandle {
  /** Programmatically focus the textarea */
  focus: () => void;
  /** Put text in the composer (replacing what is there) and move the caret to its end */
  setValue: (text: string, options?: { focus?: boolean }) => void;
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
  /** Callback when a pending file is removed (while it is going up, that stops the upload) */
  onFileRemove?: (fileId: string) => void;
  /** Callback to upload a file again after it failed (its chip then offers a retry button) */
  onFileRetry?: (fileId: string) => void;
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
  /** Maximum files (per message, or per conversation with `filesHeld`) */
  maxFiles?: number;
  /** Files the conversation already holds; they count against `maxFiles` */
  filesHeld?: number;
  /** Show "3 of 10 files in this chat" next to the attached files */
  fileCounter?: boolean;
  /** Days the server keeps an uploaded file; shown as a hint under the composer */
  retentionDays?: number;
  /** Warn that an attached image may be ignored (the agent does not read images) */
  imagesIgnored?: boolean;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Content under the helper text (a row of legal links) */
  footer?: React.ReactNode;
  /** Shown left of the send button (the `ModelPicker`) */
  modelPicker?: React.ReactNode;
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
   * (`state` covers the same cases and more; `pendingMode` is kept for existing callers.)
   */
  pendingMode?: "blocked" | "cancel" | "answer";
  /**
   * What the composer is doing, as one value: `open`, a card is waiting (`blocked`, `cancel`,
   * `answer`), the turn runs in another window (`following`), the conversation's usage limit is
   * used up (`budget_paused`), or the chat is a transcript (`readonly`). Every state but `open`,
   * `cancel` and `answer` closes the textarea, the paperclip and the send button; the stop
   * button stays while a turn runs. Wins over `pendingMode`.
   */
  state?: ComposerState;
}

/** True when a drag carries files (not text or a link). */
function dragHasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

/** "image.png" is what a browser calls any pasted screenshot; give each its own name. */
function nameForPasted(file: File, index: number): File {
  if (!/^image\.[a-z0-9]+$/i.test(file.name)) return file;
  const ext = file.name.slice(file.name.lastIndexOf("."));
  // Digits only (YYYYMMDDHHMMSS). Keep a bracketed class with a colon inside out of this file: the
  // Tailwind scanner would read it as an arbitrary-property class and emit it as (invalid) CSS.
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
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
  onFileRetry,
  isLoading = false,
  isUploading = false,
  pendingFiles = [],
  placeholder,
  enableFileUpload = true,
  allowedFileTypes,
  maxFiles = 10,
  filesHeld = 0,
  fileCounter = false,
  retentionDays,
  imagesIgnored = false,
  disabled = false,
  footer,
  modelPicker,
  className,
  renderSendButton,
  renderStopButton,
  autoFocus = false,
  pendingMode,
  state,
}, ref) {
  const { t } = useI18n();
  const modern = useAppearance() === "modern";
  const [value, setValue] = useState("");
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mode: ComposerState = state ?? pendingMode ?? "open";
  // These close the composer: a card has to be answered first, or the turn runs elsewhere, or the limit is used up
  const blocked = mode === "blocked" || mode === "following" || mode === "budget_paused" || mode === "readonly";
  const defaultPlaceholder =
    mode === "blocked"
      ? t("chat.input.waitingPlaceholder")
      : mode === "following"
        ? t("chat.input.followingPlaceholder")
        : mode === "budget_paused"
          ? t("chat.input.budgetPlaceholder")
          : mode === "readonly"
            ? t("chat.input.readOnlyPlaceholder")
            : placeholder ?? (modern ? t("chat.input.placeholderModern") : t("chat.input.placeholder"));
  // The usage-limit banner explains itself; every other state says what it is in a line above the box
  const pendingNotice =
    mode === "blocked"
      ? t("chat.input.waitingNotice")
      : mode === "cancel"
        ? t("chat.input.cancelNotice")
        : mode === "answer"
          ? t("chat.input.answerNotice")
          : mode === "following"
            ? t("chat.input.followingNotice")
            : mode === "readonly"
              ? t("chat.input.readOnlyNotice")
              : null;

  // Files going up for the message being sent (their chips carry no state) close the composer; files stored
  // as soon as they were picked show their own progress and only hold the send back
  const messageUploading = isUploading && !pendingFiles.some((f) => f.status);
  const filesBusy = messageUploading || pendingFiles.some((f) => f.status === "uploading" || f.status === "queued");
  const filesFailed = pendingFiles.some((f) => f.status === "failed");

  // Files can be added unless the composer is closed or a message is still uploading them
  const attachable = enableFileUpload && Boolean(onFilesAdd) && !disabled && !blocked && !messageUploading;
  const canAddMore = filesHeld + pendingFiles.length < maxFiles;
  // Files alone make a message, except as the answer to a question (that needs words)
  const hasSendable = value.trim().length > 0 || (pendingFiles.length > 0 && mode !== "answer");
  const hasImages = pendingFiles.some((f) => isImageType(f.mimeType));

  // Expose focus method to parent via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      textareaRef.current?.focus();
    },
    setValue: (text: string, options?: { focus?: boolean }) => {
      restoreRef.current = true; // the textarea grows to fit the new text
      setValue(text);
      if (options?.focus !== false) {
        const field = textareaRef.current;
        field?.focus();
        // the caret goes to the end once the value is in
        setTimeout(() => field?.setSelectionRange(text.length, text.length), 0);
      }
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
    if (hasSendable && !isLoading && !filesBusy && !filesFailed && !disabled && !blocked) {
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
  }, [value, hasSendable, isLoading, filesBusy, filesFailed, disabled, blocked, onSend]);

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

  const canSend = hasSendable && !isLoading && !filesBusy && !filesFailed && !disabled && !blocked;
  const attachDisabled = !attachable || !canAddMore;

  return (
    <div
      className={cn(
        "relative bg-chat-bg-primary",
        modern ? "px-4 pb-3 pt-2" : "border-t border-chat-border-primary p-4",
        className
      )}
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
              const uploading = file.status === "uploading" || file.status === "queued";
              const failed = file.status === "failed";
              const percent = Math.round(Math.min(1, Math.max(0, file.progress ?? 0)) * 100);
              const noText = file.conversionStatus === "failed" || file.conversionStatus === "skipped";
              const title = failed
                ? t("chat.input.fileFailed", { fileName: file.name, reason: file.uploadError ?? "" })
                : ignored
                  ? t("chat.input.imageIgnored", { fileName: file.name })
                  : noText
                    ? t("chat.file.noTextTitle", { fileName: file.name })
                    : undefined;
              // Files for the message being sent show a spinner; files stored on their own show their own state
              const sending = messageUploading && !file.status;
              return (
                <li
                  key={file.id}
                  title={title}
                  data-chat-file-status={file.status}
                  className={cn(
                    "relative flex items-center gap-2 overflow-hidden px-3 py-1.5 bg-chat-bg-tertiary rounded-lg text-sm border",
                    failed ? "border-chat-danger" : ignored || noText ? "border-chat-warning" : "border-transparent"
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
                  {uploading && (
                    <span className="text-chat-text-tertiary text-xs tabular-nums" aria-hidden="true">
                      {percent}%
                    </span>
                  )}
                  {sending && (
                    <span role="status" aria-label={t("chat.input.fileUploading", { fileName: file.name })}>
                      <LoadingIcon className="w-3.5 h-3.5 text-chat-text-tertiary animate-spin motion-reduce:animate-none" />
                    </span>
                  )}
                  {file.status === "ready" && (
                    <span role="img" aria-label={t("chat.input.fileReady", { fileName: file.name })}>
                      <CheckIcon className="w-3.5 h-3.5 text-chat-success" />
                    </span>
                  )}
                  {failed && onFileRetry && (
                    <button
                      type="button"
                      onClick={() => onFileRetry(file.id)}
                      className="p-0.5 hover:bg-chat-bg-hover rounded"
                      title={t("chat.input.retryFile")}
                      aria-label={`${t("chat.input.retryFile")}: ${file.name}`}
                    >
                      <RefreshIcon className="w-3.5 h-3.5 text-chat-danger" />
                    </button>
                  )}
                  {onFileRemove && !sending && (
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
                  {uploading && (
                    <span
                      role="progressbar"
                      aria-label={`${t("chat.a11y.uploadProgress")}: ${file.name}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                      className="absolute inset-x-0 bottom-0 h-0.5 bg-chat-bg-hover"
                    >
                      <span className="block h-full bg-chat-accent-primary transition-all" style={{ width: `${percent}%` }} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* How many files this chat holds, next to what is about to be added */}
        {fileCounter && Number.isFinite(maxFiles) && filesHeld + pendingFiles.length > 0 && (
          <div className="mb-2 text-xs text-chat-text-tertiary">
            {t("chat.input.fileCounter", { count: filesHeld + pendingFiles.length, max: maxFiles })}
          </div>
        )}

        {/* Files that did not go up, or still do */}
        {filesFailed && (
          <div role="status" className="mb-3 rounded-lg border border-chat-danger bg-chat-danger-bg px-3 py-2 text-xs text-chat-danger">
            {t("chat.input.filesFailedNotice")}
          </div>
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
        <div
          className={cn(
            "relative flex items-end transition-colors focus-within:border-chat-text-tertiary",
            modern
              ? "gap-1 rounded-[26px] border border-chat-border-primary bg-chat-bg-primary p-2 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_6px_20px_rgba(0,0,0,0.06)]"
              : "gap-2 bg-chat-bg-tertiary rounded-2xl border border-chat-border-primary"
          )}
        >
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
                  "flex-shrink-0 text-chat-text-secondary hover:text-chat-text-primary transition-colors",
                  modern ? "flex h-9 w-9 items-center justify-center rounded-full hover:bg-chat-bg-hover" : "p-3",
                  attachDisabled && "opacity-50 cursor-not-allowed"
                )}
                title={t("chat.input.attachFiles")}
                aria-label={t("chat.input.attachFiles")}
              >
                {modern ? <PlusIcon className="w-[18px] h-[18px]" /> : <PaperclipIcon className="w-5 h-5" />}
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
            data-chat-composer-input
            className={cn(
              "flex-1 bg-transparent border-none outline-none resize-none text-chat-text-primary placeholder:text-chat-text-tertiary",
              modern ? "min-h-[36px] px-2 py-[7px] text-[15px] leading-[22px]" : "py-3",
              !enableFileUpload && (modern ? "pl-3" : "pl-4")
            )}
          />

          {/* Send/Stop button */}
          <div className={cn("flex flex-shrink-0 items-center", modern ? "gap-1" : "gap-2 p-2")}>
            {modelPicker}
            {isLoading && onStop ? (
              renderStopButton ? (
                renderStopButton({ onClick: onStop })
              ) : (
                <button
                  type="button"
                  onClick={onStop}
                  className={cn(
                    "bg-chat-text-secondary hover:bg-chat-text-primary text-chat-bg-primary transition-colors",
                    modern ? "flex h-9 w-9 items-center justify-center rounded-full" : "p-2 rounded-lg"
                  )}
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
                  "transition-colors",
                  modern ? "flex h-9 w-9 items-center justify-center rounded-full" : "p-2 rounded-lg",
                  canSend
                    ? "bg-chat-text-primary text-chat-bg-primary hover:bg-chat-text-secondary"
                    : "bg-chat-bg-hover text-chat-text-tertiary cursor-not-allowed"
                )}
                title={t("chat.input.send")}
                aria-label={t("chat.input.send")}
              >
                {modern ? <ArrowUpIcon className="w-[18px] h-[18px]" /> : <SendIcon className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Helper text */}
        {modern ? (
          // One quiet line: how long files are kept, then the host's notice and links (Enter to send goes without saying)
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 text-xs text-chat-text-tertiary [&_[data-chat-legal]]:mt-0">
            {retentionDays !== undefined && retentionDays > 0 && enableFileUpload && onFilesAdd ? (
              <span>{t("chat.input.fileRetention", { days: retentionDays })}</span>
            ) : null}
            {footer}
          </div>
        ) : (
          <>
            <div className="text-center mt-2 text-xs text-chat-text-tertiary">
              {t("chat.input.helper")}
              {retentionDays !== undefined && retentionDays > 0 && enableFileUpload && onFilesAdd
                ? ` · ${t("chat.input.fileRetention", { days: retentionDays })}`
                : ""}
            </div>
            {footer}
          </>
        )}
      </div>
    </div>
  );
});

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}
