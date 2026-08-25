import { defaultUrlTransform } from "react-markdown";
import type { Citation, CitationMark } from "../types";

/**
 * Placing a citation marker inside an answer.
 *
 * The marker is inserted into the markdown source as a link with a `cite:`
 * scheme rather than by splitting the text and rendering the pieces separately:
 * a split at an arbitrary offset cuts through emphasis, lists and tables, while
 * a link is a construct the parser already understands and cannot corrupt.
 */

const CITE_SCHEME = "cite:";

const isWordChar = (char: string | undefined) => !!char && /[\p{L}\p{N}_]/u.test(char);

/**
 * Offsets come from where a model chose to cite, which is normally after a
 * sentence or a closing mark. Measured over production answers every offset
 * landed on such a boundary, so this only has to reject the cases that would
 * visibly break the render rather than move markers around to fit.
 */
function canInsertAt(text: string, offset: number): boolean {
  if (offset < 0 || offset > text.length) return false;

  const before = text.slice(0, offset);
  if (isWordChar(before.slice(-1)) && isWordChar(text[offset])) return false;

  // An odd count means the offset sits inside the construct, where a link would
  // either be swallowed or would close it early.
  const fences = before.match(/```/g)?.length ?? 0;
  if (fences % 2 === 1) return false;

  const ticks = before.replace(/```/g, "").match(/`/g)?.length ?? 0;
  if (ticks % 2 === 1) return false;

  const emphasis = before.match(/\*\*/g)?.length ?? 0;
  if (emphasis % 2 === 1) return false;

  if (before.lastIndexOf("[") > before.lastIndexOf("]")) return false;

  return true;
}

/**
 * Rewrite the answer with a numbered marker at each cited statement.
 *
 * Numbers are the citation's position in the source list, so the same document
 * cited three times carries the same number in all three places.
 */
export function insertCitationMarkers(
  text: string,
  marks: CitationMark[] | undefined,
  citations: Citation[] | undefined
): string {
  if (!text || !marks?.length || !citations?.length) return text;

  const numberById = new Map<string, number>();
  citations.forEach((citation, index) => {
    if (citation.id) numberById.set(String(citation.id), index + 1);
  });
  if (numberById.size === 0) return text;

  // Back to front: an insertion shifts every offset after it.
  const ordered = [...marks].sort((a, b) => b.offset - a.offset);

  let result = text;
  for (const mark of ordered) {
    const number = numberById.get(String(mark.citationId));
    if (!number || !canInsertAt(result, mark.offset)) continue;
    result =
      result.slice(0, mark.offset) +
      `[${number}](${CITE_SCHEME}${mark.citationId})` +
      result.slice(mark.offset);
  }
  return result;
}

/** The citation id behind a marker link, or null for an ordinary link. */
export function parseCitationHref(href: string | undefined): string | null {
  if (typeof href !== "string" || !href.startsWith(CITE_SCHEME)) return null;
  return href.slice(CITE_SCHEME.length) || null;
}

/**
 * react-markdown sanitises hrefs and blanks out any scheme it does not know,
 * which erased the citation handle before the renderer could read it. Only the
 * citation scheme is added; everything else keeps the default protection.
 */
export function citationUrlTransform(url: string): string {
  return url.startsWith(CITE_SCHEME) ? url : defaultUrlTransform(url);
}

/**
 * Citation links are supplied by whichever backend the host app talks to, and
 * they end up in an `href`, so anything that is not an absolute http(s) URL is
 * dropped instead of rendered.
 */
export function safeExternalHref(link: string | undefined): string | undefined {
  if (typeof link !== "string") return undefined;
  const trimmed = link.trim();
  return /^https?:\/\/\S/i.test(trimmed) ? trimmed : undefined;
}
