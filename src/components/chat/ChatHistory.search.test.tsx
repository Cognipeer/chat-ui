import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { ChatHistory, type ChatHistoryProps } from "./ChatHistory";
import type { ConversationListItem } from "../../types";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const render = (ui: ReactElement, locale: "en" | "tr" = "en") => rtlRender(<ChatI18nProvider locale={locale}>{ui}</ChatI18nProvider>);
const now = new Date();
const item = (id: string, extra: Partial<ConversationListItem> = {}): ConversationListItem => ({
  id, title: `Chat ${id}`, agentId: "a", createdAt: now, updatedAt: now, ...extra,
});
const box = () => screen.getByRole("textbox", { name: "Search chats..." }) as HTMLInputElement;
const type = (value: string) => fireEvent.change(box(), { target: { value } });
const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

type Search = NonNullable<ChatHistoryProps["searchConversations"]>;
function setup(search: Search | undefined, conversations: ConversationListItem[] = [item("local-1"), item("local-2")]) {
  const onSelect = vi.fn();
  render(<ChatHistory conversations={conversations} onSelect={onSelect} enableSearch searchConversations={search} />);
  return { onSelect };
}

describe("ChatHistory server search", () => {
  it("waits 250 ms after the last key and asks once", async () => {
    const search = vi.fn<Search>(async () => ({ conversations: [item("hit")] }));
    setup(search);
    type("bu");
    await flush(200);
    type("bud");
    await flush(200);
    expect(search).not.toHaveBeenCalled();
    await flush(60);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toBe("bud");
    expect(screen.getByText("Chat hit")).toBeTruthy();
  });

  it("does not ask for one character, and filters the loaded titles instead", async () => {
    const search = vi.fn<Search>(async () => ({ conversations: [] }));
    setup(search, [item("alpha"), item("beta")]);
    type("l");
    await flush(400);
    expect(search).not.toHaveBeenCalled();
    expect(screen.getByText("Chat alpha")).toBeTruthy();
    expect(screen.queryByText("Chat beta")).toBeNull();
  });

  it("cancels the request in flight when the text changes, and ignores its late answer", async () => {
    const signals: AbortSignal[] = [];
    const resolvers: Array<(r: { conversations: ConversationListItem[] }) => void> = [];
    const search: Search = (_q, signal) => {
      signals.push(signal);
      return new Promise((resolve) => resolvers.push(resolve));
    };
    setup(search);
    type("first");
    await flush(260);
    type("second");
    expect(signals[0].aborted).toBe(true);
    await flush(260);
    expect(signals).toHaveLength(2);
    resolvers[1]({ conversations: [item("new")] });
    await flush();
    resolvers[0]({ conversations: [item("stale")] });
    await flush();
    expect(screen.getByText("Chat new")).toBeTruthy();
    expect(screen.queryByText("Chat stale")).toBeNull();
  });

  it("shows loading, then the empty state", async () => {
    let resolve: (r: { conversations: ConversationListItem[] }) => void = () => {};
    setup(() => new Promise((r) => (resolve = r)));
    type("nothing");
    expect(screen.getByRole("status").textContent).toBe("Searching…");
    expect(screen.queryByText("No matching conversations")).toBeNull();
    await flush(260);
    resolve({ conversations: [] });
    await flush();
    expect(screen.getByText("No matching conversations")).toBeTruthy();
  });

  it("says when only titles were searched, and when the search failed", async () => {
    const search = vi.fn<Search>().mockResolvedValueOnce({ conversations: [item("t")], searchMode: "title" }).mockRejectedValueOnce(new Error("boom"));
    setup(search);
    type("title");
    await flush(260);
    expect(screen.getByText("Searching titles only")).toBeTruthy();
    type("broken");
    await flush(260);
    expect(screen.getByText("Search failed. Try again.")).toBeTruthy();
  });

  it("marks the matched text in the title and the snippet, as text and never as markup", async () => {
    const snippet = "…see <img src=x onerror=alert(1)> in the Budget plan…";
    setup(async () => ({
      conversations: [item("m", { title: "Budget talk", searchMatch: { field: "message", messageId: "m9", role: "user", snippet } })],
    }));
    type("budget");
    await flush(260);
    const marks = Array.from(document.querySelectorAll("mark")).map((m) => m.textContent);
    expect(marks).toEqual(["Budget", "Budget"]);
    const shown = document.querySelector("[data-chat-snippet]")!;
    expect(shown.textContent).toBe(snippet);
    expect(shown.querySelector("img")).toBeNull();
  });

  it("highlights a query that is markup without turning it into elements", async () => {
    setup(async () => ({
      conversations: [item("x", { title: "a <b>bold</b> idea", searchMatch: { field: "title", snippet: "a <b>bold</b> idea" } })],
    }));
    type("<b>bold");
    await flush(260);
    expect(document.querySelector("li b")).toBeNull();
    expect(document.querySelector("mark")!.textContent).toBe("<b>bold");
  });

  it("a click on a hit selects it with its match", async () => {
    const hit = item("hit", { searchMatch: { field: "message", messageId: "m1", snippet: "…budget…" } });
    const { onSelect } = setup(async () => ({ conversations: [hit] }));
    type("budget");
    await flush(260);
    fireEvent.click(screen.getByText("Chat hit"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "hit", searchMatch: expect.objectContaining({ messageId: "m1" }) }));
  });

  it("Escape clears the search and brings the loaded list back", async () => {
    setup(async () => ({ conversations: [item("hit")] }));
    type("budget");
    await flush(260);
    expect(screen.queryByText("Chat local-1")).toBeNull();
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(box().value).toBe("");
    expect(screen.getByText("Chat local-1")).toBeTruthy();
  });

  it("without server search it filters the loaded titles", async () => {
    setup(undefined, [item("alpha"), item("beta")]);
    type("bet");
    await flush(400);
    expect(screen.getByText("Chat beta")).toBeTruthy();
    expect(screen.queryByText("Chat alpha")).toBeNull();
  });

  it("speaks Turkish", async () => {
    render(<ChatHistory conversations={[]} onSelect={() => {}} enableSearch searchConversations={() => new Promise(() => {})} />, "tr");
    fireEvent.change(screen.getByRole("textbox", { name: "Sohbetlerde ara..." }), { target: { value: "bütçe" } });
    expect(screen.getByRole("status").textContent).toBe("Aranıyor…");
  });
});
