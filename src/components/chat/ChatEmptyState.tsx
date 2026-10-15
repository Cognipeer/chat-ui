"use client";

import React, { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, makeInfoUrlTransform } from "../../utils";
import type { AgentInfo, ConversationStarter } from "../../types";
import { useI18n } from "../../hooks/useI18n";
import { DefaultEmptyState } from "./ChatMessageList";
import { FOCUS_RING } from "./styles";
import { AgentBadge, useAppearance } from "./appearance";
import { SearchIcon } from "./Icons";

/** Above this many agents the modern empty chat offers a search box over the cards */
const AGENT_SEARCH_FROM = 7;

/** Markdown the portal controls (a welcome text, an announcement): links open in a new tab, images are checked. */
export function InfoMarkdown({
  children,
  allowedImageHosts,
  className,
  inline = false,
}: {
  children: string;
  /** Hosts a picture may come from (https only); without it any https host is allowed */
  allowedImageHosts?: readonly string[];
  className?: string;
  /** Only text, emphasis, code and links: no headings, lists, tables or pictures */
  inline?: boolean;
}) {
  const urlTransform = useMemo(() => makeInfoUrlTransform(allowedImageHosts), [allowedImageHosts]);
  const components = useMemo(
    () => ({
      a: ({ href, children: label }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      ),
      img: ({ src, alt }: React.ImgHTMLAttributes<HTMLImageElement>) =>
        src ? <img src={src as string} alt={alt ?? ""} loading="lazy" className="mx-auto my-2 max-h-64 max-w-full rounded-lg object-contain" /> : null,
    }),
    []
  );
  return (
    <div className={cn("chat-markdown", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={urlTransform}
        {...(inline
          ? { allowedElements: ["p", "a", "strong", "em", "del", "code", "br"], unwrapDisallowed: true }
          : {})}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export interface ChatEmptyStateProps {
  /** The host's own empty state (`renderEmptyState`); replaces the welcome text and the default */
  custom?: React.ReactNode;
  /** Markdown shown before the first message */
  welcome?: string;
  /** Hosts a picture of the welcome text may come from */
  allowedImageHosts?: readonly string[];
  starters?: ConversationStarter[];
  /** A chip was chosen */
  onPick?: (starter: ConversationStarter) => void;
  /** The chips are not offered now (the composer is closed) */
  disabled?: boolean;
  /** `appearance="modern"`: the agents to choose from, as cards (two or more) */
  agents?: AgentInfo[];
  selectedAgentId?: string;
  onAgentChange?: (agentId: string) => void;
}

/**
 * What the chat shows before the first message: the host's own empty state, or the Markdown welcome,
 * or the default text - and under it the suggested first messages as chips.
 */
export function ChatEmptyState({
  custom,
  welcome,
  allowedImageHosts,
  starters = [],
  onPick,
  disabled = false,
  agents,
  selectedAgentId,
  onAgentChange,
}: ChatEmptyStateProps) {
  const { t } = useI18n();
  const modern = useAppearance() === "modern";
  if (modern) {
    return (
      <ModernEmptyState
        custom={custom}
        welcome={welcome}
        allowedImageHosts={allowedImageHosts}
        starters={starters}
        onPick={onPick}
        disabled={disabled}
        agents={agents && agents.length > 1 && onAgentChange ? agents : undefined}
        selectedAgentId={selectedAgentId}
        onAgentChange={onAgentChange}
      />
    );
  }
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-6 px-4 py-8 text-center">
      {custom ?? (welcome ? <InfoMarkdown allowedImageHosts={allowedImageHosts} className="text-left">{welcome}</InfoMarkdown> : <DefaultEmptyState />)}
      {starters.length > 0 && onPick && (
        <ul aria-label={t("chat.starters.label")} className="m-0 flex w-full list-none flex-wrap justify-center gap-2 p-0">
          {starters.map((starter, index) => (
            <li key={`${index}-${starter.text}`} className="max-w-full">
              <button
                type="button"
                disabled={disabled}
                title={starter.label ? starter.text : undefined}
                onClick={() => onPick(starter)}
                data-chat-starter
                className={cn(
                  "max-w-full truncate rounded-full border border-chat-border-primary bg-chat-bg-secondary px-4 py-2 text-sm text-chat-text-primary transition-colors",
                  "hover:bg-chat-bg-hover disabled:cursor-not-allowed disabled:opacity-50",
                  FOCUS_RING
                )}
              >
                {starter.label ?? starter.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The modern empty chat: a heading, the agents as cards (when there is a choice), the chosen agent's
 * welcome text and its suggested first messages.
 */
function ModernEmptyState({
  custom,
  welcome,
  allowedImageHosts,
  starters = [],
  onPick,
  disabled = false,
  agents,
  selectedAgentId,
  onAgentChange,
}: ChatEmptyStateProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const shown = useMemo(
    () =>
      !agents || !needle
        ? agents ?? []
        : agents.filter((agent) => `${agent.name} ${agent.description ?? ""}`.toLocaleLowerCase().includes(needle)),
    [agents, needle]
  );

  const heading = custom ?? (agents ? (
    <h1 className="m-0 text-2xl font-semibold tracking-tight text-chat-text-primary">{t("chat.agents.title")}</h1>
  ) : welcome ? null : (
    <h1 className="m-0 text-2xl font-semibold tracking-tight text-chat-text-primary">{t("chat.empty.title")}</h1>
  ));

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-6 px-4 py-10 text-center">
      {heading}

      {agents && (
        <div className="flex w-full flex-col items-center gap-4">
          {agents.length >= AGENT_SEARCH_FROM && (
            <div className="relative w-full max-w-sm">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-chat-text-tertiary" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={t("chat.agents.search")}
                placeholder={t("chat.agents.search")}
                className="h-10 w-full rounded-xl border border-chat-border-primary bg-chat-bg-primary pl-9 pr-3 text-sm text-chat-text-primary placeholder:text-chat-text-tertiary focus:border-chat-text-tertiary focus:outline-none"
              />
            </div>
          )}
          <ul
            aria-label={t("chat.agents.label")}
            className="m-0 grid w-full list-none gap-3 p-0 text-left [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]"
          >
            {shown.map((agent) => {
              const selected = agent.id === selectedAgentId;
              return (
                <li key={agent.id} className="min-w-0">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onAgentChange?.(agent.id)}
                    data-chat-agent-card={agent.id}
                    className={cn(
                      "flex h-full w-full flex-col items-start gap-2 rounded-2xl border bg-chat-bg-primary p-4 text-left transition-colors",
                      selected
                        ? "border-chat-text-primary shadow-[0_0_0_1px_var(--chat-text-primary)]"
                        : "border-chat-border-primary hover:border-chat-text-tertiary hover:bg-chat-bg-secondary",
                      FOCUS_RING
                    )}
                  >
                    <AgentBadge id={agent.id} name={agent.name} size={32} />
                    <span className="w-full truncate text-[15px] font-semibold text-chat-text-primary">{agent.name}</span>
                    {agent.description && (
                      <span className="line-clamp-2 text-[13px] leading-snug text-chat-text-secondary">{agent.description}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {shown.length === 0 && <p className="m-0 text-sm text-chat-text-secondary">{t("chat.agents.noMatch")}</p>}
        </div>
      )}

      {!custom && welcome && (
        <InfoMarkdown allowedImageHosts={allowedImageHosts} className="w-full text-left">
          {welcome}
        </InfoMarkdown>
      )}

      {starters.length > 0 && onPick && (
        <ul aria-label={t("chat.starters.label")} className="m-0 flex w-full list-none flex-wrap justify-center gap-2 p-0">
          {starters.map((starter, index) => (
            <li key={`${index}-${starter.text}`} className="max-w-full">
              <button
                type="button"
                disabled={disabled}
                title={starter.label ? starter.text : undefined}
                onClick={() => onPick(starter)}
                data-chat-starter
                className={cn(
                  "max-w-full truncate rounded-full border border-chat-border-primary bg-chat-bg-primary px-4 py-2 text-sm text-chat-text-primary transition-colors",
                  "hover:bg-chat-bg-hover disabled:cursor-not-allowed disabled:opacity-50",
                  FOCUS_RING
                )}
              >
                {starter.label ?? starter.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
