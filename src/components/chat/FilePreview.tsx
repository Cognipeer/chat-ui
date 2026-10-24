"use client";

import React from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { FileAttachment } from "../../types";
import { cn, formatFileSize } from "../../utils";
import { copyText } from "../../utils/clipboard";
import { downloadBlob } from "../../utils/export";
import {
  blobBytes,
  blobText,
  fileExtension,
  filePreviewKind,
  loadFileBlob,
  parseCsv,
  parseXlsx,
  PREVIEW_MAX_BYTES,
  PREVIEW_MAX_CHARS,
  saveFile,
  type FilePreviewKind,
  type FileUrlResolver,
  type SheetPreview,
} from "../../utils/filePreview";
import { markdownExportName, exportMarkdown, type MarkdownExportFormat } from "../../utils/markdownExport";
import { useI18n } from "../../hooks/useI18n";
import {
  CheckIcon,
  ChevronDownIcon,
  CodeIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileIcon,
  FitWidthIcon,
  LoadingIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "./Icons";
import { FOCUS_RING, PRIMARY_BUTTON } from "./styles";

export interface FilePreviewProps {
  file: FileAttachment;
  /** How to read a stored file that has no address of its own (see `ChatTransport.getFileUrl`) */
  resolveFileUrl?: FileUrlResolver;
  onClose: () => void;
  /** Where the dialog is mounted; defaults to `document.body` (pass the chat's theme root to keep its colours) */
  container?: Element | null;
}

type Content =
  | { kind: "image" | "svg" | "audio" | "video"; url: string }
  | { kind: "pdf" | "docx"; data: ArrayBuffer }
  | { kind: "sheets"; sheets: SheetPreview[]; text?: string }
  | { kind: "markdown" | "html" | "json" | "text"; text: string; truncated: boolean };

type LoadState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "tooLarge"; size: number }
  | { status: "ready"; blob: Blob; content: Content };

const RASTER_TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", bmp: "image/bmp",
};
const MEDIA_TYPES: Record<string, string> = {
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/mp4", webm: "video/webm", ogv: "video/ogg",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac",
};

/**
 * The type a blob is handed to the page with. Only pictures and media get one of their own (the element sniffs
 * the rest); an SVG never becomes an object URL, it is drawn from a `data:` URL, whose document has no origin.
 */
function displayType(file: FileAttachment, kind: "image" | "audio" | "video"): string {
  const ext = fileExtension(file.name);
  if (kind === "image") return RASTER_TYPES[ext] ?? (/^image\/(png|jpe?g|gif|webp|avif|bmp)$/i.test(file.mimeType) ? file.mimeType : "image/png");
  return MEDIA_TYPES[ext] ?? (file.mimeType.startsWith(`${kind}/`) ? file.mimeType : kind === "video" ? "video/mp4" : "audio/mpeg");
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const capped = (text: string) =>
  text.length > PREVIEW_MAX_CHARS ? { text: text.slice(0, PREVIEW_MAX_CHARS), truncated: true } : { text, truncated: false };

/** Reads the file and turns it into what the preview draws (nothing is read for a kind that cannot be shown). */
function useFileContent(file: FileAttachment, kind: FilePreviewKind | undefined, resolve: FileUrlResolver | undefined): LoadState {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  React.useEffect(() => {
    if (!kind) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    const limit = PREVIEW_MAX_BYTES[kind];
    setState({ status: "loading" });
    (async () => {
      if (file.size > limit) return setState({ status: "tooLarge", size: file.size });
      const blob = await loadFileBlob(file, resolve, controller.signal);
      // closed while the bytes came: nothing may be made that the cleanup can no longer release
      if (controller.signal.aborted) return;
      if (blob.size > limit) return setState({ status: "tooLarge", size: blob.size });
      let content: Content;
      switch (kind) {
        case "image":
        case "audio":
        case "video":
          objectUrl = URL.createObjectURL(new Blob([blob], { type: displayType(file, kind) }));
          content = { kind, url: objectUrl };
          break;
        case "svg":
          content = { kind, url: await dataUrl(new Blob([blob], { type: "image/svg+xml" })) };
          break;
        case "pdf":
        case "docx":
          content = { kind, data: await blobBytes(blob) };
          break;
        case "spreadsheet":
          content = { kind: "sheets", sheets: await parseXlsx(await blobBytes(blob)) };
          break;
        case "csv": {
          const text = await blobText(blob);
          const tsv = fileExtension(file.name) === "tsv" || file.mimeType.startsWith("text/tab-separated-values");
          content = { kind: "sheets", sheets: [parseCsv(text, { tsv })], text };
          break;
        }
        case "json": {
          const raw = await blobText(blob);
          let pretty = raw;
          try {
            pretty = JSON.stringify(JSON.parse(raw), null, 2);
          } catch {
            // not valid JSON: shown as it is
          }
          content = { kind, ...capped(pretty) };
          break;
        }
        default:
          content = { kind, ...capped(await blobText(blob)) };
      }
      if (controller.signal.aborted) return;
      setState({ status: "ready", blob, content });
    })().catch(() => {
      if (!controller.signal.aborted) setState({ status: "failed" });
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // the file's identity decides, not the object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id, file.url, kind]);
  return state;
}

/**
 * A button with only an icon: the label is its name for a screen reader and its tooltip. One that cannot act
 * (zoomed all the way in, say) stays focusable, so the focus is not dropped out of the dialog when it gets there.
 */
const IconButton = React.forwardRef<
  HTMLButtonElement,
  { label: string; onClick: () => void; pressed?: boolean; disabled?: boolean; children: React.ReactNode; className?: string }
>(function IconButton({ label, onClick, pressed, disabled, children, className }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className={cn(
        "inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-chat-text-secondary",
        disabled ? "cursor-default opacity-50" : "hover:bg-chat-bg-hover hover:text-chat-text-primary",
        pressed && "bg-chat-bg-tertiary text-chat-text-primary",
        FOCUS_RING,
        className
      )}
    >
      {children}
    </button>
  );
});

/**
 * A file shown in place: a panel on the right of a wide screen, the whole screen on a phone. Pictures, PDF,
 * Word, spreadsheets (xlsx, csv), Markdown, HTML, JSON, text and code, audio and video; a Markdown file can be
 * saved as PDF or Word too. It closes on Escape or the close button and gives focus back to what opened it.
 */
export function FilePreview({ file, resolveFileUrl, onClose, container }: FilePreviewProps) {
  const { t } = useI18n();
  const titleId = React.useId();
  const kind = filePreviewKind(file);
  const state = useFileContent(file, kind, resolveFileUrl);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const [source, setSource] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [notice, setNotice] = React.useState<string>();
  const [pdfFailed, setPdfFailed] = React.useState(false);
  const [docxFailed, setDocxFailed] = React.useState(false);

  // Focus moves in, the page under it stops scrolling, and both come back on close
  React.useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  // Events in a portal still bubble through the React tree: the chat around the opener must not act on them
  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], iframe, audio, video, [tabindex]:not([tabindex="-1"])')
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const ready = state.status === "ready" ? state : undefined;
  const text = ready && "text" in ready.content ? ready.content.text : undefined;
  const hasSource = ready?.content.kind === "markdown" || ready?.content.kind === "html";

  const download = async () => {
    setNotice(undefined);
    if (ready) {
      // the bytes are already here; as a plain download whatever their type
      downloadBlob(new Blob([ready.blob], { type: "application/octet-stream" }), file.name);
      return;
    }
    const saved = await saveFile(file, resolveFileUrl).catch(() => false);
    if (!saved) setNotice(t("chat.file.downloadFailed"));
  };

  const exportAs = async (format: MarkdownExportFormat) => {
    if (!ready || ready.content.kind !== "markdown") return;
    setNotice(undefined);
    try {
      const markdown = await blobText(ready.blob);
      const blob = await exportMarkdown(markdown, format, file.name.replace(/\.(md|markdown)$/i, ""));
      downloadBlob(blob, markdownExportName(file.name, format));
    } catch {
      setNotice(t("chat.preview.exportFailed"));
    }
  };

  const copy = async () => {
    if (text === undefined) return;
    if (await copyText(text)) setCopied(true);
  };

  const meta = [fileExtension(file.name).toUpperCase(), file.size > 0 ? formatFileSize(file.size) : ""].filter(Boolean).join(" · ");

  const dialog = (
    <div
      className="fixed inset-0 z-[70] flex justify-end"
      data-chat-file-preview={kind ?? "none"}
      onKeyDown={onKeyDown}
      onClick={(event) => event.stopPropagation()}
    >
      <div aria-hidden="true" className="absolute inset-0 hidden animate-fade-in bg-black/50 sm:block" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // a click on the content (a PDF page, the table) focuses the dialog instead of the page behind it, so
        // Escape and Tab keep working
        tabIndex={-1}
        className={cn(
          "relative flex h-full w-full flex-col bg-chat-bg-primary text-chat-text-primary shadow-2xl outline-none",
          "pb-[env(safe-area-inset-bottom)] sm:w-[min(960px,92vw)] sm:border-l sm:border-chat-border-primary"
        )}
      >
        <header className="flex flex-shrink-0 items-center gap-1 border-b border-chat-border-primary py-2 pl-3 pr-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-1.5 sm:pl-4">
          <FileIcon className="mr-1 h-5 w-5 flex-shrink-0 text-chat-text-secondary" />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 truncate text-sm font-medium text-chat-text-primary" title={file.name}>
              {file.name}
            </h2>
            {meta && <p className="m-0 truncate text-xs text-chat-text-tertiary">{meta}</p>}
          </div>
          {hasSource && (
            <IconButton label={source ? t("chat.preview.rendered") : t("chat.preview.source")} pressed={source} onClick={() => setSource((v) => !v)}>
              {source ? <EyeIcon className="h-4 w-4" /> : <CodeIcon className="h-4 w-4" />}
            </IconButton>
          )}
          {text !== undefined && (
            <IconButton label={copied ? t("chat.preview.copied") : t("chat.preview.copy")} onClick={() => void copy()}>
              {copied ? <CheckIcon className="h-4 w-4 text-chat-success" /> : <CopyIcon className="h-4 w-4" />}
            </IconButton>
          )}
          {ready?.content.kind === "markdown" ? (
            <SaveMenu onDownload={() => void download()} onExport={exportAs} />
          ) : (
            <IconButton label={t("chat.preview.download")} onClick={() => void download()}>
              <DownloadIcon className="h-4 w-4" />
            </IconButton>
          )}
          <IconButton ref={closeRef} label={t("chat.preview.close")} onClick={onClose}>
            <XIcon className="h-5 w-5" />
          </IconButton>
        </header>
        {notice && (
          <p role="alert" className="m-0 flex-shrink-0 border-b border-chat-border-primary bg-chat-danger-bg px-4 py-2 text-xs text-chat-danger">
            {notice}
          </p>
        )}
        <div className="relative min-h-0 flex-1 overflow-auto overscroll-contain">
          {!kind ? (
            <Unavailable message={t("chat.preview.unsupported")} onDownload={() => void download()} />
          ) : state.status === "loading" ? (
            <div role="status" className="flex h-full items-center justify-center gap-2 text-sm text-chat-text-secondary">
              <LoadingIcon className="h-5 w-5 animate-spin motion-reduce:animate-none" />
              {t("chat.preview.loading")}
            </div>
          ) : state.status === "tooLarge" ? (
            <Unavailable message={t("chat.preview.tooLarge", { size: formatFileSize(state.size) })} onDownload={() => void download()} />
          ) : state.status === "failed" ? (
            <Unavailable message={t("chat.preview.failed")} onDownload={() => void download()} />
          ) : (
            <PreviewBody
              file={file}
              content={state.content}
              source={source}
              pdfFailed={pdfFailed}
              docxFailed={docxFailed}
              onPdfFailed={() => setPdfFailed(true)}
              onDocxFailed={() => setDocxFailed(true)}
              onDownload={() => void download()}
            />
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(dialog, container ?? document.body);
}

function Unavailable({ message, onDownload }: { message: string; onDownload: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <FileIcon className="h-10 w-10 text-chat-text-tertiary" />
      <p className="m-0 max-w-sm text-sm text-chat-text-secondary">{message}</p>
      <button type="button" onClick={onDownload} className={PRIMARY_BUTTON}>
        <DownloadIcon className="h-4 w-4" />
        {t("chat.preview.download")}
      </button>
    </div>
  );
}

function PreviewBody({
  file,
  content,
  source,
  pdfFailed,
  docxFailed,
  onPdfFailed,
  onDocxFailed,
  onDownload,
}: {
  file: FileAttachment;
  content: Content;
  source: boolean;
  pdfFailed: boolean;
  docxFailed: boolean;
  onPdfFailed: () => void;
  onDocxFailed: () => void;
  onDownload: () => void;
}) {
  const { t } = useI18n();
  switch (content.kind) {
    case "image":
    case "svg":
      return (
        <div className="flex min-h-full items-center justify-center bg-chat-bg-secondary p-4">
          <img src={content.url} alt={file.name} className="max-h-full max-w-full object-contain" />
        </div>
      );
    case "audio":
      return (
        <div className="flex h-full items-center justify-center p-6">
          <audio controls src={content.url} className="w-full max-w-md" />
        </div>
      );
    case "video":
      return (
        <div className="flex h-full items-center justify-center bg-black">
          <video controls playsInline src={content.url} className="max-h-full max-w-full" />
        </div>
      );
    case "pdf":
      return pdfFailed ? <Unavailable message={t("chat.preview.failed")} onDownload={onDownload} /> : <PdfView data={content.data} onFailed={onPdfFailed} />;
    case "docx":
      return docxFailed ? <Unavailable message={t("chat.preview.failed")} onDownload={onDownload} /> : <DocxView data={content.data} onFailed={onDocxFailed} />;
    case "sheets":
      return <SheetView sheets={content.sheets} />;
    case "markdown":
      return source ? (
        <TextBody text={content.text} truncated={content.truncated} />
      ) : (
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8">
          <div className="chat-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ExternalLink }}>
              {content.text}
            </ReactMarkdown>
          </div>
          {content.truncated && <TruncatedNote />}
        </div>
      );
    case "html":
      // Its scripts run in a frame of its own: no access to this page, its cookies or its storage, no pop-ups,
      // no forms, no navigating the page away
      return source ? (
        <TextBody text={content.text} truncated={content.truncated} />
      ) : (
        <iframe title={file.name} sandbox="allow-scripts" srcDoc={content.text} className="block h-full w-full border-0 bg-white" />
      );
    default:
      return <TextBody text={content.text} truncated={content.truncated} />;
  }
}

function ExternalLink({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}

function TruncatedNote() {
  const { t } = useI18n();
  return <p className="m-0 px-4 py-3 text-xs text-chat-text-tertiary">{t("chat.preview.truncatedText", { count: PREVIEW_MAX_CHARS.toLocaleString() })}</p>;
}

function TextBody({ text, truncated }: { text: string; truncated: boolean }) {
  const { t } = useI18n();
  return (
    <>
      <pre className="m-0 whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-relaxed text-chat-text-primary">
        {text.length > 0 ? text : <span className="text-chat-text-tertiary">{t("chat.preview.empty")}</span>}
      </pre>
      {truncated && <TruncatedNote />}
    </>
  );
}

/** The save button of a Markdown file: the file itself, or the same text as PDF or Word. */
function SaveMenu({ onDownload, onExport }: { onDownload: () => void; onExport: (format: MarkdownExportFormat) => Promise<void> }) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const menuId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const choose = async (action: () => void | Promise<void>) => {
    setOpen(false);
    buttonRef.current?.focus();
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const onMenuKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const items: Array<{ label: string; run: () => void | Promise<void> }> = [
    { label: t("chat.preview.saveMarkdown"), run: onDownload },
    { label: t("chat.preview.savePdf"), run: () => onExport("pdf") },
    { label: t("chat.preview.saveDocx"), run: () => onExport("docx") },
  ];

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        // busy, it keeps the focus it was given back (a disabled button would drop it out of the dialog)
        aria-disabled={busy || undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={busy ? t("chat.preview.exporting") : t("chat.preview.download")}
        title={busy ? t("chat.preview.exporting") : t("chat.preview.download")}
        onClick={busy ? undefined : () => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-9 items-center gap-0.5 rounded-lg px-2 text-chat-text-secondary",
          busy ? "cursor-default opacity-60" : "hover:bg-chat-bg-hover hover:text-chat-text-primary",
          FOCUS_RING
        )}
      >
        {busy ? <LoadingIcon className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <DownloadIcon className="h-4 w-4" />}
        <ChevronDownIcon className="h-3 w-3" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t("chat.preview.download")}
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-10 mt-1 min-w-[13rem] rounded-lg border border-chat-border-primary bg-chat-bg-secondary py-1 shadow-xl"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => void choose(item.run)}
              className={cn("block w-full px-3 py-2.5 text-left text-sm text-chat-text-primary hover:bg-chat-bg-hover sm:py-2", FOCUS_RING)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Spreadsheets
// ---------------------------------------------------------------------------------------------------------

const NUMERIC = /^[-+]?[\d.,\s]+%?$/;

function SheetView({ sheets }: { sheets: SheetPreview[] }) {
  const { t } = useI18n();
  const [active, setActive] = React.useState(0);
  const sheet = sheets[active] ?? sheets[0];
  const [header, ...body] = sheet?.rows ?? [];
  const columns = Math.max(0, ...(sheet?.rows ?? []).map((row) => row.length));
  const pad = (row: string[]) => [...row, ...Array.from({ length: columns - row.length }, () => "")];

  return (
    <div className="flex h-full flex-col">
      {sheets.length > 1 && (
        <div role="tablist" aria-label={t("chat.preview.sheets")} className="flex flex-shrink-0 gap-1 overflow-x-auto border-b border-chat-border-primary px-2 py-1.5">
          {sheets.map((s, i) => (
            <button
              key={`${i}-${s.name}`}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={cn(
                "flex-shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs",
                i === active ? "bg-chat-bg-tertiary font-medium text-chat-text-primary" : "text-chat-text-secondary hover:bg-chat-bg-hover",
                FOCUS_RING
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {!header || columns === 0 ? (
          <p className="m-0 p-6 text-center text-sm text-chat-text-tertiary">{t("chat.preview.empty")}</p>
        ) : (
          <table className="min-w-full border-separate border-spacing-0 text-xs text-chat-text-primary">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 border-b border-r border-chat-border-primary bg-chat-bg-secondary px-2 py-1.5" />
                {pad(header).map((cell, c) => (
                  <th
                    key={c}
                    title={cell}
                    className="sticky top-0 z-10 max-w-[20rem] truncate whitespace-nowrap border-b border-r border-chat-border-primary bg-chat-bg-secondary px-2 py-1.5 text-left font-semibold"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r} className="hover:bg-chat-bg-hover/40">
                  <td className="sticky left-0 border-b border-r border-chat-border-secondary bg-chat-bg-primary px-2 py-1 text-right tabular-nums text-chat-text-tertiary">
                    {r + 2}
                  </td>
                  {pad(row).map((cell, c) => (
                    <td
                      key={c}
                      title={cell.length > 40 ? cell : undefined}
                      className={cn(
                        "max-w-[20rem] truncate whitespace-nowrap border-b border-r border-chat-border-secondary px-2 py-1",
                        NUMERIC.test(cell) && "text-right tabular-nums"
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {sheet && sheet.totalRows > sheet.rows.length && (
        <p className="m-0 flex-shrink-0 border-t border-chat-border-primary px-4 py-2 text-xs text-chat-text-tertiary">
          {t("chat.preview.truncatedRows", { shown: sheet.rows.length.toLocaleString(), total: sheet.totalRows.toLocaleString() })}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------------------------------------

/**
 * How the pages look, next to the document's own styles in the shadow root: no grey desk, and white sheets with
 * dark text in a dark theme too, because documents assume a white page.
 */
const DOCX_PAGE_STYLES = `
.chat-docx-pages .docx-wrapper { background: transparent; padding: 16px 16px 0; }
.chat-docx-pages .docx-wrapper > section.docx { color: #111827; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(15, 23, 42, 0.18); }
`;

/**
 * A Word document laid out as pages (docx-preview), scaled down to fit a narrow screen. docx-preview writes the
 * document's styles out as they are, so the pages go into a shadow root, in a box that contains its layout and
 * painting: a document cannot restyle the chat or draw outside the preview.
 */
function DocxView({ data, onFailed }: { data: ArrayBuffer; onFailed: () => void }) {
  const { t } = useI18n();
  const ref = React.useRef<HTMLDivElement>(null);
  const pageWidth = React.useRef(0);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      const { renderAsync } = await import("docx-preview");
      const host = ref.current;
      if (cancelled || !host) return;
      const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = DOCX_PAGE_STYLES;
      const node = document.createElement("div");
      node.className = "chat-docx-pages";
      root.replaceChildren(style, node);
      await renderAsync(data, node, undefined, {
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: true,
        // embedded HTML (altChunk) would be drawn in an unsandboxed frame
        renderAltChunks: false,
        renderComments: false,
        renderChanges: false,
        useBase64URL: true,
      });
      if (cancelled) return;
      // Links go out to the web or a mail program, or nowhere
      for (const link of Array.from(node.querySelectorAll("a[href]"))) {
        const href = link.getAttribute("href") ?? "";
        if (href.startsWith("#")) continue;
        if (/^(https?:|mailto:)/i.test(href.trim())) {
          link.setAttribute("target", "_blank");
          link.setAttribute("rel", "noopener noreferrer");
        } else {
          link.removeAttribute("href");
        }
      }
      // measured on the first fit, once the pages are on screen
      pageWidth.current = 0;
      setReady(true);
    })().catch(() => {
      if (!cancelled) onFailed();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  React.useEffect(() => {
    const host = ref.current;
    const root = host?.shadowRoot;
    if (!ready || !host || !root) return;
    const fit = () => {
      const wrapper = root.querySelector<HTMLElement>(".docx-wrapper");
      const page = wrapper?.querySelector<HTMLElement>("section.docx");
      if (!wrapper || !page) return;
      // before any zoom is set, so this is the page's own width
      if (pageWidth.current === 0) pageWidth.current = page.offsetWidth;
      if (pageWidth.current === 0) return;
      const needed = pageWidth.current + 32;
      const scale = host.clientWidth > 0 && needed > host.clientWidth ? host.clientWidth / needed : 1;
      wrapper.style.setProperty("zoom", scale === 1 ? "" : String(scale));
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    return () => observer.disconnect();
  }, [ready]);

  return (
    <>
      {!ready && (
        <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-chat-text-secondary">
          <LoadingIcon className="h-5 w-5 animate-spin motion-reduce:animate-none" />
          {t("chat.preview.loading")}
        </div>
      )}
      <div className={cn(!ready && "hidden")} style={{ contain: "content" }}>
        <div ref={ref} className="chat-docx-preview" />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------------------------------------

type Pdfjs = typeof import("pdfjs-dist");
let pdfjsReady: Promise<Pdfjs> | undefined;

/**
 * pdf.js (the build for older browsers too), loaded once. A package cannot point pdf.js at a worker file of its
 * own, so the worker module is loaded on the page and pdf.js runs it there - unless the host set a worker up.
 */
function loadPdfjs(): Promise<Pdfjs> {
  pdfjsReady ??= (async () => {
    const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.min.mjs")) as Pdfjs;
    if (!pdfjs.GlobalWorkerOptions.workerSrc && !(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker) {
      await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
    }
    return pdfjs;
  })();
  pdfjsReady.catch(() => (pdfjsReady = undefined));
  return pdfjsReady;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.25;
const PAGE_GUTTER = 12;
/** 4096 × 4096: Safari on a phone draws no bigger canvas */
const MAX_CANVAS_PIXELS = 16_777_216;

function PdfView({ data, onFailed }: { data: ArrayBuffer; onFailed: () => void }) {
  const { t } = useI18n();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pages = React.useRef(new Map<number, HTMLDivElement>());
  const [doc, setDoc] = React.useState<PDFDocumentProxy | null>(null);
  const [base, setBase] = React.useState<{ width: number; height: number } | null>(null);
  const [width, setWidth] = React.useState(0);
  const [zoom, setZoom] = React.useState(1);
  const [page, setPage] = React.useState(1);
  // Where the reader was when the zoom changed: the page, how far down it, and the middle across
  const anchor = React.useRef<{ page: number; within: number; across: number } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let task: { destroy(): Promise<void> } | undefined;
    (async () => {
      const pdfjs = await loadPdfjs();
      const loading = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
      task = loading;
      const loaded = await loading.promise;
      const viewport = (await loaded.getPage(1)).getViewport({ scale: 1 });
      if (cancelled) return;
      setBase({ width: viewport.width, height: viewport.height });
      setDoc(loaded);
    })().catch(() => {
      if (!cancelled) onFailed();
    });
    return () => {
      cancelled = true;
      void task?.destroy().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    setWidth(node.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const register = React.useCallback((n: number, node: HTMLDivElement | null) => {
    if (node) pages.current.set(n, node);
    else pages.current.delete(n);
  }, []);

  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const probe = node.scrollTop + node.clientHeight * 0.35;
    let visible = 1;
    for (const [n, el] of pages.current) if (el.offsetTop <= probe) visible = Math.max(visible, n);
    setPage(visible);
  };

  const fit = base && width > 0 ? Math.max((width - PAGE_GUTTER * 2) / base.width, 0.1) : 1;
  const scale = fit * zoom;

  const zoomTo = (next: (zoom: number) => number) => {
    const node = scrollRef.current;
    const el = pages.current.get(page);
    if (node && el) {
      anchor.current = {
        page,
        within: (node.scrollTop - el.offsetTop) / Math.max(el.offsetHeight, 1),
        across: (node.scrollLeft + node.clientWidth / 2) / Math.max(node.scrollWidth, 1),
      };
    }
    setZoom(next);
  };

  // Every page has its new size by now (it follows the scale), so the reader stays where they were
  React.useLayoutEffect(() => {
    const node = scrollRef.current;
    const target = anchor.current;
    anchor.current = null;
    const el = target && pages.current.get(target.page);
    if (!node || !target || !el) return;
    node.scrollTop = el.offsetTop + target.within * el.offsetHeight;
    node.scrollLeft = target.across * node.scrollWidth - node.clientWidth / 2;
  }, [scale]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-chat-border-primary px-3 py-1">
        <span className="text-xs tabular-nums text-chat-text-secondary">
          {doc ? t("chat.preview.page", { page, pages: doc.numPages }) : t("chat.preview.loading")}
        </span>
        <div className="flex items-center">
          <IconButton label={t("chat.preview.zoomOut")} disabled={!doc || zoom <= MIN_ZOOM} onClick={() => zoomTo((z) => Math.max(z / ZOOM_STEP, MIN_ZOOM))}>
            <ZoomOutIcon className="h-4 w-4" />
          </IconButton>
          <IconButton label={t("chat.preview.fitWidth")} disabled={!doc || zoom === 1} onClick={() => zoomTo(() => 1)}>
            <FitWidthIcon className="h-4 w-4" />
          </IconButton>
          <IconButton label={t("chat.preview.zoomIn")} disabled={!doc || zoom >= MAX_ZOOM} onClick={() => zoomTo((z) => Math.min(z * ZOOM_STEP, MAX_ZOOM))}>
            <ZoomInIcon className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-chat-bg-secondary"
        style={{ padding: PAGE_GUTTER }}
      >
        {doc && base ? (
          <div className="flex w-max min-w-full flex-col items-center gap-3">
            {Array.from({ length: doc.numPages }, (_, i) => (
              <PdfPage key={i + 1} doc={doc} number={i + 1} scale={scale} estimate={base} register={register} />
            ))}
          </div>
        ) : (
          <div role="status" className="flex items-center justify-center py-10">
            <LoadingIcon className="h-5 w-5 animate-spin text-chat-text-secondary motion-reduce:animate-none" />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One page, drawn when it comes near the visible part of the list (and again when the scale changes). A page far
 * from it gives its canvas back: a phone runs out of canvas memory a few dozen pages into a long PDF otherwise.
 * Its size on screen follows the scale at once, drawn or not (the first page's size until its own is known).
 */
function PdfPage({
  doc,
  number,
  scale,
  estimate,
  register,
}: {
  doc: PDFDocumentProxy;
  number: number;
  scale: number;
  estimate: { width: number; height: number };
  register: (n: number, node: HTMLDivElement | null) => void;
}) {
  const wrapper = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [near, setNear] = React.useState(typeof IntersectionObserver === "undefined");
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);

  React.useEffect(() => {
    const node = wrapper.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => setNear(entries[entries.length - 1]!.isIntersecting), { rootMargin: "800px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!near) return;
    let task: RenderTask | undefined;
    let cancelled = false;
    (async () => {
      const pdfPage = await doc.getPage(number);
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const own = pdfPage.getViewport({ scale: 1 });
      setSize((known) => (known?.width === own.width && known.height === own.height ? known : { width: own.width, height: own.height }));
      const viewport = pdfPage.getViewport({ scale });
      // sharp on a high-density screen, without the 3x canvases that run a phone out of memory, and never
      // larger than a phone draws (a big page zoomed in is drawn coarser instead)
      const ratio = Math.min(
        Math.max(window.devicePixelRatio || 1, 1),
        2,
        Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height))
      );
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      task = pdfPage.render({ canvas, viewport, ...(ratio !== 1 ? { transform: [ratio, 0, 0, ratio, 0, 0] } : {}) });
      await task.promise;
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      task?.cancel();
      // keeps its place on the page (the style), lets go of its pixels
      const canvas = canvasRef.current;
      if (canvas) canvas.width = canvas.height = 0;
    };
  }, [doc, number, scale, near]);

  const box = size ?? estimate;
  return (
    <div
      ref={(node) => {
        wrapper.current = node;
        register(number, node);
      }}
      data-page-number={number}
      className="flex justify-center"
    >
      <canvas
        ref={canvasRef}
        width={0}
        height={0}
        style={{ width: Math.floor(box.width * scale), height: Math.floor(box.height * scale) }}
        className="block rounded-sm bg-white shadow"
      />
    </div>
  );
}
