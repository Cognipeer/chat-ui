import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { Chat, type ChatProps } from "./Chat";
import type { ChatTransport, StreamCallbacks } from "../../api";
import type { AgentInfo, ConversationListItem, Message } from "../../types";

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


const withReasoning = msg({ id: "a1", role: "assistant", content: "first answer", reasoning: "my thoughts" });
const convo = (id: string) => ({ conversation: { id, agentId: "agent", title: "Budget talk", createdAt: now, updatedAt: now }, messages: [user, withReasoning] });

describe("reasoning display", () => {
  it("shows the Thinking block by default", async () => {
    renderChat(makeTransport({ getConversation: async (id) => convo(id) }), { conversationId: "c1" });
    await screen.findByText("first answer");
    expect(screen.getByTestId("thinking-block")).toBeTruthy();
  });

  it("hides it with showReasoning={false}", async () => {
    renderChat(makeTransport({ getConversation: async (id) => convo(id) }), { conversationId: "c1", showReasoning: false });
    await screen.findByText("first answer");
    expect(screen.queryByTestId("thinking-block")).toBeNull();
  });

  it("hides it when the agent says showReasoning: false", async () => {
    renderChat(makeTransport({ getConversation: async (id) => convo(id) }, [{ id: "agent", name: "Helper", showReasoning: false }]), { conversationId: "c1", agentId: "agent" });
    await screen.findByText("first answer");
    expect(screen.queryByTestId("thinking-block")).toBeNull();
  });
});
