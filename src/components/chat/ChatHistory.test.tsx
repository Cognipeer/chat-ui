import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { ChatHistory, type ChatHistoryProps } from "./ChatHistory";
import type { ConversationListItem } from "../../types";

afterEach(cleanup);

const render = (ui: ReactElement, locale: "en" | "tr" = "en") => rtlRender(<ChatI18nProvider locale={locale}>{ui}</ChatI18nProvider>);
const now = new Date();
const item = (id: string, extra: Partial<ConversationListItem> = {}): ConversationListItem => ({
  id, title: `Chat ${id}`, agentId: "a", createdAt: now, updatedAt: now, ...extra,
});

function setup(conversations: ConversationListItem[], props: Partial<ChatHistoryProps> = {}) {
  const onSelect = vi.fn();
  const onDelete = vi.fn();
  render(<ChatHistory conversations={conversations} onSelect={onSelect} onDelete={onDelete} {...props} />);
  return { onSelect, onDelete };
}

describe("ChatHistory status badges", () => {
  it("shows a badge on conversations that are working, waiting for the person, or stopped on their limit", () => {
    setup([
      item("run", { runtime: { status: "running", lastEventSeq: 1 } }),
      item("wait", { runtime: { status: "requires_action", lastEventSeq: 1 } }),
      item("paused", { runtime: { status: "budget_paused", lastEventSeq: 1 } }),
      item("spent", { budget: { maxCostUsd: 1, onReach: "stop" }, spentUsd: 1.2, runtime: { status: "idle", lastEventSeq: 1 } }),
      item("idle", { runtime: { status: "idle", lastEventSeq: 1 } }),
      item("none"),
    ]);
    const badge = (title: string) => within(screen.getByText(title).closest("li")!).queryByText(/Working|Waiting for you|Limit reached/)?.textContent;
    expect(badge("Chat run")).toBe("Working");
    expect(badge("Chat wait")).toBe("Waiting for you");
    expect(badge("Chat paused")).toBe("Limit reached");
    expect(badge("Chat spent")).toBe("Limit reached");
    expect(badge("Chat idle")).toBeUndefined();
    expect(badge("Chat none")).toBeUndefined();
  });

  it("can be turned off", () => {
    setup([item("wait", { runtime: { status: "requires_action", lastEventSeq: 1 } })], { showStatus: false });
    expect(screen.queryByText("Waiting for you")).toBeNull();
  });

  it("what the page knows about the selected conversation beats an older list", () => {
    setup(
      [item("a", { runtime: { status: "running", lastEventSeq: 1 } }), item("b", { runtime: { status: "running", lastEventSeq: 1 } })],
      { selectedId: "a", selectedStatus: "idle" }
    );
    const li = (title: string) => screen.getByText(title).closest("li")!;
    expect(within(li("Chat a")).queryByText("Working")).toBeNull();
    expect(within(li("Chat b")).queryByText("Working")).toBeTruthy();
  });

  it("the selected conversation can show waiting or the limit on its own", () => {
    setup([item("a")], { selectedId: "a", selectedStatus: "requires_action" });
    expect(screen.getByText("Waiting for you")).toBeTruthy();
    cleanup();
    setup([item("a")], { selectedId: "a", selectedStatus: "budget_paused" });
    expect(screen.getByText("Limit reached")).toBeTruthy();
  });

  it("speaks Turkish", () => {
    render(<ChatHistory conversations={[item("w", { runtime: { status: "requires_action", lastEventSeq: 1 } })]} onSelect={() => {}} />, "tr");
    expect(screen.getByText("Sizi bekliyor")).toBeTruthy();
  });
});

describe("ChatHistory keyboard", () => {
  it("every row is a real button that opens its conversation, and says which one is open", () => {
    const { onSelect } = setup([item("a"), item("b")], { selectedId: "b" });
    const buttons = screen.getAllByRole("button").filter((b) => b.hasAttribute("data-chat-conversation"));
    expect(buttons.map((b) => b.textContent)).toEqual([expect.stringContaining("Chat a"), expect.stringContaining("Chat b")]);
    expect(buttons[1].getAttribute("aria-current")).toBe("true");
    expect(buttons[0].getAttribute("aria-current")).toBeNull();
    fireEvent.click(buttons[0]);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });

  it("the list is a labelled list", () => {
    setup([item("a"), item("b")]);
    expect(within(screen.getByRole("list", { name: "Conversations" })).getAllByRole("listitem")).toHaveLength(2);
  });

  it("deleting is a button of its own, named after the conversation, that does not also open it", () => {
    const { onSelect, onDelete } = setup([item("a")]);
    fireEvent.click(screen.getByRole("button", { name: "Delete conversation: Chat a" }));
    expect(onDelete).toHaveBeenCalledWith("a");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("the delete button shows for a keyboard user as well as on hover", () => {
    setup([item("a")]);
    const className = screen.getByRole("button", { name: /Delete conversation/ }).className;
    expect(className).toContain("group-hover:opacity-100");
    expect(className).toContain("group-focus-within:opacity-100");
    expect(className).toContain("focus-visible:opacity-100");
  });

  it("arrow keys, Home and End move between the rows", () => {
    setup([item("a"), item("b"), item("c")]);
    const rows = screen.getAllByRole("button").filter((b) => b.hasAttribute("data-chat-conversation"));
    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: "ArrowDown" });
    fireEvent.keyDown(rows[2], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[2]);
    fireEvent.keyDown(rows[2], { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: "Home" });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: "End" });
    expect(document.activeElement).toBe(rows[2]);
  });

  it("Escape closes the sidebar where it is an overlay", () => {
    const onClose = vi.fn();
    setup([item("a")], { isOpen: true, onClose });
    fireEvent.keyDown(screen.getByRole("button", { name: "Chat a Just now" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
