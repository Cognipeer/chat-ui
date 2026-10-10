import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { Chat, type ChatProps } from "./Chat";
import type { ChatTransport, StreamCallbacks } from "../../api";
import type { AgentInfo, ConversationListItem, Message, PendingAction } from "../../types";

afterEach(cleanup);

// jsdom has no layout, so the message list's scroll-to-bottom has nothing to call
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const render = (ui: ReactElement) => rtlRender(<ChatI18nProvider locale="en">{ui}</ChatI18nProvider>);

const now = new Date();
const approval: PendingAction = { id: "a1", type: "tool_approval", toolName: "sandbox_exec", args: { cmd: "ls" } };

const message = (partial: Partial<Message>): Message => ({
  id: "m",
  conversationId: "c-b",
  role: "assistant",
  content: "",
  createdAt: now,
  updatedAt: now,
  ...partial,
});

// the history hook loads once per baseUrl + agent, so every test gets its own baseUrl
let counter = 0;

function transportFor(agents: AgentInfo[], conversations: ConversationListItem[], messages: Message[] = [], pendingActions: PendingAction[] = []): ChatTransport {
  return {
    getAgents: async () => agents,
    getConversations: async () => ({ conversations, total: conversations.length, limit: 20, offset: 0, hasMore: false }),
    createConversation: async (p) => ({ id: "new", agentId: p.agentId, createdAt: now, updatedAt: now }),
    getConversation: async (id) => ({
      conversation: { id, agentId: conversations.find((c) => c.id === id)?.agentId ?? agents[0].id, createdAt: now, updatedAt: now },
      messages,
      pendingActions,
    }),
    deleteConversation: async () => {},
    sendMessage: async () => {
      throw new Error("unused");
    },
    sendMessageStream: async () => {},
    resolveAction: async () => undefined,
  };
}

function renderChat(transport: ChatTransport, props: Partial<ChatProps> = {}) {
  counter += 1;
  return render(<Chat baseUrl={`http://test-${counter}`} transport={transport} enableFileUpload={false} {...props} />);
}

const alpha: AgentInfo = { id: "a", name: "Alpha" };
const beta: AgentInfo = { id: "b", name: "Beta", metadata: { enableFileUpload: true } };
const betaChat: ConversationListItem = { id: "c-b", agentId: "b", title: "Beta chat", createdAt: now, updatedAt: now };

describe("Chat follows the agent of an opened conversation", () => {
  it("selects the agent when a conversation is picked from the history", async () => {
    const onAgentChange = vi.fn();
    renderChat(transportFor([alpha, beta], [betaChat]), { onAgentChange });

    // the first agent is selected by default; its paperclip is off
    await screen.findByRole("button", { name: "Alpha" });
    expect(screen.queryByTitle("Attach files")).toBeNull();

    fireEvent.click(await screen.findByText("Beta chat"));

    await screen.findByRole("button", { name: "Beta" });
    expect(screen.getByTitle("Attach files")).toBeTruthy();
    expect(onAgentChange).toHaveBeenCalledWith("b");
  });

  it("selects the agent of a conversation opened through the conversationId prop", async () => {
    renderChat(transportFor([alpha, beta], [betaChat]), { conversationId: "c-b" });
    await screen.findByRole("button", { name: "Beta" });
    expect(await screen.findByTitle("Attach files")).toBeTruthy();
  });

  it("ignores a conversation whose agent is not in the list", async () => {
    const onAgentChange = vi.fn();
    const stranger: ConversationListItem = { ...betaChat, id: "c-x", agentId: "gone", title: "Old chat" };
    renderChat(transportFor([alpha, beta], [stranger]), { onAgentChange });
    await screen.findByRole("button", { name: "Alpha" });
    fireEvent.click(await screen.findByText("Old chat"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Alpha" })).toBeTruthy());
    expect(onAgentChange).not.toHaveBeenCalled();
  });
});

describe("Chat reads the composer mode from the agent's metadata", () => {
  const paused = [message({ id: "m1" })];
  const textbox = () => screen.getByRole("textbox") as HTMLTextAreaElement;

  async function open(agent: AgentInfo, props: Partial<ChatProps> = {}) {
    renderChat(transportFor([agent], [{ ...betaChat, agentId: agent.id }], paused, [approval]), { conversationId: "c-b", ...props });
    await screen.findByText("Allow sandbox_exec?");
  }

  it("blocks the composer by default", async () => {
    await open({ id: "a", name: "Alpha" });
    expect(textbox().disabled).toBe(true);
  });

  it("lets a message through (and warns it cancels) when the agent says cancel", async () => {
    await open({ id: "a", name: "Alpha", metadata: { pendingActionComposerMode: "cancel" } });
    expect(textbox().disabled).toBe(false);
    expect(screen.getByText(/Sending a message cancels that request/)).toBeTruthy();
  });

  it("overrides the prop in both directions", async () => {
    await open({ id: "a", name: "Alpha", metadata: { pendingActionComposerMode: "block" } }, { pendingActionComposerMode: "cancel" });
    expect(textbox().disabled).toBe(true);
    cleanup();

    await open({ id: "a", name: "Alpha", metadata: { pendingActionComposerMode: "cancel" } }, { pendingActionComposerMode: "block" });
    expect(textbox().disabled).toBe(false);
  });

  it("keeps the prop when the metadata says nothing usable", async () => {
    await open({ id: "a", name: "Alpha", metadata: { pendingActionComposerMode: "reject" } }, { pendingActionComposerMode: "cancel" });
    expect(textbox().disabled).toBe(false);
  });
});

describe("Chat accessibility", () => {
  it("labels the composer and makes the message list a log that is busy while a reply streams", async () => {
    let finish!: () => void;
    const transport: ChatTransport = {
      ...transportFor([alpha], []),
      sendMessageStream: (_c, _o, cb) =>
        new Promise<void>((resolve) => {
          cb.onStart?.({ type: "stream.start", conversationId: "new", messageId: "m", timestamp: 1 });
          cb.onText?.("Hel", "Hel");
          finish = () => {
            cb.onDone?.({ type: "stream.done", conversationId: "new", messageId: "m", content: "Hello", timestamp: 2 });
            resolve();
          };
        }),
    };
    renderChat(transport);
    const box = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(box, { target: { value: "hi" } });
    await act(async () => {
      fireEvent.click(screen.getByTitle("Send message"));
    });

    const log = screen.getByRole("log", { name: "Conversation" });
    expect(log.getAttribute("aria-live")).toBe("polite");
    expect(log.getAttribute("aria-busy")).toBe("true");
    await act(async () => finish());
    expect(screen.getByRole("log", { name: "Conversation" }).getAttribute("aria-busy")).toBe("false");
  });

  it("announces a failure as an alert, in the status colours", async () => {
    const transport: ChatTransport = {
      ...transportFor([alpha], []),
      sendMessageStream: async () => {
        throw Object.assign(new Error("slow down"), { code: "RATE_LIMITED", status: 429 });
      },
    };
    renderChat(transport);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "hi" } });
    await act(async () => {
      fireEvent.click(screen.getByTitle("Send message"));
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Too many requests. Wait a moment and try again.");
    expect(alert.className).toContain("text-chat-danger");
    expect(alert.className).not.toContain("red-");
  });

  it("tells the agent picker's state", async () => {
    renderChat(transportFor([alpha, beta], []));
    const picker = await screen.findByRole("button", { name: "Alpha" });
    expect(picker.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(picker);
    expect(picker.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /Alpha/, current: true })).toBeTruthy();
  });
});

describe("Chat theme", () => {
  it("exposes every colour key, status colours included, as CSS variables", async () => {
    const { container } = renderChat(transportFor([alpha], []), {
      themeColors: {
        bgPrimary: "#010101",
        bgHover: "#020202",
        textTertiary: "#030303",
        textInverse: "#040404",
        borderPrimary: "#050505",
        borderSecondary: "#060606",
        accentSecondary: "#070707",
        success: "#00aa00",
        successBg: "rgba(0, 170, 0, 0.1)",
        danger: "#aa0000",
        dangerBg: "rgba(170, 0, 0, 0.1)",
        warning: "#aa7700",
        warningBg: "rgba(170, 119, 0, 0.1)",
        info: "#0000aa",
        infoBg: "rgba(0, 0, 170, 0.1)",
      },
    });
    await screen.findByRole("textbox");
    const root = container.querySelector(".chat-theme-root") as HTMLElement;
    const variable = (name: string) => root.style.getPropertyValue(name);
    expect(variable("--chat-bg-hover")).toBe("#020202");
    expect(variable("--chat-text-inverse")).toBe("#040404");
    expect(variable("--chat-border-secondary")).toBe("#060606");
    expect(variable("--chat-accent-secondary")).toBe("#070707");
    expect(variable("--chat-success")).toBe("#00aa00");
    expect(variable("--chat-success-bg")).toBe("rgba(0, 170, 0, 0.1)");
    expect(variable("--chat-danger")).toBe("#aa0000");
    expect(variable("--chat-danger-bg")).toBe("rgba(170, 0, 0, 0.1)");
    expect(variable("--chat-warning")).toBe("#aa7700");
    expect(variable("--chat-warning-bg")).toBe("rgba(170, 119, 0, 0.1)");
    expect(variable("--chat-info")).toBe("#0000aa");
    expect(variable("--chat-info-bg")).toBe("rgba(0, 0, 170, 0.1)");
  });
});

describe("Chat files: drag and drop, paste, images", () => {
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  beforeEach(() => {
    URL.createObjectURL = () => "blob:http://localhost:3000/preview";
    URL.revokeObjectURL = () => {};
  });
  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
  });

  const photo = () => new File(["x"], "photo.png", { type: "image/png" });
  const uploadAgent: AgentInfo = { id: "u", name: "Uploader", metadata: { enableFileUpload: true } };
  const composerRoot = () => screen.getByRole("textbox").closest("div.border-t") as HTMLElement;

  it("takes a dropped image as a chip with its thumbnail, and sends it without text", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "new", messageId: "m", content: "Nice cat", timestamp: 2 });
    });
    renderChat({ ...transportFor([uploadAgent], []), sendMessageStream });
    await screen.findByRole("textbox");

    fireEvent.drop(composerRoot(), { dataTransfer: { types: ["Files"], files: [photo()] } });
    const chip = (await screen.findByText("photo.png")).closest("li") as HTMLElement;
    expect(chip.querySelector("img")?.getAttribute("src")).toBe("blob:http://localhost:3000/preview");

    fireEvent.click(screen.getByTitle("Send message"));
    await waitFor(() => expect(sendMessageStream).toHaveBeenCalledTimes(1));
    const sent = sendMessageStream.mock.calls[0][1] as { message: string; files?: Array<{ name: string }> };
    expect(sent.message).toBe("Please review the attached files.");
    expect(sent.files?.[0].name).toBe("photo.png");
    // the sent image shows in the conversation
    expect((await screen.findByRole("img", { name: "photo.png" })).getAttribute("src")).toBe("blob:http://localhost:3000/preview");
  });

  it("takes a pasted screenshot", async () => {
    renderChat(transportFor([uploadAgent], []));
    const box = await screen.findByRole("textbox");
    fireEvent.paste(box, { clipboardData: { files: [new File(["x"], "image.png", { type: "image/png" })], getData: () => "" } });
    expect(await screen.findByText(/^pasted-\d{14}\.png$/)).toBeTruthy();
  });

  it("warns when the agent does not read images, from its metadata or its capabilities", async () => {
    for (const agent of [
      { ...uploadAgent, metadata: { enableFileUpload: true, acceptsImages: false } },
      { ...uploadAgent, capabilities: { acceptsImages: false } },
    ]) {
      const { unmount } = renderChat(transportFor([agent], []));
      await screen.findByRole("textbox");
      fireEvent.drop(composerRoot(), { dataTransfer: { types: ["Files"], files: [photo()] } });
      expect(await screen.findByText(/can't see images/)).toBeTruthy();
      unmount();
    }
  });

  it("does not warn when the agent says nothing about images", async () => {
    renderChat(transportFor([uploadAgent], []));
    await screen.findByRole("textbox");
    fireEvent.drop(composerRoot(), { dataTransfer: { types: ["Files"], files: [photo()] } });
    await screen.findByText("photo.png");
    expect(screen.queryByText(/can't see images/)).toBeNull();
  });
});

describe("Chat cards", () => {
  const withArgs: PendingAction = {
    id: "a1",
    type: "tool_approval",
    toolName: "sandbox_exec",
    args: { cmd: "ls" },
  };
  const paused = [message({ id: "m1" })];

  async function open(agent: AgentInfo, props: Partial<ChatProps> = {}, pending: PendingAction[] = [withArgs], messages = paused) {
    renderChat(transportFor([agent], [{ ...betaChat, agentId: agent.id }], messages, pending), { conversationId: "c-b", ...props });
    await screen.findByText("Allow sandbox_exec?");
  }

  it("edits arguments only when allowed: by the prop, or by the agent's capability (which wins)", async () => {
    await open({ id: "a", name: "Alpha" });
    expect(screen.queryByRole("button", { name: "Edit arguments" })).toBeNull();
    cleanup();

    await open({ id: "a", name: "Alpha" }, { allowArgumentEdit: true });
    expect(screen.getByRole("button", { name: "Edit arguments" })).toBeTruthy();
    cleanup();

    await open({ id: "a", name: "Alpha", capabilities: { approvalArgsEdit: true } });
    expect(screen.getByRole("button", { name: "Edit arguments" })).toBeTruthy();
    cleanup();

    await open({ id: "a", name: "Alpha", capabilities: { approvalArgsEdit: false } }, { allowArgumentEdit: true });
    expect(screen.queryByRole("button", { name: "Edit arguments" })).toBeNull();
  });

  it("does not move focus to a card that arrives with a loaded conversation", async () => {
    await open({ id: "a", name: "Alpha" });
    expect(document.activeElement?.closest("[data-chat-card]")).toBeNull();
  });

  it("moves focus to a card that appears in a live turn, and announces it", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "new", messageId: "m1", content: "", status: "requires_action", pendingActions: [withArgs], timestamp: 1 });
    });
    renderChat({ ...transportFor([alpha], []), sendMessageStream });
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "list files" } });
    await act(async () => {
      fireEvent.click(screen.getByTitle("Send message"));
    });
    await screen.findByText("Allow sandbox_exec?");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("group", { name: "Allow sandbox_exec?" })));
    expect(screen.getByText("The assistant needs your approval: sandbox_exec")).toBeTruthy();
  });

  it("gives the keyboard back to the composer once the last card is answered", async () => {
    const resolveAction = vi.fn(async (_c: string, _a: string, _r: unknown, options?: { callbacks?: StreamCallbacks }) => {
      options?.callbacks?.onDone?.({ type: "stream.done", conversationId: "c-b", messageId: "m2", content: "Done.", timestamp: 2 });
      return undefined;
    });
    renderChat({ ...transportFor([alpha], [{ ...betaChat, agentId: "a" }], paused, [withArgs]), resolveAction }, { conversationId: "c-b" });
    await screen.findByText("Allow sandbox_exec?");
    const approve = screen.getByRole("button", { name: "Approve" });
    approve.focus();
    await act(async () => {
      fireEvent.click(approve);
    });
    await screen.findByText("Approved");
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Message" }));
  });

  it("does not take focus from someone who clicked elsewhere when a card is answered", async () => {
    const resolveAction = vi.fn(async (_c: string, _a: string, _r: unknown, options?: { callbacks?: StreamCallbacks }) => {
      options?.callbacks?.onDone?.({ type: "stream.done", conversationId: "c-b", messageId: "m2", content: "Done.", timestamp: 2 });
      return undefined;
    });
    renderChat({ ...transportFor([alpha], [{ ...betaChat, agentId: "a" }], paused, [withArgs]), resolveAction }, { conversationId: "c-b" });
    await screen.findByText("Allow sandbox_exec?");
    const newChat = screen.getByRole("button", { name: /New Chat/ });
    newChat.focus();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    });
    expect(document.activeElement).not.toBe(screen.queryByRole("textbox", { name: "Message" }));
  });
});

describe("Chat shows how a reloaded conversation's requests ended, when the server says", () => {
  const snapshot = (entries: unknown[]) => [
    message({ id: "u0", role: "user", content: "do things" }),
    message({ id: "m1", status: "completed", content: "All done.", metadata: { pendingActions: entries } }),
  ];

  it("renders approved-with-edits, denied with its reason, expired, cancelled and answered questions", async () => {
    renderChat(
      transportFor([alpha], [{ ...betaChat, agentId: "a" }], snapshot([
        { id: "a1", kind: "tool_approval", toolName: "sandbox_exec", args: { cmd: "ls" }, status: "resolved", resolution: { decision: "allow", approvedArgs: { cmd: "ls -la" }, rememberForSession: true } },
        { id: "a2", kind: "tool_approval", toolName: "web_fetch", args: { url: "x" }, status: "resolved", resolution: { decision: "deny", comment: "not that site" } },
        { id: "a3", kind: "tool_approval", toolName: "slow_tool", status: "expired" },
        { id: "a4", kind: "tool_approval", toolName: "other_tool", status: "cancelled" },
        { id: "q1", kind: "user_question", questions: [{ question: "Which env?" }], status: "resolved", resolution: { answers: { "Which env?": "staging" } } },
      ])),
      { conversationId: "c-b" }
    );
    await screen.findByText("All done.");
    expect(screen.getByText("Approved with edited arguments")).toBeTruthy();
    expect(screen.getByText("Remembered for this chat")).toBeTruthy();
    expect(screen.getByText(/Denied/).textContent).toContain("not that site");
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.getByText("staging")).toBeTruthy();
    expect(screen.getByText("Answered")).toBeTruthy();
    // nothing is waiting: the composer is open
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("keeps the old fallback when the server only lists the requests", async () => {
    renderChat(
      transportFor([alpha], [{ ...betaChat, agentId: "a" }], snapshot([{ id: "a1", kind: "tool_approval", toolName: "sandbox_exec" }])),
      { conversationId: "c-b" }
    );
    await screen.findByText("All done.");
    expect(screen.getByText("Answered")).toBeTruthy();
  });
});
