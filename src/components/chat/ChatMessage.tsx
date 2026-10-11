"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, formatFileSize, imagePartSource, isFileExpired, isImageType, isRasterImageType, safeFileHref, safeImageSrc } from "../../utils";
import {
  insertCitationMarkers,
  parseCitationHref,
  safeExternalHref,
  citationUrlTransform,
} from "../../utils/citations";
import type { Message, MessageActionProps, FileAttachment, Citation, StopNoticeRenderProps } from "../../types";
import { FileIcon, ImageIcon } from "./Icons";
import { ToolCalls } from "./ToolCall";
import { MessageActionCards, type ChatActionsConfig } from "./ActionCards";
import { MessageStopNotice, MessageWarnings } from "./StopNotice";
import { useI18n } from "../../hooks";

/** What `renderImage` receives for an image in a message. */
export interface ImageRenderProps {
  /** A URL that is safe to use as an `<img src>` */
  src: string;
  alt: string;
  /** The attachment it belongs to; absent for an image that is part of the message content */
  file?: FileAttachment;
}

/** Turns a stored file into a URL the browser can use (see `ChatTransport.getFileUrl`). */
export type ResolveFileUrl = (
  file: FileAttachment,
  options?: { disposition?: "inline" | "attachment" }
) => Promise<string | undefined>;

export interface ChatMessageProps {
  /** The message to display */
  message: Message;
  /** Whether this message is currently streaming */
  isStreaming?: boolean;
  /** Current streaming text (only used when isStreaming is true) */
  streamingText?: string;
  /** Custom class name */
  className?: string;
  /** Render custom message actions (like feedback buttons) */
  renderActions?: (props: MessageActionProps) => React.ReactNode;
  /** Render custom avatar */
  renderAvatar?: (role: Message["role"]) => React.ReactNode;
  /** Show avatar */
  showAvatar?: boolean;
  /** Show timestamp */
  showTimestamp?: boolean;
  /** Show sources section for assistant messages */
  enableCitations?: boolean;
  /** How approval / question cards behave under this message */
  actions?: ChatActionsConfig;
  /** Replace how an image is drawn, e.g. to fetch it with credentials */
  renderImage?: (props: ImageRenderProps) => React.ReactNode;
  /** Replace the notice under an answer that stopped early (stopped, limit, usage limit, error) */
  renderStopNotice?: (props: StopNoticeRenderProps) => React.ReactNode;
  /**
   * How to get a URL for a stored file that has none of its own (the messages of a loaded
   * conversation): images are fetched this way to be shown, other files when "Download" is pressed.
   */
  resolveFileUrl?: ResolveFileUrl;
}

/**
 * Individual chat message component
 */
export function ChatMessage({
  message,
  isStreaming = false,
  streamingText,
  className,
  renderActions,
  renderAvatar,
  showAvatar = true,
  showTimestamp = false,
  enableCitations = true,
  actions,
  renderImage,
  renderStopNotice,
  resolveFileUrl,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const content = isStreaming && streamingText ? streamingText : getTextContent(message.content);
  const images = React.useMemo(() => getImages(message.content), [message.content]);

  // Offsets index the finished answer, so markers only go in once it is whole.
  const showInlineCitations = enableCitations && isAssistant && !isStreaming;
  const renderedContent = React.useMemo(
    () =>
      showInlineCitations
        ? insertCitationMarkers(content, message.citationMarks, message.citations)
        : content,
    [showInlineCitations, content, message.citationMarks, message.citations]
  );

  const markdownComponents = React.useMemo(
    () => ({
      a: makeCitationAwareLink(message.citations),
    }),
    [message.citations]
  );

  return (
    <div
      className={cn(
        "group flex gap-4 px-4 py-6 animate-fade-in",
        isUser ? "bg-transparent" : "bg-chat-bg-secondary",
        className
      )}
    >
      {/* Avatar */}
      {showAvatar && (
        <div className="flex-shrink-0">
          {renderAvatar ? (
            renderAvatar(message.role)
          ) : (
            <DefaultAvatar role={message.role} />
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Tool calls from completed messages — shown above the text */}
        {isAssistant && !isStreaming && hasToolCalls(message) && (
          <MessageToolCalls message={message} />
        )}

        {/* Message content (a turn that only paused for an answer has none) */}
        {(renderedContent || isStreaming || !isAssistant || !message.pendingActions?.length) && (
          <div className="chat-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
              urlTransform={citationUrlTransform}
            >
              {renderedContent}
            </ReactMarkdown>
            {isStreaming && <StreamingCursor />}
          </div>
        )}

        {/* Images that are part of the content */}
        {images.length > 0 && <MessageImages images={images} renderImage={renderImage} />}

        {/* Why the answer ends where it does, when it was not simply finished */}
        {isAssistant && !isStreaming && (
          <MessageStopNotice message={message} hasText={content.trim().length > 0} render={renderStopNotice} />
        )}

        {/* Approvals and questions the assistant is waiting on */}
        {isAssistant && !isStreaming && <MessageActionCards message={message} config={actions} />}

        {/* File attachments */}
        {message.files && message.files.length > 0 && (
          <FileAttachments files={message.files} renderImage={renderImage} resolveFileUrl={resolveFileUrl} />
        )}

        {/* Things worth knowing about the turn (files cut short, images not seen) */}
        {isAssistant && !isStreaming && <MessageWarnings message={message} />}

        {/* Sources */}
        {enableCitations && isAssistant && !isStreaming && message.citations && message.citations.length > 0 && (
          <MessageCitations citations={message.citations} />
        )}

        {/* Timestamp */}
        {showTimestamp && (
          <div className="text-xs text-chat-text-tertiary mt-2">
            {formatTime(message.createdAt)}
          </div>
        )}

        {/* Custom actions slot */}
        {isAssistant && !isStreaming && renderActions && (
          <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {renderActions({ message, isStreaming })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Default avatar component
 */
function DefaultAvatar({ role }: { role: Message["role"] }) {
  const { t } = useI18n();
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
        isUser
          ? "bg-chat-accent-primary text-chat-text-inverse"
          : "bg-chat-bg-tertiary text-chat-text-primary"
      )}
    >
      {isUser ? t("chat.message.user") : t("chat.message.ai")}
    </div>
  );
}

/**
 * Streaming cursor animation
 */
function StreamingCursor() {
  return (
    <span className="inline-block w-2 h-4 bg-chat-text-primary animate-pulse ml-0.5" />
  );
}

/**
 * Splits a file name into its base name and extension (extension includes
 * the leading dot, e.g. ".docx"). Used so truncation never hides the
 * extension — otherwise multiple export formats of the same document (e.g.
 * "Report.md", "Report.docx", "Report.pdf") become visually indistinguishable
 * once the shared long base name gets cut off.
 */
function splitFileName(name: string): { base: string; ext: string } {
  const idx = name.lastIndexOf(".");
  if (idx <= 0 || idx === name.length - 1) {
    return { base: name, ext: "" };
  }
  return { base: name.slice(0, idx), ext: name.slice(idx) };
}

/** An image, opening full size in a new tab on click or Enter. */
function ImageThumb({
  src,
  alt,
  className,
  renderImage,
  file,
  onError,
}: {
  src: string;
  alt: string;
  className?: string;
  renderImage?: (props: ImageRenderProps) => React.ReactNode;
  file?: FileAttachment;
  /** The picture could not be loaded (not called for a host's own `renderImage`) */
  onError?: () => void;
}) {
  const { t } = useI18n();
  if (renderImage) return <>{renderImage({ src, alt, file })}</>;
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("chat.message.openImage", { name: alt })}
      className="inline-block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent-primary"
    >
      <img src={src} alt={alt} loading="lazy" onError={onError} className={cn("rounded-lg object-contain bg-chat-bg-tertiary", className)} />
    </a>
  );
}

/** Images that are part of a message's content (`image_url`, `input_image`, `image` parts). */
function MessageImages({
  images,
  renderImage,
}: {
  images: string[];
  renderImage?: (props: ImageRenderProps) => React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {images.map((src, index) => (
        <ImageThumb
          key={`${index}-${src.slice(0, 64)}`}
          src={src}
          alt={`${t("chat.message.image")} ${index + 1}`}
          className="max-h-64 max-w-full"
          renderImage={renderImage}
        />
      ))}
    </div>
  );
}

/** The URL of a stored file that has none of its own, asked of the transport when `enabled`. */
function useStoredFileUrl(
  file: FileAttachment,
  resolve: ResolveFileUrl | undefined,
  enabled: boolean
): { src?: string; failed: boolean } {
  const [state, setState] = React.useState<{ src?: string; failed: boolean }>({ failed: false });
  React.useEffect(() => {
    if (!enabled || !resolve) return;
    let cancelled = false;
    resolve(file, { disposition: "inline" }).then(
      (url) => {
        if (!cancelled) setState({ src: safeImageSrc(url), failed: !safeImageSrc(url) });
      },
      () => {
        if (!cancelled) setState({ failed: true });
      }
    );
    return () => {
      cancelled = true;
    };
    // the file's identity is what decides, not the object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id, enabled, resolve]);
  return state;
}

/** One attached file: a thumbnail for a picture, otherwise a chip with its name, size and state. */
function FileAttachmentItem({
  file,
  renderImage,
  resolveFileUrl,
}: {
  file: FileAttachment;
  renderImage?: (props: ImageRenderProps) => React.ReactNode;
  resolveFileUrl?: ResolveFileUrl;
}) {
  const { t, formatDate } = useI18n();
  const [downloadFailed, setDownloadFailed] = React.useState(false);
  const expired = isFileExpired(file);
  const image = isImageType(file.mimeType);
  // Only pictures a browser shows without running anything become thumbnails; an SVG or the like is a file chip
  const raster = isRasterImageType(file.mimeType);
  // Addresses that did not load (a preview that was released, a stored copy the browser cannot draw)
  const [failedSrc, setFailedSrc] = React.useState<readonly string[]>([]);
  const usable = (src: string | undefined) => (src && !failedSrc.includes(src) ? src : undefined);
  const local = raster ? usable(safeImageSrc(file.previewUrl)) : undefined;
  const ownUrl = raster ? usable(safeImageSrc(file.url)) : undefined;
  // A picture that is still on this device shows even if its server copy is gone
  const stored = useStoredFileUrl(file, resolveFileUrl, raster && !local && !ownUrl && !expired);
  const thumb = raster ? local ?? (expired ? undefined : ownUrl ?? usable(stored.src)) : undefined;

  if (thumb) {
    return (
      <figure className="m-0 max-w-full">
        <ImageThumb
          src={thumb}
          alt={file.name}
          className="max-h-48 max-w-full"
          renderImage={renderImage}
          file={file}
          onError={() => setFailedSrc((prev) => [...prev, thumb])}
        />
        <figcaption className="mt-1 text-xs text-chat-text-secondary truncate max-w-[16rem]" title={file.name}>
          {file.name} · {formatFileSize(file.size)}
        </figcaption>
      </figure>
    );
  }

  const { base, ext } = splitFileName(file.name);
  const href = expired ? undefined : safeFileHref(file.url);
  const noText = file.conversionStatus === "failed" || file.conversionStatus === "skipped";
  const keptUntil = !expired && file.expiresAt ? formatDate(new Date(file.expiresAt), { dateStyle: "medium" }) : undefined;
  const canDownload = !expired && !href && Boolean(resolveFileUrl);

  const download = async () => {
    setDownloadFailed(false);
    try {
      const url = await resolveFileUrl?.(file, { disposition: "attachment" });
      if (!url) throw new Error("no url");
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setDownloadFailed(true);
    }
  };

  return (
    <div
      data-chat-file={expired ? "expired" : noText ? "no-text" : undefined}
      title={
        expired
          ? t("chat.file.expiredTitle", { fileName: file.name })
          : noText
            ? t("chat.file.noTextTitle", { fileName: file.name })
            : keptUntil
              ? t("chat.file.keptUntil", { date: keptUntil })
              : undefined
      }
      className={cn(
        "flex items-center gap-2 px-3 py-2 bg-chat-bg-tertiary rounded-lg text-sm border",
        expired ? "border-transparent opacity-60" : noText ? "border-chat-warning" : "border-transparent"
      )}
    >
      {image ? (
        <ImageIcon className="w-4 h-4 text-chat-text-secondary flex-shrink-0" />
      ) : (
        <FileIcon className="w-4 h-4 text-chat-text-secondary flex-shrink-0" />
      )}
      <span className={cn("text-chat-text-primary truncate max-w-[160px]", expired && "line-through")} title={file.name}>
        {base}
      </span>
      {ext && (
        <span className="text-chat-text-secondary flex-shrink-0">
          {ext}
        </span>
      )}
      {file.size > 0 && (
        <span className="text-chat-text-tertiary text-xs flex-shrink-0">
          {formatFileSize(file.size)}
        </span>
      )}
      {expired && (
        <span className="rounded-full bg-chat-bg-hover px-1.5 py-0.5 text-[10px] font-medium text-chat-text-secondary flex-shrink-0">
          {t("chat.file.expired")}
        </span>
      )}
      {noText && !expired && (
        <span className="rounded-full bg-chat-warning-bg px-1.5 py-0.5 text-[10px] font-medium text-chat-warning flex-shrink-0">
          {t("chat.file.noText")}
        </span>
      )}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-chat-accent-primary hover:underline flex-shrink-0"
        >
          {t("chat.file.download")}
        </a>
      )}
      {canDownload && (
        <button
          type="button"
          onClick={download}
          className="text-chat-accent-primary hover:underline flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent-primary rounded"
        >
          {t("chat.file.download")}
        </button>
      )}
      {downloadFailed && (
        <span role="alert" className="text-xs text-chat-danger flex-shrink-0">
          {t("chat.file.downloadFailed")}
        </span>
      )}
    </div>
  );
}

/**
 * File attachments display: images as thumbnails (from the server's `url`, a stored copy fetched
 * through `resolveFileUrl`, or the local preview of a file just sent), other files as a chip with
 * name and size - muted once they expired, tinted when their text could not be read.
 */
function FileAttachments({
  files,
  renderImage,
  resolveFileUrl,
}: {
  files: FileAttachment[];
  renderImage?: (props: ImageRenderProps) => React.ReactNode;
  resolveFileUrl?: ResolveFileUrl;
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {files.map((file) => (
        <FileAttachmentItem key={file.id} file={file} renderImage={renderImage} resolveFileUrl={resolveFileUrl} />
      ))}
    </div>
  );
}

/**
 * Markdown links carrying the `cite:` scheme are the inline citation markers;
 * everything else is left as an ordinary link.
 */
function makeCitationAwareLink(citations: Citation[] | undefined) {
  return function MarkdownLink({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    const citationId = parseCitationHref(href);
    if (!citationId) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      );
    }

    const citation = citations?.find((c) => String(c.id) === citationId);
    return <CitationChip citation={citation} label={children} />;
  };
}

function CitationChip({
  citation,
  label,
}: {
  citation: Citation | undefined;
  label: React.ReactNode;
}) {
  const href = safeExternalHref(citation?.link);
  const title = citation?.title?.trim();

  // Sources without a resolvable link still get a marker, so the reader can see
  // the statement is supported even when the document cannot be opened.
  if (!href) {
    return (
      <span className="chat-citation" title={title}>
        {label}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="chat-citation"
      title={title}
    >
      {label}
    </a>
  );
}

/**
 * Synced documents are titled with their full path, so six sources from one
 * folder repeated the same two lines six times and buried the filename at the
 * end. The name is the thing being cited; the folder is context.
 *
 * Only the innermost folders are kept: sources of one answer usually share a
 * long common prefix, which truncated away the part that told them apart. The
 * full path stays on the element's title.
 */
const FOLDER_SEGMENTS_SHOWN = 2;

function splitDocumentTitle(title: string): { name: string; folder: string | null } {
  const parts = title.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { name: title, folder: null };
  const name = parts.pop() as string;
  const tail = parts.slice(-FOLDER_SEGMENTS_SHOWN).join(" / ");
  const folder = parts.length > FOLDER_SEGMENTS_SHOWN ? `… / ${tail}` : tail;
  return { name, folder };
}

function MessageCitations({ citations }: { citations: Citation[] }) {
  const { t } = useI18n();
  const DEFAULT_VISIBLE_CITATIONS = 5;
  const [showAll, setShowAll] = React.useState(false);

  const hasMoreThanDefault = citations.length > DEFAULT_VISIBLE_CITATIONS;
  const visibleCitations = showAll ? citations : citations.slice(0, DEFAULT_VISIBLE_CITATIONS);

  return (
    <div className="mt-4">
      <div className="text-xs font-medium text-chat-text-tertiary mb-2">
        {t("chat.message.sources")}
      </div>
      <div className="space-y-1">
        {visibleCitations.map((citation, index) => {
          const rawTitle = citation.title?.trim() || t("chat.message.source", { index: index + 1 });
          const { name, folder } = splitDocumentTitle(rawTitle);
          const href = safeExternalHref(citation.link);

          const body = (
            <>
              {/* Same number the inline marker carries, and the same shape, so a
                  marker in the answer reads as pointing here. */}
              <span className="inline-flex items-center justify-center flex-shrink-0 min-w-[1.25rem] h-[1.25rem] mt-px px-1 rounded-[0.3rem] bg-chat-bg-tertiary text-[0.6875rem] font-medium leading-none text-chat-text-tertiary tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-chat-text-primary" title={name}>
                  {name}
                </span>
                {folder && (
                  <span className="block truncate text-xs text-chat-text-tertiary" title={rawTitle}>
                    {folder}
                  </span>
                )}
                {citation.description && (
                  <span className="mt-1 block text-xs text-chat-text-secondary leading-relaxed">
                    {citation.description}
                  </span>
                )}
                {citation.image && (
                  <img
                    src={citation.image}
                    alt={name}
                    className="mt-2 max-h-40 w-full rounded-md object-cover"
                  />
                )}
              </span>
            </>
          );

          const shared = "flex items-start gap-2.5 rounded-lg px-2.5 py-2 border border-transparent";

          // The whole row is the target, not just the title text - a one-line
          // filename made a very small thing to hit.
          return href ? (
            <a
              key={citation.id || `${name}-${index}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                shared,
                "no-underline transition-colors hover:border-chat-border-primary hover:bg-chat-bg-tertiary/60"
              )}
            >
              {body}
            </a>
          ) : (
            <div key={citation.id || `${name}-${index}`} className={shared}>
              {body}
            </div>
          );
        })}
      </div>

      {hasMoreThanDefault && (
        <div className="mt-1 pl-2.5">
          <button
            type="button"
            className="text-xs text-chat-text-tertiary hover:text-chat-text-secondary transition-colors"
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? t("chat.message.showLess") : t("chat.message.showAll", { count: citations.length })}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Extract text content from message content: the text parts, one per line.
 */
function getTextContent(content: Message["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  return content
    .filter((part) => part.type === "text" && "text" in part)
    .map((part) => (part as { type: "text"; text: string }).text)
    .join("\n");
}

/** The safe image URLs among the content parts, in order. */
function getImages(content: Message["content"]): string[] {
  if (typeof content === "string") return [];
  const out: string[] = [];
  for (const part of content) {
    const image = imagePartSource(part);
    if (image) out.push(image.src);
  }
  return out;
}

/**
 * Format timestamp
 */
function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Check if a message has tool call details
 */
function hasToolCalls(message: Message): boolean {
  const details = (message.metadata as Record<string, unknown> | undefined)?.toolCallDetails;
  return Array.isArray(details) && details.length > 0;
}

/**
 * Render tool calls from a completed message's metadata
 */
function MessageToolCalls({ message }: { message: Message }) {
  const meta = message.metadata as Record<string, unknown> | undefined;
  const details = meta?.toolCallDetails as
    | Array<{ id: string; name: string; args: Record<string, unknown>; result?: unknown }>
    | undefined;
  const durationSeconds = meta?.toolCallDurationSeconds as number | undefined;

  if (!details || details.length === 0) return null;

  return (
    <div className="mt-2">
      <ToolCalls
        toolCalls={details}
        isExecuting={false}
        durationSeconds={durationSeconds}
        defaultExpanded={false}
      />
    </div>
  );
}
