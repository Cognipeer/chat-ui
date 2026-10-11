import type { BulkDeleteResult } from "./transport";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

type Failure = BulkDeleteResult["failed"][number];

const failure = (id: string, code?: unknown, message?: unknown): Failure => ({
  id,
  ...(typeof code === "string" && code ? { code } : {}),
  ...(typeof message === "string" && message ? { message } : {}),
});

/**
 * Reads the answer of `POST /conversations/bulk-delete` for the ids that were asked for.
 *
 * - agent-server: `{ results: [{ id, status: "deleted" | "not_found" | "busy" | "error", message? }], deleted: <count> }`.
 *   Each id is judged by its own status; the count is only a total and is not used to guess.
 * - Older shape: `{ deleted: string[], failed: (string | { id, code? })[] }`. A server that lists what it
 *   deleted is believed, one that lists only the failures (or nothing at all) deleted the rest.
 * - `{ deleted: <count> }` without per-id data: all of them when the count is all, none otherwise (a
 *   partial count says nothing about which ones, and a conversation still in the list is better than one
 *   that is dropped while it may still exist).
 *
 * An id the answer does not account for counts as not deleted, except when the answer lists nothing.
 */
export function readBulkDelete(body: unknown, requested: string[]): BulkDeleteResult {
  const asked = new Set(requested);
  const record = isRecord(body) ? body : {};
  const result: BulkDeleteResult = { deleted: [], failed: [] };
  const settled = new Set<string>();
  const settle = (id: string, ok: boolean, f?: Failure) => {
    if (!asked.has(id) || settled.has(id)) return;
    settled.add(id);
    if (ok) result.deleted.push(id);
    else result.failed.push(f ?? { id });
  };

  if (Array.isArray(record.results)) {
    for (const entry of record.results) {
      if (!isRecord(entry) || typeof entry.id !== "string") continue;
      const status = typeof entry.status === "string" ? entry.status : undefined;
      if (status === "deleted") settle(entry.id, true);
      else settle(entry.id, false, failure(entry.id, status ?? "error", entry.message));
    }
    for (const id of requested) settle(id, false);
    return result;
  }

  const failed: Failure[] = Array.isArray(record.failed)
    ? record.failed.flatMap((entry): Failure[] => {
        if (typeof entry === "string") return [failure(entry)];
        return isRecord(entry) && typeof entry.id === "string" ? [failure(entry.id, entry.code, entry.message)] : [];
      })
    : [];

  if (Array.isArray(record.deleted)) {
    for (const id of record.deleted) if (typeof id === "string") settle(id, true);
    for (const f of failed) settle(f.id, false, f);
    for (const id of requested) settle(id, false);
    return result;
  }

  if (typeof record.deleted === "number" && failed.length === 0) {
    const all = record.deleted >= requested.length;
    for (const id of requested) settle(id, all);
    return result;
  }

  // Only failures listed, or nothing: what is not named failed is gone
  for (const f of failed) settle(f.id, false, f);
  for (const id of requested) settle(id, true);
  return result;
}
