import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ChatI18nProvider } from "../providers";
import { useChat } from "./useChat";
import type { ChatTransport, StreamCallbacks } from "../api";
import type { Conversation, Message, MessagesPage, PendingAction } from "../types";

const now = new Date();

const wrapper = ({ children }: { children: ReactNode }) => (
  <ChatI18nProvider locale="en">{children}</ChatI18nProvider>
);

const message = (id: string, partial: Partial<Message> = {}): Message => ({
  id,
  conversationId: "c1",
  role: id.startsWith("u") ? "user" : "assistant",
  content: id,
  createdAt: now,
  updatedAt: now,
  ...partial,
});

const conversation = (partial: Partial<Conversation> = {}): Conversation => ({
  id: "c1",
  agentId: "agent",
  createdAt: now,
  updatedAt: now,
  ...partial,
});

const page = (hasMoreBefore: boolean): MessagesPage => ({ limit: 2, order: "asc", hasMoreBefore, hasMoreAfter: false });

function makeTransport(overrides: Partial<ChatTransport> = {}): ChatTransport {
  return {
    getAgents: async () => [],
    getConversations: async () => ({ conversations: [], total: 0, limit: 20, offset: 0, hasMore: false }),
    createConversation: async (p) => conversation({ agentId: p.agentId }),
    getConversation: async () => ({ conversation: conversation(), messages: [] }),
    deleteConversation: async () => {},
    sendMessage: async () => {
      throw new Error("unused");
    },
    sendMessageStream: async (_c, _o, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m9", content: "ok", timestamp: 2 });
    },
    ...overrides,
  };
}

/**
 * A server that pages its history two messages at a time: the newest page without `before`,
 * the page just older than a message with it.
 */
function pagingServer(all: Message[]) {
  return vi.fn(async (_id: string, options?: { before?: string }) => {
    const end = options?.before ? all.findIndex((m) => m.id === options.before) : all.length;
    const start = Math.max(0, end - 2);
    return { conversation: conversation(), messages: all.slice(start, end), messagesPage: page(start > 0) };
  });
}

const history = [message("u1"), message("m1"), message("u2"), message("m2"), message("u3"), message("m3")];

describe("useChat: a long conversation the server pages", () => {
  it("knows older messages exist, fetches the page just older than the oldest shown and puts it in front", async () => {
    const getConversation = pagingServer(history);
    const { result } = renderHook(() => useChat({ transport: makeTransport({ getConversation }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    expect(result.current.messages.map((m) => m.id)).toEqual(["u3", "m3"]);
    expect(result.current.hasEarlierMessages).toBe(true);

    let more: boolean | undefined;
    await act(async () => {
      more = await result.current.loadEarlierMessages();
    });
    expect(more).toBe(true);
    expect(getConversation).toHaveBeenLastCalledWith("c1", { before: "u3" });
    expect(result.current.messages.map((m) => m.id)).toEqual(["u2", "m2", "u3", "m3"]);
    expect(result.current.hasEarlierMessages).toBe(true);

    await act(async () => {
      await result.current.loadEarlierMessages();
    });
    expect(getConversation).toHaveBeenLastCalledWith("c1", { before: "u2" });
    expect(result.current.messages.map((m) => m.id)).toEqual(history.map((m) => m.id));
    expect(result.current.hasEarlierMessages).toBe(false);

    // nothing left: no request is made
    getConversation.mockClear();
    await act(async () => {
      more = await result.current.loadEarlierMessages();
    });
    expect(more).toBe(false);
    expect(getConversation).not.toHaveBeenCalled();
  });

  it("asks once at a time, and ignores a message it already has", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const server = pagingServer(history);
    const getConversation = vi.fn(async (id: string, options?: { before?: string }) => {
      if (options?.before) await gate;
      const loaded = await server(id, options);
      // the older page overlaps what is shown
      return options?.before ? { ...loaded, messages: [...loaded.messages, message("u3")] } : loaded;
    });
    const { result } = renderHook(() => useChat({ transport: makeTransport({ getConversation }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    let first!: Promise<boolean>;
    let second: boolean | undefined;
    await act(async () => {
      first = result.current.loadEarlierMessages();
      second = await result.current.loadEarlierMessages();
    });
    expect(second).toBe(false);
    expect(result.current.isLoadingEarlierMessages).toBe(true);
    await act(async () => {
      release();
      await first;
    });
    expect(result.current.isLoadingEarlierMessages).toBe(false);
    expect(result.current.messages.map((m) => m.id)).toEqual(["u2", "m2", "u3", "m3"]);
  });

  it("keeps the older messages when the conversation is fetched again for the newest page", async () => {
    const getConversation = pagingServer(history);
    // the next send is refused as busy, which makes the page look at the conversation again
    const sendMessageStream = vi.fn(async () => {
      throw Object.assign(new Error("busy"), { code: "conversation_busy", status: 409 });
    });
    const { result } = renderHook(() => useChat({ transport: makeTransport({ getConversation, sendMessageStream }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    await act(async () => {
      await result.current.loadEarlierMessages();
    });
    expect(result.current.messages.map((m) => m.id)).toEqual(["u2", "m2", "u3", "m3"]);

    getConversation.mockClear();
    await act(async () => {
      await result.current.sendMessage("more");
    });
    await waitFor(() => expect(getConversation).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(["u2", "m2", "u3", "m3"]));
    expect(result.current.hasEarlierMessages).toBe(true);
  });

  it("settles a card in an older page: nothing there waits for an answer any more", async () => {
    const approval: PendingAction = { id: "a1", type: "tool_approval", toolName: "sandbox_exec" };
    const all = [
      message("u1"),
      message("m1", { status: "requires_action", pendingActions: [approval] }),
      message("u2"),
      message("m2", { content: "latest" }),
    ];
    const { result } = renderHook(() => useChat({ transport: makeTransport({ getConversation: pagingServer(all) }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    await act(async () => {
      await result.current.loadEarlierMessages();
    });
    expect(result.current.messages.map((m) => m.id)).toEqual(all.map((m) => m.id));
    expect(result.current.messages[1].actionStates?.a1.status).toBe("resolved");
    expect(result.current.awaitingAction).toBe(false);
  });

  it("says why when the older page cannot be fetched, and leaves what is shown alone", async () => {
    const server = pagingServer(history);
    const getConversation = vi.fn(async (id: string, options?: { before?: string }) => {
      if (options?.before) throw Object.assign(new Error("gone"), { code: "NOT_FOUND", status: 404 });
      return server(id, options);
    });
    const onError = vi.fn();
    const { result } = renderHook(() => useChat({ transport: makeTransport({ getConversation }), agentId: "agent", onError }), { wrapper });
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    let more: boolean | undefined;
    await act(async () => {
      more = await result.current.loadEarlierMessages();
    });
    expect(more).toBe(false);
    expect(result.current.error?.message).toBe("That conversation or item was not found. It may have been removed.");
    expect(onError).toHaveBeenCalled();
    expect(result.current.messages.map((m) => m.id)).toEqual(["u3", "m3"]);
    expect(result.current.hasEarlierMessages).toBe(true);
    expect(result.current.isLoadingEarlierMessages).toBe(false);
  });

  it("has nothing older for a server that does not page, and forgets it when the chat is cleared", async () => {
    const plain = vi.fn(async () => ({ conversation: conversation(), messages: [message("u1"), message("m1")] }));
    const none = renderHook(() => useChat({ transport: makeTransport({ getConversation: plain }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await none.result.current.loadConversation("c1");
    });
    expect(none.result.current.hasEarlierMessages).toBe(false);
    let more: boolean | undefined;
    await act(async () => {
      more = await none.result.current.loadEarlierMessages();
    });
    expect(more).toBe(false);

    const paged = renderHook(() => useChat({ transport: makeTransport({ getConversation: pagingServer(history) }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await paged.result.current.loadConversation("c1");
    });
    expect(paged.result.current.hasEarlierMessages).toBe(true);
    act(() => paged.result.current.clearMessages());
    expect(paged.result.current.hasEarlierMessages).toBe(false);
  });
});

describe("useChat: blob URLs of stored files", () => {
  const revoked: string[] = [];
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
    revoked.length = 0;
  });

  it("are released when another conversation is opened, including those of a client the hook replaced", async () => {
    let n = 0;
    URL.createObjectURL = () => `blob:stored/${n++}`;
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/content")) return new Response(new Blob([new Uint8Array([1])], { type: "image/png" }), { status: 200 });
      return new Response(JSON.stringify({ conversation: { id: "c1", agentId: "agent" }, messages: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });

    // no transport: the hook builds its own client, and builds another when the credentials change
    const { result, rerender } = renderHook(
      ({ authorization }: { authorization: string }) =>
        useChat({ baseUrl: "http://x", agentId: "agent", authorization, fetch: fetchMock as unknown as typeof fetch }),
      { wrapper, initialProps: { authorization: "Bearer one" } }
    );
    await act(async () => {
      await result.current.resolveFileUrl?.({ id: "f1", name: "a.png", mimeType: "image/png", size: 1 });
    });
    rerender({ authorization: "Bearer two" });
    await act(async () => {
      await result.current.resolveFileUrl?.({ id: "f2", name: "b.png", mimeType: "image/png", size: 1 });
    });
    // still on screen while the conversation stays open
    expect(revoked).toEqual([]);

    await act(async () => {
      await result.current.loadConversation("c2");
    });
    await waitFor(() => expect(revoked.sort()).toEqual(["blob:stored/0", "blob:stored/1"]));
  });
});
