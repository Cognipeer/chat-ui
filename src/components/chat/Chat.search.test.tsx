import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { Chat } from "./Chat";
import type { ChatTransport } from "../../api";
import type { ConversationListItem, Message } from "../../types";

const scrollIntoView = vi.fn();
const scrollTo = vi.fn();
beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
  HTMLElement.prototype.scrollTo = scrollTo as unknown as HTMLElement["scrollTo"];
});
afterEach(() => {
  cleanup();
  scrollIntoView.mockClear();
  scrollTo.mockClear();
});

const render = (ui: ReactElement) => rtlRender(<ChatI18nProvider locale="en">{ui}</ChatI18nProvider>);
const now = new Date();
const msg = (id: string, role: Message["role"], content: string): Message => ({ id, conversationId: "c1", role, content, createdAt: now, updatedAt: now });
const row: ConversationListItem = { id: "c1", agentId: "agent", title: "Budget talk", createdAt: now, updatedAt: now };
const hit: ConversationListItem = {
  ...row,
  searchMatch: { field: "message", messageId: "u2", role: "user", snippet: "…the quarterly forecast…" },
};

function transport(extra: Partial<ChatTransport> = {}): ChatTransport {
  return {
    getAgents: async () => [{ id: "agent", name: "Helper" }],
    getConversations: async () => ({ conversations: [row], total: 1, limit: 20, offset: 0, hasMore: false }),
    createConversation: async (p) => ({ id: "c-new", agentId: p.agentId, createdAt: now, updatedAt: now }),
    getConversation: async (id) => ({
      conversation: { id, agentId: "agent", title: "Budget talk", createdAt: now, updatedAt: now },
      messages: [msg("u1", "user", "hello there"), msg("a1", "assistant", "hi"), msg("u2", "user", "the quarterly forecast"), msg("a2", "assistant", "sure")],
    }),
    deleteConversation: async () => {},
    sendMessage: async () => {
      throw new Error("unused");
    },
    sendMessageStream: async () => {},
    ...extra,
  };
}

describe("Chat conversation search", () => {
  it("searches on the server and opens a hit at its message, scrolling the list and not the page", async () => {
    const searchConversations = vi.fn(async (_q: string, _o?: unknown) => ({ conversations: [hit], total: 1, limit: 50, offset: 0, hasMore: false, searchMode: "full" as const }));
    render(<Chat baseUrl="http://s1" transport={transport({ searchConversations, getSearchMode: async () => "full" })} enableMessageSearch enableFileUpload={false} />);
    await screen.findByText("Budget talk");
    const input = screen.getByRole("textbox", { name: "Search chats..." });
    expect(searchConversations).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "forecast" } });
    await waitFor(() => expect(document.querySelector("[data-chat-snippet]")?.textContent).toBe("…the quarterly forecast…"), { timeout: 2000 });
    expect(searchConversations.mock.calls[0][0]).toBe("forecast");
    expect((searchConversations.mock.calls[0] as unknown[])[1]).toMatchObject({ limit: 50 });

    fireEvent.click(document.querySelector<HTMLElement>("[data-chat-conversation='c1']")!);
    await screen.findByText("the quarterly forecast", { selector: "div,p,span" });
    await waitFor(() => expect(document.querySelector("[data-chat-message-id='u2']")?.classList.contains("ring-2")).toBe(true));
    // the message list scrolled itself; nothing scrolled the page
    const jumped = scrollTo.mock.calls.some((call) => typeof (call[0] as { top?: number } | undefined)?.top === "number");
    expect(jumped).toBe(true);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.querySelector("[data-chat-message-id='u1']")?.classList.contains("ring-2")).toBe(false);
  });

  it("filters the loaded titles when the transport cannot search", async () => {
    render(<Chat baseUrl="http://s2" transport={transport()} enableMessageSearch enableFileUpload={false} />);
    await screen.findByText("Budget talk");
    fireEvent.change(screen.getByRole("textbox", { name: "Search chats..." }), { target: { value: "zzz" } });
    expect(await screen.findByText("No matching conversations")).toBeTruthy();
  });

  it("uses local filtering when the server reports no search", async () => {
    const searchConversations = vi.fn(async () => ({ conversations: [], total: 0, limit: 50, offset: 0, hasMore: false }));
    render(<Chat baseUrl="http://s3" transport={transport({ searchConversations, getSearchMode: async () => false })} enableMessageSearch enableFileUpload={false} />);
    await screen.findByText("Budget talk");
    fireEvent.change(screen.getByRole("textbox", { name: "Search chats..." }), { target: { value: "budget" } });
    await new Promise((r) => setTimeout(r, 400));
    expect(searchConversations).not.toHaveBeenCalled();
    expect(screen.getByText("Budget talk")).toBeTruthy();
  });
});
