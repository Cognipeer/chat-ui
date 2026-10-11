import type { FileAttachment, FileConversionStatus, FileStatus, Message } from "../types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const CONVERSION: ReadonlySet<string> = new Set(["pending", "succeeded", "failed", "skipped"]);
const STATUSES: ReadonlySet<string> = new Set(["queued", "uploading", "ready", "failed"]);

/** An ISO string from a date-ish value, or undefined. */
function isoOf(value: unknown): string | undefined {
  if (typeof value === "string" && value) return Number.isFinite(Date.parse(value)) ? value : undefined;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  return undefined;
}

/**
 * A file as the chat shows it, from the record a server returns (`POST /files`, `GET /files/:id`,
 * `GET /conversations/:id/files`). Servers differ in the extras (`expiresAt`, `url`,
 * `conversionStatus` / `conversion.status`); unknown fields are dropped.
 */
export function fileFromRecord(record: unknown): FileAttachment {
  const r = isRecord(record) ? record : {};
  const conversion = isRecord(r.conversion) ? r.conversion.status : undefined;
  const conversionStatus = [r.conversionStatus, conversion].find(
    (value): value is FileConversionStatus => typeof value === "string" && CONVERSION.has(value)
  );
  const status = typeof r.status === "string" && STATUSES.has(r.status) ? (r.status as FileStatus) : undefined;
  const expiresAt = isoOf(r.expiresAt);
  return {
    id: String(r.id ?? ""),
    name: typeof r.name === "string" ? r.name : "file",
    mimeType: typeof r.mimeType === "string" && r.mimeType ? r.mimeType : "application/octet-stream",
    size: typeof r.size === "number" && Number.isFinite(r.size) ? r.size : 0,
    ...(typeof r.url === "string" && r.url ? { url: r.url } : {}),
    ...(typeof r.storageKey === "string" ? { storageKey: r.storageKey } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(conversionStatus ? { conversionStatus } : {}),
    ...(status ? { status } : {}),
  };
}

/** The file's deadline has passed (or the server already said it is gone). */
export function isFileExpired(file: Pick<FileAttachment, "expired" | "expiresAt">, now: number = Date.now()): boolean {
  if (file.expired) return true;
  if (!file.expiresAt) return false;
  const at = Date.parse(file.expiresAt);
  return Number.isFinite(at) && at <= now;
}

/**
 * Messages freshly loaded from the server, with what the conversation's file list says about
 * the files they carry: the deadline and the conversion status of each, and `expired` for a file
 * the list no longer holds (deleted, or past retention). Only a complete list can say a file is
 * gone, so pass `complete: false` for a page of a longer one.
 */
export function applyFileList(messages: Message[], listed: FileAttachment[], complete: boolean): Message[] {
  const byId = new Map(listed.map((file) => [file.id, file]));
  return messages.map((message) => {
    if (!message.files || message.files.length === 0) return message;
    let changed = false;
    const files = message.files.map((file) => {
      const held = byId.get(file.id);
      if (!held) {
        if (!complete || file.expired) return file;
        changed = true;
        return { ...file, expired: true };
      }
      const next: FileAttachment = { ...file };
      if (held.expiresAt && !file.expiresAt) next.expiresAt = held.expiresAt;
      if (held.conversionStatus && !file.conversionStatus) next.conversionStatus = held.conversionStatus;
      if (held.url && !file.url) next.url = held.url;
      if (next.expiresAt === file.expiresAt && next.conversionStatus === file.conversionStatus && next.url === file.url) return file;
      changed = true;
      return next;
    });
    return changed ? { ...message, files } : message;
  });
}

/** Distinct files carried by the loaded messages (what a conversation holds when the server cannot say). */
export function countMessageFiles(messages: Message[]): number {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const file of message.files ?? []) if (!file.expired) ids.add(file.id);
  }
  return ids.size;
}

/** What `Content-Type` a file goes up with: its own, else the neutral type (the server guesses from the name). */
export function uploadMimeType(file: Pick<File, "type">): string {
  return file.type || "application/octet-stream";
}

/**
 * Whether a file's type is on the allowed list (`image/*` matches by prefix; `.pdf`
 * and `application/pdf` match as before). A file the browser could not give a type is judged by
 * its name against the extension entries; when the list also names media types it is let through,
 * because those cannot be compared: the server knows the extension rules and answers with its own refusal.
 */
export function isFileTypeAllowed(file: Pick<File, "type" | "name">, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  const byName = (entry: string) => file.name.endsWith(entry.replace("*", ""));
  if (!file.type) return allowed.some((entry) => entry.includes("/")) || allowed.some(byName);
  return allowed.some((entry) =>
    entry.endsWith("/*") ? file.type.startsWith(entry.slice(0, -1)) : file.type === entry || byName(entry)
  );
}
