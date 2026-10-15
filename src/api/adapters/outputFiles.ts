import type { FileAttachment } from "../../types";
import { buildHeaders, httpFetch, type HttpOptions } from "../http";

/** Blob URLs kept alive at once; the least recently used are released first. */
const MAX_BLOBS = 50;
/** A blob keeps its own type only for raster pictures, so a downloaded HTML or SVG file never runs on the page. */
const SAFE_BLOB_TYPE = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i;

/** Whether the options carry credentials a plain `<a href>` / `<img src>` cannot send. */
export function needsCredentials(http: HttpOptions): boolean {
  return Boolean(http.authorization || (http.headers && Object.keys(http.headers).length > 0) || http.getHeaders || http.fetch);
}

/**
 * A file a Console agent wrote to its sandbox (`output_files` / `files` on a response, a `file` part of an
 * A2A artifact), as a message attachment. `storageKey` holds the absolute address of its bytes when they
 * need the transport's credentials to be fetched (`getFileUrl`); without credentials the file is just a
 * link (`url`), which a cookie session can follow.
 */
export function outputFileAttachment(
  file: { id: string; name: string; mimeType?: string; size?: number; address: string },
  http: HttpOptions
): FileAttachment {
  const base = { id: file.id, name: file.name, mimeType: file.mimeType ?? "application/octet-stream", size: file.size ?? 0 };
  return needsCredentials(http) ? { ...base, storageKey: file.address } : { ...base, url: file.address };
}

/** `download_url` of the Console client API (`/client/v1/agents/sessions/<id>/files/<id>/content`) under the API root. */
export function consoleDownloadAddress(baseUrl: string, downloadUrl: string): string | undefined {
  const m = /\/sessions\/([^/?#]+)\/files\/([^/?#]+)\/content/.exec(downloadUrl);
  if (!m) return /^https?:\/\//i.test(downloadUrl) ? downloadUrl : undefined;
  return `${baseUrl.replace(/\/$/, "")}/agents/sessions/${m[1]}/files/${m[2]}/content`;
}

/** The `output_files` of a Console response / chat completion (and the `files` of its closing stream chunk). */
export function outputFilesFromWire(list: unknown, baseUrl: string, http: HttpOptions): FileAttachment[] {
  if (!Array.isArray(list)) return [];
  const out: FileAttachment[] = [];
  for (const f of list) {
    if (!f || typeof f.id !== "string" || typeof f.name !== "string" || typeof f.download_url !== "string") continue;
    const address = consoleDownloadAddress(baseUrl, f.download_url);
    if (!address) continue;
    out.push(outputFileAttachment({ id: f.id, name: f.name, mimeType: f.mime_type, size: f.size, address }, http));
  }
  return out;
}

/** Fetches stored files with the transport's credentials and hands back blob URLs, cached per address. */
export class AuthedFileUrls {
  private readonly cache = new Map<string, Promise<string>>();

  constructor(private readonly http: HttpOptions) {}

  async get(address: string, disposition: "inline" | "attachment" = "attachment"): Promise<string> {
    const key = `${address}|${disposition}`;
    let pending = this.cache.get(key);
    if (pending) {
      this.cache.delete(key);
      this.cache.set(key, pending);
      return pending;
    }
    pending = (async () => {
      const { "Content-Type": _ct, ...headers } = await buildHeaders(this.http);
      void _ct;
      const joiner = address.includes("?") ? "&" : "?";
      const response = await httpFetch(this.http, `${address}${joiner}disposition=${disposition}`, { method: "GET", headers });
      if (!response.ok) throw new Error(`File request failed (${response.status})`);
      const blob = await response.blob();
      const safe = disposition === "inline" && SAFE_BLOB_TYPE.test(blob.type) ? blob : new Blob([blob], { type: "application/octet-stream" });
      return URL.createObjectURL(safe);
    })();
    this.cache.set(key, pending);
    pending.catch(() => this.cache.delete(key));
    while (this.cache.size > MAX_BLOBS) {
      const oldest = this.cache.keys().next().value as string;
      const evicted = this.cache.get(oldest);
      this.cache.delete(oldest);
      evicted?.then((u) => URL.revokeObjectURL(u)).catch(() => undefined);
    }
    return pending;
  }

  dispose(): void {
    for (const p of this.cache.values()) p.then((u) => URL.revokeObjectURL(u)).catch(() => undefined);
    this.cache.clear();
  }
}
