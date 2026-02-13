import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Type definition for i18n function
type I18nFunction = (key: string, values?: Record<string, string | number>) => string;

// Global i18n function reference (set by I18nProvider)
let globalI18n: I18nFunction | null = null;

export function setGlobalI18n(i18n: I18nFunction) {
  globalI18n = i18n;
}

function getI18n(): I18nFunction {
  if (!globalI18n) {
    // Fallback: return key as-is if i18n not initialized
    return (key: string) => key;
  }
  return globalI18n;
}

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format file size to human readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Format date to relative time string
 */
export function formatRelativeTime(date: Date): string {
  const t = getI18n();
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t("chat.time.justNow");
  if (diffMins < 60) return t("chat.time.minutesAgo", { minutes: diffMins });
  if (diffHours < 24) return t("chat.time.hoursAgo", { hours: diffHours });
  if (diffDays < 7) return t("chat.time.daysAgo", { days: diffDays });

  return date.toLocaleDateString();
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  return filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2).toLowerCase();
}

/**
 * Check if file type is an image
 */
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Parse SSE event data
 */
export function parseSSEEvent(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Extract text content from message content
 */
export function getMessageTextContent(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") {
    return content;
  }
  
  return content
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("");
}
