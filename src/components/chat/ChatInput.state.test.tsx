import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { ChatInput, type ChatInputProps } from "./ChatInput";
import type { ComposerState, FileAttachment } from "../../types";

afterEach(cleanup);

const render = (ui: ReactElement, locale: "en" | "tr" = "en") => rtlRender(<ChatI18nProvider locale={locale}>{ui}</ChatI18nProvider>);
const textbox = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const file = (extra: Partial<FileAttachment> = {}): FileAttachment => ({ id: "f1", name: "plan.pdf", mimeType: "application/pdf", size: 2048, ...extra });
const files = (...list: Partial<FileAttachment>[]) => list.map((extra, i) => file({ id: `f${i + 1}`, name: `file${i + 1}.pdf`, ...extra }));

describe("ChatInput states", () => {
  it.each<[ComposerState, string, RegExp | null]>([
    ["following", "The assistant is still working on this conversation...", /is still answering/],
    ["blocked", "Respond to the request above to continue", /waiting for your response above/],
    ["readonly", "This conversation is read-only", /read-only/],
    ["budget_paused", "This conversation reached its usage limit", null],
  ])("%s closes the textarea, the paperclip and the send button and says why", (state, placeholder, notice) => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} state={state} onFilesAdd={() => {}} pendingFiles={files({})} />);
    expect(textbox().disabled).toBe(true);
    expect(textbox().placeholder).toBe(placeholder);
    expect((screen.getByTitle("Attach files") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTitle("Send message") as HTMLButtonElement).disabled).toBe(true);
    if (notice) expect(screen.getByRole("status").textContent).toMatch(notice);
    else expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByTitle("Send message"));
    expect(onSend).not.toHaveBeenCalled();
  });

  it.each<ComposerState>(["open", "cancel", "answer"])("%s keeps the composer open", (state) => {
    render(<ChatInput onSend={() => {}} state={state} onFilesAdd={() => {}} />);
    expect(textbox().disabled).toBe(false);
    expect((screen.getByTitle("Attach files") as HTMLButtonElement).disabled).toBe(false);
  });

  it("while following, Stop is there", () => {
    const onStop = vi.fn();
    render(<ChatInput onSend={() => {}} state="following" isLoading onStop={onStop} />);
    fireEvent.click(screen.getByTitle("Stop generation"));
    expect(onStop).toHaveBeenCalled();
  });

  it("state wins over the older pendingMode, which still works alone", () => {
    render(<ChatInput onSend={() => {}} pendingMode="blocked" state="open" />);
    expect(textbox().disabled).toBe(false);
    cleanup();
    render(<ChatInput onSend={() => {}} pendingMode="blocked" />);
    expect(textbox().disabled).toBe(true);
  });

  it("speaks Turkish", () => {
    render(<ChatInput onSend={() => {}} state="following" />, "tr");
    expect(textbox().placeholder).toBe("Asistan bu sohbet üzerinde hâlâ çalışıyor...");
  });
});

describe("ChatInput file chips", () => {
  const base: Partial<ChatInputProps> = { onSend: () => {}, onFilesAdd: () => {} };
  const chip = (name: string) => screen.getByText(name).closest("li")!;

  it("a file going up shows its progress as a bar and a percentage, and holds the send back", () => {
    const onSend = vi.fn();
    render(<ChatInput {...(base as ChatInputProps)} onSend={onSend} pendingFiles={files({ status: "uploading", progress: 0.4 })} onFileRemove={() => {}} />);
    const bar = within(chip("file1.pdf")).getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(within(chip("file1.pdf")).getByText("40%")).toBeTruthy();
    fireEvent.change(textbox(), { target: { value: "hi" } });
    expect((screen.getByTitle("Send message") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(textbox(), { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("a file that is going up can still be removed, and more can be added meanwhile", () => {
    const onRemove = vi.fn();
    render(<ChatInput {...(base as ChatInputProps)} pendingFiles={files({ status: "uploading", progress: 0.1 })} onFileRemove={onRemove} isUploading />);
    fireEvent.click(screen.getByRole("button", { name: "Remove file: file1.pdf" }));
    expect(onRemove).toHaveBeenCalledWith("f1");
    expect((screen.getByTitle("Attach files") as HTMLButtonElement).disabled).toBe(false);
  });

  it("a file uploaded for the message being sent shows a spinner and cannot be removed, as before", () => {
    render(<ChatInput {...(base as ChatInputProps)} pendingFiles={files({})} onFileRemove={() => {}} isUploading />);
    expect(within(chip("file1.pdf")).getByRole("status").getAttribute("aria-label")).toBe("Uploading file1.pdf");
    expect(screen.queryByRole("button", { name: /Remove file/ })).toBeNull();
    expect((screen.getByTitle("Attach files") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a stored file is marked ready and does not hold the send back", () => {
    const onSend = vi.fn();
    render(<ChatInput {...(base as ChatInputProps)} onSend={onSend} pendingFiles={files({ status: "ready", progress: 1 })} />);
    expect(within(chip("file1.pdf")).getByRole("img", { name: "file1.pdf is uploaded" })).toBeTruthy();
    expect(within(chip("file1.pdf")).queryByRole("progressbar")).toBeNull();
    fireEvent.click(screen.getByTitle("Send message"));
    expect(onSend).toHaveBeenCalledWith("");
  });

  it("a file that failed says why, offers a retry, and blocks the send until it is retried or removed", () => {
    const onSend = vi.fn();
    const onRetry = vi.fn();
    render(
      <ChatInput
        {...(base as ChatInputProps)}
        onSend={onSend}
        onFileRetry={onRetry}
        onFileRemove={() => {}}
        pendingFiles={files({ status: "failed", uploadError: "The file is too large" })}
      />
    );
    expect(chip("file1.pdf").getAttribute("title")).toBe("file1.pdf: upload failed. The file is too large");
    expect(screen.getByText("Some files could not be uploaded. Try again or remove them to send.")).toBeTruthy();
    fireEvent.change(textbox(), { target: { value: "hi" } });
    expect((screen.getByTitle("Send message") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Try uploading again: file1.pdf" }));
    expect(onRetry).toHaveBeenCalledWith("f1");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("a file whose text could not be read is tinted and explained", () => {
    render(<ChatInput {...(base as ChatInputProps)} pendingFiles={files({ conversionStatus: "failed" })} />);
    expect(chip("file1.pdf").getAttribute("title")).toBe("The text of file1.pdf could not be read, so the assistant may not see what is in it");
    expect(chip("file1.pdf").className).toContain("border-chat-warning");
  });
});

describe("ChatInput file counts and retention", () => {
  it("counts the files the conversation already holds against the limit", () => {
    render(<ChatInput onSend={() => {}} onFilesAdd={() => {}} maxFiles={3} filesHeld={2} fileCounter pendingFiles={files({})} />);
    expect(screen.getByText("3 of 3 files in this chat")).toBeTruthy();
    expect((screen.getByTitle("Attach files") as HTMLButtonElement).disabled).toBe(true);
  });

  it("leaves the paperclip on while there is room, and shows no counter for an empty chat or when asked not to", () => {
    render(<ChatInput onSend={() => {}} onFilesAdd={() => {}} maxFiles={3} filesHeld={1} fileCounter />);
    expect(screen.getByText("1 of 3 files in this chat")).toBeTruthy();
    expect((screen.getByTitle("Attach files") as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    render(<ChatInput onSend={() => {}} onFilesAdd={() => {}} maxFiles={3} filesHeld={0} fileCounter />);
    expect(screen.queryByText(/files in this chat/)).toBeNull();
    cleanup();
    render(<ChatInput onSend={() => {}} onFilesAdd={() => {}} maxFiles={3} filesHeld={2} />);
    expect(screen.queryByText(/files in this chat/)).toBeNull();
  });

  it("tells how long files are kept, only where files can be attached", () => {
    render(<ChatInput onSend={() => {}} onFilesAdd={() => {}} retentionDays={30} />);
    expect(screen.getByText(/Files are kept for 30 days/)).toBeTruthy();
    cleanup();
    render(<ChatInput onSend={() => {}} onFilesAdd={() => {}} retentionDays={1} />);
    expect(screen.getByText(/Files are kept for 1 day$/)).toBeTruthy();
    cleanup();
    render(<ChatInput onSend={() => {}} retentionDays={30} />);
    expect(screen.queryByText(/kept for/)).toBeNull();
    cleanup();
    render(<ChatInput onSend={() => {}} onFilesAdd={() => {}} retentionDays={0} />);
    expect(screen.queryByText(/kept for/)).toBeNull();
  });

  it("a send waits while files for the message are still being read", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} onFilesAdd={() => {}} pendingFiles={files({})} isUploading />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Send message"));
    });
    expect(onSend).not.toHaveBeenCalled();
  });
});
