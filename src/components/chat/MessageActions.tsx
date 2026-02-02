"use client";

import React, { useState } from "react";
import { cn } from "../../utils";
import type { MessageActionProps } from "../../types";
import { ThumbsUpIcon, ThumbsDownIcon, CopyIcon, RefreshIcon, CheckIcon } from "./Icons";

export interface MessageActionsProps extends MessageActionProps {
  /** Callback when copy is clicked */
  onCopy?: (content: string) => void;
  /** Callback when feedback is given */
  onFeedback?: (messageId: string, type: "positive" | "negative") => void;
  /** Callback when regenerate is clicked */
  onRegenerate?: (messageId: string) => void;
  /** Show copy button */
  showCopy?: boolean;
  /** Show regenerate button */
  showRegenerate?: boolean;
  /** Show feedback buttons */
  showFeedback?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Pre-built message actions component with feedback, copy, and regenerate buttons
 */
export function MessageActions({
  message,
  isStreaming,
  onCopy,
  onFeedback,
  onRegenerate,
  showCopy = true,
  showRegenerate = true,
  showFeedback = true,
  className,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(null);

  if (isStreaming || message.role !== "assistant") return null;

  const content = typeof message.content === "string"
    ? message.content
    : message.content.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      onCopy?.(content);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleFeedback = (type: "positive" | "negative") => {
    setFeedback(type);
    onFeedback?.(message.id, type);
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {showCopy && (
        <ActionButton
          onClick={handleCopy}
          title={copied ? "Copied!" : "Copy"}
          active={copied}
        >
          {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
        </ActionButton>
      )}

      {showRegenerate && onRegenerate && (
        <ActionButton
          onClick={() => onRegenerate(message.id)}
          title="Regenerate"
        >
          <RefreshIcon className="w-4 h-4" />
        </ActionButton>
      )}

      {showFeedback && (
        <>
          <ActionButton
            onClick={() => handleFeedback("positive")}
            title="Good response"
            active={feedback === "positive"}
          >
            <ThumbsUpIcon className="w-4 h-4" />
          </ActionButton>
          <ActionButton
            onClick={() => handleFeedback("negative")}
            title="Bad response"
            active={feedback === "negative"}
          >
            <ThumbsDownIcon className="w-4 h-4" />
          </ActionButton>
        </>
      )}
    </div>
  );
}

interface ActionButtonProps {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}

function ActionButton({ onClick, title, active = false, children }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "p-1.5 rounded transition-colors",
        active
          ? "text-chat-accent-primary"
          : "text-chat-text-tertiary hover:text-chat-text-secondary hover:bg-chat-bg-hover"
      )}
    >
      {children}
    </button>
  );
}
