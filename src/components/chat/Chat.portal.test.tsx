import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { createRef, type ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { Chat, type ChatProps } from "./Chat";
import type { ChatTransport, ResolveActionOptions, StreamCallbacks } from "../../api";
import type { AgentInfo, ChatController, ConversationListItem, Message } from "../../types";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const render = (ui: ReactElement, locale: "en" | "tr" = "en") => rtlRender(<ChatI18nProvider locale={locale}>{ui}</ChatI18nProvider>);
const now = new Date();
const msg = (partial: Partial<Message>): Message => ({ id: "m", conversationId: "c1", role: "assistant", content: "", createdAt: now, updatedAt: now, ...partial });

const user = msg({ id: "u1", role: "user", content: "first question" });
const answer = msg({ id: "a1", role: "assistant", content: "first answer" });
const chatItem: ConversationListItem = { id: "c1", agentId: "agent", title: "Budget talk", createdAt: now, updatedAt: now };

let counter = 0;

function makeTransport(overrides: Partial<ChatTransport> = {}, agents: AgentInfo[] = [{ id: "agent", name: "Helper" }]): ChatTransport {
  return {
    getAgents: async () => agents,
    getConversations: async () => ({ conversations: [chatItem], total: 1, limit: 20, offset: 0, hasMore: false }),
    createConversation: async (p) => ({ id: "c-new", agentId: p.agentId, createdAt: now, updatedAt: now }),
    getConversation: async (id) => ({ conversation: { id, agentId: "agent", title: "Budget talk", createdAt: now, updatedAt: now }, messages: [user, answer] }),
    deleteConversation: async () => {},
    sendMessage: async () => {
      throw new Error("unused");
    },
    sendMessageStream: async (_c, _o, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c-new", messageId: "a-new", content: "hello back", timestamp: 1 });
    },
    ...overrides,
  };
}

function renderChat(transport: ChatTransport, props: Partial<ChatProps> = {}) {
  counter += 1;
  return render(<Chat baseUrl={`http://portal-${counter}`} transport={transport} enableFileUpload={false} {...props} />);
}

const textbox = () => screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;

describe("nothing new appears until it is switched on", () => {
  it("has no toolbar, no label, no bell and no export on a plain chat", async () => {
    renderChat(makeTransport({ regenerateMessage: vi.fn(), editMessage: vi.fn(), sendFeedback: vi.fn() }), { conversationId: "c1" });
    await screen.findByText("first answer");
    expect(screen.queryByRole("group", { name: "Message actions" })).toBeNull();
    expect(document.querySelector("[data-chat-ai-label]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Notifications" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export conversation" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Rename|Pin conversation|Select/ })).toBeNull();
  });
});

describe("message actions", () => {
  it("copies, regenerates the newest answer, and edits the person's message", async () => {
    // a server that remembers: what it stored is what a fresh read returns
    let stored: Message[] = [user, answer];
    const regenerateMessage = vi.fn(async (_c: string, _m: string, options?: ResolveActionOptions) => {
      stored = [user, { ...answer, content: "second try" }];
      options?.callbacks?.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "a1", content: "second try", timestamp: 3 });
      return undefined;
    });
    const editMessage = vi.fn(async (_c: string, _m: string, _i: unknown, options?: ResolveActionOptions) => {
      stored = [{ ...user, content: "better question" }, msg({ id: "a2", content: "edited reply" })];
      options?.callbacks?.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "a2", content: "edited reply", timestamp: 3 });
      return undefined;
    });
    const getConversation = async (id: string) => ({ conversation: { id, agentId: "agent", title: "Budget talk", createdAt: now, updatedAt: now }, messages: stored });
    renderChat(makeTransport({ regenerateMessage, editMessage, getConversation }), { conversationId: "c1", messageActions: { copy: true, regenerate: true, edit: true } });
    await screen.findByText("first answer");

    // regenerate is under the newest answer only; edit under the person's message
    expect(screen.getAllByRole("button", { name: "Regenerate" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Edit message" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    await waitFor(() => expect(regenerateMessage).toHaveBeenCalledTimes(1));
    expect(regenerateMessage.mock.calls[0].slice(0, 2)).toEqual(["c1", "a1"]);
    await screen.findByText("second try");
    expect(screen.queryByText("first answer")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit your message" }), { target: { value: "better question" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and send" }));
    await waitFor(() => expect(editMessage).toHaveBeenCalledTimes(1));
    expect(editMessage.mock.calls[0].slice(0, 3)).toEqual(["c1", "u1", { content: "better question" }]);
    await screen.findByText("edited reply");
    expect(screen.queryByText("second try")).toBeNull();
  });

  it("leaves out what the transport cannot do", async () => {
    renderChat(makeTransport(), { conversationId: "c1", messageActions: { copy: true, regenerate: true, edit: true }, feedback: true });
    await screen.findByText("first answer");
    expect(screen.queryByRole("button", { name: "Regenerate" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit message" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Good response" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(2);
  });

  it("is narrowed by the agent's own metadata, never switched on by it", async () => {
    const agent: AgentInfo = { id: "agent", name: "Helper", metadata: { experience: { messageActions: { copy: true }, feedback: { enabled: true, comments: false } } } };
    // the agent publishes everything on; a host that set nothing gets nothing
    const bare = renderChat(makeTransport({ sendFeedback: vi.fn(async () => null) }, [agent]), { conversationId: "c1" });
    await screen.findByText("first answer");
    expect(screen.queryAllByRole("button", { name: "Copy" })).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Bad response" })).toBeNull();
    bare.unmount();

    // the host turns the features on; the agent only takes the comment box away
    renderChat(makeTransport({ sendFeedback: vi.fn(async () => null) }, [agent]), {
      conversationId: "c1",
      messageActions: { copy: true },
      feedback: { enabled: true, comments: true },
    });
    await screen.findByText("first answer");
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Copy" }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Bad response" }));
    expect(screen.queryByLabelText(/Tell us more/)).toBeNull();
  });

  it("does not offer regenerate or edit while an answer is being written", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "a2", timestamp: 1 });
      await gate;
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "a2", content: "late", timestamp: 2 });
    });
    renderChat(makeTransport({ sendMessageStream, regenerateMessage: vi.fn(), editMessage: vi.fn() }), {
      conversationId: "c1",
      messageActions: { regenerate: true, edit: true },
    });
    await screen.findByText("first answer");
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeTruthy();
    fireEvent.change(textbox(), { target: { value: "more" } });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    await waitFor(() => expect(sendMessageStream).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Regenerate" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit message" })).toBeNull();
    await act(async () => release());
    await screen.findByText("late");
  });
});

describe("feedback", () => {
  it("rates an answer and shows the rating", async () => {
    const sendFeedback = vi.fn(async () => ({ rating: "up" as const }));
    const onFeedback = vi.fn();
    renderChat(makeTransport({ sendFeedback }), { conversationId: "c1", feedback: true, onFeedback });
    await screen.findByText("first answer");
    fireEvent.click(screen.getByRole("button", { name: "Good response" }));
    await waitFor(() => expect(sendFeedback).toHaveBeenCalledWith("c1", "a1", { rating: "up" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Good response" }).getAttribute("aria-pressed")).toBe("true"));
    expect(onFeedback).toHaveBeenCalledWith({ conversationId: "c1", messageId: "a1", feedback: { rating: "up" } });
  });

  it("shows a rating the server stored", async () => {
    const rated = { ...answer, metadata: { feedback: { rating: "down", reasons: ["too_long"] } } };
    renderChat(makeTransport({ sendFeedback: vi.fn(), getConversation: async () => ({ conversation: { id: "c1", agentId: "agent", createdAt: now, updatedAt: now }, messages: [user, rated] }) }), {
      conversationId: "c1",
      feedback: true,
    });
    await screen.findByText("first answer");
    expect(screen.getByRole("button", { name: "Bad response" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("is not offered on a transcript", async () => {
    renderChat(makeTransport({ sendFeedback: vi.fn() }), { conversationId: "c1", feedback: true, readOnly: true });
    await screen.findByText("first answer");
    expect(screen.queryByRole("button", { name: "Good response" })).toBeNull();
  });
});

describe("starters and welcome", () => {
  const agent: AgentInfo = {
    id: "agent",
    name: "Helper",
    metadata: {
      welcome: "## Welcome back\n\nAsk me about **orders**.",
      starters: [{ text: "Where is my order?", label: "Track order" }, { text: "Show invoices", autoSend: true }],
    },
  };

  it("shows the agent's welcome and starters; a chip fills the composer, an auto-send chip sends", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c-new", messageId: "a-new", content: "here you go", timestamp: 1 });
    });
    renderChat(makeTransport({ sendMessageStream }, [agent]));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Track order" }));
    expect(textbox().value).toBe("Where is my order?");
    expect(sendMessageStream).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Show invoices" }));
    await waitFor(() => expect(sendMessageStream).toHaveBeenCalledTimes(1));
    expect(sendMessageStream.mock.calls[0][1]).toMatchObject({ message: "Show invoices" });
    await screen.findByText("here you go");
    // once the chat has begun the chips are gone
    expect(screen.queryByRole("button", { name: "Track order" })).toBeNull();
  });

  it("takes starters and a welcome from props when the agent has none", async () => {
    renderChat(makeTransport(), { starters: [{ text: "Hello there" }], welcome: "Props welcome" });
    expect(await screen.findByText("Props welcome")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hello there" })).toBeTruthy();
  });

  it("keeps the host's own empty state exactly as it was when there are no starters", async () => {
    renderChat(makeTransport(), { renderEmptyState: () => <p>Custom welcome</p>, welcome: "ignored" });
    expect(await screen.findByText("Custom welcome")).toBeTruthy();
    expect(screen.queryByText("ignored")).toBeNull();
  });

  it("puts starters under the host's own empty state", async () => {
    renderChat(makeTransport(), { renderEmptyState: () => <p>Custom welcome</p>, starters: [{ text: "Hello there" }] });
    expect(await screen.findByText("Custom welcome")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hello there" })).toBeTruthy();
  });
});

describe("deep links", () => {
  const two: AgentInfo[] = [
    { id: "alpha", name: "Alpha" },
    { id: "beta", name: "Beta" },
  ];

  it("opens on the linked agent when it exists, else on the first", async () => {
    renderChat(makeTransport({}, two), { initialAgentId: "beta" });
    expect(await screen.findByRole("button", { name: "Beta" })).toBeTruthy();
    cleanup();
    renderChat(makeTransport({}, two), { initialAgentId: "gone" });
    expect(await screen.findByRole("button", { name: "Alpha" })).toBeTruthy();
  });

  it("an agentId prop wins over the link", async () => {
    renderChat(makeTransport({}, two), { agentId: "alpha", initialAgentId: "beta" });
    expect(await screen.findByRole("button", { name: "Alpha" })).toBeTruthy();
  });

  it("fills the composer with the linked text without sending it", async () => {
    const sendMessageStream = vi.fn();
    renderChat(makeTransport({ sendMessageStream }), { initialInput: "How do I reset my password?" });
    await waitFor(() => expect(textbox().value).toBe("How do I reset my password?"));
    await new Promise((r) => setTimeout(r, 50));
    expect(sendMessageStream).not.toHaveBeenCalled();
  });

  it("sends the linked text once the chat is ready, and only once", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c-new", messageId: "a-new", content: "sent!", timestamp: 1 });
    });
    renderChat(makeTransport({ sendMessageStream }, two), { initialAgentId: "beta", initialInput: "status of ticket 7", autoSend: true });
    await screen.findByText("sent!");
    expect(sendMessageStream).toHaveBeenCalledTimes(1);
    expect(sendMessageStream.mock.calls[0][1]).toMatchObject({ message: "status of ticket 7" });
    // the agent chosen by the link is the one that answered
    expect(screen.getByRole("heading", { name: "Beta" }) ?? screen.getByText("Beta")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 60));
    expect(sendMessageStream).toHaveBeenCalledTimes(1);
  });

  it("does not send into an existing conversation", async () => {
    const sendMessageStream = vi.fn();
    renderChat(makeTransport({ sendMessageStream }), { conversationId: "c1", initialInput: "x", autoSend: true });
    await screen.findByText("first answer");
    await new Promise((r) => setTimeout(r, 60));
    expect(sendMessageStream).not.toHaveBeenCalled();
  });
});

describe("disclosure and announcements", () => {
  it("labels answers as AI-generated and shows the legal links under the composer", async () => {
    renderChat(makeTransport(), {
      conversationId: "c1",
      disclosure: { aiLabel: true, links: { privacy: "https://x.example/privacy", terms: "javascript:alert(1)" } },
      footerText: "Check important facts.",
    });
    await screen.findByText("first answer");
    expect(document.querySelectorAll("[data-chat-ai-label]")).toHaveLength(1);
    expect(screen.getByText("AI-generated")).toBeTruthy();
    expect(screen.getByText("Check important facts.")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Legal" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Privacy"]);
  });

  it("uses the operator's label text", async () => {
    renderChat(makeTransport(), { conversationId: "c1", disclosure: { aiLabel: true, labelText: "Written by a machine" } });
    expect(await screen.findByText("Written by a machine")).toBeTruthy();
  });

  it("shows announcements above the chat", async () => {
    renderChat(makeTransport(), { announcements: [{ id: "n1", severity: "warning", text: "Planned maintenance tonight" }] });
    expect(await screen.findByText("Planned maintenance tonight")).toBeTruthy();
  });
});

describe("export", () => {
  let created: Blob[] = [];
  let downloads: string[] = [];
  beforeEach(() => {
    created = [];
    downloads = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return "blob:x";
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
  });

  it("is hidden without a conversation, and offers the formats once there is one", async () => {
    renderChat(makeTransport(), { exportMenu: { enabled: true, formats: ["md", "json"] } });
    await screen.findByText("Start a conversation");
    expect(screen.queryByRole("button", { name: "Export conversation" })).toBeNull();
    cleanup();
    renderChat(makeTransport(), { conversationId: "c1", exportMenu: { enabled: true, formats: ["md", "json"] } });
    await screen.findByText("first answer");
    fireEvent.click(screen.getByRole("button", { name: "Export conversation" }));
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Markdown (.md)", "JSON (.json)"]);
  });

  it("builds a Markdown file from the messages on screen when the server cannot export", async () => {
    renderChat(makeTransport(), { conversationId: "c1", exportMenu: true });
    await screen.findByText("first answer");
    fireEvent.click(screen.getByRole("button", { name: "Export conversation" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Markdown (.md)" }));
    await waitFor(() => expect(downloads).toEqual(["Budget-talk.md"]));
    expect(created).toHaveLength(1);
    expect(created[0].type).toContain("text/markdown");
  });

  it("asks the server first, and downloads what it returns", async () => {
    const exportConversation = vi.fn(async () => ({ blob: new Blob(["# from server"], { type: "text/markdown" }), filename: "server-name.md", contentType: "text/markdown" }));
    renderChat(makeTransport({ exportConversation }), { conversationId: "c1", exportMenu: { enabled: true, includeTools: true } });
    await screen.findByText("first answer");
    fireEvent.click(screen.getByRole("button", { name: "Export conversation" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "JSON (.json)" }));
    await waitFor(() => expect(exportConversation).toHaveBeenCalledWith("c1", { format: "json", includeTools: true }));
    await waitFor(() => expect(downloads).toEqual(["server-name.md"]));
  });

  it("falls back to the screen when the server has no export route, and shows other failures", async () => {
    const exportConversation = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("nope"), { status: 404 }))
      .mockRejectedValueOnce(Object.assign(new Error("disabled"), { code: "export_disabled", status: 403 }));
    renderChat(makeTransport({ exportConversation }), { conversationId: "c1", exportMenu: true });
    await screen.findByText("first answer");
    fireEvent.click(screen.getByRole("button", { name: "Export conversation" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "JSON (.json)" }));
    await waitFor(() => expect(downloads).toEqual(["Budget-talk.json"]));
    fireEvent.click(screen.getByRole("button", { name: "Export conversation" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Markdown (.md)" }));
    expect((await screen.findByRole("alert")).textContent).toContain("turned off");
    expect(downloads).toEqual(["Budget-talk.json"]);
  });
});

describe("history actions", () => {
  it("renames and pins through the transport and reflects it in the list and the header", async () => {
    const renameConversation = vi.fn(async () => {});
    const pinConversation = vi.fn(async () => {});
    renderChat(makeTransport({ renameConversation, pinConversation }), { conversationId: "c1", historyActions: { rename: true, pin: true } });
    await screen.findByText("first answer");
    await screen.findByRole("button", { name: "Rename conversation: Budget talk" });
    fireEvent.click(screen.getByRole("button", { name: "Pin conversation: Budget talk" }));
    await waitFor(() => expect(pinConversation).toHaveBeenCalledWith("c1", true));
    fireEvent.click(screen.getByRole("button", { name: "Rename conversation: Budget talk" }));
    const field = screen.getByRole("textbox", { name: "Conversation title" });
    fireEvent.change(field, { target: { value: "Q4 plan" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(renameConversation).toHaveBeenCalledWith("c1", "Q4 plan"));
    await waitFor(() => expect(screen.getAllByText("Q4 plan").length).toBeGreaterThan(0));
  });

  it("offers the rename button only when the transport can rename", async () => {
    renderChat(makeTransport(), { conversationId: "c1", historyActions: { rename: true, pin: true } });
    await screen.findByText("first answer");
    await screen.findByText("Budget talk");
    expect(screen.queryByRole("button", { name: /Rename conversation/ })).toBeNull();
  });

  it("deletes the selected conversations and clears the open one", async () => {
    const deleteConversations = vi.fn(async (ids: string[]) => ({ deleted: ids, failed: [] }));
    renderChat(makeTransport({ deleteConversations }), { conversationId: "c1", historyActions: { bulkDelete: true } });
    await screen.findByText("first answer");
    await screen.findByText("Budget talk");
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Budget talk" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected (1)" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteConversations).toHaveBeenCalledWith(["c1"]));
    await waitFor(() => expect(screen.queryByText("first answer")).toBeNull());
  });
});

describe("the controller", () => {
  it("lets the host prefill the composer, send, and start a new chat", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c-new", messageId: "a-new", content: "from controller", timestamp: 1 });
    });
    const ref = createRef<ChatController>();
    renderChat(makeTransport({ sendMessageStream }), { controllerRef: ref });
    await screen.findByText("Start a conversation");
    act(() => ref.current!.prefill("typed for you"));
    expect(textbox().value).toBe("typed for you");
    act(() => ref.current!.prefill("sent for you", { send: true }));
    await waitFor(() => expect(sendMessageStream).toHaveBeenCalledTimes(1));
    expect(sendMessageStream.mock.calls[0][1]).toMatchObject({ message: "sent for you" });
    await screen.findByText("from controller");
    act(() => ref.current!.newChat());
    await screen.findByText("Start a conversation");
  });
});

const historyRow = (id: string) =>
  waitFor(() => {
    const row = document.querySelector<HTMLButtonElement>(`button[data-chat-conversation="${id}"]`);
    if (!row) throw new Error(`no history row ${id}`);
    return row;
  });

describe("the conversation the host keeps in its address", () => {
  it("tells the host a new chat's id once it exists, an opened conversation, and a new chat", async () => {
    const onConversationChange = vi.fn();
    renderChat(makeTransport(), { onConversationChange });
    await screen.findByText("Start a conversation");
    expect(onConversationChange).not.toHaveBeenCalled();

    fireEvent.change(textbox(), { target: { value: "hi" } });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    await screen.findByText("hello back");
    expect(onConversationChange.mock.calls).toEqual([["c-new"]]);

    fireEvent.click(await historyRow("c1"));
    await screen.findByText("first answer");
    expect(onConversationChange).toHaveBeenLastCalledWith("c1");

    fireEvent.click(screen.getAllByRole("button", { name: "New Chat" })[0]);
    await screen.findByText("Start a conversation");
    expect(onConversationChange.mock.calls).toEqual([["c-new"], ["c1"], [null]]);
  });

  it("stays quiet for the conversation it opened with, and says null when that one is deleted", async () => {
    const onConversationChange = vi.fn();
    renderChat(makeTransport(), { conversationId: "c1", onConversationChange });
    await screen.findByText("first answer");
    // opening it again from the list is no change
    fireEvent.click(await historyRow("c1"));
    await screen.findByText("first answer");
    expect(onConversationChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete conversation: Budget talk" }));
    await waitFor(() => expect(screen.queryByText("first answer")).toBeNull());
    expect(onConversationChange.mock.calls).toEqual([[null]]);
  });
});

describe("notifications", () => {
  it("shows the bell only when the host offers a sound or desktop notifications", async () => {
    renderChat(makeTransport(), { notifications: { tabBadge: true } });
    await screen.findByText("Start a conversation");
    expect(screen.queryByRole("button", { name: "Notifications" })).toBeNull();
    cleanup();
    renderChat(makeTransport(), { notifications: { tabBadge: true, sound: true, desktop: "opt_in" } });
    fireEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    expect(screen.getByRole("switch", { name: "Play a sound" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Desktop notifications" })).toBeTruthy();
  });
});

describe("Turkish", () => {
  it("speaks Turkish across the new surfaces", async () => {
    renderChat(makeTransport({ sendFeedback: vi.fn() }), {
      conversationId: "c1",
      messageActions: { copy: true },
      feedback: true,
      disclosure: { aiLabel: true },
    });
    await screen.findByText("first answer");
    expect(screen.getAllByText("AI-generated").length).toBeGreaterThan(0);
    cleanup();
    render(<Chat baseUrl="http://tr-1" transport={makeTransport({ sendFeedback: vi.fn() })} conversationId="c1" enableFileUpload={false} messageActions={{ copy: true }} feedback disclosure={{ aiLabel: true }} />, "tr");
    await screen.findByText("first answer");
    expect(screen.getAllByText("Yapay zekâ tarafından üretildi").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "İyi yanıt" }).length).toBeGreaterThan(0);
  });
});
