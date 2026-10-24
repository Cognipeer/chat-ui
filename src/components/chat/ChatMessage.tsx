"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, formatFileSize, imagePartSource, isFileExpired, isImageType, isRasterImageType, safeFileHref, safeImageSrc, messageText, readPlan, reasoningOf, waitingToolCallIds, callsWithOpenActions, type ToolCallRow } from "../../utils";
import {
  insertCitationMarkers,
  parseCitationHref,
  safeExternalHref,
  citationUrlTransform,
} from "../../utils/citations";
import type { Message, MessageActionProps, FileAttachment, Citation, StopNoticeRenderProps } from "../../types";
import { FileIcon, ImageIcon, InfoIcon, LoadingIcon } from "./Icons";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCalls } from "./ToolCall";
import { PlanCard } from "./PlanCard";
import { MessageActionCards, type ChatActionsConfig } from "./ActionCards";
import { MessageToolbar, type MessageToolbarConfig } from "./MessageToolbar";
import { MessageEditor } from "./MessageEditor";
import { MessageStopNotice, MessageWarnings } from "./StopNotice";
import { FilePreview } from "./FilePreview";
import { filePreviewKind, saveFile } from "../../utils/filePreview";
import { useI18n } from "../../hooks";
import { useAppearance } from "./appearance";

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
  /** Reasoning streamed so far (only used when isStreaming is true) */
  streamingReasoning?: string;
  /** Show the collapsible "Thinking" block above an answer that has reasoning (default true) */
  showReasoning?: boolean;
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
  /**
   * Offer a preview next to Download on the message's files, and open its pictures in it (default true):
   * pictures, PDF, Word, spreadsheets (xlsx, csv), Markdown (also saved as PDF or Word), HTML, JSON, text and
   * code, audio and video. A panel on a wide screen, the whole screen on a phone.
   */
  filePreview?: boolean;
  /** Replace the notice under an answer that stopped early (stopped, limit, usage limit, error) */
  renderStopNotice?: (props: StopNoticeRenderProps) => React.ReactNode;
  /**
   * How to get a URL for a stored file that has none of its own (the messages of a loaded
   * conversation): images are fetched this way to be shown, other files when "Download" is pressed.
   */
  resolveFileUrl?: ResolveFileUrl;
  /** The built-in row of buttons under the message (copy, regenerate, edit, thumbs) */
  toolbar?: MessageToolbarConfig;
  /**
   * Edit-and-resend of one of the person's messages: `toolbar.onEdit` opens the editor, and this
   * receives the new text. Resolves `false` when it was refused (the editor stays open).
   */
  onSaveEdit?: (content: string) => Promise<boolean> | boolean | void;
  /** Label this message as AI-generated with this text (assistant messages only) */
  aiLabel?: string;
  /**
   * The message list shows this message's reasoning, tool calls and answered cards in a "worked for ..."
   * line above it (`appearance="modern"`): the message itself shows only what is still open.
   */
  hideActivity?: boolean;
}

/**
 * Individual chat message component
 */
export function ChatMessage({
  message,
  isStreaming = false,
  streamingText,
  streamingReasoning,
  showReasoning = true,
  className,
  renderActions,
  renderAvatar,
  showAvatar = true,
  showTimestamp = false,
  enableCitations = true,
  actions,
  renderImage,
  filePreview = true,
  renderStopNotice,
  resolveFileUrl,
  toolbar,
  onSaveEdit,
  aiLabel,
  hideActivity = false,
}: ChatMessageProps) {
  const modern = useAppearance() === "modern";
  const [editing, setEditing] = React.useState(false);
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const content = isStreaming && streamingText ? streamingText : messageText(message.content);
  const reasoning = showReasoning && isAssistant ? (isStreaming ? streamingReasoning ?? "" : reasoningOf(message)) : "";
  const images = React.useMemo(() => getImages(message.content), [message.content]);
  const storedPlan = React.useMemo(() => (isAssistant ? readPlan(message) : undefined), [isAssistant, message.metadata]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // A turn that only paused for a tool of the host page has nothing to show: the page answers it unseen
  if (isAssistant && !isStreaming && isHostToolPauseOnly(message, content, images.length)) return null;

  const markdown = (
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
  );

  return (
    <div
      data-chat-message-id={message.id}
      data-chat-role={message.role}
      className={cn(
        "group animate-fade-in",
        modern
          ? cn("px-4", isUser ? "flex flex-col items-end py-2" : "py-3")
          : cn("flex gap-4 px-4 py-6", isUser ? "bg-transparent" : "bg-chat-bg-secondary"),
        className
      )}
    >
      {/* Avatar */}
      {showAvatar && !modern && (
        <div className="flex-shrink-0">
          {renderAvatar ? (
            renderAvatar(message.role)
          ) : (
            <DefaultAvatar role={message.role} />
          )}
        </div>
      )}

      {/* Content */}
      <div
        className={cn(
          "min-w-0 space-y-2",
          modern && isUser ? "flex max-w-[85%] flex-col items-end" : "flex-1",
          modern && isUser && editing && "w-full max-w-full"
        )}
      >
        {/* Tool calls from completed messages — shown above the text */}
        {isAssistant && !isStreaming && !hideActivity && hasToolCalls(message) && (
          <MessageToolCalls message={message} />
        )}

        {/* The agent's plan, kept with the answer (the modern list draws it itself, in the turn's activity) */}
        {isAssistant && !isStreaming && !hideActivity && storedPlan && <PlanCard plan={storedPlan} />}

        {/* Editing one of the person's messages */}
        {isUser && editing && onSaveEdit && (
          <MessageEditor
            initial={content}
            onCancel={() => setEditing(false)}
            onSave={async (next) => {
              const ok = await onSaveEdit(next);
              if (ok !== false) setEditing(false);
              return ok !== false;
            }}
          />
        )}

        {reasoning && !hideActivity && <ThinkingBlock reasoning={reasoning} streaming={isStreaming} answering={content.trim().length > 0} className="mb-3" />}

        {/* Message content (a turn that only paused for an answer has none) */}
        {!(isUser && editing) && (renderedContent || isStreaming || !isAssistant || !message.pendingActions?.length) &&
          (modern && isUser ? (
            // the person's own words: a bubble on the right
            <div data-chat-bubble className="max-w-full rounded-3xl bg-chat-bg-tertiary px-4 py-2.5 text-chat-text-primary">
              {markdown}
            </div>
          ) : modern && hideActivity && !renderedContent.trim() && !isStreaming ? null : (
            markdown
          ))}

        {/* Images that are part of the content */}
        {images.length > 0 && <MessageImages images={images} renderImage={renderImage} />}

        {/* Why the answer ends where it does, when it was not simply finished */}
        {isAssistant && !isStreaming && (
          <MessageStopNotice message={message} hasText={content.trim().length > 0} render={renderStopNotice} />
        )}

        {/* Approvals and questions the assistant is waiting on */}
        {isAssistant && !isStreaming && <MessageActionCards message={message} config={actions} openOnly={hideActivity} />}

        {/* File attachments */}
        {message.files && message.files.length > 0 && (
          <FileAttachments files={message.files} renderImage={renderImage} resolveFileUrl={resolveFileUrl} preview={filePreview} />
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

        {/* Labelled as machine-written, where the host asked for it */}
        {isAssistant && aiLabel && (
          <div data-chat-ai-label className="mt-1 inline-flex items-center gap-1 text-[11px] text-chat-text-tertiary">
            <InfoIcon className="h-3 w-3" />
            <span>{aiLabel}</span>
          </div>
        )}

        {/* Built-in actions: copy, edit, regenerate, thumbs */}
        {!isStreaming && toolbar && !(isUser && editing) && (
          <MessageToolbar
            {...toolbar}
            onEdit={toolbar.onEdit ? () => setEditing(true) : undefined}
            text={content}
            className="mt-1"
          />
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

/** An answer that is only the pause for the host page's tools: no words, no files, no calls, no cards of its own. */
function isHostToolPauseOnly(message: Message, text: string, imageCount: number): boolean {
  const actions = message.pendingActions;
  if (!actions || actions.length === 0 || !actions.every((a) => a.type === "client_tool")) return false;
  return text.trim() === "" && imageCount === 0 && !(message.files && message.files.length > 0) && !hasToolCalls(message) && !message.stopReason;
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

/** An image, opening full size in a new tab on click or Enter (or in the preview, with `onOpen`). */
function ImageThumb({
  src,
  alt,
  className,
  renderImage,
  file,
  onError,
  onOpen,
}: {
  src: string;
  alt: string;
  className?: string;
  renderImage?: (props: ImageRenderProps) => React.ReactNode;
  file?: FileAttachment;
  /** The picture could not be loaded (not called for a host's own `renderImage`) */
  onError?: () => void;
  /** Open the picture in the file preview instead of a new tab */
  onOpen?: () => void;
}) {
  const { t } = useI18n();
  if (renderImage) return <>{renderImage({ src, alt, file })}</>;
  if (onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("chat.preview.openFile", { fileName: alt })}
        className="inline-block cursor-zoom-in rounded-lg border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent-primary"
      >
        <img src={src} alt={alt} loading="lazy" onError={onError} className={cn("rounded-lg object-contain bg-chat-bg-tertiary", className)} />
      </button>
    );
  }
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

/** How far a file has gone up, as a thin bar (the chip's own bottom edge, or under a thumbnail). */
function UploadBar({ name, percent, className }: { name: string; percent: number; className?: string }) {
  const { t } = useI18n();
  return (
    <span
      role="progressbar"
      aria-label={`${t("chat.a11y.uploadProgress")}: ${name}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("block h-0.5 bg-chat-bg-hover", className)}
    >
      <span className="block h-full bg-chat-accent-primary transition-all" style={{ width: `${percent}%` }} />
    </span>
  );
}

/**
 * One attached file: a thumbnail for a picture, otherwise a chip with its name, size and state. A file
 * still going up (the message was sent with files stored first) shows how far it is and offers nothing
 * to open or download: it is not on the server yet.
 */
function FileAttachmentItem({
  file,
  renderImage,
  resolveFileUrl,
  preview,
}: {
  file: FileAttachment;
  renderImage?: (props: ImageRenderProps) => React.ReactNode;
  resolveFileUrl?: ResolveFileUrl;
  preview: boolean;
}) {
  const { t, formatDate } = useI18n();
  const [downloadFailed, setDownloadFailed] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const rootRef = React.useRef<HTMLElement | null>(null);
  const expired = isFileExpired(file);
  // Going up (or refused by the server): there is no stored copy to show, open or download yet
  const uploading = file.status === "uploading" || file.status === "queued";
  const failed = file.status === "failed";
  const notStored = uploading || failed;
  const percent = Math.round(Math.min(1, Math.max(0, file.progress ?? 0)) * 100);
  const image = isImageType(file.mimeType);
  // Only pictures a browser shows without running anything become thumbnails; an SVG or the like is a file chip
  const raster = isRasterImageType(file.mimeType);
  // Addresses that did not load (a preview that was released, a stored copy the browser cannot draw)
  const [failedSrc, setFailedSrc] = React.useState<readonly string[]>([]);
  const usable = (src: string | undefined) => (src && !failedSrc.includes(src) ? src : undefined);
  const local = raster ? usable(safeImageSrc(file.previewUrl)) : undefined;
  const ownUrl = raster ? usable(safeImageSrc(file.url)) : undefined;
  // A picture that is still on this device shows even if its server copy is gone
  const stored = useStoredFileUrl(file, resolveFileUrl, raster && !local && !ownUrl && !expired && !notStored);
  const thumb = raster ? local ?? (expired || notStored ? undefined : ownUrl ?? usable(stored.src)) : undefined;
  const href = expired || notStored ? undefined : safeFileHref(file.url);
  // A preview reads the bytes: from this device, the file's own link or the transport
  const canPreview =
    preview &&
    !expired &&
    !notStored &&
    filePreviewKind(file) !== undefined &&
    Boolean(href || resolveFileUrl || (file.previewUrl && /^blob:/i.test(file.previewUrl)));
  const previewPanel = previewing && (
    <FilePreview
      file={file}
      resolveFileUrl={resolveFileUrl}
      onClose={() => setPreviewing(false)}
      container={rootRef.current?.closest(".chat-container, .chat-theme-root")}
    />
  );

  if (thumb) {
    return (
      <figure ref={rootRef} className="m-0 max-w-full" data-chat-file-status={file.status}>
        <ImageThumb
          src={thumb}
          alt={file.name}
          className="max-h-48 max-w-full"
          renderImage={renderImage}
          file={file}
          onError={() => setFailedSrc((prev) => [...prev, thumb])}
          onOpen={canPreview ? () => setPreviewing(true) : undefined}
        />
        <figcaption className="mt-1 text-xs text-chat-text-secondary truncate max-w-[16rem]" title={file.name}>
          {file.name} · {formatFileSize(file.size)}
          {uploading && <span aria-hidden="true"> · {t("chat.file.uploading", { percent })}</span>}
          {failed && <span className="text-chat-danger"> · {file.uploadError ?? t("chat.file.uploadFailed")}</span>}
        </figcaption>
        {uploading && <UploadBar name={file.name} percent={percent} className="mt-1 max-w-[16rem] rounded" />}
        {previewPanel}
      </figure>
    );
  }

  const { base, ext } = splitFileName(file.name);
  const noText = file.conversionStatus === "failed" || file.conversionStatus === "skipped";
  const keptUntil = !expired && file.expiresAt ? formatDate(new Date(file.expiresAt), { dateStyle: "medium" }) : undefined;
  const canDownload = !expired && !notStored && !href && Boolean(resolveFileUrl);

  const download = async () => {
    setDownloadFailed(false);
    const saved = await saveFile(file, resolveFileUrl).catch(() => false);
    if (!saved) setDownloadFailed(true);
  };

  return (
    <div
      ref={rootRef as React.RefObject<HTMLDivElement>}
      data-chat-file={expired ? "expired" : noText ? "no-text" : undefined}
      data-chat-file-status={file.status}
      title={
        expired
          ? t("chat.file.expiredTitle", { fileName: file.name })
          : failed
            ? t("chat.input.fileFailed", { fileName: file.name, reason: file.uploadError ?? "" })
            : noText
              ? t("chat.file.noTextTitle", { fileName: file.name })
              : keptUntil
                ? t("chat.file.keptUntil", { date: keptUntil })
                : undefined
      }
      className={cn(
        "relative flex max-w-full items-center gap-2 overflow-hidden px-3 py-2 bg-chat-bg-tertiary rounded-lg text-sm border",
        expired ? "border-transparent opacity-60" : failed ? "border-chat-danger" : noText ? "border-chat-warning" : "border-transparent"
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
      {uploading && (
        <>
          <LoadingIcon className="w-3.5 h-3.5 flex-shrink-0 text-chat-text-tertiary animate-spin motion-reduce:animate-none" />
          <span className="text-chat-text-tertiary text-xs tabular-nums flex-shrink-0" aria-hidden="true">
            {t("chat.file.uploading", { percent })}
          </span>
        </>
      )}
      {failed && (
        <span role="status" className="text-xs text-chat-danger flex-shrink-0">
          {file.uploadError ?? t("chat.file.uploadFailed")}
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
      {canPreview && (
        <button
          type="button"
          onClick={() => setPreviewing(true)}
          aria-label={t("chat.preview.openFile", { fileName: file.name })}
          className="text-chat-accent-primary hover:underline flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent-primary rounded"
        >
          {t("chat.preview.open")}
        </button>
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
      {uploading && <UploadBar name={file.name} percent={percent} className="absolute inset-x-0 bottom-0" />}
      {previewPanel}
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
  preview,
}: {
  files: FileAttachment[];
  renderImage?: (props: ImageRenderProps) => React.ReactNode;
  resolveFileUrl?: ResolveFileUrl;
  preview: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {files.map((file) => (
        <FileAttachmentItem key={file.id} file={file} renderImage={renderImage} resolveFileUrl={resolveFileUrl} preview={preview} />
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

/** The tool calls a completed message stored (`metadata.toolCallDetails`) */
export function storedToolCalls(message: Message): ToolCallRow[] {
  const details = (message.metadata as Record<string, unknown> | undefined)?.toolCallDetails;
  return Array.isArray(details) ? (details as ToolCallRow[]) : [];
}

/**
 * The rows to show for a message: the stored calls, and a row for every open approval or question
 * that has none (a conversation loaded again knows its cards, not the calls that led to them)
 */
function toolCallsOf(message: Message): ToolCallRow[] {
  return callsWithOpenActions(message, storedToolCalls(message));
}

/**
 * Check if a message has tool call details
 */
function hasToolCalls(message: Message): boolean {
  return toolCallsOf(message).length > 0;
}

/**
 * Render tool calls from a completed message's metadata
 */
function MessageToolCalls({ message }: { message: Message }) {
  const meta = message.metadata as Record<string, unknown> | undefined;
  const details = toolCallsOf(message);
  const durationSeconds = meta?.toolCallDurationSeconds as number | undefined;

  if (details.length === 0) return null;

  // A call the turn paused on (an approval or a question that is still open) is not a finished one
  const waitingIds = waitingToolCallIds(message, details);

  return (
    <div className="mt-2">
      <ToolCalls
        toolCalls={details}
        isExecuting={false}
        durationSeconds={durationSeconds}
        defaultExpanded={false}
        waitingIds={waitingIds}
      />
    </div>
  );
}
