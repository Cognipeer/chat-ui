"use client";

import React, { useState } from "react";
import { cn } from "../../utils";
import type { ToolCallDisplayProps } from "../../types";
import { ChevronDownIcon, ChevronRightIcon, ToolIcon, LoadingIcon } from "./Icons";
import { useI18n } from "../../hooks/useI18n";

export interface ToolCallProps extends Omit<ToolCallDisplayProps, "onToggle" | "isExpanded"> {
  /** Custom class name */
  className?: string;
  /** Whether initially expanded */
  defaultExpanded?: boolean;
  /** Whether the tool call is currently executing */
  isExecuting?: boolean;
  /** Custom tool icon */
  renderIcon?: (toolName: string) => React.ReactNode;
}

/**
 * Compact tool call item — used for older/completed tool calls in the list
 */
function CompactToolCallItem({
  toolName,
  reasoning,
  displayName,
  isExecuting,
}: {
  toolName: string;
  reasoning?: string;
  displayName?: string;
  isExecuting?: boolean;
}) {
  const label = reasoning || displayName || formatToolName(toolName);
  const actionName = formatToolName(toolName);
  const showActionSeparately = !!(reasoning || displayName);

  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className="flex-shrink-0 mt-0.5">
        {isExecuting ? (
          <LoadingIcon className="w-3 h-3 text-chat-accent-primary animate-spin" />
        ) : (
          <CheckCircleIcon className="w-3 h-3 text-chat-text-tertiary" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-chat-text-secondary leading-tight truncate">
          {label}
        </div>
        {showActionSeparately && (
          <div className="text-[10px] text-chat-text-tertiary leading-tight mt-0.5">
            {actionName}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Grouped tool calls display — latest tool at top prominently, older calls below.
 */
export interface ToolCallsProps {
  /** Tool calls to display — Map (streaming) or array (completed) */
  toolCalls:
    | Map<string, { name: string; args: Record<string, unknown>; result?: unknown; reasoning?: string; displayName?: string }>
    | Array<{ id: string; name: string; args: Record<string, unknown>; result?: unknown; reasoning?: string; displayName?: string }>;
  /** Custom class name */
  className?: string;
  /** Whether tool calls are currently executing */
  isExecuting?: boolean;
  /** Duration in seconds (for completed tool calls) */
  durationSeconds?: number;
  /** Whether the group should default to expanded */
  defaultExpanded?: boolean;
}

export function ToolCalls({
  toolCalls,
  className,
  isExecuting = false,
  durationSeconds,
  defaultExpanded = false,
}: ToolCallsProps) {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Normalise to array
  const entries: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
    reasoning?: string;
    displayName?: string;
  }> = toolCalls instanceof Map
    ? Array.from(toolCalls.entries()).map(([id, call]) => ({
        id,
        name: call.name,
        args: call.args,
        result: call.result,
        reasoning: call.reasoning,
        displayName: call.displayName,
      }))
    : toolCalls;

  const count = entries.length;
  if (count === 0) return null;

  // Latest tool call is at the end of the array
  const latestCall = entries[entries.length - 1];
  const olderCalls = entries.slice(0, -1);

  // Build the latest call label: prefer reasoning, then displayName, then formatted name
  const latestLabel = latestCall.reasoning || latestCall.displayName || formatToolName(latestCall.name);
  const latestActionName = formatToolName(latestCall.name);
  const latestHasReasoning = !!(latestCall.reasoning || latestCall.displayName);
  const latestIsRunning = isExecuting;

  return (
    <div className={cn("", className)}>
      {/* Latest tool call — prominent display */}
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 mt-0.5">
          {latestIsRunning ? (
            <LoadingIcon className="w-3.5 h-3.5 text-chat-accent-primary animate-spin" />
          ) : (
            <CheckCircleIcon className="w-3.5 h-3.5 text-chat-accent-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-chat-text-secondary leading-snug">
            {latestLabel}
          </div>
          {latestHasReasoning && (
            <div className="text-xs text-chat-text-tertiary mt-0.5">
              {latestActionName}
            </div>
          )}
        </div>
      </div>

      {/* Older tool calls — compact list with expand/collapse */}
      {olderCalls.length > 0 && (
        <div className="mt-2 ml-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-chat-text-tertiary hover:text-chat-text-secondary transition-colors cursor-pointer select-none"
          >
            {isExpanded ? (
              <ChevronDownIcon className="w-3 h-3" />
            ) : (
              <ChevronRightIcon className="w-3 h-3" />
            )}
            <ToolIcon className="w-3 h-3" />
            <span>
              {t("chat.toolCall.previousSteps", { count: olderCalls.length })}
              {durationSeconds && !isExecuting ? ` · ${durationSeconds}s` : ""}
            </span>
          </button>

          {isExpanded && (
            <div className="pl-2 border-l border-chat-border-secondary ml-1 mt-1">
              {olderCalls.map((call, index) => (
                <CompactToolCallItem
                  key={`${call.id}-${index}`}
                  toolName={call.name}
                  reasoning={call.reasoning}
                  displayName={call.displayName}
                  isExecuting={isExecuting}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Legacy single ToolCall export — kept for backwards compatibility
 */
export function ToolCall({
  toolName,
  toolCallId,
  args,
  result,
  className,
  defaultExpanded = false,
  isExecuting = false,
}: ToolCallProps) {
  return (
    <ToolCalls
      toolCalls={[{ id: toolCallId, name: toolName, args, result }]}
      className={className}
      isExecuting={isExecuting}
      defaultExpanded={defaultExpanded}
    />
  );
}

// ---- Icons ----

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

// ---- Helpers ----

/**
 * Format tool name for display
 */
function formatToolName(name: string | undefined): string {
  if (!name) return "Unknown Tool"; // Fallback - normally shouldn't happen
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
