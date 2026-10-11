"use client";

import { useEffect, useMemo, useState } from "react";
import {
  activeAnnouncements,
  cn,
  isAnnouncementDismissed,
  rememberAnnouncementDismissed,
} from "../../utils";
import type { Announcement, AnnouncementSeverity } from "../../types";
import { useI18n } from "../../hooks/useI18n";
import { AlertIcon, InfoIcon, XIcon } from "./Icons";
import { InfoMarkdown } from "./ChatEmptyState";
import { FOCUS_RING } from "./styles";

export interface AnnouncementBannerProps {
  announcements: Announcement[];
  /** A person closed one; for a host that also keeps the choice on its server */
  onDismiss?: (announcement: Announcement) => void;
  className?: string;
}

const TONE: Record<AnnouncementSeverity, string> = {
  info: "border-chat-info bg-chat-info-bg text-chat-text-primary",
  warning: "border-chat-warning bg-chat-warning-bg text-chat-text-primary",
  critical: "border-chat-danger bg-chat-danger-bg text-chat-text-primary",
};

const ICON_TONE: Record<AnnouncementSeverity, string> = {
  info: "text-chat-info",
  warning: "text-chat-warning",
  critical: "text-chat-danger",
};

/**
 * Notices above the chat: a maintenance window, a new agent, a policy change. Only the ones that are
 * due now are shown (at most five), the most severe first; a person can close the ones that allow it
 * and the choice is remembered on this device. A critical notice is announced to screen readers at once.
 */
export function AnnouncementBanner({ announcements, onDismiss, className }: AnnouncementBannerProps) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());

  // A notice starts and ends while the page is open
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const visible = useMemo(
    () => activeAnnouncements(announcements, now).filter((a) => !dismissed.has(a.id) && !(a.dismissible !== false && isAnnouncementDismissed(a.id))),
    [announcements, now, dismissed]
  );

  if (visible.length === 0) return null;

  return (
    <div data-chat-announcements className={cn("flex-shrink-0 space-y-px", className)}>
      {visible.map((announcement) => {
        const severity = announcement.severity ?? "info";
        return (
          <div
            key={announcement.id}
            role={severity === "critical" ? "alert" : "status"}
            data-chat-announcement={severity}
            className={cn("flex items-start gap-3 border-b px-4 py-2 text-sm", TONE[severity])}
          >
            {severity === "info" ? (
              <InfoIcon className={cn("mt-0.5 h-4 w-4 flex-shrink-0", ICON_TONE[severity])} />
            ) : (
              <AlertIcon className={cn("mt-0.5 h-4 w-4 flex-shrink-0", ICON_TONE[severity])} />
            )}
            <div className="min-w-0 flex-1 [&_.chat-markdown_p]:mb-0">
              <InfoMarkdown inline>{announcement.text}</InfoMarkdown>
            </div>
            {announcement.dismissible !== false && (
              <button
                type="button"
                className={cn("flex-shrink-0 rounded p-1 hover:bg-chat-bg-hover", FOCUS_RING)}
                aria-label={t("chat.announcement.dismiss")}
                title={t("chat.announcement.dismiss")}
                onClick={() => {
                  rememberAnnouncementDismissed(announcement.id);
                  setDismissed((current) => new Set(current).add(announcement.id));
                  onDismiss?.(announcement);
                }}
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
