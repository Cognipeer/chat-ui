import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { Chat, type ChatProps } from "./Chat";
import type { ChatTransport, FollowEventsOptions, StreamCallbacks } from "../../api";
import type { AgentInfo, Conversation, ConversationListItem, Message } from "../../types";

afterEach(cleanup);

// jsdom has no layout, so the message list's scroll-to-bottom has nothing to call
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const render = (ui: ReactElement) => rtlRender(<ChatI18nProvider locale="en">{ui}</ChatI18nProvider>);
const now = new Date();
let counter = 0;

const message = (partial: Partial<Message>): Message => ({
  id: "m",
  conversationId: "c1",
  role: "assistant",
  content: "",
  createdAt: now,
  updatedAt: now,
  ...partial,
});
const conversation = (partial: Partial<Conversation> = {}): Conversation => ({ id: "c1", agentId: "a", createdAt: now, updatedAt: now, ...partial });
const row = (partial: Partial<ConversationListItem> = {}): ConversationListItem => ({ id: "c1", agentId: "a", title: "Research", createdAt: now, updatedAt: now, ...partial });
const agent = (extra: Partial<AgentInfo> = {}): AgentInfo => ({ id: "a", name: "Alpha", ...extra });

function transportFor(options: {
  agents?: AgentInfo[];
  conversations?: ConversationListItem[];
  conversation?: Conversation;
  messages?: Message[];
  overrides?: Partial<ChatTransport>;
}): ChatTransport {
  const { agents = [agent()], conversations = [row()], conversation: conv = conversation(), messages = [] } = options;
  return {
    getAgents: async () => agents,
    getConversations: async () => ({ conversations, total: conversations.length, limit: 20, offset: 0, hasMore: false }),
    createConversation: async (p) => conversation({ id: "new", agentId: p.agentId }),
    getConversation: async () => ({ conversation: conv, messages }),
    deleteConversation: async () => {},
    sendMessage: async () => {
      throw new Error("unused");
    },
    sendMessageStream: async (_c, _o, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "new", messageId: "m9", content: "ok", timestamp: 1 });
    },
    ...options.overrides,
  };
}

function renderChat(transport: ChatTransport, props: Partial<ChatProps> = {}) {
  counter += 1;
  return render(<Chat baseUrl={`http://run-${counter}`} transport={transport} {...props} />);
}

const user = message({ id: "u1", role: "user", content: "check the build later" });
const fireAt = Math.floor(Date.now() / 1000) + 3600;
// the client turns the wire's fire_at into fireAt; a bare transport hands over the normalized shape
const reminders = [{ id: "r1", fireAt: fireAt * 1000, message: "look at the build" }];
const withReminders = agent({ capabilities: { reminders: true } });

describe("Chat reminders", () => {
  it("shows the strip, cancels through the transport and refreshes", async () => {
    let list = reminders;
    const cancelReminder = vi.fn(async () => {
      list = [];
      return { reminder: {} };
    });
    const followEvents = vi.fn((_id: string, o: FollowEventsOptions) => new Promise<void>((r) => o.signal?.addEventListener("abort", () => r())));
    renderChat(
      transportFor({
        agents: [withReminders],
        conversation: undefined,
        messages: [user],
        overrides: { followEvents, cancelReminder, getConversation: async () => ({ conversation: conversation({ reminders: list }), messages: [user] }) },
      }),
      { conversationId: "c1" }
    );
    await screen.findByText(/Will check back at/);
    // idle watcher: passive follow of the start of a run
    await waitFor(() => expect(followEvents).toHaveBeenCalled());
    expect(followEvents.mock.calls[0][1].types).toEqual(["session.status_running"]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel this reminder" }));
    await waitFor(() => expect(cancelReminder).toHaveBeenCalledWith("c1", "r1"));
    await waitFor(() => expect(screen.queryByText(/Will check back at/)).toBeNull());
  });

  it("starts the normal follower when the reminder fires", async () => {
    let emit!: FollowEventsOptions["onEvent"];
    const calls: FollowEventsOptions[] = [];
    const followEvents = vi.fn((_id: string, o: FollowEventsOptions) => {
      calls.push(o);
      if (calls.length === 1) emit = o.onEvent;
      return new Promise<void>((r) => o.signal?.addEventListener("abort", () => r()));
    });
    renderChat(
      transportFor({
        agents: [withReminders],
        conversation: undefined,
        messages: [user],
        overrides: {
          followEvents,
          getConversation: async () => ({ conversation: conversation({ reminders, runtime: { status: "idle", lastEventSeq: 5 } }), messages: [user] }),
        },
      }),
      { conversationId: "c1" }
    );
    await waitFor(() => expect(followEvents).toHaveBeenCalledTimes(1));
    expect(calls[0].after).toBe(5);
    act(() => emit({ seq: 6, type: "session.status_running", data: { trigger: "reminder" } }));
    await waitFor(() => expect(followEvents).toHaveBeenCalledTimes(2));
    expect(calls[1].after).toBe(5);
    // the reminder turn's wake-up message is a gray card, not a bubble
    act(() => calls[1].onEvent({ seq: 6, type: "user.message", data: { message_id: "u2", content: "[framed]", origin: "reminder", reminder: { message: "look at the build" } } }));
    expect(await screen.findByText("look at the build", { selector: "[data-chat-reminder] div" })).toBeTruthy();
    expect(screen.queryByText("[framed]")).toBeNull();
  });

  it("shows nothing without the capability", async () => {
    const followEvents = vi.fn(async () => {});
    renderChat(
      transportFor({
        conversation: undefined,
        messages: [user],
        overrides: { followEvents, getConversation: async () => ({ conversation: conversation({ reminders }), messages: [user] }) },
      }),
      { conversationId: "c1" }
    );
    await screen.findByText("check the build later");
    expect(screen.queryByText(/Will check back at/)).toBeNull();
    expect(followEvents).not.toHaveBeenCalled();
  });

  it("renders a stored reminder message as a card with the reminder text", async () => {
    const stored = message({
      id: "u9",
      role: "user",
      content: "[framed note for the model]",
      metadata: { origin: "reminder", reminder: { runId: "r", message: "check the deploy", setAt: 1 } },
    });
    renderChat(transportFor({ agents: [withReminders], conversation: undefined, messages: [stored] }), { conversationId: "c1" });
    expect(await screen.findByText("check the deploy")).toBeTruthy();
    expect(screen.queryByText("[framed note for the model]")).toBeNull();
    expect(document.querySelector("[data-chat-reminder]")).toBeTruthy();
  });
});
