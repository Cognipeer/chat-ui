import type { Conversation, ExportFormat, Message } from "../types";
import { messageText } from "./helpers";

/**
 * Turning a conversation into a file on this device: Markdown and JSON are built from the loaded
 * messages (a server that can export - `ChatTransport.exportConversation` - is asked first and
 * produces the same formats), and a print view stands in for a PDF the server could not render.
 */

export interface ExportLabels {
  user: string;
  assistant: string;
  system: string;
  tool: string;
  input: string;
  output: string;
  exportedOn: string;
  untitled: string;
}

export interface ExportBuildOptions {
  includeTools: boolean;
  labels: ExportLabels;
  now?: Date;
}

interface ToolDetail {
  id?: string;
  name?: string;
  args?: unknown;
  result?: unknown;
}

const iso = (value: unknown): string | undefined => {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : undefined;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
};

const toolDetails = (message: Message): ToolDetail[] => {
  const details = (message.metadata as Record<string, unknown> | undefined)?.toolCallDetails;
  return Array.isArray(details) ? (details as ToolDetail[]) : [];
};

const roleLabel = (role: Message["role"], labels: ExportLabels): string =>
  role === "user" ? labels.user : role === "assistant" ? labels.assistant : role === "tool" ? labels.tool : labels.system;

const asJson = (value: unknown): string => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return String(value);
  }
};

/** A fence long enough to hold `body` whatever backticks it contains. */
function fence(body: string, info = ""): string {
  const longest = Math.max(2, ...Array.from(body.matchAll(/`+/g), (m) => m[0].length));
  const marks = "`".repeat(longest + 1);
  return `${marks}${info}\n${body}\n${marks}`;
}

/** The conversation as Markdown: a heading, then one section per message. */
export function conversationToMarkdown(
  conversation: Pick<Conversation, "title" | "id"> | null | undefined,
  messages: Message[],
  options: ExportBuildOptions
): string {
  const { labels } = options;
  const lines: string[] = [];
  lines.push(`# ${conversation?.title?.trim() || labels.untitled}`);
  lines.push("");
  lines.push(`_${labels.exportedOn}: ${(options.now ?? new Date()).toISOString()}_`);
  for (const message of messages) {
    if (message.role === "system") continue;
    const body = messageText(message.content).trim();
    const tools = options.includeTools ? toolDetails(message) : [];
    if (!body && tools.length === 0) continue;
    lines.push("");
    lines.push(`## ${roleLabel(message.role, labels)}`);
    const at = iso(message.createdAt);
    if (at) lines.push(`_${at}_`);
    for (const tool of tools) {
      lines.push("");
      lines.push(`**${labels.tool}: ${tool.name ?? "?"}**`);
      if (tool.args !== undefined) {
        lines.push("");
        lines.push(`${labels.input}:`);
        lines.push(fence(asJson(tool.args), "json"));
      }
      if (tool.result !== undefined) {
        lines.push("");
        lines.push(`${labels.output}:`);
        lines.push(fence(asJson(tool.result)));
      }
    }
    if (body) {
      lines.push("");
      lines.push(body);
    }
    const files = (message.files ?? []).map((f) => f.name).filter(Boolean);
    if (files.length > 0) {
      lines.push("");
      lines.push(files.map((name) => `- ${name}`).join("\n"));
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** The conversation as JSON (`schemaVersion` 1). */
export function conversationToJson(
  conversation: Pick<Conversation, "title" | "id" | "agentId" | "createdAt"> | null | undefined,
  messages: Message[],
  options: Pick<ExportBuildOptions, "includeTools" | "now">
): string {
  const doc = {
    schemaVersion: 1,
    exportedAt: (options.now ?? new Date()).toISOString(),
    conversation: conversation
      ? { id: conversation.id, title: conversation.title ?? null, agentId: conversation.agentId, createdAt: iso(conversation.createdAt) ?? null }
      : null,
    messages: messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: messageText(m.content),
        createdAt: iso(m.createdAt) ?? null,
        ...(m.files && m.files.length > 0 ? { files: m.files.map((f) => ({ name: f.name, mimeType: f.mimeType, size: f.size })) } : {}),
        ...(m.citations && m.citations.length > 0 ? { citations: m.citations } : {}),
        ...(options.includeTools && toolDetails(m).length > 0 ? { toolCalls: toolDetails(m) } : {}),
      })),
  };
  return JSON.stringify(doc, null, 2);
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A print-friendly page of the conversation (all text escaped). */
export function conversationToPrintHtml(
  conversation: Pick<Conversation, "title"> | null | undefined,
  messages: Message[],
  options: ExportBuildOptions
): string {
  const { labels } = options;
  const title = conversation?.title?.trim() || labels.untitled;
  const sections = messages
    .filter((m) => m.role !== "system")
    .flatMap((m) => {
      const body = messageText(m.content).trim();
      const tools = options.includeTools ? toolDetails(m) : [];
      if (!body && tools.length === 0) return [];
      const toolHtml = tools
        .map(
          (tool) =>
            `<div class="tool"><strong>${escapeHtml(labels.tool)}: ${escapeHtml(String(tool.name ?? "?"))}</strong>` +
            (tool.args !== undefined ? `<pre>${escapeHtml(asJson(tool.args))}</pre>` : "") +
            (tool.result !== undefined ? `<pre>${escapeHtml(asJson(tool.result))}</pre>` : "") +
            `</div>`
        )
        .join("");
      return [`<section class="${m.role}"><h2>${escapeHtml(roleLabel(m.role, labels))}</h2>${toolHtml}<div class="body">${escapeHtml(body)}</div></section>`];
    });
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>` +
    `body{font:14px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#111}` +
    `h1{font-size:1.4rem}h2{font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:#555;margin:1.4rem 0 .2rem}` +
    `.body{white-space:pre-wrap;word-wrap:break-word}pre{background:#f3f3f3;padding:.6rem;border-radius:.3rem;white-space:pre-wrap;word-wrap:break-word}` +
    `.tool{margin:.4rem 0}section{break-inside:avoid-page}small{color:#777}` +
    `</style></head><body><h1>${escapeHtml(title)}</h1><small>${escapeHtml(labels.exportedOn)}: ${escapeHtml((options.now ?? new Date()).toISOString())}</small>` +
    sections.join("") +
    `</body></html>`
  );
}

/** A file name from a conversation title: letters, digits, dots, dashes; never empty. */
export function exportFilename(title: string | undefined, format: ExportFormat | string, fallback = "conversation"): string {
  const base = (title ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  return `${base || fallback}.${format}`;
}

export const EXPORT_MIME: Record<ExportFormat, string> = {
  md: "text/markdown;charset=utf-8",
  json: "application/json;charset=utf-8",
  pdf: "application/pdf",
};

/** Hands a blob to the browser as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // the download has started by the time the task queue turns over
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Opens the print dialog for an HTML page without leaving this one (a hidden frame; "Save as PDF" is in the dialog). */
export function printHtml(html: string): void {
  if (typeof document === "undefined") return;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  // The page is only read and printed: no script in it (it may come from a server) ever runs.
  // `allow-same-origin` lets this page call print() on it, `allow-modals` lets the print dialog open.
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.srcdoc = html;
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  frame.onload = () => {
    try {
      const win = frame.contentWindow;
      if (!win) return cleanup();
      win.addEventListener("afterprint", cleanup, { once: true });
      win.focus();
      win.print();
    } catch {
      cleanup();
    }
  };
  document.body.appendChild(frame);
}

/** The file name a `Content-Disposition` header proposes, or undefined. */
export function filenameFromDisposition(header: string | null | undefined): string | undefined {
  if (!header) return undefined;
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1]!.trim().replace(/^"|"$/g, ""));
    } catch {
      // fall through to the plain form
    }
  }
  const plain = /filename\s*=\s*("([^"]+)"|[^;]+)/i.exec(header);
  const name = plain ? (plain[2] ?? plain[1])!.trim() : undefined;
  return name ? name.replace(/[\\/]/g, "_") : undefined;
}
