import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { markdownExportName, exportMarkdown, markdownBlocks } from "./markdownExport";
import { blobBytes } from "./filePreview";

const SAMPLE = `# Çeyrek raporu

Giriş **kalın** ve *eğik* metin, \`kod\` ve [bağlantı](https://example.com) ile [kötü](javascript:alert(1)).

- madde bir
- madde iki
  1. alt bir
  2. alt iki

* [x] bitti
* [ ] kaldı

> Alıntı satırı

| Ad | Tutar |
| :-- | --: |
| Şube İstanbul | 1.250 |
| Ğ | 3 |

\`\`\`js
const x = 1;
\`\`\`

---

Son satır ğüşıöç İĞÜŞÖÇ.
`;

/** The text of every page of a PDF, read back with pdf.js. */
async function pdfText(blob: Blob): Promise<string> {
  await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(await blobBytes(blob)) });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  await task.destroy();
  return pages.join("\n");
}

describe("markdownBlocks", () => {
  it("reads headings, marks, safe links, lists, task lists, quotes, tables, code and rules", () => {
    const blocks = markdownBlocks(SAMPLE);
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "list", "list", "quote", "table", "code", "rule", "paragraph"]);
    const intro = blocks[1]!;
    expect(intro.type === "paragraph" && intro.runs.find((r) => r.text === "kalın")?.bold).toBe(true);
    expect(intro.type === "paragraph" && intro.runs.find((r) => r.text === "bağlantı")?.link).toBe("https://example.com");
    // a javascript: link keeps its words but loses the address
    expect(intro.type === "paragraph" && intro.runs.find((r) => r.text === "kötü")?.link).toBeUndefined();
    const nested = blocks[2]!;
    expect(nested.type === "list" && nested.items[1]!.blocks[1]!.type).toBe("list");
    const tasks = blocks[3]!;
    expect(tasks.type === "list" && tasks.items.map((i) => i.checked)).toEqual([true, false]);
    const table = blocks[5]!;
    expect(table.type === "table" && table.align).toEqual(["left", "right"]);
    expect(table.type === "table" && table.rows.length).toBe(3);
  });
});

describe("exportMarkdown", () => {
  it("writes a Word document with the text", async () => {
    const blob = await exportMarkdown(SAMPLE, "docx", "Çeyrek raporu");
    const zip = await JSZip.loadAsync(await blobBytes(blob));
    const body = await zip.file("word/document.xml")!.async("string");
    expect(body).toContain("Çeyrek raporu");
    expect(body).toContain("Şube İstanbul");
    expect(body).toContain("ğüşıöç İĞÜŞÖÇ");
    expect(body).toContain("const x = 1;");
    expect(await zip.file("word/numbering.xml")!.async("string")).toContain("decimal");
  });

  it("writes a PDF whose text reads back, Turkish letters included", async () => {
    const blob = await exportMarkdown(SAMPLE, "pdf", "Çeyrek raporu");
    const head = new TextDecoder().decode((await blobBytes(blob)).slice(0, 5));
    expect(head).toBe("%PDF-");
    const text = await pdfText(blob);
    expect(text).toContain("Çeyrek raporu");
    expect(text).toContain("Şube İstanbul");
    expect(text.replace(/\s+/g, " ")).toContain("ğüşıöç İĞÜŞÖÇ");
  }, 30_000);

  it("names the file after the Markdown file", () => {
    expect(markdownExportName("rapor.md", "pdf")).toBe("rapor.pdf");
    expect(markdownExportName("notes.MARKDOWN", "docx")).toBe("notes.docx");
    expect(markdownExportName("plain", "pdf")).toBe("plain.pdf");
  });
});
