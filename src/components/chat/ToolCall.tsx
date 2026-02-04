"use client";

import React, { useState } from "react";
import { cn } from "../../utils";
import type { ToolCallDisplayProps } from "../../types";
import { ChevronDownIcon, ChevronRightIcon, ToolIcon, CheckIcon, LoadingIcon } from "./Icons";

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
 * Tool call display component
 */
export function ToolCall({
  toolName,
  toolCallId: _toolCallId,
  args,
  result,
  className,
  defaultExpanded = false,
  isExecuting = false,
  renderIcon,
}: ToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const hasResult = result !== undefined;

  return (
    <div
      className={cn(
        "border border-chat-border-primary rounded-lg overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-chat-bg-tertiary hover:bg-chat-bg-hover transition-colors text-left"
      >
        {/* Expand/collapse icon */}
        <span className="text-chat-text-tertiary">
          {isExpanded ? (
            <ChevronDownIcon className="w-4 h-4" />
          ) : (
            <ChevronRightIcon className="w-4 h-4" />
          )}
        </span>

        {/* Tool icon */}
        <span className="text-chat-text-secondary">
          {renderIcon ? renderIcon(toolName) : <ToolIcon className="w-4 h-4" />}
        </span>

        {/* Tool name */}
        <span className="flex-1 font-medium text-chat-text-primary">
          {formatToolName(toolName)}
        </span>

        {/* Status indicator */}
        <span className="flex items-center gap-1.5">
          {isExecuting ? (
            <>
              <LoadingIcon className="w-4 h-4 text-chat-accent-primary animate-spin" />
              <span className="text-sm text-chat-text-secondary">Running...</span>
            </>
          ) : hasResult ? (
            <>
              <CheckIcon className="w-4 h-4 text-green-500" />
              <span className="text-sm text-chat-text-secondary">Completed</span>
            </>
          ) : (
            <span className="text-sm text-chat-text-tertiary">Pending</span>
          )}
        </span>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="border-t border-chat-border-secondary">
          {/* Arguments */}
          <div className="px-4 py-3">
            <div className="text-xs font-medium text-chat-text-tertiary uppercase mb-2">
              Arguments
            </div>
            <pre className="text-sm text-chat-text-primary bg-chat-bg-secondary p-3 rounded overflow-x-auto">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>

          {/* Result */}
          {hasResult && (
            <div className="px-4 py-3 border-t border-chat-border-secondary">
              <div className="text-xs font-medium text-chat-text-tertiary uppercase mb-2">
                Result
              </div>
              <pre className="text-sm text-chat-text-primary bg-chat-bg-secondary p-3 rounded overflow-x-auto max-h-[200px]">
                {typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Tool calls container for multiple tool calls
 */
export interface ToolCallsProps {
  /** Tool calls to display */
  toolCalls: Map<string, { name: string; args: Record<string, unknown>; result?: unknown }>;
  /** Custom class name */
  className?: string;
  /** Whether tool calls are currently executing */
  isExecuting?: boolean;
}

export function ToolCalls({ toolCalls, className, isExecuting = false }: ToolCallsProps) {
  if (toolCalls.size === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-xs font-medium text-chat-text-tertiary uppercase">
        Tool Calls
      </div>
      {Array.from(toolCalls.entries()).map(([id, call], index) => (
        <ToolCall
          key={`${id}-${index}`}
          toolName={call.name}
          toolCallId={id}
          args={call.args}
          result={call.result}
          isExecuting={isExecuting && call.result === undefined}
        />
      ))}
    </div>
  );
}

/**
 * Format tool name for display
 */
function formatToolName(name: string | undefined): string {
  if (!name) return "Unknown Tool";
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
