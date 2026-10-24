import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { ChatMessage } from "./ChatMessage";
import { FilePreview } from "./FilePreview";
import { exportMarkdown } from "../../utils/markdownExport";
import type { FileAttachment, Message } from "../../types";

const render = (ui: ReactElement) => rtlRender(<ChatI18nProvider locale="en">{ui}</ChatI18nProvider>);
const now = new Date();
const message = (files: FileAttachment[]): Message => ({
  id: "m", conversationId: "c", role: "assistant", content: "Here you go", files, createdAt: now, updatedAt: now,
});
const file = (name: string, extra: Partial<FileAttachment> = {}): FileAttachment => ({
  id: `f-${name}`, name, mimeType: "application/octet-stream", size: 120, ...extra,
});

/** `fetch` answering with these bytes (a jsdom Blob, as the page's own `Blob` is). */
function serve(body: string | null, status = 200) {
  const fetchMock = vi.fn(async () => ({ ok: status < 400, status, blob: async () => new Blob(body === null ? [] : [body]) }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

describe("the Preview button on a file chip", () => {
  it("sits next to Download for a file it can show, and opens the file in a dialog", async () => {
    const fetchMock = serve("# Quarterly report\n\nRevenue **grew**.");
    const resolve = vi.fn(async () => "blob:stored");
    render(<ChatMessage message={message([file("report.md")])} resolveFileUrl={resolve} />);

    expect(screen.getByRole("button", { name: "Download" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Preview report.md" }));

    const dialog = await screen.findByRole("dialog", { name: "report.md" });
    expect(await within(dialog).findByRole("heading", { name: "Quarterly report" })).toBeTruthy();
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ id: "f-report.md" }), { disposition: "attachment" });
    expect(fetchMock).toHaveBeenCalledWith("blob:stored", expect.anything());
    // the page behind stops scrolling while it is open
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("is not offered for a type it cannot show, an expired file, a file still uploading, or when turned off", () => {
    const resolve = vi.fn(async () => "blob:x");
    render(
      <ChatMessage
        message={message([
          file("bundle.zip"),
          file("gone.pdf", { expired: true }),
          file("going.csv", { status: "uploading", progress: 0.4 }),
        ])}
        resolveFileUrl={resolve}
      />
    );
    expect(screen.queryByRole("button", { name: /^Preview/ })).toBeNull();
    cleanup();
    render(<ChatMessage message={message([file("report.md")])} resolveFileUrl={resolve} filePreview={false} />);
    expect(screen.queryByRole("button", { name: /^Preview/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Download" })).toBeTruthy();
  });

  it("needs a way to read the file: its own link, the transport, or the copy on this device", () => {
    render(<ChatMessage message={message([file("notes.txt")])} />);
    expect(screen.queryByRole("button", { name: /^Preview/ })).toBeNull();
    cleanup();
    render(<ChatMessage message={message([file("notes.txt", { url: "https://files.example/notes.txt" })])} />);
    expect(screen.getByRole("button", { name: "Preview notes.txt" })).toBeTruthy();
  });

  it("opens a picture's thumbnail in the preview instead of a new tab", async () => {
    serve("png-bytes");
    render(<ChatMessage message={message([file("cat.png", { mimeType: "image/png", url: "https://files.example/cat.png" })])} />);
    expect(document.querySelector('a[href="https://files.example/cat.png"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview cat.png" }));
    const dialog = await screen.findByRole("dialog", { name: "cat.png" });
    await waitFor(() => expect(within(dialog).getByRole("img", { name: "cat.png" }).getAttribute("src")).toBe("blob:preview"));
  });

  it("closes on Escape and gives focus back to the button that opened it", async () => {
    serve("hello");
    render(<ChatMessage message={message([file("hello.txt", { url: "https://files.example/hello.txt" })])} />);
    const opener = screen.getByRole("button", { name: "Preview hello.txt" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("hello");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close preview" }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
  });
});

describe("FilePreview", () => {
  const open = (f: FileAttachment, resolve?: () => Promise<string>) =>
    render(<FilePreview file={f} resolveFileUrl={resolve ?? (async () => "blob:stored")} onClose={() => undefined} />);

  it("offers a Markdown file as Markdown, PDF or Word, and shows its source on request", async () => {
    serve("# Title\n\nSome *text*.");
    open(file("notes.md"));
    await screen.findByRole("heading", { name: "Title" });
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Markdown (.md)",
      "PDF document (.pdf)",
      "Word document (.docx)",
    ]);
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show source" }));
    expect(screen.getByText(/# Title/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Title" })).toBeNull();
  });

  it("shows a CSV as a table with its header row", async () => {
    serve("name,amount\nAyşe,1250\nMehmet,980\n");
    open(file("sales.csv"));
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["", "name", "amount"]);
    expect(within(table).getByText("Ayşe")).toBeTruthy();
    expect(within(table).getByText("980").className).toContain("text-right");
    expect(screen.getByRole("button", { name: "Copy contents" })).toBeTruthy();
  });

  it("pretty-prints JSON", async () => {
    serve('{"a":1,"b":[true,null]}');
    open(file("data.json"));
    expect((await screen.findByText(/"a": 1/)).textContent).toBe('{\n  "a": 1,\n  "b": [\n    true,\n    null\n  ]\n}');
  });

  it("runs an HTML file's scripts only in a frame of its own", async () => {
    serve("<h1>Hi</h1><script>parent.document.title = 'owned'</script>");
    open(file("page.html"));
    await waitFor(() => expect(document.querySelector("iframe")).toBeTruthy());
    const frame = document.querySelector("iframe")!;
    expect(frame.getAttribute("title")).toBe("page.html");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("srcdoc")).toContain("<h1>Hi</h1>");
  });

  it("draws an SVG from a data: URL, never an object URL", async () => {
    serve('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    open(file("logo.svg"));
    const img = await screen.findByRole("img", { name: "logo.svg" });
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("lays a Word document out in a shadow root, where its styles cannot reach the page", async () => {
    const docx = await exportMarkdown("# Rapor\n\nMerhaba dünya.", "docx", "Rapor");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, blob: async () => docx })));
    open(file("rapor.docx"));
    const host = await waitFor(
      () => {
        const el = document.querySelector<HTMLElement>(".chat-docx-preview");
        expect(el?.shadowRoot?.querySelector("section.docx")).toBeTruthy();
        return el!;
      },
      { timeout: 5000 }
    );
    expect(host.shadowRoot!.textContent).toContain("Merhaba dünya.");
    expect(document.querySelector("section.docx, .docx-wrapper")).toBeNull();
    expect(document.head.querySelector("style")).toBeNull();
  });

  it("does not read a file that is too large, and offers the download instead", async () => {
    const fetchMock = serve("x");
    open(file("huge.txt", { size: 6 * 1024 * 1024 }));
    expect(await screen.findByText("This file is too large to preview here (6 MB).")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "Download" }).length).toBeGreaterThan(0);
  });

  it("says so when the file cannot be read", async () => {
    serve(null, 404);
    open(file("missing.txt"));
    expect(await screen.findByText("The preview could not be loaded. You can still download the file.")).toBeTruthy();
  });

  it("keeps Tab inside the dialog", async () => {
    serve("text");
    open(file("a.txt"));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("text");
    const close = within(dialog).getByRole("button", { name: "Close preview" });
    const first = within(dialog).getByRole("button", { name: "Copy contents" });
    close.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(close);
  });
});
