import type { ContentPart } from "../types";

const RASTER_DATA_URL = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;
const RASTER_MIME = /^image\/(png|jpe?g|gif|webp)$/i;

/** True for `image/*` media types. */
export function isImageType(mimeType: string | undefined): boolean {
  return typeof mimeType === "string" && mimeType.toLowerCase().startsWith("image/");
}

/**
 * True for the picture types a browser shows without running anything: PNG, JPEG, GIF and WebP.
 * SVG and the like are images too (`isImageType`) but can carry script, so they are never shown
 * inline or linked from a local object URL.
 */
export function isRasterImageType(mimeType: string | undefined): boolean {
  return typeof mimeType === "string" && RASTER_MIME.test(mimeType.split(";")[0]!.trim());
}

/**
 * A URL that is safe to put in an `<img src>`, or undefined. Allowed: `https:`, `blob:`,
 * relative / same-origin URLs, `http:` when the page itself is served over http (local
 * development), and base64 `data:` URLs of PNG / JPEG / GIF / WebP. Everything else is
 * dropped: `javascript:`, SVG data URLs, other schemes, and plain-http images from
 * another origin on an https page.
 */
export function safeImageSrc(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  const value = url.trim();
  if (!value) return undefined;
  if (/^data:/i.test(value)) return RASTER_DATA_URL.test(value) ? value : undefined;
  if (/^blob:/i.test(value)) return value;

  const page = typeof window !== "undefined" ? window.location : undefined;
  let parsed: URL;
  try {
    parsed = new URL(value, page?.href ?? "https://localhost/");
  } catch {
    return undefined;
  }
  if (parsed.protocol === "https:") return value;
  if (parsed.protocol === "http:") {
    return page && (page.protocol === "http:" || parsed.origin === page.origin) ? value : undefined;
  }
  return undefined;
}

/**
 * A link target for a file download: http(s), `blob:` or relative; never `javascript:` and the like.
 * The check is made on what the browser's URL parser will see: it drops tabs and line breaks anywhere
 * in the string and control characters or spaces at its start, so `java\nscript:` is a script URL.
 * The result is the parsed address, not the raw string.
 */
export function safeFileHref(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const value = url.replace(/[\t\n\r]/g, "").replace(/^[\u0000-\u0020]+/, "").replace(/[\u0000-\u0020]+$/, "");
  if (!value) return undefined;

  const page = typeof window !== "undefined" ? window.location : undefined;
  let parsed: URL;
  try {
    parsed = new URL(value, page?.href ?? "https://localhost/");
  } catch {
    return undefined;
  }
  // No scheme of its own: a relative link, which can only land on the page's own scheme
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "blob:" ? parsed.href : undefined;
}

/** The image a content part shows, or undefined for any other kind of part (or an unsafe URL). */
export function imagePartSource(part: ContentPart): { src: string } | undefined {
  const p = part as Record<string, unknown>;
  let candidate: unknown;
  if (p.type === "image_url" || p.type === "input_image") {
    const image = p.image_url;
    candidate = typeof image === "string" ? image : (image as { url?: unknown } | undefined)?.url;
  } else if (p.type === "image") {
    const source = p.source as { type?: string; url?: unknown; media_type?: unknown; data?: unknown } | undefined;
    if (source?.type === "url") candidate = source.url;
    else if (source?.type === "base64" && typeof source.media_type === "string" && RASTER_MIME.test(source.media_type) && typeof source.data === "string") {
      candidate = `data:${source.media_type};base64,${source.data}`;
    }
  } else {
    return undefined;
  }
  const src = safeImageSrc(candidate);
  return src ? { src } : undefined;
}

/** Whether a content part is an image of any kind (shown or not). */
export function isImagePart(part: ContentPart): boolean {
  return part.type === "image_url" || part.type === "input_image" || part.type === "image";
}
