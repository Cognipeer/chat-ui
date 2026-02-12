"use client";

import React, { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef, KeyboardEvent, ChangeEvent } from "react";
import { cn, formatFileSize } from "../../utils";
import type { FileAttachment } from "../../types";
import { SendIcon, PaperclipIcon, XIcon, StopIcon } from "./Icons";

export interface ChatInputHandle {
  /** Programmatically focus the textarea */
  focus: () => void;
}

export interface ChatInputProps {
  /** Callback when sending a message */
  onSend: (message: string) => void;
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
  placeholder = "Type a message...",
  enableFileUpload = true,
  allowedFileTypes,
  maxFiles = 10,
  disabled = false,
  className,
  renderSendButton,
  renderStopButton,
  autoFocus = false,
}, ref) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSend = useCallback(() => {
    if (value.trim() && !isLoading && !disabled) {
      onSend(value.trim());
      setValue("");
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  }, [value, isLoading, disabled, onSend]);

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

  const canSend = value.trim().length > 0 && !isLoading && !disabled;

  return (
    <div className={cn("border-t border-chat-border-primary bg-chat-bg-primary p-4", className)}>
      <div className="max-w-3xl mx-auto">
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
                title="Attach files"
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
            placeholder={placeholder}
            disabled={disabled}
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
                  title="Stop generation"
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
                title="Send message"
              >
                <SendIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Helper text */}
        <div className="text-center mt-2 text-xs text-chat-text-tertiary">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
});
