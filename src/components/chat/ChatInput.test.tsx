import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { ChatInput, type ChatInputProps } from "./ChatInput";
import type { FileAttachment } from "../../types";

afterEach(cleanup);

const render = (ui: ReactElement) => rtlRender(<ChatI18nProvider locale="en">{ui}</ChatI18nProvider>);

const box = () => screen.getByPlaceholderText("Type a message...") as HTMLTextAreaElement;

async function typeAndSend(text: string) {
  fireEvent.change(box(), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByTitle("Send message"));
  });
}

function setup(onSend: ChatInputProps["onSend"]) {
  render(<ChatInput onSend={onSend} />);
}

describe("ChatInput keeps the text of a refused message", () => {
  it("clears at once and stays empty when the message is taken", async () => {
    const onSend = vi.fn(async () => true);
    setup(onSend);
    await typeAndSend("hello");
    expect(onSend).toHaveBeenCalledWith("hello");
    expect(box().value).toBe("");
  });

  it("stays empty for a handler that returns nothing (the old contract)", async () => {
    setup(() => {});
    await typeAndSend("hello");
    expect(box().value).toBe("");
  });

  it("puts the text back when the send resolves to false", async () => {
    let finish!: (taken: boolean) => void;
    setup(() => new Promise<boolean>((resolve) => (finish = resolve)));
    await typeAndSend("second batch");
    expect(box().value).toBe("");
    await act(async () => finish(false));
    expect(box().value).toBe("second batch");
  });

  it("puts the text back when the handler returns false or rejects", async () => {
    setup(() => false);
    await typeAndSend("sync refusal");
    expect(box().value).toBe("sync refusal");
    cleanup();

    setup(async () => {
      throw new Error("boom");
    });
    await typeAndSend("async failure");
    expect(box().value).toBe("async failure");
  });

  it("does not overwrite what was typed while the send was in flight", async () => {
    let finish!: (taken: boolean) => void;
    setup(() => new Promise<boolean>((resolve) => (finish = resolve)));
    await typeAndSend("first");
    fireEvent.change(box(), { target: { value: "next thought" } });
    await act(async () => finish(false));
    expect(box().value).toBe("next thought");
  });
});

const attachment = (name: string, mimeType = "text/plain", extra: Partial<FileAttachment> = {}): FileAttachment => ({
  id: name,
  name,
  mimeType,
  size: 2048,
  ...extra,
});

const png = (name = "photo.png") => new File(["x"], name, { type: "image/png" });

/** A drag that carries files, the way a browser reports it. */
const fileDrag = (files: File[] = []) => ({
  dataTransfer: { types: ["Files"], files, dropEffect: "none" },
});

describe("ChatInput sends files without text", () => {
  it("lets a message with only files go, with empty text", async () => {
    const onSend = vi.fn(async () => true);
    render(<ChatInput onSend={onSend} pendingFiles={[attachment("notes.txt")]} onFilesAdd={() => {}} />);
    const send = screen.getByTitle("Send message") as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(send);
    });
    expect(onSend).toHaveBeenCalledWith("");
  });

  it("sends files with Enter on an empty composer", async () => {
    const onSend = vi.fn(async () => true);
    render(<ChatInput onSend={onSend} pendingFiles={[attachment("notes.txt")]} onFilesAdd={() => {}} />);
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter" });
    });
    expect(onSend).toHaveBeenCalledWith("");
  });

  it("still needs text or files to send", () => {
    render(<ChatInput onSend={() => {}} />);
    expect((screen.getByTitle("Send message") as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not send files alone as the answer to a question", () => {
    render(<ChatInput onSend={() => {}} pendingFiles={[attachment("a.txt")]} pendingMode="answer" />);
    expect((screen.getByTitle("Send message") as HTMLButtonElement).disabled).toBe(true);
  });

  it("holds the send while the files are uploading, and shows it", () => {
    render(<ChatInput onSend={() => {}} pendingFiles={[attachment("a.txt")]} isUploading onFilesAdd={() => {}} />);
    expect((screen.getByTitle("Send message") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status", { name: "Uploading a.txt" })).toBeTruthy();
    // a file being uploaded cannot be taken back out
    expect(screen.queryByTitle("Remove file")).toBeNull();
  });
});

describe("ChatInput paperclip", () => {
  const paperclip = () => screen.getByRole("button", { name: "Attach files" }) as HTMLButtonElement;

  it("is on by default and labelled", () => {
    render(<ChatInput onSend={() => {}} onFilesAdd={() => {}} />);
    expect(paperclip().disabled).toBe(false);
  });

  it("is off while uploading, while the composer is blocked, and at the file limit", () => {
    const { rerender } = render(<ChatInput onSend={() => {}} onFilesAdd={() => {}} isUploading />);
    expect(paperclip().disabled).toBe(true);
    rerender(<ChatInput onSend={() => {}} onFilesAdd={() => {}} pendingMode="blocked" />);
    expect(paperclip().disabled).toBe(true);
    rerender(<ChatInput onSend={() => {}} onFilesAdd={() => {}} pendingFiles={[attachment("a"), attachment("b")]} maxFiles={2} />);
    expect(paperclip().disabled).toBe(true);
  });

  it("stays on while an answer is streaming (files for the next message)", () => {
    render(<ChatInput onSend={() => {}} onFilesAdd={() => {}} isLoading />);
    expect(paperclip().disabled).toBe(false);
  });
});

describe("ChatInput drag and drop", () => {
  const zone = () => screen.getByRole("textbox").closest("div.relative") as HTMLElement;
  const root = () => zone().parentElement!.parentElement as HTMLElement;

  it("attaches dropped files and shows a drop hint while dragging", () => {
    const onFilesAdd = vi.fn();
    render(<ChatInput onSend={() => {}} onFilesAdd={onFilesAdd} />);
    const file = png();

    fireEvent.dragEnter(root(), fileDrag([file]));
    expect(screen.getByText("Drop files to attach them")).toBeTruthy();
    fireEvent.dragLeave(root(), fileDrag());
    expect(screen.queryByText("Drop files to attach them")).toBeNull();

    fireEvent.dragEnter(root(), fileDrag([file]));
    fireEvent.drop(root(), fileDrag([file]));
    expect(onFilesAdd).toHaveBeenCalledWith([file]);
    expect(screen.queryByText("Drop files to attach them")).toBeNull();
  });

  it("keeps the hint up while the drag moves over children (enter/leave pairs)", () => {
    render(<ChatInput onSend={() => {}} onFilesAdd={() => {}} />);
    fireEvent.dragEnter(root(), fileDrag());
    fireEvent.dragEnter(box(), fileDrag());
    fireEvent.dragLeave(root(), fileDrag());
    expect(screen.getByText("Drop files to attach them")).toBeTruthy();
    fireEvent.dragLeave(box(), fileDrag());
    expect(screen.queryByText("Drop files to attach them")).toBeNull();
  });

  it("ignores drags that carry no files (text, links)", () => {
    const onFilesAdd = vi.fn();
    render(<ChatInput onSend={() => {}} onFilesAdd={onFilesAdd} />);
    fireEvent.dragEnter(root(), { dataTransfer: { types: ["text/plain"], files: [] } });
    expect(screen.queryByText("Drop files to attach them")).toBeNull();
    fireEvent.drop(root(), { dataTransfer: { types: ["text/plain"], files: [] } });
    expect(onFilesAdd).not.toHaveBeenCalled();
  });

  it("refuses a drop while blocked or uploading, but still keeps the browser from opening the file", () => {
    for (const props of [{ pendingMode: "blocked" as const }, { isUploading: true }]) {
      const onFilesAdd = vi.fn();
      const { unmount } = render(<ChatInput onSend={() => {}} onFilesAdd={onFilesAdd} {...props} />);
      fireEvent.dragEnter(root(), fileDrag([png()]));
      expect(screen.queryByText("Drop files to attach them")).toBeNull();
      const notPrevented = fireEvent.drop(root(), fileDrag([png()]));
      expect(onFilesAdd).not.toHaveBeenCalled();
      expect(notPrevented).toBe(false); // preventDefault was called
      unmount();
    }
  });

  it("does nothing when file upload is off", () => {
    const onFilesAdd = vi.fn();
    render(<ChatInput onSend={() => {}} onFilesAdd={onFilesAdd} enableFileUpload={false} />);
    fireEvent.drop(root(), fileDrag([png()]));
    expect(onFilesAdd).not.toHaveBeenCalled();
  });
});

describe("ChatInput paste", () => {
  const paste = (files: File[], text = "") =>
    fireEvent.paste(box(), {
      clipboardData: { files, getData: (type: string) => (type === "text/plain" ? text : "") },
    });

  it("attaches a pasted screenshot and gives it a name of its own", () => {
    const onFilesAdd = vi.fn();
    render(<ChatInput onSend={() => {}} onFilesAdd={onFilesAdd} />);
    paste([png("image.png")]);
    expect(onFilesAdd).toHaveBeenCalledTimes(1);
    const [added] = onFilesAdd.mock.calls[0][0] as File[];
    expect(added.name).toMatch(/^pasted-\d{14}\.png$/);
    expect(added.type).toBe("image/png");
  });

  it("keeps a real file name", () => {
    const onFilesAdd = vi.fn();
    render(<ChatInput onSend={() => {}} onFilesAdd={onFilesAdd} />);
    const file = new File(["x"], "report.pdf", { type: "application/pdf" });
    paste([file]);
    expect(onFilesAdd).toHaveBeenCalledWith([file]);
  });

  it("leaves pasted text alone, also when the clipboard has an image next to it (a copied spreadsheet cell)", () => {
    const onFilesAdd = vi.fn();
    render(<ChatInput onSend={() => {}} onFilesAdd={onFilesAdd} />);
    paste([png("image.png")], "A1\tB1");
    paste([], "plain text");
    expect(onFilesAdd).not.toHaveBeenCalled();
  });

  it("ignores a paste while blocked", () => {
    const onFilesAdd = vi.fn();
    render(<ChatInput onSend={() => {}} onFilesAdd={onFilesAdd} pendingMode="blocked" />);
    fireEvent.paste(screen.getByRole("textbox"), { clipboardData: { files: [png("image.png")], getData: () => "" } });
    expect(onFilesAdd).not.toHaveBeenCalled();
  });
});

describe("ChatInput chips", () => {
  it("shows a thumbnail for an image with a local preview", () => {
    render(<ChatInput onSend={() => {}} pendingFiles={[attachment("cat.png", "image/png", { previewUrl: "blob:http://localhost:3000/abc" })]} />);
    const chip = screen.getByText("cat.png").closest("li") as HTMLElement;
    expect(chip.querySelector("img")?.getAttribute("src")).toBe("blob:http://localhost:3000/abc");
  });

  it("shows the file type icon, not an image, for other files and for an unsafe preview", () => {
    render(
      <ChatInput
        onSend={() => {}}
        pendingFiles={[attachment("notes.txt"), attachment("evil.png", "image/png", { previewUrl: "javascript:alert(1)" })]}
      />
    );
    expect(document.querySelector("li img")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("labels the remove button with the file", () => {
    const onFileRemove = vi.fn();
    render(<ChatInput onSend={() => {}} pendingFiles={[attachment("notes.txt")]} onFileRemove={onFileRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove file: notes.txt" }));
    expect(onFileRemove).toHaveBeenCalledWith("notes.txt");
  });

  it("warns when an image is attached to an agent that does not read images", () => {
    const { rerender } = render(
      <ChatInput onSend={() => {}} pendingFiles={[attachment("cat.png", "image/png")]} imagesIgnored />
    );
    expect(screen.getByText(/can't see images/)).toBeTruthy();
    expect(screen.getByText("cat.png").closest("li")?.className).toContain("border-chat-warning");

    // no image, no warning; an agent that reads images, no warning
    rerender(<ChatInput onSend={() => {}} pendingFiles={[attachment("notes.txt")]} imagesIgnored />);
    expect(screen.queryByText(/can't see images/)).toBeNull();
    rerender(<ChatInput onSend={() => {}} pendingFiles={[attachment("cat.png", "image/png")]} />);
    expect(screen.queryByText(/can't see images/)).toBeNull();
  });
});

describe("ChatInput accessibility", () => {
  it("labels the composer and its buttons", () => {
    render(<ChatInput onSend={() => {}} onFilesAdd={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Message" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send message" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Attach files" })).toBeTruthy();
  });

  it("labels the stop button", () => {
    render(<ChatInput onSend={() => {}} onStop={() => {}} isLoading />);
    expect(screen.getByRole("button", { name: "Stop generation" })).toBeTruthy();
  });
});
