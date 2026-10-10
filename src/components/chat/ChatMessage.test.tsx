import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { ChatMessage } from "./ChatMessage";
import type { FileAttachment, Message } from "../../types";

afterEach(cleanup);

const render = (ui: ReactElement) => rtlRender(<ChatI18nProvider locale="en">{ui}</ChatI18nProvider>);
const now = new Date();

const message = (partial: Partial<Message>): Message => ({
  id: "m",
  conversationId: "c",
  role: "assistant",
  content: "",
  createdAt: now,
  updatedAt: now,
  ...partial,
});

const file = (partial: Partial<FileAttachment>): FileAttachment => ({
  id: "f1",
  name: "report.pdf",
  mimeType: "application/pdf",
  size: 2048,
  ...partial,
});

describe("images in message content", () => {
  it("renders image_url, input_image and image parts, each opening full size", () => {
    render(
      <ChatMessage
        message={message({
          content: [
            { type: "text", text: "Here you go" },
            { type: "image_url", image_url: { url: "https://cdn.test/a.png" } },
            { type: "input_image", image_url: "https://cdn.test/b.png" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
          ],
        })}
      />
    );
    const images = screen.getAllByRole("img");
    expect(images.map((img) => img.getAttribute("src"))).toEqual([
      "https://cdn.test/a.png",
      "https://cdn.test/b.png",
      "data:image/png;base64,iVBORw0KGgo=",
    ]);
    expect(images[0].getAttribute("alt")).toBe("Image 1");
    expect(images[0].getAttribute("loading")).toBe("lazy");
    const link = images[0].closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://cdn.test/a.png");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText("Here you go")).toBeTruthy();
  });

  it("never renders an unsafe image URL", () => {
    render(
      <ChatMessage
        message={message({
          content: [
            { type: "image_url", image_url: { url: "javascript:alert(1)" } },
            { type: "image_url", image_url: { url: "data:image/svg+xml;base64,PHN2Zz4=" } },
            { type: "image", source: { type: "base64", media_type: "image/svg+xml", data: "PHN2Zz4=" } },
          ],
        })}
      />
    );
    expect(screen.queryAllByRole("img")).toEqual([]);
  });

  it("keeps the text parts, one per line, in a content array", () => {
    render(<ChatMessage message={message({ content: [{ type: "text", text: "first" }, { type: "text", text: "second" }] })} />);
    expect(document.querySelector(".chat-markdown")?.textContent).toContain("first");
    expect(document.querySelector(".chat-markdown")?.textContent).toContain("second");
  });

  it("lets the host draw the image", () => {
    render(
      <ChatMessage
        message={message({ content: [{ type: "image_url", image_url: { url: "https://cdn.test/a.png" } }] })}
        renderImage={({ src, alt }) => <span data-testid="custom">{alt}|{src}</span>}
      />
    );
    expect(screen.getByTestId("custom").textContent).toBe("Image 1|https://cdn.test/a.png");
    expect(screen.queryAllByRole("img")).toEqual([]);
  });
});

describe("file attachments", () => {
  it("shows an image attachment with a server URL as a thumbnail with its name and size", () => {
    render(<ChatMessage message={message({ role: "user", content: "look", files: [file({ name: "cat.png", mimeType: "image/png", url: "/api/files/f1/content" })] })} />);
    const img = screen.getByRole("img", { name: "cat.png" });
    expect(img.getAttribute("src")).toBe("/api/files/f1/content");
    expect(screen.getByText("cat.png · 2 KB")).toBeTruthy();
  });

  it("prefers the local preview of a file that was just sent", () => {
    render(
      <ChatMessage
        message={message({ role: "user", content: "look", files: [file({ name: "cat.png", mimeType: "image/png", url: "/api/files/f1/content", previewUrl: "blob:http://localhost:3000/p" })] })}
      />
    );
    expect(screen.getByRole("img", { name: "cat.png" }).getAttribute("src")).toBe("blob:http://localhost:3000/p");
  });

  it("shows an image without any URL as a chip, not a broken picture", () => {
    render(<ChatMessage message={message({ role: "user", content: "look", files: [file({ name: "cat.png", mimeType: "image/png" })] })} />);
    expect(screen.queryAllByRole("img")).toEqual([]);
    expect(screen.getByText("cat")).toBeTruthy();
    expect(screen.getByText(".png")).toBeTruthy();
    expect(screen.getByText("2 KB")).toBeTruthy();
  });

  it("shows other files as a chip with size and a download link when there is a URL", () => {
    render(<ChatMessage message={message({ files: [file({ url: "https://files.test/report.pdf" })] })} />);
    expect(screen.getByText("2 KB")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Download" });
    expect(link.getAttribute("href")).toBe("https://files.test/report.pdf");
  });

  it("offers no download link for an unsafe URL", () => {
    render(<ChatMessage message={message({ files: [file({ url: "javascript:alert(1)" })] })} />);
    expect(screen.queryByRole("link", { name: "Download" })).toBeNull();
  });
});
