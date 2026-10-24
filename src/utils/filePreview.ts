import type { FileAttachment } from "../types";
import { safeFileHref } from "./images";

/** How the preview draws a file. */
export type FilePreviewKind =
  | "image"
  | "svg"
  | "pdf"
  | "docx"
  | "spreadsheet"
  | "csv"
  | "markdown"
  | "html"
  | "json"
  | "text"
  | "audio"
  | "video";

const TEXT_EXTENSIONS = [
  "txt", "log", "text", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", "properties", "env",
  "sh", "bash", "zsh", "ps1", "bat", "py", "js", "mjs", "cjs", "ts", "tsx", "jsx", "java", "kt", "go",
  "rs", "rb", "php", "c", "h", "cpp", "hpp", "cs", "swift", "scala", "lua", "pl", "r", "dart", "sql",
  "css", "scss", "less", "vue", "svelte", "graphql", "proto", "tex", "rst", "srt", "vtt", "diff", "patch",
];

const BY_EXTENSION: Record<string, FilePreviewKind> = {
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", avif: "image", bmp: "image",
  svg: "svg",
  pdf: "pdf",
  docx: "docx",
  xlsx: "spreadsheet", xlsm: "spreadsheet",
  csv: "csv", tsv: "csv",
  md: "markdown", markdown: "markdown",
  html: "html", htm: "html",
  json: "json", geojson: "json",
  mp3: "audio", wav: "audio", m4a: "audio", aac: "audio", oga: "audio", ogg: "audio", opus: "audio", flac: "audio",
  mp4: "video", m4v: "video", webm: "video", mov: "video", ogv: "video",
  ...Object.fromEntries(TEXT_EXTENSIONS.map((ext) => [ext, "text" as const])),
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = /^application\/vnd\.(openxmlformats-officedocument\.spreadsheetml\.sheet|ms-excel\.sheet\.macroenabled\.12)$/;

/** The extension of a file name, lower case and without the dot ("" when it has none). */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : "";
}

function kindOfMime(mimeType: string): FilePreviewKind | undefined {
  const type = mimeType.split(";")[0]!.trim().toLowerCase();
  if (/^image\/(png|jpe?g|gif|webp|avif|bmp)$/.test(type)) return "image";
  if (type === "image/svg+xml") return "svg";
  if (type === "application/pdf") return "pdf";
  if (type === DOCX_MIME) return "docx";
  if (XLSX_MIME.test(type)) return "spreadsheet";
  if (type === "text/csv" || type === "text/tab-separated-values") return "csv";
  if (type === "text/markdown" || type === "text/x-markdown") return "markdown";
  if (type === "text/html" || type === "application/xhtml+xml") return "html";
  if (type === "application/json" || type.endsWith("+json")) return "json";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("text/") || type.endsWith("+xml") || type === "application/xml" || type === "application/yaml" || type === "application/x-yaml" || type === "application/javascript" || type === "application/sql") {
    return "text";
  }
  return undefined;
}

/**
 * How a file can be previewed, or undefined when it cannot. The extension decides first: the files an agent
 * writes often come as `application/octet-stream`.
 */
export function filePreviewKind(file: Pick<FileAttachment, "name" | "mimeType">): FilePreviewKind | undefined {
  return BY_EXTENSION[fileExtension(file.name)] ?? kindOfMime(file.mimeType ?? "");
}

const MB = 1024 * 1024;

/** The largest file of each kind the preview loads into the page. */
export const PREVIEW_MAX_BYTES: Record<FilePreviewKind, number> = {
  image: 25 * MB,
  svg: 2 * MB,
  pdf: 40 * MB,
  docx: 15 * MB,
  spreadsheet: 15 * MB,
  csv: 10 * MB,
  markdown: 5 * MB,
  html: 5 * MB,
  json: 10 * MB,
  text: 5 * MB,
  audio: 50 * MB,
  video: 50 * MB,
};

/** Characters of text drawn at most; the rest is left out (with a note). */
export const PREVIEW_MAX_CHARS = 300_000;

/** Turns a stored file into a URL the browser can use (see `ChatTransport.getFileUrl`). */
export type FileUrlResolver = (
  file: FileAttachment,
  options?: { disposition?: "inline" | "attachment" }
) => Promise<string | undefined>;

/**
 * The bytes of a file: the copy still on this device, the file's own link, or the address the transport
 * resolves (with its credentials). Throws when none can be read.
 */
export async function loadFileBlob(file: FileAttachment, resolve: FileUrlResolver | undefined, signal?: AbortSignal): Promise<Blob> {
  const local = file.previewUrl && /^blob:/i.test(file.previewUrl) ? file.previewUrl : undefined;
  const url = local ?? safeFileHref(file.url) ?? (resolve ? await resolve(file, { disposition: "attachment" }) : undefined);
  if (!url) throw new Error("The file has no address");
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`File request failed (${response.status})`);
  return response.blob();
}

/**
 * Saves a file the way the chip's Download does: from the address the transport resolves (or the file's own),
 * so a large file streams to disk instead of through the page. Resolves `false` when there was none.
 */
export async function saveFile(file: FileAttachment, resolve: FileUrlResolver | undefined): Promise<boolean> {
  const url = safeFileHref(file.url) ?? (resolve ? await resolve(file, { disposition: "attachment" }) : undefined);
  if (!url || typeof document === "undefined") return false;
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

/** The bytes of a blob (`FileReader` where a browser's `Blob` has no `arrayBuffer`). */
export function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** UTF-8 text of a blob, without a byte order mark. */
export async function blobText(blob: Blob): Promise<string> {
  return new TextDecoder("utf-8").decode(await blobBytes(blob)).replace(/^\uFEFF/, "");
}

/** A rectangle of cell texts; the first row is the header. */
export interface SheetPreview {
  name: string;
  rows: string[][];
  /** Rows the sheet holds (before the cap) */
  totalRows: number;
}

export const SHEET_MAX_ROWS = 500;
export const SHEET_MAX_COLUMNS = 50;

const capRows = (rows: string[][]): string[][] =>
  rows.slice(0, SHEET_MAX_ROWS).map((row) => row.slice(0, SHEET_MAX_COLUMNS));

/** The delimiter of a CSV: tab for `.tsv`, else whichever of `,` `;` tab is most common outside quotes in the first line. */
function csvDelimiter(text: string, tsv: boolean): string {
  if (tsv) return "\t";
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const char of text.slice(0, 4096)) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === "\n") break;
    else if (!quoted && char in counts) counts[char]!++;
  }
  const [best, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]!;
  return count > 0 ? best : ",";
}

/** Rows of a CSV / TSV text (quoted fields, doubled quotes and line breaks inside quotes are understood). */
export function parseCsv(text: string, options: { tsv?: boolean } = {}): SheetPreview {
  const delimiter = csvDelimiter(text, options.tsv ?? false);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return { name: "", rows: capRows(rows), totalRows: rows.length };
}

/** Column index of a cell reference ("C7" → 2). */
function columnIndex(ref: string): number {
  let index = 0;
  for (const char of ref) {
    const code = char.toUpperCase().charCodeAt(0);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

/** Built-in number formats that show a date or time. */
const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
const PERCENT_FORMAT_IDS = new Set([9, 10]);

/** A custom number format without its quoted text, escapes and [colour] blocks. */
const bareFormat = (code: string) => code.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, "");

/** Whether a custom number format shows a date. */
function isDateFormatCode(code: string): boolean {
  const bare = bareFormat(code);
  return /[dmyhs]/i.test(bare) && !/^general$/i.test(bare.trim());
}

/** An Excel serial day as `YYYY-MM-DD` (with `HH:MM` when it has a time). */
function serialToDate(serial: number, date1904: boolean): string {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.round(serial * 86_400_000));
  if (Number.isNaN(date.getTime())) return String(serial);
  const iso = date.toISOString();
  return serial % 1 === 0 ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

const RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const xml = (text: string) => new DOMParser().parseFromString(text, "application/xml");
/** Elements by local name, whatever prefix the writer gave the SpreadsheetML namespace. */
const all = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS("*", name));
const textOf = (element: Element) =>
  all(element, "t")
    // phonetic guides (`rPh`) are not part of the cell text
    .filter((t) => t.parentElement?.localName !== "rPh")
    .map((t) => t.textContent ?? "")
    .join("");

/** The sheets of an `.xlsx` workbook as cell texts (the cached results of formulas; dates as `YYYY-MM-DD`). */
export async function parseXlsx(data: ArrayBuffer, maxSheets = 10): Promise<SheetPreview[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);
  const read = async (path: string) => {
    const entry = zip.file(path);
    return entry ? xml(await entry.async("string")) : undefined;
  };

  const workbook = await read("xl/workbook.xml");
  if (!workbook) throw new Error("Not a workbook");
  const date1904 = ["1", "true"].includes(all(workbook, "workbookPr")[0]?.getAttribute("date1904") ?? "");
  const rels = await read("xl/_rels/workbook.xml.rels");
  const targets = new Map(
    (rels ? all(rels, "Relationship") : []).map((r) => [r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? ""])
  );
  const sharedDoc = await read("xl/sharedStrings.xml");
  const shared = sharedDoc ? all(sharedDoc, "si").map(textOf) : [];

  // What each cell style shows its number as
  const styles = await read("xl/styles.xml");
  const customFormats = new Map(
    (styles ? all(styles, "numFmt") : []).map((f) => [Number(f.getAttribute("numFmtId")), f.getAttribute("formatCode") ?? ""])
  );
  const cellXfs = styles ? all(styles, "cellXfs")[0] : undefined;
  const cellFormats = (cellXfs ? all(cellXfs, "xf") : []).map((xf) => {
    const id = Number(xf.getAttribute("numFmtId") ?? 0);
    const custom = customFormats.get(id);
    if (DATE_FORMAT_IDS.has(id) || (custom !== undefined && isDateFormatCode(custom))) return "date";
    return PERCENT_FORMAT_IDS.has(id) || (custom !== undefined && bareFormat(custom).includes("%")) ? "percent" : "number";
  });

  const cellText = (cell: Element): string => {
    const type = cell.getAttribute("t");
    const value = all(cell, "v")[0]?.textContent ?? "";
    if (type === "s") return shared[Number(value)] ?? "";
    if (type === "inlineStr") {
      const inline = all(cell, "is")[0];
      return inline ? textOf(inline) : "";
    }
    if (type === "b") return value === "1" ? "TRUE" : "FALSE";
    const number = Number(value);
    if (type === "str" || type === "e" || value === "" || !Number.isFinite(number)) return value;
    const format = cellFormats[Number(cell.getAttribute("s") ?? 0)];
    if (format === "date") return serialToDate(number, date1904);
    if (format === "percent") return `${+(number * 100).toFixed(4)}%`;
    return value;
  };

  const sheets: SheetPreview[] = [];
  for (const sheet of all(workbook, "sheet").slice(0, maxSheets)) {
    const target = targets.get(sheet.getAttributeNS(RELATIONSHIPS_NS, "id") ?? sheet.getAttribute("r:id") ?? "");
    if (!target) continue;
    const doc = await read(target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
    if (!doc) continue;
    const rowElements = all(doc, "row");
    const rows: string[][] = [];
    for (const rowElement of rowElements) {
      // rows are numbered from 1 and may skip empty ones
      const at = Number(rowElement.getAttribute("r") ?? rows.length + 1) - 1;
      if (at >= SHEET_MAX_ROWS) break;
      while (rows.length < at) rows.push([]);
      const row: string[] = [];
      let next = 0;
      for (const cell of all(rowElement, "c")) {
        const ref = cell.getAttribute("r");
        const column = ref ? columnIndex(ref) : next;
        next = column + 1;
        if (column >= SHEET_MAX_COLUMNS) continue;
        while (row.length < column) row.push("");
        row[column] = cellText(cell);
      }
      rows.push(row);
    }
    const last = rowElements[rowElements.length - 1];
    sheets.push({
      name: sheet.getAttribute("name") ?? `Sheet ${sheets.length + 1}`,
      rows: capRows(rows),
      totalRows: Math.max(rows.length, Number(last?.getAttribute("r") ?? rowElements.length) || 0),
    });
  }
  return sheets;
}
