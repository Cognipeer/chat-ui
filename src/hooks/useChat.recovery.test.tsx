import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { ChatI18nProvider } from "../providers";
import { useChat } from "./useChat";
import type { ChatTransport, StreamCallbacks } from "../api";
import type { Message, PendingAction } from "../types";

const approval: PendingAction = { id: "a1", type: "tool_approval", toolName: "sandbox_exec", args: { cmd: "ls" } };
const now = new Date();

const wrapper = ({ children }: { children: ReactNode }) => (
  <ChatI18nProvider locale="en">{children}</ChatI18nProvider>
);

const assistant = (partial: Partial<Message> = {}): Message => ({
  id: "m1",
  conversationId: "c1",
  role: "assistant",
  content: "",
  createdAt: now,
  updatedAt: now,
  ...partial,
});

function makeTransport(overrides: Partial<ChatTransport> = {}): ChatTransport {
  return {
    getAgents: async () => [],
    getConversations: async () => ({ conversations: [], total: 0, limit: 20, offset: 0, hasMore: false }),
    createConversation: async (p) => ({ id: "c1", agentId: p.agentId, createdAt: now, updatedAt: now }),
    getConversation: async () => {
      throw new Error("unused");
    },
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

const coded = (message: string, code: string, status: number) => Object.assign(new Error(message), { code, status });

describe("useChat: friendly messages for server error codes", () => {
  it("shows a localized message for a coded failure, keeping the code and the server's wording", async () => {
    const sendMessageStream = vi.fn(async () => {
      throw coded("Too many requests (60/min)", "RATE_LIMITED", 429);
    });
    const onError = vi.fn();
    const { result } = renderHook(() => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent", onError }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("hi");
    });
    expect(result.current.error?.message).toBe("Too many requests. Wait a moment and try again.");
    expect((result.current.error as { code?: string }).code).toBe("RATE_LIMITED");
    expect((result.current.error as { serverMessage?: string }).serverMessage).toBe("Too many requests (60/min)");
    expect(onError.mock.calls[0][0]).toBe(result.current.error);
  });

  it("speaks Turkish when the locale is Turkish", async () => {
    const trWrapper = ({ children }: { children: ReactNode }) => <ChatI18nProvider locale="tr">{children}</ChatI18nProvider>;
    const sendMessageStream = vi.fn(async () => {
      throw coded("Message too long", "MESSAGE_TOO_LONG", 413);
    });
    const { result } = renderHook(() => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent" }), { wrapper: trWrapper });
    await act(async () => {
      await result.current.sendMessage("hi");
    });
    expect(result.current.error?.message).toBe("Mesaj çok uzun. Kısaltıp yeniden deneyin.");
  });

  it("keeps the server's message for a code it has no string for", async () => {
    const sendMessageStream = vi.fn(async () => {
      throw coded("Something specific", "NEW_THING", 400);
    });
    const { result } = renderHook(() => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("hi");
    });
    expect(result.current.error?.message).toBe("Something specific");
  });

  it("localizes an error event in the stream too", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onError?.(coded("guardrail said no", "GUARDRAIL_BLOCKED", 400));
    });
    const { result } = renderHook(() => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("hi");
    });
    expect(result.current.error?.message).toBe("Your message was blocked by a content policy. guardrail said no");
  });

  it("localizes a failed answer to a card, which stays open", async () => {
    const resolveAction = vi.fn(async () => {
      throw coded("only the owner", "ACTION_FORBIDDEN", 403);
    });
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "", status: "requires_action", pendingActions: [approval], timestamp: 1 });
    });
    const { result } = renderHook(() => useChat({ transport: makeTransport({ resolveAction, sendMessageStream }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("go");
    });
    await act(async () => {
      await result.current.resolveAction("a1", { type: "tool_approval", decision: "allow" });
    });
    expect(result.current.error?.message).toBe("Only the person who started this chat can answer this request.");
    expect(result.current.awaitingAction).toBe(true);
  });
});

describe("useChat: a send refused because of a card or a running turn shows what is going on", () => {
  it.each(["PENDING_ACTION", "action_pending"])("%s: the open card appears", async (code) => {
    const getConversation = vi.fn(async () => ({
      conversation: { id: "c1", agentId: "agent", createdAt: now, updatedAt: now },
      messages: [
        { ...assistant({ id: "u0", role: "user", content: "run it" }) },
        assistant({ id: "m1", status: "requires_action" }),
      ],
      pendingActions: [approval],
    }));
    const sendMessageStream = vi.fn(async () => {
      throw coded("Answer the request above first", code, 409);
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, sendMessageStream }), agentId: "agent" }),
      { wrapper }
    );
    let sent: boolean | undefined;
    await act(async () => {
      sent = await result.current.sendMessage("another thing");
    });

    expect(sent).toBe(false);
    expect(getConversation).toHaveBeenCalledWith("c1");
    expect(result.current.awaitingAction).toBe(true);
    expect(result.current.pendingActions.map((e) => e.action.id)).toEqual(["a1"]);
    expect(result.current.messages.map((m) => m.id)).toEqual(["u0", "m1"]);
    expect(result.current.error?.message).toBe("The assistant is waiting for your answer above. Answer it to continue.");
  });

  it("conversation_busy: the conversation is fetched again, the typed text is not lost", async () => {
    const getConversation = vi.fn(async () => ({
      conversation: { id: "c1", agentId: "agent", createdAt: now, updatedAt: now },
      messages: [assistant({ id: "m1", content: "done meanwhile" })],
    }));
    const sendMessageStream = vi.fn(async () => {
      throw coded("busy", "CONVERSATION_BUSY", 409);
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, sendMessageStream }), agentId: "agent" }),
      { wrapper }
    );
    let sent: boolean | undefined;
    await act(async () => {
      sent = await result.current.sendMessage("hello");
    });
    expect(sent).toBe(false); // the composer keeps its text
    expect(getConversation).toHaveBeenCalledTimes(1);
    expect(result.current.messages.map((m) => m.content)).toEqual(["done meanwhile"]);
    expect(result.current.error?.message).toContain("still working");
  });

  it("does not refetch for other failures", async () => {
    const getConversation = vi.fn();
    const sendMessageStream = vi.fn(async () => {
      throw coded("limit", "RATE_LIMITED", 429);
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, sendMessageStream }), agentId: "agent" }),
      { wrapper }
    );
    await act(async () => {
      await result.current.sendMessage("hi");
    });
    expect(getConversation).not.toHaveBeenCalled();
  });

  it("an answer refused as busy refetches too, and the card stays", async () => {
    const getConversation = vi.fn(async () => ({
      conversation: { id: "c1", agentId: "agent", createdAt: now, updatedAt: now },
      messages: [assistant({ id: "m1", status: "requires_action" })],
      pendingActions: [approval],
    }));
    const resolveAction = vi.fn(async () => {
      throw coded("busy", "conversation_busy", 409);
    });
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "", status: "requires_action", pendingActions: [approval], timestamp: 1 });
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, resolveAction, sendMessageStream }), agentId: "agent" }),
      { wrapper }
    );
    await act(async () => {
      await result.current.sendMessage("go");
    });
    await act(async () => {
      await result.current.resolveAction("a1", { type: "tool_approval", decision: "allow" });
    });
    expect(getConversation).toHaveBeenCalledWith("c1");
    expect(result.current.awaitingAction).toBe(true);
  });
});

describe("useChat: a card past its deadline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const loaded = (expiresAt: string, extra: Partial<PendingAction> = {}) => {
    const action = { ...approval, expiresAt, ...extra } as PendingAction;
    return {
      conversation: { id: "c1", agentId: "agent", createdAt: now, updatedAt: now },
      messages: [assistant({ id: "m1", status: "requires_action" })],
      pendingActions: [action],
    };
  };

  async function open(getConversation: ChatTransport["getConversation"], options: Record<string, unknown> = {}) {
    const hook = renderHook(
      () => useChat({ transport: makeTransport({ getConversation }), agentId: "agent", conversationId: "c1", ...options }),
      { wrapper }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    return hook;
  }

  it("turns Expired at the deadline, which frees the composer, then fetches the conversation again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    const deadline = new Date(Date.now() + 60_000).toISOString();
    const getConversation = vi.fn(async () => loaded(deadline));
    const { result } = await open(getConversation);

    expect(result.current.awaitingAction).toBe(true);
    expect(getConversation).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000);
    });
    expect(result.current.awaitingAction).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(result.current.awaitingAction).toBe(false);
    expect(result.current.messages[0].actionStates?.a1.status).toBe("expired");
    expect(getConversation).toHaveBeenCalledTimes(1); // not yet

    // the server carried on by itself (deny and continue): its answer is fetched
    getConversation.mockImplementation(async () => ({
      conversation: { id: "c1", agentId: "agent", createdAt: now, updatedAt: now },
      messages: [
        assistant({ id: "m1", status: "requires_action", pendingActions: [approval] }),
        assistant({ id: "m2", content: "Carried on without it." }),
      ],
      pendingActions: [],
    }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(getConversation).toHaveBeenCalledTimes(2);
    expect(result.current.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    // a refresh that only says "resolved" must not turn Expired into Answered
    expect(result.current.messages[0].actionStates?.a1.status).toBe("expired");
  });

  it("stays Expired, and stops fetching, while the server has not swept the card and still lists it as open", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    const deadline = new Date(Date.now() + 5_000).toISOString();
    // the server's sweep has not run: every fetch says the card is open
    const getConversation = vi.fn(async () => loaded(deadline));
    const { result } = await open(getConversation);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.awaitingAction).toBe(false);

    const seen: boolean[] = [];
    for (let i = 0; i < 40; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      seen.push(result.current.awaitingAction);
    }
    // the first look, and the one after the deadline - not one every second and a half
    expect(getConversation).toHaveBeenCalledTimes(2);
    expect(seen.every((waiting) => !waiting)).toBe(true);
    expect(result.current.messages[0].actionStates?.a1.status).toBe("expired");
  });

  it("a fetched card whose deadline lies ahead is still open (a later deadline than the one it had)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    let deadline = new Date(Date.now() + 5_000).toISOString();
    const getConversation = vi.fn(async () => loaded(deadline));
    const { result } = await open(getConversation);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.awaitingAction).toBe(false);
    // the server extended it before the page looked again
    deadline = new Date(Date.now() + 60_000).toISOString();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(getConversation).toHaveBeenCalledTimes(2);
    expect(result.current.awaitingAction).toBe(true);
  });

  it("waits as long as it is told before fetching again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    const getConversation = vi.fn(async () => loaded(new Date(Date.now() + 1_000).toISOString()));
    await open(getConversation, { actionExpiryRefreshMs: 10_000 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    expect(getConversation).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(getConversation).toHaveBeenCalledTimes(2);
  });

  it("leaves a card without a deadline alone", async () => {
    vi.useFakeTimers();
    const getConversation = vi.fn(async () => ({
      conversation: { id: "c1", agentId: "agent", createdAt: now, updatedAt: now },
      messages: [assistant({ id: "m1", status: "requires_action" })],
      pendingActions: [approval],
    }));
    const { result } = await open(getConversation);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7 * 86400_000);
    });
    expect(result.current.awaitingAction).toBe(true);
    expect(getConversation).toHaveBeenCalledTimes(1);
  });

  it("does not expire a card whose answer is on its way", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    const getConversation = vi.fn(async () => loaded(new Date(Date.now() + 5_000).toISOString()));
    let finish!: () => void;
    const resolveAction = vi.fn(() => new Promise<undefined>((resolve) => (finish = () => resolve(undefined))));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, resolveAction }), agentId: "agent", conversationId: "c1", streaming: false }),
      { wrapper }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.resolveAction("a1", { type: "tool_approval", decision: "allow" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(result.current.messages[0].actionStates?.a1.status).toBe("resolving");
    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.messages[0].actionStates?.a1.status).toBe("resolved");
  });
});
