"use client";

import { cn, legalLinkEntries } from "../../utils";
import type { LegalLinks } from "../../types";
import { useI18n } from "../../hooks/useI18n";

export interface LegalFooterProps {
  links?: LegalLinks;
  /** The older single free-text footer; shown before the links */
  text?: string;
  className?: string;
}

/**
 * The line under the composer: a short notice (the legacy footer text) and the privacy, terms,
 * support and "how this AI works" links. A link that is not a plain web address is left out.
 */
export function LegalFooter({ links, text, className }: LegalFooterProps) {
  const { t } = useI18n();
  const entries = legalLinkEntries(links);
  if (!text && entries.length === 0) return null;
  return (
    <div data-chat-legal className={cn("mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-chat-text-tertiary", className)}>
      {text && <span className="max-w-full break-words">{text}</span>}
      {entries.length > 0 && (
        <nav aria-label={t("chat.legal.label")} className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {entries.map(([key, href]) => (
            <a
              key={key}
              href={href}
              {...(href.startsWith("mailto:") ? {} : { target: "_blank", rel: "noopener noreferrer" })}
              className="underline-offset-2 hover:text-chat-text-secondary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent-primary rounded"
            >
              {t(`chat.legal.${key}`)}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
