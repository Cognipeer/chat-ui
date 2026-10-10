import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { Chat, type ChatProps } from "./Chat";
import type { ChatTransport } from "../../api";
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
