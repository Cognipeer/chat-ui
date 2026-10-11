import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { MessageToolbar } from "./MessageToolbar";
import { MessageEditor } from "./MessageEditor";
import { ChatMessage } from "./ChatMessage";
import { ChatHistory, type ChatHistoryProps } from "./ChatHistory";
import { ChatEmptyState, InfoMarkdown } from "./ChatEmptyState";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { LegalFooter } from "./LegalFooter";
import { TermsGate } from "./TermsGate";
import { ExportMenu } from "./ExportMenu";
import { NotificationsMenu } from "./NotificationsMenu";
import type { ConversationListItem, Message } from "../../types";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

const render = (ui: ReactElement, locale: "en" | "tr" = "en") => rtlRender(<ChatI18nProvider locale={locale}>{ui}</ChatI18nProvider>);
const now = new Date();
const msg = (over: Partial<Message> = {}): Message => ({ id: "m", conversationId: "c", role: "assistant", content: "answer", createdAt: now, updatedAt: now, ...over });
const item = (id: string, extra: Partial<ConversationListItem> = {}): ConversationListItem => ({ id, title: `Chat ${id}`, agentId: "a", createdAt: now, updatedAt: now, ...extra });

describe("MessageToolbar", () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
  });

  it("copies the text and says so", async () => {
    render(<MessageToolbar text="the answer" copy />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied!" })).toBeTruthy());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("the answer");
    expect(screen.getByRole("status").textContent).toBe("Copied!");
  });

  it("falls back to the old copy command when the clipboard API is blocked", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("blocked"))) } });
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    render(<MessageToolbar text="the answer" copy />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(exec).toHaveBeenCalledWith("copy"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied!" })).toBeTruthy());
  });

  it("offers regenerate and edit only when given, and calls them", () => {
    const onRegenerate = vi.fn();
    const onEdit = vi.fn();
    render(<MessageToolbar text="x" copy={false} onRegenerate={onRegenerate} onEdit={onEdit} />);
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when it has nothing to offer", () => {
    const { container } = render(<MessageToolbar text="x" />);
    expect(container.querySelector("[data-persist], .chat-message-actions")).toBeNull();
  });

  describe("thumbs", () => {
    const feedback = (over: Record<string, unknown> = {}) => ({
      comments: true,
      reasons: ["inaccurate", "too_long", "other"],
      onSubmit: vi.fn(async () => true),
      ...over,
    });

    it("a thumbs-up sends at once, and pressing it again takes it back", async () => {
      const fb = feedback();
      const { rerender } = render(<MessageToolbar text="x" feedback={fb} />);
      fireEvent.click(screen.getByRole("button", { name: "Good response" }));
      await waitFor(() => expect(fb.onSubmit).toHaveBeenCalledWith({ rating: "up" }));
      rerender(
        <ChatI18nProvider locale="en">
          <MessageToolbar text="x" feedback={{ ...fb, current: { rating: "up" } }} />
        </ChatI18nProvider>
      );
      const up = screen.getByRole("button", { name: "Good response" });
      expect(up.getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(up);
      await waitFor(() => expect(fb.onSubmit).toHaveBeenLastCalledWith({ rating: null }));
    });

    it("a thumbs-down opens the reasons and sends them with the comment", async () => {
      const fb = feedback();
      render(<MessageToolbar text="x" feedback={fb} />);
      fireEvent.click(screen.getByRole("button", { name: "Bad response" }));
      const sheet = await screen.findByRole("dialog", { name: "What went wrong?" });
      const reason = within(sheet).getByRole("button", { name: "Too long" });
      fireEvent.click(reason);
      expect(reason.getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(within(sheet).getByRole("button", { name: "Other" }));
      fireEvent.change(within(sheet).getByLabelText(/Tell us more/), { target: { value: "  rambling  " } });
      fireEvent.click(within(sheet).getByRole("button", { name: "Send feedback" }));
      await waitFor(() =>
        expect(fb.onSubmit).toHaveBeenCalledWith({ rating: "down", reasons: ["too_long", "other"], comment: "rambling" })
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("leaves the sheet open when the rating is refused, and sends nothing when it is cancelled", async () => {
      const refused = feedback({ onSubmit: vi.fn(async () => false) });
      render(<MessageToolbar text="x" feedback={refused} />);
      fireEvent.click(screen.getByRole("button", { name: "Bad response" }));
      fireEvent.click(await screen.findByRole("button", { name: "Send feedback" }));
      await waitFor(() => expect(refused.onSubmit).toHaveBeenCalled());
      expect(screen.getByRole("dialog")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(refused.onSubmit).toHaveBeenCalledTimes(1);
    });

    it("closes on Escape and hides the comment box when comments are off", async () => {
      render(<MessageToolbar text="x" feedback={feedback({ comments: false })} />);
      fireEvent.click(screen.getByRole("button", { name: "Bad response" }));
      const sheet = await screen.findByRole("dialog");
      expect(within(sheet).queryByLabelText(/Tell us more/)).toBeNull();
      fireEvent.keyDown(sheet, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("caps the comment at 1000 characters", async () => {
      render(<MessageToolbar text="x" feedback={feedback()} />);
      fireEvent.click(screen.getByRole("button", { name: "Bad response" }));
      const box = (await screen.findByLabelText(/Tell us more/)) as HTMLTextAreaElement;
      expect(box.maxLength).toBe(1000);
    });

    it("speaks the labels in Turkish", () => {
      render(<MessageToolbar text="x" copy feedback={feedback()} />, "tr");
      expect(screen.getByRole("button", { name: "Kopyala" })).toBeTruthy();
      expect(screen.getByRole("group", { name: "Mesaj işlemleri" })).toBeTruthy();
    });
  });
});

describe("ChatMessage with a toolbar", () => {
  it("shows an AI label on answers when asked", () => {
    render(<ChatMessage message={msg()} aiLabel="AI-generated" />);
    expect(screen.getByText("AI-generated")).toBeTruthy();
    cleanup();
    render(<ChatMessage message={msg({ role: "user" })} aiLabel="AI-generated" />);
    expect(screen.queryByText("AI-generated")).toBeNull();
  });

  it("edits a user message in place: the editor replaces the text, saves and closes", async () => {
    const onSaveEdit = vi.fn(async () => true);
    render(<ChatMessage message={msg({ role: "user", content: "original" })} toolbar={{ copy: true, onEdit: () => undefined }} onSaveEdit={onSaveEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    const box = screen.getByRole("textbox", { name: "Edit your message" }) as HTMLTextAreaElement;
    expect(box.value).toBe("original");
    expect(screen.getByText(/replaces the assistant's answer/)).toBeTruthy();
    fireEvent.change(box, { target: { value: " changed " } });
    fireEvent.click(screen.getByRole("button", { name: "Save and send" }));
    await waitFor(() => expect(onSaveEdit).toHaveBeenCalledWith("changed"));
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it("keeps the editor open when the save is refused, and Escape cancels", async () => {
    const onSaveEdit = vi.fn(async () => false);
    render(<ChatMessage message={msg({ role: "user", content: "original" })} toolbar={{ copy: false, onEdit: () => undefined }} onSaveEdit={onSaveEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and send" }));
    await waitFor(() => expect(onSaveEdit).toHaveBeenCalled());
    expect(screen.getByRole("textbox")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("original")).toBeTruthy();
  });
});

describe("an answer that only paused for a tool of the host page", () => {
  const hostTool = { id: "h1", type: "client_tool" as const, toolName: "open_ticket", args: { id: 7 } };

  it("draws nothing: the page answers it unseen", () => {
    const { container } = render(<ChatMessage message={msg({ content: "", status: "requires_action", pendingActions: [hostTool] })} aiLabel="AI-generated" />);
    expect(container.firstChild).toBeNull();
  });

  it("still draws the answer when it has words, or when an approval waits next to the tool", () => {
    render(<ChatMessage message={msg({ content: "Opening it now", status: "requires_action", pendingActions: [hostTool] })} />);
    expect(screen.getByText("Opening it now")).toBeTruthy();
    cleanup();
    const approval = { id: "ap", type: "tool_approval" as const, toolName: "send_email" };
    render(<ChatMessage message={msg({ content: "", status: "requires_action", pendingActions: [hostTool, approval] })} />);
    expect(screen.getByText(/send_email/)).toBeTruthy();
  });
});

describe("MessageEditor", () => {
  it("will not send an empty message, and Ctrl+Enter saves", async () => {
    const onSave = vi.fn(async () => true);
    render(<MessageEditor initial="hello" onSave={onSave} onCancel={() => undefined} />);
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "Save and send" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: "again" } });
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("again"));
  });
});

describe("ChatHistory: rename, pin and bulk delete", () => {
  function setup(conversations: ConversationListItem[], props: Partial<ChatHistoryProps> = {}) {
    const onSelect = vi.fn();
    render(<ChatHistory conversations={conversations} onSelect={onSelect} {...props} />);
    return { onSelect };
  }
  /** The button that opens a conversation (the row, not its pin / rename / delete buttons) */
  const row = (id: string) => document.querySelector<HTMLElement>(`[data-chat-conversation="${id}"]`)!;

  it("renames in place: Enter saves, Escape keeps the old title", async () => {
    const onRename = vi.fn(async () => true);
    setup([item("a")], { onRename });
    fireEvent.click(screen.getByRole("button", { name: "Rename conversation: Chat a" }));
    const field = screen.getByRole("textbox", { name: "Conversation title" }) as HTMLInputElement;
    expect(field.value).toBe("Chat a");
    fireEvent.change(field, { target: { value: "  Budget  " } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(onRename).toHaveBeenCalledWith("a", "Budget"));
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());

    fireEvent.keyDown(row("a"), { key: "F2" });
    const again = screen.getByRole("textbox");
    fireEvent.change(again, { target: { value: "Something else" } });
    fireEvent.keyDown(again, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it("does not call rename for an unchanged title, and a double click on the title starts renaming", async () => {
    const onRename = vi.fn();
    setup([item("a")], { onRename });
    fireEvent.doubleClick(row("a"));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(onRename).not.toHaveBeenCalled();
  });

  it("pins and unpins, lists pinned first and marks them", () => {
    const onPin = vi.fn();
    setup([item("a"), item("b", { pinned: true }), item("c", { metadata: { pinned: true } })], { onPin });
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows[0]).toContain("Chat b");
    expect(rows[1]).toContain("Chat c");
    expect(rows[2]).toContain("Chat a");
    const unpin = screen.getByRole("button", { name: "Unpin conversation: Chat b" });
    expect(unpin.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(unpin);
    expect(onPin).toHaveBeenCalledWith("b", false);
    fireEvent.click(screen.getByRole("button", { name: "Pin conversation: Chat a" }));
    expect(onPin).toHaveBeenCalledWith("a", true);
  });

  it("selects several conversations, asks to confirm, deletes them, and keeps the ones that failed selected", async () => {
    const onBulkDelete = vi.fn(async () => ({ deleted: ["a"], failed: ["c"] }));
    const { onSelect } = setup([item("a"), item("b"), item("c")], { onBulkDelete });
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    // rows are checkboxes now and do not open the conversation
    fireEvent.click(screen.getByRole("checkbox", { name: "Chat a" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Chat c" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete selected (2)" }));
    const confirm = screen.getByRole("alertdialog");
    expect(within(confirm).getByText(/2 conversations will be deleted/)).toBeTruthy();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onBulkDelete).toHaveBeenCalledWith(["a", "c"]));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Chat c" }) as HTMLInputElement).checked).toBe(true);
  });

  it("can select all and none, and leave select mode", () => {
    setup([item("a"), item("b")], { onBulkDelete: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Select none" }));
    expect(screen.getByText("0 selected")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Delete selected (0)" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Select" })).toBeTruthy();
  });

  it("offers none of this unless the host passed the handlers", () => {
    setup([item("a")]);
    expect(screen.queryByRole("button", { name: /Rename|Pin|Select/ })).toBeNull();
  });

  it("shows what went wrong", () => {
    const onDismissError = vi.fn();
    setup([item("a")], { error: "The conversation could not be renamed", onDismissError });
    expect(screen.getByRole("alert").textContent).toContain("could not be renamed");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissError).toHaveBeenCalled();
  });
});

describe("ChatEmptyState", () => {
  it("shows the Markdown welcome and the starters, and picking one tells the host", () => {
    const onPick = vi.fn();
    render(
      <ChatEmptyState
        welcome={"# Hello **team**\n\n- one\n- [docs](https://example.com/docs)"}
        starters={[{ text: "Summarise my week", label: "Weekly summary", autoSend: true }, { text: "Draft an email" }]}
        onPick={onPick}
      />
    );
    expect(screen.getByRole("heading", { name: /Hello/ })).toBeTruthy();
    const link = screen.getByRole("link", { name: "docs" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    const chips = within(screen.getByRole("list", { name: "Suggested messages" })).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual(["Weekly summary", "Draft an email"]);
    fireEvent.click(chips[0]);
    expect(onPick).toHaveBeenCalledWith({ text: "Summarise my week", label: "Weekly summary", autoSend: true });
  });

  it("falls back to the default text, and shows the host's own empty state instead of the welcome", () => {
    render(<ChatEmptyState />);
    expect(screen.getByText("Start a conversation")).toBeTruthy();
    cleanup();
    render(<ChatEmptyState custom={<p>Custom!</p>} welcome="ignored" />);
    expect(screen.getByText("Custom!")).toBeTruthy();
    expect(screen.queryByText("ignored")).toBeNull();
  });

  it("does not run script, raw HTML or unsafe links from the welcome text", () => {
    const { container } = render(
      <InfoMarkdown>{'<script>window.__x=1</script><img src=x onerror="window.__x=1">\n\n[bad](javascript:alert(1))\n\n![ok](https://cdn.example/a.png)\n\n![bad](http://cdn.example/b.png)'}</InfoMarkdown>
    );
    expect(container.querySelector("script")).toBeNull();
    // the raw HTML is printed as text, never run
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("a")?.getAttribute("href") ?? "").not.toContain("javascript");
    const images = Array.from(container.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(images).toEqual(["https://cdn.example/a.png"]);
  });

  it("limits pictures to the allowed hosts", () => {
    const { container } = render(<InfoMarkdown allowedImageHosts={["cdn.example"]}>{"![a](https://cdn.example/a.png) ![b](https://other.example/b.png)"}</InfoMarkdown>);
    expect(Array.from(container.querySelectorAll("img")).map((i) => i.getAttribute("src"))).toEqual(["https://cdn.example/a.png"]);
  });

  it("disables the chips while the composer is closed", () => {
    render(<ChatEmptyState starters={[{ text: "Go" }]} onPick={vi.fn()} disabled />);
    expect((screen.getByRole("button", { name: "Go" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("AnnouncementBanner", () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const past = new Date(Date.now() - 3_600_000).toISOString();

  it("shows the due announcements, critical ones as alerts, with Markdown links", () => {
    render(
      <AnnouncementBanner
        announcements={[
          { id: "i", text: "New agent: **Billing**" },
          { id: "c", severity: "critical", text: "Maintenance at [status](https://status.example)" },
          { id: "later", text: "Not yet", startsAt: future },
          { id: "gone", text: "Over", endsAt: past },
        ]}
      />
    );
    expect(screen.getByRole("alert").textContent).toContain("Maintenance at status");
    expect(screen.getByRole("status").textContent).toContain("New agent: Billing");
    expect(screen.queryByText("Not yet")).toBeNull();
    expect(screen.queryByText("Over")).toBeNull();
    expect(screen.getByRole("link", { name: "status" }).getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("closes an announcement, remembers it, and tells the host", () => {
    const onDismiss = vi.fn();
    const list = [{ id: "i", text: "Hello there" }];
    const { unmount } = render(<AnnouncementBanner announcements={list} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss announcement" }));
    expect(screen.queryByText("Hello there")).toBeNull();
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: "i" }));
    unmount();
    render(<AnnouncementBanner announcements={list} />);
    expect(screen.queryByText("Hello there")).toBeNull();
  });

  it("has no close button when the announcement cannot be dismissed", () => {
    render(<AnnouncementBanner announcements={[{ id: "i", text: "Required reading", dismissible: false }]} />);
    expect(screen.queryByRole("button", { name: "Dismiss announcement" })).toBeNull();
  });

  it("renders nothing when nothing is due", () => {
    const { container } = render(<AnnouncementBanner announcements={[{ id: "x", text: "old", endsAt: past }]} />);
    expect(container.querySelector("[data-chat-announcements]")).toBeNull();
  });
});

describe("LegalFooter", () => {
  it("lists the safe links in order, opens them safely, and drops the rest", () => {
    render(
      <LegalFooter
        text="AI can make mistakes."
        links={{ privacy: "https://x.example/privacy", terms: "javascript:alert(1)", support: "mailto:help@x.example", aboutAi: "/about" }}
      />
    );
    expect(screen.getByText("AI can make mistakes.")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Legal" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Privacy", "https://x.example/privacy"],
      ["Support", "mailto:help@x.example"],
      ["How this AI works", "/about"],
    ]);
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
    expect(links[1].getAttribute("target")).toBeNull();
  });

  it("renders nothing without text or links", () => {
    const { container } = render(<LegalFooter links={{ terms: "javascript:x" }} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("TermsGate", () => {
  const terms = { title: "Acceptable use", body: "You agree to **be kind**.", version: 1 };

  it("shows the children at once when nothing is required", () => {
    render(<TermsGate required={false} {...terms} onAccept={vi.fn()}><p>chat</p></TermsGate>);
    expect(screen.getByText("chat")).toBeTruthy();
  });

  it("keeps the chat away until the terms are accepted, then shows it", async () => {
    let finish!: () => void;
    const onAccept = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<TermsGate required {...terms} onAccept={onAccept}><p>chat</p></TermsGate>);
    const dialog = screen.getByRole("dialog", { name: "Acceptable use" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(within(dialog).getByText("be kind").tagName).toBe("STRONG");
    expect(screen.queryByText("chat")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Accept and continue" }));
    expect((await screen.findByRole("button", { name: "Saving..." }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("chat")).toBeNull();
    await act(async () => finish());
    expect(await screen.findByText("chat")).toBeTruthy();
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("says when the acceptance could not be saved and lets the person try again", async () => {
    const onAccept = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    render(<TermsGate required {...terms} onAccept={onAccept}><p>chat</p></TermsGate>);
    fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
    expect((await screen.findByRole("alert")).textContent).toContain("could not be saved");
    expect(screen.queryByText("chat")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
    expect(await screen.findByText("chat")).toBeTruthy();
  });

  it("shows a friendly screen after declining, with a way back to the terms", () => {
    const onDecline = vi.fn();
    render(<TermsGate required {...terms} onAccept={vi.fn()} onDecline={onDecline}><p>chat</p></TermsGate>);
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(screen.getByText("You need to accept to use this portal")).toBeTruthy();
    expect(screen.queryByText("chat")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Review the terms" }));
    expect(screen.getByRole("dialog", { name: "Acceptable use" })).toBeTruthy();
  });

  it("asks again when the terms change", async () => {
    const onAccept = vi.fn(async () => {});
    const view = render(<TermsGate required {...terms} onAccept={onAccept}><p>chat</p></TermsGate>);
    fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
    await screen.findByText("chat");
    view.rerender(
      <ChatI18nProvider locale="en">
        <TermsGate required {...terms} version={2} onAccept={onAccept}><p>chat</p></TermsGate>
      </ChatI18nProvider>
    );
    expect(await screen.findByRole("dialog", { name: "Acceptable use" })).toBeTruthy();
    expect(screen.queryByText("chat")).toBeNull();
  });

  it("keeps Tab inside the dialog", () => {
    render(<TermsGate required {...terms} onAccept={vi.fn()}><p>chat</p></TermsGate>);
    const accept = screen.getByRole("button", { name: "Accept and continue" });
    accept.focus();
    fireEvent.keyDown(accept, { key: "Tab" });
    // from the last control the focus goes back to the first one (the terms text)
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Terms" }));
  });

  it("is in Turkish for a Turkish chat", () => {
    render(<TermsGate required {...terms} onAccept={vi.fn()}><p>chat</p></TermsGate>, "tr");
    expect(screen.getByRole("button", { name: "Kabul et ve devam et" })).toBeTruthy();
  });
});

describe("ExportMenu", () => {
  it("lists the formats in a menu, runs the chosen one and closes", async () => {
    const onExport = vi.fn(async () => {});
    render(<ExportMenu formats={["md", "json"]} onExport={onExport} />);
    const button = screen.getByRole("button", { name: "Export conversation" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    const menu = screen.getByRole("menu", { name: "Export conversation" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Markdown (.md)", "JSON (.json)"]);
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.click(items[1]);
    await waitFor(() => expect(onExport).toHaveBeenCalledWith("json"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape and returns the focus to its button", () => {
    render(<ExportMenu formats={["md"]} onExport={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Export conversation" });
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe("NotificationsMenu", () => {
  const alerts = (over: Record<string, unknown> = {}) => ({
    count: 0,
    available: true,
    prefs: { sound: true, desktop: false },
    desktopSupported: true,
    permission: "default" as const,
    setSound: vi.fn(),
    setDesktop: vi.fn(async () => true),
    ...over,
  });

  it("turns the sound and the desktop notifications on and off with switches", () => {
    const a = alerts();
    render(<NotificationsMenu alerts={a} offer={{ sound: true, desktop: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    const sound = screen.getByRole("switch", { name: "Play a sound" });
    expect(sound.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sound);
    expect(a.setSound).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("switch", { name: "Desktop notifications" }));
    expect(a.setDesktop).toHaveBeenCalledWith(true);
  });

  it("explains a browser that blocks them, and offers only what the host offers", () => {
    render(<NotificationsMenu alerts={alerts({ permission: "denied" })} offer={{ sound: false, desktop: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.queryByRole("switch", { name: "Play a sound" })).toBeNull();
    expect(screen.getByText(/Blocked in the browser/)).toBeTruthy();
  });
});
