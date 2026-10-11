import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { ChatMessage } from "./ChatMessage";
import type { FileAttachment, Message } from "../../types";

afterEach(cleanup);

const render = (ui: ReactElement) => rtlRender(<ChatI18nProvider locale="en">{ui}</ChatI18nProvider>);
const now = new Date();
const message = (files: FileAttachment[]): Message => ({
  id: "m", conversationId: "c", role: "user", content: "see attached", files, createdAt: now, updatedAt: now,
});
const pdf = (extra: Partial<FileAttachment> = {}): FileAttachment => ({ id: "f1", name: "report.pdf", mimeType: "application/pdf", size: 2048, ...extra });
const png = (extra: Partial<FileAttachment> = {}): FileAttachment => ({ id: "i1", name: "cat.png", mimeType: "image/png", size: 100, ...extra });

describe("file chips that are no longer good", () => {
  it("an expired file is muted, struck through, says so, and offers no download", () => {
    const resolve = vi.fn();
    render(<ChatMessage message={message([pdf({ expired: true, url: "https://x/f1" })])} resolveFileUrl={resolve} />);
    const chip = screen.getByText("report").closest("[data-chat-file]")!;
    expect(chip.getAttribute("data-chat-file")).toBe("expired");
    expect(chip.getAttribute("title")).toBe("report.pdf is no longer available");
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.queryByText("Download")).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("a file whose deadline has passed is expired too, one with time left says how long it is kept", () => {
    render(<ChatMessage message={message([pdf({ expiresAt: "2020-01-01T00:00:00.000Z", url: "https://x/f1" })])} />);
    expect(screen.getByText("Expired")).toBeTruthy();
    cleanup();
    render(<ChatMessage message={message([pdf({ expiresAt: "2999-01-01T00:00:00.000Z", url: "https://x/f1" })])} />);
    expect(screen.queryByText("Expired")).toBeNull();
    expect(screen.getByText("report").closest("div[title]")!.getAttribute("title")).toMatch(/^Kept until /);
  });

  it("an expired picture shows as a chip, not as a broken thumbnail", () => {
    render(<ChatMessage message={message([png({ expired: true, url: "https://x/i1" })])} />);
    expect(screen.queryByRole("img", { name: "cat.png" })).toBeNull();
    expect(screen.getByText("Expired")).toBeTruthy();
  });

  it("but a picture still on this device shows even if its server copy is gone", () => {
    render(<ChatMessage message={message([png({ expired: true, previewUrl: "blob:local" })])} />);
    expect(screen.getByRole("img", { name: "cat.png" })).toBeTruthy();
  });

  it("a file whose text could not be read is tinted and says no readable text", () => {
    render(<ChatMessage message={message([pdf({ conversionStatus: "skipped" })])} />);
    expect(screen.getByText("No readable text")).toBeTruthy();
    expect(screen.getByText("report").closest("[data-chat-file]")!.getAttribute("data-chat-file")).toBe("no-text");
  });
});

describe("pictures that cannot be drawn", () => {
  const svg = (extra: Partial<FileAttachment> = {}): FileAttachment => ({ id: "s1", name: "logo.svg", mimeType: "image/svg+xml", size: 300, ...extra });

  it("an SVG is a file chip, never a thumbnail or a link to a local object URL", () => {
    const resolve = vi.fn(async () => "blob:fetched");
    render(<ChatMessage message={message([svg({ url: "https://x/s1", previewUrl: "blob:mine" }), svg({ id: "s2", name: "mark.svg" })])} resolveFileUrl={resolve} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.querySelector('a[href^="blob:"]')).toBeNull();
    // each is a chip with its own download, not a picture
    expect(screen.getAllByText("Download")).toHaveLength(2);
    expect(screen.getByText("logo")).toBeTruthy();
    expect(screen.getByText("mark")).toBeTruthy();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("a thumbnail that fails to load falls back to the next copy, then to the chip", () => {
    render(<ChatMessage message={message([png({ previewUrl: "blob:released", url: "https://x/i1" })])} />);
    expect(screen.getByRole("img", { name: "cat.png" }).getAttribute("src")).toBe("blob:released");
    fireEvent.error(screen.getByRole("img", { name: "cat.png" }));
    expect(screen.getByRole("img", { name: "cat.png" }).getAttribute("src")).toBe("https://x/i1");
    fireEvent.error(screen.getByRole("img", { name: "cat.png" }));
    expect(screen.queryByRole("img", { name: "cat.png" })).toBeNull();
    expect(screen.getByText("cat")).toBeTruthy();
  });

  it("asks the transport for the stored copy when the copies it holds do not load", async () => {
    const resolve = vi.fn(async () => "blob:fetched");
    render(<ChatMessage message={message([png({ previewUrl: "blob:released" })])} resolveFileUrl={resolve} />);
    expect(resolve).not.toHaveBeenCalled();
    fireEvent.error(screen.getByRole("img", { name: "cat.png" }));
    const img = await screen.findByRole("img", { name: "cat.png" });
    expect(img.getAttribute("src")).toBe("blob:fetched");
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});

describe("files without a URL of their own", () => {
  it("a stored picture is fetched through the transport and shown", async () => {
    const resolve = vi.fn(async () => "blob:fetched");
    render(<ChatMessage message={message([png()])} resolveFileUrl={resolve} />);
    const img = await screen.findByRole("img", { name: "cat.png" });
    expect(img.getAttribute("src")).toBe("blob:fetched");
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve.mock.calls[0]).toEqual([expect.objectContaining({ id: "i1" }), { disposition: "inline" }]);
  });

  it("does not fetch a picture that has a URL or a local preview", () => {
    const resolve = vi.fn(async () => "blob:fetched");
    render(<ChatMessage message={message([png({ url: "https://x/i1" }), png({ id: "i2", name: "dog.png", previewUrl: "blob:mine" })])} resolveFileUrl={resolve} />);
    expect(resolve).not.toHaveBeenCalled();
    expect(screen.getAllByRole("img").map((i) => i.getAttribute("src"))).toEqual(["https://x/i1", "blob:mine"]);
  });

  it("a picture that cannot be fetched stays a chip", async () => {
    const resolve = vi.fn(async () => undefined);
    render(<ChatMessage message={message([png()])} resolveFileUrl={resolve} />);
    await waitFor(() => expect(resolve).toHaveBeenCalled());
    expect(screen.queryByRole("img", { name: "cat.png" })).toBeNull();
    expect(screen.getByText("cat")).toBeTruthy();
  });

  it("a document downloads on request: the transport makes the URL and a link is followed", async () => {
    const resolve = vi.fn(async () => "blob:doc");
    const clicked: Array<{ href: string; download: string }> = [];
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    };
    try {
      render(<ChatMessage message={message([pdf()])} resolveFileUrl={resolve} />);
      fireEvent.click(screen.getByRole("button", { name: "Download" }));
      await waitFor(() => expect(clicked).toHaveLength(1));
      expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ id: "f1" }), { disposition: "attachment" });
      expect(clicked[0]).toEqual({ href: "blob:doc", download: "report.pdf" });
    } finally {
      HTMLAnchorElement.prototype.click = original;
    }
  });

  it("says when a download did not work", async () => {
    render(<ChatMessage message={message([pdf()])} resolveFileUrl={async () => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect((await screen.findByRole("alert")).textContent).toBe("The file could not be downloaded");
  });

  it("a file with a link of its own keeps its link, and none without a way to get one gets no button", () => {
    render(<ChatMessage message={message([pdf({ url: "https://x/f1" })])} resolveFileUrl={async () => "blob:x"} />);
    expect(screen.getByRole("link", { name: "Download" }).getAttribute("href")).toBe("https://x/f1");
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
    cleanup();
    render(<ChatMessage message={message([pdf()])} />);
    expect(screen.queryByText("Download")).toBeNull();
  });
});
