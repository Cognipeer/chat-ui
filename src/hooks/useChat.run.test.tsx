import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ChatI18nProvider } from "../providers";
import { useChat } from "./useChat";
import type { ChatTransport, FollowEventsOptions, StreamCallbacks } from "../api";
import type { Conversation, ConversationEvent, Message, PendingAction } from "../types";

const now = new Date();

const wrapper = ({ children }: { children: ReactNode }) => (
  <ChatI18nProvider locale="en">{children}</ChatI18nProvider>
);

const message = (partial: Partial<Message> = {}): Message => ({
  id: "m1",
  conversationId: "c1",
  role: "assistant",
  content: "",
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

const approval: PendingAction = { id: "a1", type: "tool_approval", toolName: "sandbox_exec", args: { cmd: "ls" } };

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
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m2", content: "ok", timestamp: 2 });
    },
    ...overrides,
  };
}

/** A promise a test settles by hand. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const event = (type: string, data: Record<string, unknown> = {}, seq?: number): ConversationEvent => ({
  type,
  data,
  ...(seq !== undefined ? { seq } : {}),
});

describe("useChat: a turn that is still running when the conversation opens", () => {
  const user = message({ id: "u1", role: "user", content: "research it" });

  it("follows the event log from the runtime's last event, shows the live turn, then loads the stored answer", async () => {
    const getConversation = vi
      .fn()
      .mockResolvedValueOnce({
        conversation: conversation({ runtime: { status: "running", lastEventSeq: 7, activeRunId: "run_1" } }),
        messages: [user],
      })
      .mockResolvedValue({
        conversation: conversation({ runtime: { status: "idle", stopReason: "end_turn", lastEventSeq: 12 } }),
        messages: [user, message({ id: "m2", content: "Here is the report." })],
      });
    const gate = deferred();
    const followEvents = vi.fn(async (_id: string, options: FollowEventsOptions) => {
      options.onEvent(event("agent.tool_use", { tool_call_id: "t1", name: "web_search", args: { q: "cats" } }, 8));
      options.onEvent(event("agent.message.delta", { text: "Here is " }));
      options.onEvent(event("agent.message.delta", { text: "the report." }));
      await gate.promise;
      options.onEvent(event("agent.message", { content: "Here is the report.", message_id: "m2", stop_reason: "end_turn" }, 11));
      options.onEvent(event("session.status_idle", { stop_reason: "end_turn" }, 12));
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, followEvents }), agentId: "agent" }),
      { wrapper }
    );

    await act(async () => {
      await result.current.loadConversation("c1");
    });

    expect(followEvents).toHaveBeenCalledTimes(1);
    expect(followEvents.mock.calls[0][0]).toBe("c1");
    expect(followEvents.mock.calls[0][1].after).toBe(7);
    // the live turn is on screen: it is streaming, but not ours
    await waitFor(() => expect(result.current.streamingText).toBe("Here is the report."));
    expect(result.current.isFollowing).toBe(true);
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.composerState).toBe("following");
    expect(Array.from(result.current.activeToolCalls.values()).map((c) => c.name)).toEqual(["web_search"]);

    await act(async () => {
      gate.resolve();
    });
    await waitFor(() => expect(result.current.isFollowing).toBe(false));

    // what the server stored replaces the live view
    expect(getConversation).toHaveBeenCalledTimes(2);
    expect(result.current.messages.map((m) => m.id)).toEqual(["u1", "m2"]);
    expect(result.current.streamingText).toBe("");
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.conversation?.runtime?.status).toBe("idle");
    expect(result.current.composerState).toBe("open");
  });

  it("shows the answer of a turn that did not stream once it is written", async () => {
    const getConversation = vi
      .fn()
      .mockResolvedValueOnce({ conversation: conversation({ runtime: { status: "running", lastEventSeq: 1 } }), messages: [user] })
      .mockResolvedValue({ conversation: conversation(), messages: [user, message({ id: "m2", content: "Done." })] });
    const gate = deferred();
    const followEvents = vi.fn(async (_id: string, options: FollowEventsOptions) => {
      options.onEvent(event("agent.message", { content: "Done.", message_id: "m2" }, 2));
      await gate.promise;
      options.onEvent(event("session.status_idle", { stop_reason: "end_turn" }, 3));
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, followEvents }), agentId: "agent" }),
      { wrapper }
    );
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    await waitFor(() => expect(result.current.streamingText).toBe("Done."));
    await act(async () => {
      gate.resolve();
    });
    await waitFor(() => expect(result.current.isFollowing).toBe(false));
    expect(result.current.messages.map((m) => m.content)).toEqual(["research it", "Done."]);
  });

  it("looks again once when the answer was not stored yet at the first look", async () => {
    const getConversation = vi
      .fn()
      .mockResolvedValueOnce({ conversation: conversation({ runtime: { status: "running", lastEventSeq: 1 } }), messages: [user] })
      .mockResolvedValueOnce({ conversation: conversation(), messages: [user] }) // not stored yet
      .mockResolvedValue({ conversation: conversation(), messages: [user, message({ id: "m2", content: "Late." })] });
    const followEvents = vi.fn(async (_id: string, options: FollowEventsOptions) => {
      options.onEvent(event("agent.message", { content: "Late.", message_id: "m2" }, 2));
      options.onEvent(event("session.status_idle", { stop_reason: "end_turn" }, 3));
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, followEvents }), agentId: "agent", followSettleRetryMs: 5 }),
      { wrapper }
    );
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(["u1", "m2"]));
    expect(getConversation).toHaveBeenCalledTimes(3);
  });

  it("a turn that ends waiting for a person brings its cards", async () => {
    const getConversation = vi
      .fn()
      .mockResolvedValueOnce({ conversation: conversation({ runtime: { status: "running", lastEventSeq: 1 } }), messages: [user] })
      .mockResolvedValue({
        conversation: conversation({ runtime: { status: "requires_action", stopReason: "requires_action", lastEventSeq: 4, pendingActionIds: ["a1"] } }),
        messages: [user, message({ id: "m2", status: "requires_action" })],
        pendingActions: [approval],
      });
    const followEvents = vi.fn(async (_id: string, options: FollowEventsOptions) => {
      options.onEvent(event("action.required", { action_id: "a1", kind: "tool_approval", tool_name: "sandbox_exec" }, 3));
      options.onEvent(event("session.status_idle", { stop_reason: "requires_action", pending_action_ids: ["a1"] }, 4));
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, followEvents, resolveAction: async () => undefined }), agentId: "agent" }),
      { wrapper }
    );
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    await waitFor(() => expect(result.current.awaitingAction).toBe(true));
    expect(result.current.pendingActions.map((e) => e.action.id)).toEqual(["a1"]);
    expect(result.current.composerState).toBe("blocked");
    expect(result.current.isFollowing).toBe(false);
  });

  it("shows a failed run and still loads what was stored", async () => {
    const getConversation = vi
      .fn()
      .mockResolvedValueOnce({ conversation: conversation({ runtime: { status: "running", lastEventSeq: 1 } }), messages: [user] })
      .mockResolvedValue({ conversation: conversation(), messages: [user, message({ id: "m2", content: "partial", status: "incomplete", stopReason: "error" })] });
    const followEvents = vi.fn(async (_id: string, options: FollowEventsOptions) => {
      options.onEvent(event("session.error", { message: "run_interrupted", code: "run_interrupted" }, 2));
      options.onEvent(event("session.status_idle", { stop_reason: "error" }, 3));
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, followEvents }), agentId: "agent" }),
      { wrapper }
    );
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    await waitFor(() => expect(result.current.isFollowing).toBe(false));
    expect(result.current.error?.message).toBe("The assistant was interrupted. Send your message again.");
    expect(result.current.messages.map((m) => m.id)).toEqual(["u1", "m2"]);
  });

  it("does not follow an idle conversation, or a transport that cannot follow", async () => {
    const followEvents = vi.fn(async () => {});
    const idle = vi.fn(async () => ({ conversation: conversation({ runtime: { status: "idle", lastEventSeq: 3 } }), messages: [user] }));
    const a = renderHook(() => useChat({ transport: makeTransport({ getConversation: idle, followEvents }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await a.result.current.loadConversation("c1");
    });
    expect(followEvents).not.toHaveBeenCalled();

    const running = vi.fn(async () => ({ conversation: conversation({ runtime: { status: "running", lastEventSeq: 3 } }), messages: [user] }));
    const b = renderHook(() => useChat({ transport: makeTransport({ getConversation: running }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await b.result.current.loadConversation("c1");
    });
    expect(b.result.current.isFollowing).toBe(false);
    expect(b.result.current.composerState).toBe("open");
  });

  it("stops following when another conversation is opened", async () => {
    const seen: FollowEventsOptions[] = [];
    const getConversation = vi.fn(async (id: string) => ({
      conversation: conversation({ id, runtime: id === "c1" ? { status: "running", lastEventSeq: 1 } : { status: "idle", lastEventSeq: 0 } }),
      messages: [user],
    }));
    const followEvents = vi.fn((_id: string, options: FollowEventsOptions) => {
      seen.push(options);
      return new Promise<void>((resolve) => options.signal?.addEventListener("abort", () => resolve()));
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, followEvents }), agentId: "agent" }),
      { wrapper }
    );
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    await waitFor(() => expect(result.current.isFollowing).toBe(true));
    await act(async () => {
      await result.current.loadConversation("c2");
    });
    expect(seen[0].signal?.aborted).toBe(true);
    expect(result.current.isFollowing).toBe(false);
    expect(result.current.isStreaming).toBe(false);
  });

  it("coming back to a conversation whose turn this page started and left picks it up again", async () => {
    const release = deferred();
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "u1", timestamp: 1 });
      await release.promise; // the stream goes on in the background after we leave
    });
    const getConversation = vi.fn(async (id: string) => ({
      conversation: conversation({ id, runtime: { status: id === "c1" ? "running" : "idle", lastEventSeq: 2 } }),
      messages: [user],
    }));
    const followEvents = vi.fn((_id: string, options: FollowEventsOptions) => new Promise<void>((resolve) => options.signal?.addEventListener("abort", () => resolve())));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, sendMessageStream, followEvents }), agentId: "agent" }),
      { wrapper }
    );
    let sending!: Promise<boolean>;
    act(() => {
      sending = result.current.sendMessage("research it");
    });
    await waitFor(() => expect(sendMessageStream).toHaveBeenCalled());
    await act(async () => {
      await result.current.loadConversation("c2");
    });
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    await waitFor(() => expect(followEvents).toHaveBeenCalledTimes(1));
    expect(result.current.isFollowing).toBe(true);
    await act(async () => {
      release.resolve();
      await sending;
    });
  });
});

describe("useChat: a followed turn that has just ended", () => {
  const user = message({ id: "u1", role: "user", content: "go" });
  const answer = message({ id: "m2", content: "done" });

  /** A follower that streams one turn up to its idle event (seq 12) and ends; later ones wait until aborted. */
  function followers() {
    let calls = 0;
    return vi.fn(async (_id: string, options: FollowEventsOptions) => {
      calls += 1;
      if (calls === 1) {
        options.onEvent(event("agent.message", { content: "done", message_id: "m2" }, 11));
        options.onEvent(event("session.status_idle", { stop_reason: "end_turn" }, 12));
        return;
      }
      await new Promise<void>((resolve) => options.signal?.addEventListener("abort", () => resolve()));
    });
  }

  it("does not follow the run again when the store still reads running right after it said idle", async () => {
    const getConversation = vi
      .fn()
      .mockResolvedValueOnce({ conversation: conversation({ runtime: { status: "running", lastEventSeq: 7 } }), messages: [user] })
      // the store has not caught up: still running, nothing newer than the idle event
      .mockResolvedValue({ conversation: conversation({ runtime: { status: "running", lastEventSeq: 12 } }), messages: [user, answer] });
    const followEvents = followers();
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, followEvents }), agentId: "agent", followSettleRetryMs: 5 }),
      { wrapper }
    );
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    // the first look, and the one more after a short wait
    await waitFor(() => expect(getConversation).toHaveBeenCalledTimes(3));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(followEvents).toHaveBeenCalledTimes(1);
    expect(getConversation).toHaveBeenCalledTimes(3);
    expect(result.current.isFollowing).toBe(false);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.composerState).toBe("open");
    expect(result.current.messages.map((m) => m.id)).toEqual(["u1", "m2"]);
  });

  it("follows a turn that started after the idle one (a newer event), from where it stands", async () => {
    const getConversation = vi
      .fn()
      .mockResolvedValueOnce({ conversation: conversation({ runtime: { status: "running", lastEventSeq: 7 } }), messages: [user] })
      .mockResolvedValue({ conversation: conversation({ runtime: { status: "running", lastEventSeq: 15, activeRunId: "run_2" } }), messages: [user, answer] });
    const followEvents = followers();
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, followEvents }), agentId: "agent", followSettleRetryMs: 5 }),
      { wrapper }
    );
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    await waitFor(() => expect(followEvents).toHaveBeenCalledTimes(2));
    expect(followEvents.mock.calls[1][1].after).toBe(15);
    await waitFor(() => expect(result.current.isFollowing).toBe(true));
  });

  it("Stop on a turn the server has nothing to cancel in stops watching and shows what the server holds", async () => {
    const getConversation = vi.fn(async () => ({
      conversation: conversation({ runtime: { status: "running", lastEventSeq: 7 } }),
      messages: [user, answer],
    }));
    const followEvents = vi.fn((_id: string, options: FollowEventsOptions) => new Promise<void>((resolve) => options.signal?.addEventListener("abort", () => resolve())));
    const cancel = vi.fn(async () => ({ cancelled: false, settled: true }));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, followEvents, cancel }), agentId: "agent" }),
      { wrapper }
    );
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    await waitFor(() => expect(result.current.isFollowing).toBe(true));
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.isFollowing).toBe(false));
    expect(cancel).toHaveBeenCalledWith("c1");
    // looked again, and did not attach to the same run a second time
    await waitFor(() => expect(getConversation).toHaveBeenCalledTimes(2));
    expect(followEvents).toHaveBeenCalledTimes(1);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.composerState).toBe("open");
  });
});

describe("useChat: a send refused because the conversation is running elsewhere", () => {
  it("follows the running turn instead of only showing the banner", async () => {
    const user = message({ id: "u1", role: "user", content: "earlier" });
    const getConversation = vi.fn(async () => ({
      conversation: conversation({ runtime: { status: "running", lastEventSeq: 5 } }),
      messages: [user],
    }));
    const sendMessageStream = vi.fn(async () => {
      throw Object.assign(new Error("busy"), { code: "conversation_busy", status: 409 });
    });
    const followEvents = vi.fn((_id: string, options: FollowEventsOptions) => new Promise<void>((resolve) => options.signal?.addEventListener("abort", () => resolve())));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, sendMessageStream, followEvents }), agentId: "agent" }),
      { wrapper }
    );
    let sent: boolean | undefined;
    await act(async () => {
      sent = await result.current.sendMessage("more");
    });
    expect(sent).toBe(false);
    await waitFor(() => expect(result.current.isFollowing).toBe(true));
    expect(followEvents.mock.calls[0][1].after).toBe(5);
    expect(result.current.error?.message).toContain("still working");
  });
});

describe("useChat: a connection that drops while the server is answering", () => {
  const user = message({ id: "u1", role: "user", content: "go" });
  const drop = () => new TypeError("network error");

  it("is not an error: the turn goes on without us, so the page picks it up and shows the stored answer", async () => {
    const onError = vi.fn();
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "u1", timestamp: 1 });
      cb.onText?.("Working", "Working");
      throw drop();
    });
    const getConversation = vi
      .fn()
      .mockResolvedValueOnce({ conversation: conversation({ runtime: { status: "running", lastEventSeq: 4 } }), messages: [user] })
      .mockResolvedValue({ conversation: conversation({ runtime: { status: "idle", stopReason: "end_turn", lastEventSeq: 9 } }), messages: [user, message({ id: "m2", content: "Done." })] });
    const gate = deferred();
    const followEvents = vi.fn(async (_id: string, options: FollowEventsOptions) => {
      await gate.promise;
      options.onEvent(event("agent.message", { content: "Done.", message_id: "m2" }, 8));
      options.onEvent(event("session.status_idle", { stop_reason: "end_turn" }, 9));
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ sendMessageStream, getConversation, followEvents }), agentId: "agent", onError }),
      { wrapper }
    );
    let sent: boolean | undefined;
    await act(async () => {
      sent = await result.current.sendMessage("go");
    });
    expect(sent).toBe(true);
    await waitFor(() => expect(result.current.isFollowing).toBe(true));
    expect(followEvents.mock.calls[0][1].after).toBe(4);
    expect(result.current.error).toBeNull();

    await act(async () => {
      gate.resolve();
    });
    await waitFor(() => expect(result.current.isFollowing).toBe(false));
    expect(result.current.messages.map((m) => m.id)).toEqual(["u1", "m2"]);
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("shows the finished turn when it was already over", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "u1", timestamp: 1 });
      throw drop();
    });
    const getConversation = vi.fn(async () => ({
      conversation: conversation({ runtime: { status: "idle", stopReason: "end_turn", lastEventSeq: 9 } }),
      messages: [user, message({ id: "m2", content: "All done." })],
    }));
    const followEvents = vi.fn(async () => {});
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ sendMessageStream, getConversation, followEvents }), agentId: "agent" }),
      { wrapper }
    );
    await act(async () => {
      await result.current.sendMessage("go");
    });
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(["u1", "m2"]));
    expect(followEvents).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.isStreaming).toBe(false);
  });

  it("says so when the conversation cannot be reached either", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "u1", timestamp: 1 });
      throw new TypeError("network error");
    });
    const getConversation = vi.fn(async () => {
      throw new TypeError("still offline");
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ sendMessageStream, getConversation, followEvents: async () => {} }), agentId: "agent" }),
      { wrapper }
    );
    await act(async () => {
      await result.current.sendMessage("go");
    });
    await waitFor(() => expect(result.current.error?.message).toBe("network error"));
  });

  it("a failure the server answered with a code is still shown as such, and a transport that cannot follow keeps the old behaviour", async () => {
    const coded = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "u1", timestamp: 1 });
      throw Object.assign(new Error("slow down"), { code: "RATE_LIMITED", status: 429 });
    });
    const getConversation = vi.fn();
    const a = renderHook(
      () => useChat({ transport: makeTransport({ sendMessageStream: coded, getConversation, followEvents: async () => {} }), agentId: "agent" }),
      { wrapper }
    );
    await act(async () => {
      await a.result.current.sendMessage("go");
    });
    expect(a.result.current.error?.message).toBe("Too many requests. Wait a moment and try again.");
    expect(getConversation).not.toHaveBeenCalled();

    const plain = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "u1", timestamp: 1 });
      throw new Error("connection lost");
    });
    const b = renderHook(() => useChat({ transport: makeTransport({ sendMessageStream: plain, getConversation }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await b.result.current.sendMessage("go");
    });
    expect(b.result.current.error?.message).toBe("connection lost");
    expect(getConversation).not.toHaveBeenCalled();
  });

  it("an answer to a card whose stream drops goes on in the background and is picked up", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "", status: "requires_action", pendingActions: [approval], timestamp: 1 });
    });
    const resolveAction = vi.fn(async (_c: string, _a: string, _r: unknown, options?: { callbacks?: StreamCallbacks }) => {
      // the server opens its stream with the start and the resolved event together
      options?.callbacks?.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "m1", timestamp: 1 });
      options?.callbacks?.onActionResolved?.({ type: "stream.action_resolved", conversationId: "c1", actionId: "a1", resolution: { type: "tool_approval", decision: "allow" }, timestamp: 1 });
      throw drop();
    });
    const getConversation = vi.fn(async () => ({
      conversation: conversation({ runtime: { status: "idle", lastEventSeq: 9 } }),
      messages: [message({ id: "m1", status: "requires_action", pendingActions: [approval], actionStates: { a1: { status: "resolved" } } }), message({ id: "m2", content: "Carried on." })],
    }));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ sendMessageStream, resolveAction, getConversation, followEvents: async () => {} }), agentId: "agent" }),
      { wrapper }
    );
    await act(async () => {
      await result.current.sendMessage("go");
    });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.resolveAction("a1", { type: "tool_approval", decision: "allow" });
    });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toContain("m2"));
    expect(result.current.error).toBeNull();
  });
});

describe("useChat: Stop", () => {
  it("cancels the run on the server, closes the stream, keeps the partial answer as stopped, then shows what the server kept", async () => {
    const cancel = vi.fn(async () => ({ cancelled: true, settled: true, stopReason: "cancelled" as const }));
    let signal: AbortSignal | undefined;
    const sendMessageStream = vi.fn((_c: string, _o: unknown, cb: StreamCallbacks, s?: AbortSignal) => {
      signal = s;
      cb.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "u1", timestamp: 1 });
      cb.onText?.("Working on", "Working on");
      return new Promise<void>((_resolve, reject) => s?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    });
    const stored = [
      message({ id: "u1", role: "user", content: "go" }),
      message({ id: "m9", content: "Working on it", status: "cancelled", metadata: { stopReason: "cancelled" } }),
    ];
    const getConversation = vi.fn(async () => ({ conversation: conversation({ runtime: { status: "idle", stopReason: "cancelled", lastEventSeq: 6 } }), messages: stored }));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ cancel, sendMessageStream, getConversation }), agentId: "agent" }),
      { wrapper }
    );
    let sending!: Promise<boolean>;
    act(() => {
      sending = result.current.sendMessage("go");
    });
    await waitFor(() => expect(result.current.streamingText).toBe("Working on"));

    act(() => {
      result.current.stop();
    });
    await act(async () => {
      await sending;
    });

    expect(cancel).toHaveBeenCalledWith("c1");
    expect(signal?.aborted).toBe(true);
    // at once: what was written, marked as stopped
    // then: the server's copy replaces it
    await waitFor(() => expect(getConversation).toHaveBeenCalled());
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(["u1", "m9"]));
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.conversation?.runtime?.stopReason).toBe("cancelled");
  });

  it("marks the partial answer as stopped before the server answers", async () => {
    const cancelGate = deferred<{ cancelled: boolean; settled: boolean }>();
    const cancel = vi.fn(() => cancelGate.promise);
    const sendMessageStream = vi.fn((_c: string, _o: unknown, cb: StreamCallbacks, s?: AbortSignal) => {
      cb.onText?.("Part", "Part");
      return new Promise<void>((_r, reject) => s?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ cancel, sendMessageStream }), agentId: "agent" }),
      { wrapper }
    );
    let sending!: Promise<boolean>;
    act(() => {
      sending = result.current.sendMessage("go");
    });
    await waitFor(() => expect(result.current.streamingText).toBe("Part"));
    act(() => {
      result.current.stop();
    });
    await act(async () => {
      await sending;
    });
    const partial = result.current.messages[result.current.messages.length - 1];
    expect(partial).toMatchObject({ role: "assistant", content: "Part", status: "cancelled", stopReason: "cancelled" });
    await act(async () => {
      cancelGate.resolve({ cancelled: true, settled: true });
    });
  });

  it("without a cancel route it only closes this page's connection, as before", async () => {
    const sendMessageStream = vi.fn((_c: string, _o: unknown, cb: StreamCallbacks, s?: AbortSignal) => {
      cb.onText?.("Part", "Part");
      return new Promise<void>((_r, reject) => s?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    });
    const getConversation = vi.fn();
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ sendMessageStream, getConversation }), agentId: "agent" }),
      { wrapper }
    );
    let sending!: Promise<boolean>;
    act(() => {
      sending = result.current.sendMessage("go");
    });
    await waitFor(() => expect(result.current.streamingText).toBe("Part"));
    act(() => {
      result.current.stop();
    });
    await act(async () => {
      await sending;
    });
    expect(getConversation).not.toHaveBeenCalled();
    expect(result.current.messages[result.current.messages.length - 1].content).toBe("Part");
  });

  it("ignores a missing cancel route (an older server) but shows any other refusal", async () => {
    const sendMessageStream = (text: string) =>
      vi.fn((_c: string, _o: unknown, cb: StreamCallbacks, s?: AbortSignal) => {
        cb.onText?.(text, text);
        return new Promise<void>((_r, reject) => s?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      });

    const gone = renderHook(
      () => useChat({ transport: makeTransport({ cancel: async () => { throw Object.assign(new Error("Route not found"), { status: 404 }); }, sendMessageStream: sendMessageStream("a") }), agentId: "agent" }),
      { wrapper }
    );
    let sending!: Promise<boolean>;
    act(() => {
      sending = gone.result.current.sendMessage("go");
    });
    await waitFor(() => expect(gone.result.current.streamingText).toBe("a"));
    act(() => gone.result.current.stop());
    await act(async () => {
      await sending;
    });
    expect(gone.result.current.error).toBeNull();

    const refused = renderHook(
      () => useChat({ transport: makeTransport({ cancel: async () => { throw Object.assign(new Error("no"), { status: 403, code: "FORBIDDEN" }); }, sendMessageStream: sendMessageStream("b") }), agentId: "agent" }),
      { wrapper }
    );
    act(() => {
      sending = refused.result.current.sendMessage("go");
    });
    await waitFor(() => expect(refused.result.current.streamingText).toBe("b"));
    act(() => refused.result.current.stop());
    await act(async () => {
      await sending;
    });
    await waitFor(() => expect(refused.result.current.error?.message).toBe("You do not have permission to do that."));
  });

  it("while watching a turn, Stop asks the server to cancel it and the follower sees it end", async () => {
    const getConversation = vi
      .fn()
      .mockResolvedValueOnce({ conversation: conversation({ runtime: { status: "running", lastEventSeq: 1 } }), messages: [message({ id: "u1", role: "user", content: "go" })] })
      .mockResolvedValue({ conversation: conversation({ runtime: { status: "idle", stopReason: "cancelled", lastEventSeq: 4 } }), messages: [message({ id: "u1", role: "user", content: "go" }), message({ id: "m2", content: "half", status: "cancelled" })] });
    let emit!: FollowEventsOptions["onEvent"];
    const followEvents = vi.fn((_id: string, options: FollowEventsOptions) => {
      emit = options.onEvent;
      return new Promise<void>((resolve) => options.signal?.addEventListener("abort", () => resolve()));
    });
    const cancel = vi.fn(async () => {
      emit(event("session.status_idle", { stop_reason: "cancelled" }, 4));
      return { cancelled: true, settled: true };
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, followEvents, cancel }), agentId: "agent" }),
      { wrapper }
    );
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    await waitFor(() => expect(result.current.isFollowing).toBe(true));
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.isFollowing).toBe(false));
    expect(cancel).toHaveBeenCalledWith("c1");
    expect(result.current.messages.map((m) => m.id)).toEqual(["u1", "m2"]);
  });

  it("while watching a turn on a transport that cannot cancel, Stop stops watching", async () => {
    const getConversation = vi.fn(async () => ({
      conversation: conversation({ runtime: { status: "running", lastEventSeq: 1 } }),
      messages: [message({ id: "u1", role: "user", content: "go" })],
    }));
    const followEvents = vi.fn((_id: string, options: FollowEventsOptions) => new Promise<void>((resolve) => options.signal?.addEventListener("abort", () => resolve())));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, followEvents }), agentId: "agent" }),
      { wrapper }
    );
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    await waitFor(() => expect(result.current.isFollowing).toBe(true));
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.isFollowing).toBe(false));
    expect(result.current.isStreaming).toBe(false);
  });
});

describe("useChat: stop reasons", () => {
  it("a cancelled stream.done keeps its stop reason and status on the message", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m2", content: "half", status: "cancelled", stopReason: "cancelled", timestamp: 2 });
    });
    const { result } = renderHook(() => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("go");
    });
    expect(result.current.messages[1]).toMatchObject({ status: "cancelled", stopReason: "cancelled" });
    expect(result.current.conversation?.runtime).toMatchObject({ status: "idle", stopReason: "cancelled" });
  });

  it("keeps the limit and warnings of a turn, and says nothing for a plain end_turn", async () => {
    const sendMessageStream = vi
      .fn()
      .mockImplementationOnce(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
        cb.onDone?.({
          type: "stream.done", conversationId: "c1", messageId: "m2", content: "cut", status: "incomplete", stopReason: "limit",
          warnings: [{ code: "file_truncated", message: "too long" }], timestamp: 2,
        });
      })
      .mockImplementationOnce(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
        cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m4", content: "fine", stopReason: "end_turn", timestamp: 3 });
      });
    const { result } = renderHook(() => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("one");
    });
    await act(async () => {
      await result.current.sendMessage("two");
    });
    expect(result.current.messages[1]).toMatchObject({ stopReason: "limit", status: "incomplete" });
    expect(result.current.messages[1].metadata?.warnings).toEqual([{ code: "file_truncated", message: "too long" }]);
    expect(result.current.messages[3].stopReason).toBeUndefined();
    expect(result.current.messages[3].status).toBeUndefined();
  });
});

describe("useChat: the conversation's usage limit", () => {
  const budget = { maxCostUsd: 1, onReach: "pause" as const };

  it("a turn that reaches the limit pauses the conversation, closes the composer and tells the host", async () => {
    const onBudgetReached = vi.fn();
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({
        type: "stream.done", conversationId: "c1", messageId: "m2", content: "partial", status: "incomplete",
        stopReason: "budget_reached", budget, spentUsd: 1.02, timestamp: 2,
      });
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent", onBudgetReached }),
      { wrapper }
    );
    await act(async () => {
      await result.current.sendMessage("go");
    });
    expect(result.current.conversation).toMatchObject({ budget, spentUsd: 1.02 });
    expect(result.current.conversation?.runtime?.status).toBe("budget_paused");
    expect(result.current.budgetExhausted).toBe(true);
    expect(result.current.composerState).toBe("budget_paused");
    expect(onBudgetReached).toHaveBeenCalledWith({ conversationId: "c1", budget, spentUsd: 1.02 });
  });

  it("a stop-mode limit ends the conversation without a paused status, and still closes the composer", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({
        type: "stream.done", conversationId: "c1", messageId: "m2", content: "done", stopReason: "budget_reached",
        budget: { maxCostUsd: 1, onReach: "stop" }, spentUsd: 1.1, timestamp: 2,
      });
    });
    const { result } = renderHook(() => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("go");
    });
    expect(result.current.conversation?.runtime?.status).toBe("idle");
    expect(result.current.budgetExhausted).toBe(true);
    expect(result.current.composerState).toBe("budget_paused");
  });

  it("a send refused with budget_reached loads the conversation again, which shows it paused", async () => {
    const getConversation = vi.fn(async () => ({
      conversation: conversation({ budget, spentUsd: 1.02, runtime: { status: "budget_paused", stopReason: "budget_reached", lastEventSeq: 3 } }),
      messages: [message({ id: "m1", content: "earlier" })],
    }));
    const sendMessageStream = vi.fn(async () => {
      throw Object.assign(new Error("budget used up"), { code: "budget_reached", status: 402, details: { spentUsd: 1.02, maxCostUsd: 1 } });
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, sendMessageStream }), agentId: "agent" }),
      { wrapper }
    );
    let sent: boolean | undefined;
    await act(async () => {
      sent = await result.current.sendMessage("more");
    });
    expect(sent).toBe(false);
    await waitFor(() => expect(result.current.budgetExhausted).toBe(true));
    expect(result.current.error?.message).toBe("This conversation reached its usage limit.");
    expect((result.current.error as { details?: unknown }).details).toEqual({ spentUsd: 1.02, maxCostUsd: 1 });
  });

  it("raising the limit and continuing carries the paused turn on into a new message", async () => {
    const getConversation = vi.fn(async () => ({
      conversation: conversation({ budget, spentUsd: 1.02, runtime: { status: "budget_paused", stopReason: "budget_reached", lastEventSeq: 3 } }),
      messages: [message({ id: "u1", role: "user", content: "go" }), message({ id: "m1", content: "partial", status: "incomplete", stopReason: "budget_reached" })],
    }));
    const updateBudget = vi.fn(async (_id: string, next: { maxCostUsd: number; onReach: "pause" | "stop" } | null) =>
      conversation({ budget: next, spentUsd: 1.02, runtime: { status: "idle", stopReason: "budget_reached", lastEventSeq: 3 } })
    );
    const continueConversation = vi.fn(async (_id: string, options?: { callbacks?: StreamCallbacks }) => {
      options?.callbacks?.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "m1", timestamp: 1 });
      options?.callbacks?.onDone?.({
        type: "stream.done", conversationId: "c1", messageId: "m2", content: "and the rest", stopReason: "end_turn",
        budget: { maxCostUsd: 5, onReach: "pause" }, spentUsd: 1.3, timestamp: 2,
      });
      return undefined;
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, updateBudget, continueConversation }), agentId: "agent", conversationId: "c1" }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.budgetExhausted).toBe(true));
    expect(result.current.canContinue).toBe(true);
    expect(result.current.canUpdateBudget).toBe(true);

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.updateBudget({ maxCostUsd: 5, onReach: "pause" }, { continue: true });
    });
    expect(ok).toBe(true);
    expect(updateBudget).toHaveBeenCalledWith("c1", { maxCostUsd: 5, onReach: "pause" });
    expect(continueConversation).toHaveBeenCalledTimes(1);
    expect(continueConversation.mock.calls[0][1]).toMatchObject({ stream: true });
    expect(result.current.messages.map((m) => m.id)).toEqual(["u1", "m1", "m2"]);
    expect(result.current.budgetExhausted).toBe(false);
    expect(result.current.composerState).toBe("open");
    expect(result.current.conversation).toMatchObject({ spentUsd: 1.3, budget: { maxCostUsd: 5 } });
  });

  it("raising a stop-mode limit does not try to continue, and reopens the composer", async () => {
    const stop = { maxCostUsd: 1, onReach: "stop" as const };
    const getConversation = vi.fn(async () => ({
      conversation: conversation({ budget: stop, spentUsd: 1.1, runtime: { status: "idle", stopReason: "budget_reached", lastEventSeq: 3 } }),
      messages: [message({ id: "m1", content: "done" })],
    }));
    const updateBudget = vi.fn(async (_id: string, next: unknown) => conversation({ budget: next as typeof stop, spentUsd: 1.1 }));
    const continueConversation = vi.fn();
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, updateBudget, continueConversation }), agentId: "agent", conversationId: "c1" }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.budgetExhausted).toBe(true));
    await act(async () => {
      await result.current.updateBudget({ maxCostUsd: 3, onReach: "stop" }, { continue: false });
    });
    expect(continueConversation).not.toHaveBeenCalled();
    expect(result.current.budgetExhausted).toBe(false);
    expect(result.current.composerState).toBe("open");
  });

  it("shows why the server refused a change, and a continue with nothing to carry on is quiet", async () => {
    const getConversation = vi.fn(async () => ({
      conversation: conversation({ budget, spentUsd: 1.02, runtime: { status: "budget_paused", lastEventSeq: 3 } }),
      messages: [message({ id: "m1", content: "x" })],
    }));
    const updateBudget = vi.fn(async () => {
      throw Object.assign(new Error("needs authorizeBudget"), { code: "budget_forbidden", status: 403 });
    });
    const continueConversation = vi.fn(async () => {
      throw Object.assign(new Error("nothing"), { code: "nothing_to_continue", status: 409 });
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, updateBudget, continueConversation }), agentId: "agent", conversationId: "c1" }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.budgetExhausted).toBe(true));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.updateBudget({ maxCostUsd: 9, onReach: "pause" });
    });
    expect(ok).toBe(false);
    expect(result.current.error?.message).toBe("You can not change the usage limit of this conversation.");

    act(() => result.current.setError(null));
    await act(async () => {
      ok = await result.current.continueConversation();
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("continues without streaming too", async () => {
    const getConversation = vi.fn(async () => ({
      conversation: conversation({ budget, spentUsd: 0.5, runtime: { status: "budget_paused", lastEventSeq: 3 } }),
      messages: [message({ id: "m1", content: "x" })],
    }));
    const continueConversation = vi.fn(async () => ({
      response: message({ id: "m2", content: "carried on" }),
    }));
    const { result } = renderHook(
      () =>
        useChat({
          transport: makeTransport({ getConversation, continueConversation: continueConversation as unknown as ChatTransport["continueConversation"] }),
          agentId: "agent",
          conversationId: "c1",
          streaming: false,
        }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.conversation).not.toBeNull());
    await act(async () => {
      await result.current.continueConversation();
    });
    expect(continueConversation.mock.calls[0]).toEqual(["c1", { stream: false }]);
    expect(result.current.messages.map((m) => m.content)).toEqual(["x", "carried on"]);
  });
});

describe("useChat: composerState", () => {
  const paused = (extra: Partial<Parameters<typeof useChat>[0]> = {}, transport: Partial<ChatTransport> = {}) =>
    renderHook(
      () =>
        useChat({
          transport: makeTransport({
            getConversation: async () => ({
              conversation: conversation({ runtime: { status: "requires_action", lastEventSeq: 2, pendingActionIds: ["a1"] } }),
              messages: [message({ id: "m1", status: "requires_action" })],
              pendingActions: [approval],
            }),
            resolveAction: async () => undefined,
            ...transport,
          }),
          agentId: "agent",
          conversationId: "c1",
          ...extra,
        }),
      { wrapper }
    );

  it("is open for a plain chat, blocked or cancel while a card waits, readonly when the host says so", async () => {
    const plain = renderHook(() => useChat({ transport: makeTransport(), agentId: "agent" }), { wrapper });
    expect(plain.result.current.composerState).toBe("open");

    const blocked = paused();
    await waitFor(() => expect(blocked.result.current.awaitingAction).toBe(true));
    expect(blocked.result.current.composerState).toBe("blocked");

    const cancel = paused({ pendingActionComposerMode: "cancel" });
    await waitFor(() => expect(cancel.result.current.awaitingAction).toBe(true));
    expect(cancel.result.current.composerState).toBe("cancel");

    const readOnly = renderHook(() => useChat({ transport: makeTransport(), agentId: "agent", readOnly: true }), { wrapper });
    expect(readOnly.result.current.composerState).toBe("readonly");
  });

  it("is answer for a lone free-text question, unless questions are turned off", async () => {
    const question: PendingAction = { id: "q1", type: "user_question", questions: [{ question: "Which env?" }] };
    const open = (extra: Partial<Parameters<typeof useChat>[0]> = {}) =>
      renderHook(
        () =>
          useChat({
            transport: makeTransport({
              getConversation: async () => ({ conversation: conversation(), messages: [message({ id: "m1", status: "requires_action" })], pendingActions: [question] }),
              resolveAction: async () => undefined,
            }),
            agentId: "agent",
            conversationId: "c1",
            ...extra,
          }),
        { wrapper }
      );
    const answering = open();
    await waitFor(() => expect(answering.result.current.awaitingAction).toBe(true));
    expect(answering.result.current.composerState).toBe("answer");
    const off = open({ enableQuestions: false });
    await waitFor(() => expect(off.result.current.awaitingAction).toBe(true));
    expect(off.result.current.composerState).toBe("blocked");
  });
});
