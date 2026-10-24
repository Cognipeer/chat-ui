import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { PhrasingContent, Root, RootContent, Table } from "mdast";

/**
 * A Markdown file as a PDF or a Word document, made in the browser: the text is read into a small block
 * model (headings, paragraphs, lists, tables, code, quotes) and each writer lays that out. The writers
 * (`docx`, `pdfmake`) are loaded only when a file is exported. Pictures become their alt text: a file
 * shown here has no address its relative images could be read from.
 */

export type MarkdownExportFormat = "pdf" | "docx";

/** A piece of text with one set of marks; `"\n"` alone is a line break. */
export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: string;
}

export type Block =
  | { type: "heading"; level: number; runs: Run[] }
  | { type: "paragraph"; runs: Run[] }
  | { type: "code"; text: string }
  | { type: "quote"; blocks: Block[] }
  | { type: "list"; ordered: boolean; start: number; items: Array<{ checked?: boolean; blocks: Block[] }> }
  | { type: "table"; align: Array<"left" | "right" | "center" | null>; rows: Run[][][] }
  | { type: "rule" };

type Marks = Omit<Run, "text">;

/** Only links a reader can follow safely end up in the file. */
function safeLink(url: string): string | undefined {
  return /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : undefined;
}

/** The text of raw HTML in the Markdown, tags taken out until none is left (`<b<b>>` leaves none either). */
function htmlText(html: string): string {
  let text = html.replace(/<br\s*\/?>/gi, "\n");
  for (let previous = ""; previous !== text; ) {
    previous = text;
    text = text.replace(/<[^>]*>/g, "");
  }
  return text;
}

function runsOf(nodes: PhrasingContent[], marks: Marks = {}): Run[] {
  const out: Run[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        if (node.value) out.push({ ...marks, text: node.value.replace(/\n/g, " ") });
        break;
      case "strong":
        out.push(...runsOf(node.children, { ...marks, bold: true }));
        break;
      case "emphasis":
        out.push(...runsOf(node.children, { ...marks, italic: true }));
        break;
      case "delete":
        out.push(...runsOf(node.children, { ...marks, strike: true }));
        break;
      case "inlineCode":
        out.push({ ...marks, code: true, text: node.value });
        break;
      case "link": {
        const link = safeLink(node.url);
        out.push(...runsOf(node.children, link ? { ...marks, link } : marks));
        break;
      }
      case "linkReference":
        out.push(...runsOf(node.children, marks));
        break;
      case "image":
      case "imageReference":
        if (node.alt) out.push({ ...marks, italic: true, text: `[${node.alt}]` });
        break;
      case "break":
        out.push({ text: "\n" });
        break;
      case "html": {
        const text = htmlText(node.value);
        if (text) out.push({ ...marks, text });
        break;
      }
      case "footnoteReference":
        out.push({ ...marks, text: `[${node.label ?? node.identifier}]` });
        break;
    }
  }
  return out;
}

function blocksOf(nodes: RootContent[]): Block[] {
  const out: Block[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "heading":
        out.push({ type: "heading", level: node.depth, runs: runsOf(node.children) });
        break;
      case "paragraph":
        out.push({ type: "paragraph", runs: runsOf(node.children) });
        break;
      case "code":
        out.push({ type: "code", text: node.value });
        break;
      case "blockquote":
        out.push({ type: "quote", blocks: blocksOf(node.children) });
        break;
      case "list":
        out.push({
          type: "list",
          ordered: Boolean(node.ordered),
          start: node.start ?? 1,
          items: node.children.map((item) => ({
            ...(typeof item.checked === "boolean" ? { checked: item.checked } : {}),
            blocks: blocksOf(item.children),
          })),
        });
        break;
      case "table":
        out.push(tableOf(node));
        break;
      case "thematicBreak":
        out.push({ type: "rule" });
        break;
      case "html": {
        const text = htmlText(node.value).trim();
        if (text) out.push({ type: "paragraph", runs: [{ text }] });
        break;
      }
      case "footnoteDefinition":
        out.push(...blocksOf(node.children).map((block, i) =>
          i === 0 && block.type === "paragraph" ? { ...block, runs: [{ text: `[${node.label ?? node.identifier}] ` }, ...block.runs] } : block
        ));
        break;
    }
  }
  return out;
}

function tableOf(node: Table): Block {
  const rows = node.children.map((row) => row.children.map((cell) => runsOf(cell.children)));
  const width = Math.max(1, ...rows.map((row) => row.length));
  return {
    type: "table",
    align: Array.from({ length: width }, (_, i) => node.align?.[i] ?? null),
    rows: rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => [] as Run[])]),
  };
}

/** The blocks of a Markdown text (GitHub flavour: tables, task lists, strikethrough, autolinks). */
export function markdownBlocks(markdown: string): Block[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  return blocksOf(tree.children);
}

/** `report.md` → `report.pdf` / `report.docx`. */
export function markdownExportName(name: string, format: MarkdownExportFormat): string {
  const base = name.replace(/\.(md|markdown)$/i, "") || "document";
  return `${base}.${format}`;
}

/** The Markdown text as a `.pdf` or `.docx` file. */
export async function exportMarkdown(markdown: string, format: MarkdownExportFormat, title: string): Promise<Blob> {
  const blocks = markdownBlocks(markdown);
  return format === "pdf" ? markdownPdf(blocks, title) : markdownDocx(blocks, title);
}

// ---------------------------------------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------------------------------------

const MONO = "Consolas";
const MUTED = "475569";
const RULE = "CBD5E1";
const CODE_FILL = "F1F5F9";
const QUOTE_STYLE = "MarkdownQuote";

async function markdownDocx(blocks: Block[], title: string): Promise<Blob> {
  const docx = await import("docx");
  const { AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, LevelFormat, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } = docx;
  type Child = InstanceType<typeof Paragraph> | InstanceType<typeof Table>;
  type Inline = InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>;

  const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
  const ALIGN = { left: AlignmentType.LEFT, right: AlignmentType.RIGHT, center: AlignmentType.CENTER } as const;
  const codeShading = { type: ShadingType.CLEAR, color: "auto", fill: CODE_FILL };

  const inline = (runs: Run[], extra: { bold?: boolean } = {}): Inline[] =>
    runs.map((run) => {
      if (run.text === "\n") return new TextRun({ text: "", break: 1 });
      const text = new TextRun({
        text: run.text,
        bold: run.bold || extra.bold,
        italics: run.italic,
        strike: run.strike,
        ...(run.code ? { font: MONO, shading: codeShading } : {}),
        ...(run.link ? { style: "Hyperlink" } : {}),
      });
      return run.link ? new ExternalHyperlink({ link: run.link, children: [text] }) : text;
    });

  // Every ordered list counts from its own start: one numbering per list
  const numberings: Array<{ reference: string; start: number }> = [];
  const listNumbering = (start: number) => {
    const reference = `ol-${numberings.length + 1}`;
    numberings.push({ reference, start });
    return reference;
  };

  const render = (list: Block[], depth = { quote: 0, list: -1 }): Child[] => {
    const out: Child[] = [];
    const indent = depth.quote * 400 + (depth.list + 1) * 720;
    const quoteBorder = depth.quote > 0 ? { border: { left: { style: BorderStyle.SINGLE, size: 12, color: RULE, space: 10 } } } : {};
    for (const block of list) {
      switch (block.type) {
        case "heading":
          out.push(new Paragraph({ heading: HEADINGS[Math.min(block.level, 6) - 1], children: inline(block.runs) }));
          break;
        case "paragraph":
          out.push(
            new Paragraph({
              children: inline(block.runs),
              spacing: { after: 120 },
              ...(indent ? { indent: { left: indent } } : {}),
              ...(depth.quote > 0 ? { style: QUOTE_STYLE, ...quoteBorder } : {}),
            })
          );
          break;
        case "code": {
          const lines = block.text.split("\n");
          lines.forEach((line, i) =>
            out.push(
              new Paragraph({
                children: [new TextRun({ text: line || " ", font: MONO, size: 19 })],
                shading: codeShading,
                spacing: { before: 0, after: i === lines.length - 1 ? 160 : 0 },
                ...(indent ? { indent: { left: indent } } : {}),
              })
            )
          );
          break;
        }
        case "quote":
          out.push(...render(block.blocks, { ...depth, quote: depth.quote + 1 }));
          break;
        case "list": {
          const level = Math.min(depth.list + 1, 8);
          const reference = block.ordered ? listNumbering(block.start) : undefined;
          for (const item of block.items) {
            const box = item.checked === undefined ? [] : [new TextRun({ text: item.checked ? "☑ " : "☐ " })];
            item.blocks.forEach((child, i) => {
              if (i === 0 && child.type === "paragraph") {
                out.push(
                  new Paragraph({
                    children: [...box, ...inline(child.runs)],
                    spacing: { after: 60 },
                    ...(reference ? { numbering: { reference, level } } : { bullet: { level } }),
                  })
                );
              } else {
                out.push(...render([child], { ...depth, list: level }));
              }
            });
          }
          break;
        }
        case "table": {
          const border = { style: BorderStyle.SINGLE, size: 4, color: RULE };
          out.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
              rows: block.rows.map(
                (cells, r) =>
                  new TableRow({
                    tableHeader: r === 0,
                    children: cells.map(
                      (runs, c) =>
                        new TableCell({
                          children: [new Paragraph({ children: inline(runs, { bold: r === 0 }), ...(block.align[c] ? { alignment: ALIGN[block.align[c]!] } : {}) })],
                          margins: { top: 60, bottom: 60, left: 100, right: 100 },
                          ...(r === 0 ? { shading: { type: ShadingType.CLEAR, color: "auto", fill: CODE_FILL } } : {}),
                        })
                    ),
                  })
              ),
            })
          );
          out.push(new Paragraph({ children: [], spacing: { after: 120 } }));
          break;
        }
        case "rule":
          out.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 1 } }, spacing: { after: 200 } }));
          break;
      }
    }
    return out;
  };

  const children = render(blocks);
  const document = new Document({
    title,
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
      paragraphStyles: [{ id: QUOTE_STYLE, name: "Markdown Quote", basedOn: "Normal", run: { color: MUTED, italics: true } }],
    },
    numbering: {
      config: numberings.map(({ reference, start }) => ({
        reference,
        levels: Array.from({ length: 9 }, (_, level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          start: level === 0 ? start : 1,
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
        })),
      })),
    },
    sections: [{ children: children.length ? children : [new Paragraph({ children: [] })] }],
  });
  return Packer.toBlob(document);
}

// ---------------------------------------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------------------------------------

/** The part of pdfmake's document definition used here. */
type PdfNode = Record<string, unknown> | string;
interface PdfMake {
  addVirtualFileSystem(vfs: Record<string, string>): void;
  createPdf(definition: Record<string, unknown>): { getBlob(): Promise<Blob> };
}

let pdfMakeReady: Promise<PdfMake> | undefined;

/** pdfmake with its Roboto fonts (Latin, including Turkish, Greek and Cyrillic), loaded once. */
function loadPdfMake(): Promise<PdfMake> {
  pdfMakeReady ??= (async () => {
    const [made, fonts] = await Promise.all([import("pdfmake/build/pdfmake.js"), import("pdfmake/build/vfs_fonts.js")]);
    const pdfMake = ((made as { default?: PdfMake }).default ?? made) as PdfMake;
    pdfMake.addVirtualFileSystem(((fonts as { default?: Record<string, string> }).default ?? fonts) as Record<string, string>);
    return pdfMake;
  })();
  pdfMakeReady.catch(() => (pdfMakeReady = undefined));
  return pdfMakeReady;
}

/** A4 width less the side margins, in points. */
const PDF_WIDTH = 595.28 - 2 * 50;

async function markdownPdf(blocks: Block[], title: string): Promise<Blob> {
  const pdfMake = await loadPdfMake();

  const inline = (runs: Run[]): PdfNode[] =>
    runs.map((run) =>
      run.text === "\n"
        ? "\n"
        : {
            text: run.text,
            ...(run.bold ? { bold: true } : {}),
            ...(run.italic ? { italics: true } : {}),
            ...(run.strike ? { decoration: "lineThrough" } : {}),
            ...(run.code ? { background: "#eef2f6", fontSize: 9.5 } : {}),
            ...(run.link ? { link: run.link, color: "#1d4ed8", decoration: "underline" } : {}),
          }
    );
  const text = (runs: Run[]) => (runs.length ? inline(runs) : " ");
  const box = (stack: PdfNode[], layout: Record<string, unknown>, margin: number[], cell: Record<string, unknown> = {}) => ({
    table: { widths: ["*"], body: [[{ stack, ...cell }]] },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, ...layout },
    margin,
  });

  const render = (list: Block[]): PdfNode[] =>
    list.map((block): PdfNode => {
      switch (block.type) {
        case "heading":
          return { text: text(block.runs), style: `h${Math.min(block.level, 6)}` };
        case "paragraph":
          return { text: text(block.runs), margin: [0, 0, 0, 8] };
        case "code":
          return box(
            [{ text: block.text || " ", fontSize: 9, preserveLeadingSpaces: true, color: "#1f2937" }],
            { fillColor: () => "#f3f4f6", paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 },
            [0, 0, 0, 10]
          );
        case "quote":
          return box(
            render(block.blocks),
            { vLineWidth: (i: number) => (i === 0 ? 2 : 0), vLineColor: () => "#cbd5e1", paddingLeft: () => 10 },
            [0, 0, 0, 8],
            { color: "#475569", italics: true }
          );
        case "list": {
          const items = block.items.map((item) => {
            const inner = render(item.blocks);
            if (item.checked !== undefined && inner[0] && typeof inner[0] === "object" && "text" in inner[0]) {
              inner[0] = { ...inner[0], text: [item.checked ? "[x] " : "[ ] ", ...(Array.isArray(inner[0].text) ? inner[0].text : [inner[0].text])] };
            }
            // a list item's last paragraph keeps no space of its own under it
            return { stack: inner.map((node, i) => (i === inner.length - 1 && typeof node === "object" && !("table" in node) ? { ...node, margin: [0, 0, 0, 3] } : node)) };
          });
          return block.ordered ? { ol: items, start: block.start, margin: [0, 0, 0, 8] } : { ul: items, margin: [0, 0, 0, 8] };
        }
        case "table":
          return {
            table: {
              headerRows: 1,
              widths: block.align.map(() => "*"),
              body: block.rows.map((cells, r) =>
                cells.map((runs, c) => ({
                  text: text(runs),
                  ...(r === 0 ? { bold: true, fillColor: "#f1f5f9" } : {}),
                  ...(block.align[c] ? { alignment: block.align[c] } : {}),
                }))
              ),
            },
            layout: {
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              hLineColor: () => "#cbd5e1",
              vLineColor: () => "#cbd5e1",
              paddingLeft: () => 5,
              paddingRight: () => 5,
              paddingTop: () => 3,
              paddingBottom: () => 3,
            },
            fontSize: 9.5,
            margin: [0, 2, 0, 10],
          };
        case "rule":
          return { canvas: [{ type: "line", x1: 0, y1: 0, x2: PDF_WIDTH, y2: 0, lineWidth: 0.5, lineColor: "#cbd5e1" }], margin: [0, 4, 0, 12] };
      }
    });

  const definition = {
    info: { title },
    pageSize: "A4",
    pageMargins: [50, 56, 50, 56],
    defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.3, color: "#111827" },
    styles: {
      h1: { fontSize: 20, bold: true, margin: [0, 6, 0, 10] },
      h2: { fontSize: 16, bold: true, margin: [0, 10, 0, 8] },
      h3: { fontSize: 13.5, bold: true, margin: [0, 8, 0, 6] },
      h4: { fontSize: 12, bold: true, margin: [0, 6, 0, 4] },
      h5: { fontSize: 11, bold: true, margin: [0, 6, 0, 4] },
      h6: { fontSize: 10.5, bold: true, color: "#475569", margin: [0, 6, 0, 4] },
    },
    content: blocks.length ? render(blocks) : [" "],
  };
  return pdfMake.createPdf(definition).getBlob();
}
