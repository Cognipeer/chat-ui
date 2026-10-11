import { defaultUrlTransform } from "react-markdown";
import type {
  AgentInfo,
  Announcement,
  AnnouncementSeverity,
  ConversationListItem,
  ConversationStarter,
  DisclosureConfig,
  ExportConfig,
  ExportFormat,
  FeedbackConfig,
  FeedbackReasonId,
  HistoryActionsConfig,
  LegalLinks,
  Message,
  MessageActionsConfig,
  MessageFeedback,
  NotificationsConfig,
} from "../types";

/**
 * The portal experience: starters, welcome, feedback, announcements, legal links and the switches
 * that turn each feature on. Everything here is tolerant of what a server sends - a malformed
 * entry is dropped, never thrown on - and conservative about what ends up in an `href` or `src`.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value : undefined);

// ----------------------------------------------------------------------------
// Starters
// ----------------------------------------------------------------------------

/** The most chips the empty chat shows */
export const MAX_STARTERS = 6;

/** Starters from a server or a prop: well-formed entries only, at most `MAX_STARTERS`. */
export function normalizeStarters(value: unknown, max: number = MAX_STARTERS): ConversationStarter[] {
  if (!Array.isArray(value)) return [];
  const out: ConversationStarter[] = [];
  for (const item of value) {
    const entry = typeof item === "string" ? { text: item } : item;
    if (!isRecord(entry)) continue;
    const body = text(entry.text) ?? text(entry.prompt) ?? text(entry.message);
    if (!body) continue;
    const label = text(entry.label) ?? text(entry.title);
    const auto = entry.autoSend ?? entry.auto_send;
    out.push({
      text: body.trim(),
      ...(label ? { label: label.trim() } : {}),
      ...(auto === true ? { autoSend: true } : {}),
    });
    if (out.length >= max) break;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Feedback
// ----------------------------------------------------------------------------

export const DEFAULT_FEEDBACK_REASONS: FeedbackReasonId[] = [
  "inaccurate",
  "incomplete",
  "off_topic",
  "too_long",
  "unsafe",
  "other",
];

/** The longest comment that goes with a rating */
export const MAX_FEEDBACK_COMMENT = 1000;

/** A rating as a server writes it (`up` / `down`, or the older `positive` / `negative`), or undefined. */
export function normalizeFeedback(value: unknown): MessageFeedback | undefined {
  if (!isRecord(value)) return undefined;
  const raw = value.rating ?? value.type ?? value.value;
  const rating = raw === "up" || raw === "positive" || raw === 1 ? "up" : raw === "down" || raw === "negative" || raw === -1 ? "down" : undefined;
  if (!rating) return undefined;
  const reasons = Array.isArray(value.reasons) ? value.reasons.filter((r): r is string => typeof r === "string" && r !== "") : [];
  const comment = text(value.comment);
  return {
    rating,
    ...(reasons.length > 0 ? { reasons } : {}),
    ...(comment ? { comment } : {}),
  };
}

/** The rating a message carries: its own `feedback`, or `metadata.feedback`. */
export function readFeedback(message: Pick<Message, "feedback" | "metadata">): MessageFeedback | undefined {
  return normalizeFeedback(message.feedback) ?? normalizeFeedback(message.metadata?.feedback);
}

export function resolveFeedbackConfig(value: unknown): Required<FeedbackConfig> {
  const config: FeedbackConfig = value === true ? { enabled: true } : isRecord(value) ? (value as FeedbackConfig) : {};
  const reasons = Array.isArray(config.reasons) ? config.reasons.filter((r): r is string => typeof r === "string" && r !== "") : [];
  return {
    enabled: config.enabled === true,
    comments: config.comments !== false,
    reasons: reasons.length > 0 ? reasons : DEFAULT_FEEDBACK_REASONS,
  };
}

// ----------------------------------------------------------------------------
// Announcements
// ----------------------------------------------------------------------------

/** The most announcements shown at once */
export const MAX_ANNOUNCEMENTS = 5;

const SEVERITIES: ReadonlySet<string> = new Set(["info", "warning", "critical"]);

function moment(value: unknown): number | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : undefined;
}

/** The announcements that are due now, most severe first, at most `MAX_ANNOUNCEMENTS`. */
export function activeAnnouncements(list: unknown, now: number = Date.now(), max: number = MAX_ANNOUNCEMENTS): Announcement[] {
  if (!Array.isArray(list)) return [];
  const rank: Record<AnnouncementSeverity, number> = { critical: 0, warning: 1, info: 2 };
  const seen = new Set<string>();
  const out: Announcement[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const id = text(item.id);
    const body = text(item.text);
    if (!id || !body || seen.has(id)) continue;
    const starts = moment(item.startsAt);
    const ends = moment(item.endsAt);
    if (starts !== undefined && starts > now) continue;
    if (ends !== undefined && ends <= now) continue;
    seen.add(id);
    out.push({
      id,
      text: body,
      severity: SEVERITIES.has(String(item.severity)) ? (item.severity as AnnouncementSeverity) : "info",
      ...(typeof item.startsAt === "string" ? { startsAt: item.startsAt } : {}),
      ...(typeof item.endsAt === "string" ? { endsAt: item.endsAt } : {}),
      dismissible: item.dismissible !== false,
    });
  }
  out.sort((a, b) => rank[a.severity ?? "info"] - rank[b.severity ?? "info"]);
  return out.slice(0, max);
}

const DISMISSED_PREFIX = "cp:announcement:dismissed:";

/** Whether the person dismissed this announcement on this device (never throws: storage may be blocked). */
export function isAnnouncementDismissed(id: string): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(DISMISSED_PREFIX + id) === "1";
  } catch {
    return false;
  }
}

export function rememberAnnouncementDismissed(id: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(DISMISSED_PREFIX + id, "1");
  } catch {
    // dismissed for this page view only
  }
}

// ----------------------------------------------------------------------------
// Links and Markdown
// ----------------------------------------------------------------------------

/**
 * A link for the legal footer: `https:`, `http:`, `mailto:` (support), or a path of the page itself.
 * Anything else - `javascript:`, `data:`, a link with control characters - is dropped.
 */
export function safeLegalHref(url: unknown, options: { allowMailto?: boolean } = {}): string | undefined {
  if (typeof url !== "string") return undefined;
  // the browser's URL parser ignores tabs and line breaks anywhere and control characters at the ends
  // eslint-disable-next-line no-control-regex
  const value = url.replace(/[\t\n\r]/g, "").replace(/^[\u0000- ]+/, "").replace(/[\u0000- ]+$/, "");
  if (!value) return undefined;
  if (/^\/(?!\/)/.test(value)) return value;
  if (/^mailto:[^\s<>]+$/i.test(value)) return options.allowMailto === false ? undefined : value;
  if (/^https?:\/\/[^\s<>]+$/i.test(value)) return value;
  return undefined;
}

/** The legal links worth showing, in a fixed order, as `[key, href]` pairs. */
export function legalLinkEntries(links: LegalLinks | undefined): Array<["privacy" | "terms" | "support" | "aboutAi", string]> {
  if (!links) return [];
  const out: Array<["privacy" | "terms" | "support" | "aboutAi", string]> = [];
  for (const key of ["privacy", "terms", "support", "aboutAi"] as const) {
    const href = safeLegalHref(links[key], { allowMailto: key === "support" });
    if (href) out.push([key, href]);
  }
  return out;
}

/** A safe `src` for an image in a welcome text or an announcement: https, the page's own paths, or a raster data URL. */
export function safeMarkdownImageSrc(url: string, allowedHosts?: readonly string[]): string | undefined {
  const value = url.trim();
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(value)) return value;
  if (/^\/(?!\/)/.test(value)) return value;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:") return undefined;
  if (allowedHosts && allowedHosts.length > 0 && !allowedHosts.includes(parsed.hostname)) return undefined;
  return value;
}

/**
 * The `urlTransform` of the Markdown the portal controls (welcome text, announcements): links keep
 * react-markdown's default protection; an image URL is cut down to `safeMarkdownImageSrc`.
 */
export function makeInfoUrlTransform(allowedImageHosts?: readonly string[]) {
  return (url: string, key: string): string => {
    if (key === "src") return safeMarkdownImageSrc(url, allowedImageHosts) ?? "";
    return defaultUrlTransform(url);
  };
}

// ----------------------------------------------------------------------------
// History
// ----------------------------------------------------------------------------

/** Whether a listed conversation is pinned: its `pinned` flag, or `metadata.pinned`. */
export function isPinned(item: Pick<ConversationListItem, "pinned" | "metadata">): boolean {
  return item.pinned === true || item.metadata?.pinned === true;
}

/** The listed conversations with the pinned ones first; the order inside each group is kept. */
export function pinnedFirst<T extends Pick<ConversationListItem, "pinned" | "metadata">>(items: T[]): T[] {
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const item of items) (isPinned(item) ? pinned : rest).push(item);
  return pinned.length === 0 ? items : [...pinned, ...rest];
}

// ----------------------------------------------------------------------------
// Resolving the switches
// ----------------------------------------------------------------------------

const EXPORT_FORMATS: ExportFormat[] = ["md", "json", "pdf"];

export interface ExperienceInput {
  messageActions?: MessageActionsConfig;
  feedback?: boolean | FeedbackConfig;
  historyActions?: HistoryActionsConfig;
  exportMenu?: boolean | ExportConfig;
  notifications?: NotificationsConfig;
  disclosure?: DisclosureConfig;
  starters?: ConversationStarter[];
  welcome?: string;
}

export interface Experience {
  messageActions: Required<MessageActionsConfig>;
  feedback: Required<FeedbackConfig>;
  historyActions: Required<HistoryActionsConfig>;
  exportMenu: { enabled: boolean; formats: ExportFormat[]; includeTools: boolean };
  notifications: { tabBadge: boolean; sound: boolean; desktop: "off" | "opt_in" };
  disclosure: { aiLabel: boolean; labelText?: string; links: LegalLinks };
  starters: ConversationStarter[];
  welcome?: string;
}

const flags = <T extends string>(value: unknown, keys: readonly T[]): Record<T, boolean> => {
  const config = isRecord(value) ? value : {};
  return Object.fromEntries(keys.map((key) => [key, config[key] === true])) as Record<T, boolean>;
};

/**
 * One place that decides which parts of the portal experience are on. Per switch, what the selected
 * agent says (`metadata.experience.<switch>`, `metadata.starters`, `metadata.welcome`) refines the
 * host's props; a switch neither sets stays off, so a chat behaves as before until it is turned on.
 */
export function resolveExperience(agent: AgentInfo | undefined, props: ExperienceInput): Experience {
  const meta = agent?.metadata;
  const said = isRecord(meta?.experience) ? (meta!.experience as Record<string, unknown>) : {};
  const pick = (key: string, prop: unknown): unknown => (said[key] !== undefined ? said[key] : prop);

  const formatsRaw = (() => {
    const value = pick("export", props.exportMenu);
    return isRecord(value) && Array.isArray(value.formats)
      ? value.formats.filter((f): f is ExportFormat => EXPORT_FORMATS.includes(f as ExportFormat))
      : [];
  })();
  const exportValue = pick("export", props.exportMenu);
  const exportRecord = isRecord(exportValue) ? exportValue : {};

  const notificationsValue = pick("notifications", props.notifications);
  const notifications = isRecord(notificationsValue) ? notificationsValue : {};

  const disclosureValue = pick("disclosure", props.disclosure);
  const disclosure = isRecord(disclosureValue) ? disclosureValue : {};

  const startersFromAgent = normalizeStarters(meta?.starters);
  const welcomeFromAgent = text(meta?.welcome);

  return {
    messageActions: flags(pick("messageActions", props.messageActions), ["copy", "regenerate", "edit"] as const),
    feedback: resolveFeedbackConfig(pick("feedback", props.feedback)),
    historyActions: flags(pick("history", props.historyActions), ["rename", "pin", "bulkDelete"] as const),
    exportMenu: {
      enabled: exportValue === true || exportRecord.enabled === true,
      formats: formatsRaw.length > 0 ? formatsRaw : EXPORT_FORMATS,
      includeTools: exportRecord.includeTools === true,
    },
    notifications: {
      tabBadge: notifications.tabBadge === true,
      sound: notifications.sound === true,
      desktop: notifications.desktop === "opt_in" ? "opt_in" : "off",
    },
    disclosure: {
      aiLabel: disclosure.aiLabel === true,
      ...(text(disclosure.labelText) ? { labelText: text(disclosure.labelText) } : {}),
      links: isRecord(disclosure.links) ? (disclosure.links as LegalLinks) : {},
    },
    starters: startersFromAgent.length > 0 ? startersFromAgent : normalizeStarters(props.starters),
    welcome: welcomeFromAgent ?? text(props.welcome),
  };
}
