import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { filePreviewKind, parseCsv, parseXlsx } from "./filePreview";

describe("filePreviewKind", () => {
  it("goes by the extension first, since agent files often come as octet-stream", () => {
    const octet = "application/octet-stream";
    expect(filePreviewKind({ name: "report.md", mimeType: octet })).toBe("markdown");
    expect(filePreviewKind({ name: "Report.PDF", mimeType: octet })).toBe("pdf");
    expect(filePreviewKind({ name: "data.xlsx", mimeType: octet })).toBe("spreadsheet");
    expect(filePreviewKind({ name: "data.tsv", mimeType: octet })).toBe("csv");
    expect(filePreviewKind({ name: "letter.docx", mimeType: octet })).toBe("docx");
    expect(filePreviewKind({ name: "main.py", mimeType: octet })).toBe("text");
    expect(filePreviewKind({ name: "logo.svg", mimeType: octet })).toBe("svg");
    expect(filePreviewKind({ name: "clip.mp4", mimeType: octet })).toBe("video");
  });

  it("falls back to the media type, and has no answer for what it cannot show", () => {
    expect(filePreviewKind({ name: "download", mimeType: "application/pdf" })).toBe("pdf");
    expect(filePreviewKind({ name: "x", mimeType: "image/webp" })).toBe("image");
    expect(filePreviewKind({ name: "x", mimeType: "application/ld+json" })).toBe("json");
    expect(filePreviewKind({ name: "x", mimeType: "text/plain; charset=utf-8" })).toBe("text");
    expect(filePreviewKind({ name: "archive.zip", mimeType: "application/zip" })).toBeUndefined();
    expect(filePreviewKind({ name: "deck.pptx", mimeType: "application/octet-stream" })).toBeUndefined();
    expect(filePreviewKind({ name: "old.doc", mimeType: "application/msword" })).toBeUndefined();
  });
});

describe("parseCsv", () => {
  it("reads quoted fields, doubled quotes, line breaks in quotes and CRLF", () => {
    const sheet = parseCsv('ad,not\r\n"Yılmaz, Ayşe","dedi ki ""merhaba"""\r\nAli,"iki\nsatır"\r\n');
    expect(sheet.rows).toEqual([
      ["ad", "not"],
      ["Yılmaz, Ayşe", 'dedi ki "merhaba"'],
      ["Ali", "iki\nsatır"],
    ]);
    expect(sheet.totalRows).toBe(3);
  });

  it("finds a semicolon delimiter (spreadsheets saved in a Turkish locale) and tabs for tsv", () => {
    expect(parseCsv("a;b;c\n1;2,5;3").rows).toEqual([["a", "b", "c"], ["1", "2,5", "3"]]);
    expect(parseCsv("a\tb\n1\t2", { tsv: true }).rows).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("keeps at most 500 rows but says how many there were", () => {
    const text = Array.from({ length: 1200 }, (_, i) => `r${i},x`).join("\n");
    const sheet = parseCsv(text);
    expect(sheet.rows).toHaveLength(500);
    expect(sheet.totalRows).toBe(1200);
  });
});

/** A small workbook as Excel writes it: shared strings, an inline string, a date, a percent, a boolean, a gap. */
async function workbook(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Satışlar" sheetId="1" r:id="rId1"/><sheet name="Boş" sheetId="2" r:id="rId2"/></sheets></workbook>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`
  );
  zip.file(
    "xl/sharedStrings.xml",
    `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Şube</t></si><si><r><t>Tar</t></r><r><t>ih</t></r></si><si><t>Oran</t></si></sst>`
  );
  zip.file(
    "xl/styles.xml",
    `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts><numFmt numFmtId="164" formatCode="dd.mm.yyyy"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="10"/><xf numFmtId="165"/></cellXfs></styleSheet>`
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>` +
      `<row r="2"><c r="A2" t="inlineStr"><is><t>İzmir</t></is></c><c r="B2" s="1"><v>45658</v></c><c r="C2" s="2"><v>0.125</v></c></row>` +
      `<row r="4"><c r="A4" t="b"><v>1</v></c><c r="B4" s="3"><v>0.375</v></c><c r="C4"><v>42</v></c></row>` +
      `</sheetData></worksheet>`
  );
  zip.file("xl/worksheets/sheet2.xml", `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`);
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("parseXlsx", () => {
  it("reads every sheet with the cell texts Excel shows", async () => {
    const sheets = await parseXlsx(await workbook());
    expect(sheets.map((s) => s.name)).toEqual(["Satışlar", "Boş"]);
    expect(sheets[0]!.rows).toEqual([
      ["Şube", "Tarih", "Oran"],
      ["İzmir", "2025-01-01", "12.5%"],
      [],
      ["TRUE", "37.5%", "42"],
    ]);
    expect(sheets[1]!.rows).toEqual([]);
  });

  it("refuses what is not a workbook", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "hi");
    await expect(parseXlsx(await zip.generateAsync({ type: "arraybuffer" }))).rejects.toThrow();
  });
});
