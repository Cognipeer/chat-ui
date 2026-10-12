import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ChatI18nProvider } from "../providers";
import { useChat } from "./useChat";
import type { ChatTransport, ResolveActionOptions, StreamCallbacks } from "../api";
import type { Conversation, Message, PendingAction } from "../types";

const now = new Date();
const wrapper = ({ children }: { children: ReactNode }) => <ChatI18nProvider locale="en">{children}</ChatI18nProvider>;

const message = (partial: Partial<Message> = {}): Message => ({
  id: "m1",
  conversationId: "c1",
  role: "assistant",
  content: "",
  createdAt: now,
  updatedAt: now,
  ...partial,
});
const conversation = (partial: Partial<Conversation> = {}): Conversation => ({ id: "c1", agentId: "agent", createdAt: now, updatedAt: now, ...partial });

const user = message({ id: "u1", role: "user", content: "first question" });
const answer = message({ id: "a1", role: "assistant", content: "first answer" });

function makeTransport(overrides: Partial<ChatTransport> = {}): ChatTransport {
  return {
    getAgents: async () => [],
    getConversations: async () => ({ conversations: [], total: 0, limit: 20, offset: 0, hasMore: false }),
    createConversation: async (p) => conversation({ agentId: p.agentId }),
    getConversation: async () => ({ conversation: conversation(), messages: [user, answer] }),
    deleteConversation: async () => {},
    sendMessage: async () => {
      throw new Error("unused");
    },
    sendMessageStream: async (_c, _o, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "a-new", content: "ok", timestamp: 2 });
    },
    ...overrides,
  };
}

const done = (id: string, content: string, extra: Record<string, unknown> = {}) => ({
  type: "stream.done" as const,
  conversationId: "c1",
  messageId: id,
  content,
  timestamp: 9,
  ...extra,
});

async function open(transport: ChatTransport, extra: Record<string, unknown> = {}) {
  const hook = renderHook(() => useChat({ transport, agentId: "agent", ...extra }), { wrapper });
  await act(async () => {
    await hook.result.current.loadConversation("c1");
  });
  return hook;
}

describe("regenerate", () => {
  it("replaces the newest answer with a new one and reads the stored conversation afterwards", async () => {
    const regenerateMessage = vi.fn(async (_c: string, _m: string, options?: ResolveActionOptions) => {
      options?.callbacks?.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "a1", timestamp: 1 });
      options?.callbacks?.onText?.("second ", "second ");
      options?.callbacks?.onDone?.(done("a1", "second answer"));
      return undefined;
    });
    const getConversation = vi
      .fn()
      .mockResolvedValueOnce({ conversation: conversation(), messages: [user, answer] })
      .mockResolvedValue({ conversation: conversation(), messages: [user, message({ id: "a1", content: "second answer" })] });
    const { result } = await open(makeTransport({ regenerateMessage, getConversation }));

    expect(result.current.canRegenerate).toBe(true);
    let ok = false;
    await act(async () => {
      ok = await result.current.regenerate();
    });

    expect(ok).toBe(true);
    expect(regenerateMessage).toHaveBeenCalledTimes(1);
    expect(regenerateMessage.mock.calls[0].slice(0, 2)).toEqual(["c1", "a1"]);
    expect(result.current.messages.map((m) => [m.id, m.content])).toEqual([
      ["u1", "first question"],
      ["a1", "second answer"],
    ]);
    expect(getConversation).toHaveBeenCalledTimes(2);
    expect(result.current.isStreaming).toBe(false);
  });

  it("shows the old answer gone while the new one streams", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const regenerateMessage = vi.fn(async (_c: string, _m: string, options?: ResolveActionOptions) => {
      options?.callbacks?.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "a1", timestamp: 1 });
      await gate;
      options?.callbacks?.onDone?.(done("a1", "again"));
      return undefined;
    });
    const { result } = await open(makeTransport({ regenerateMessage }));
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.regenerate();
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(true));
    expect(result.current.messages.map((m) => m.id)).toEqual(["u1"]);
    await act(async () => {
      release();
      await pending;
    });
    expect(result.current.messages.map((m) => m.id)).toContain("a1");
  });

  it("puts the answer back and says why when the server will not run it again", async () => {
    const regenerateMessage = vi.fn(async () => {
      throw Object.assign(new Error("busy"), { code: "conversation_busy", status: 409 });
    });
    const { result } = await open(makeTransport({ regenerateMessage }));
    await act(async () => {
      expect(await result.current.regenerate()).toBe(false);
    });
    expect(result.current.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(result.current.error?.message).toMatch(/still working/);
  });

  it("is not offered without a transport method, without an answer, or while a turn runs", async () => {
    const plain = await open(makeTransport());
    expect(plain.result.current.canRegenerate).toBe(false);
    await act(async () => {
      expect(await plain.result.current.regenerate()).toBe(false);
    });

    const regenerateMessage = vi.fn();
    const onlyUser = await open(makeTransport({ regenerateMessage, getConversation: async () => ({ conversation: conversation(), messages: [user] }) }));
    await act(async () => {
      expect(await onlyUser.result.current.regenerate()).toBe(false);
    });
    expect(regenerateMessage).not.toHaveBeenCalled();
  });
});

describe("edit and resend", () => {
  it("replaces the message, drops everything after it and runs the turn again", async () => {
    const second = message({ id: "u2", role: "user", content: "second question" });
    const secondAnswer = message({ id: "a2", content: "second answer" });
    const editMessage = vi.fn(async (_c: string, _m: string, _i: unknown, options?: ResolveActionOptions) => {
      options?.callbacks?.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "a9", timestamp: 1 });
      options?.callbacks?.onDone?.(done("a9", "fresh answer"));
      return undefined;
    });
    const getConversation = vi
      .fn()
      .mockResolvedValueOnce({ conversation: conversation(), messages: [user, answer, second, secondAnswer] })
      .mockResolvedValue({ conversation: conversation(), messages: [message({ id: "u1", role: "user", content: "better question" }), message({ id: "a9", content: "fresh answer" })] });
    const { result } = await open(makeTransport({ editMessage, getConversation }));

    await act(async () => {
      expect(await result.current.editMessage("u1", "  better question ")).toBe(true);
    });
    expect(editMessage.mock.calls[0].slice(0, 3)).toEqual(["c1", "u1", { content: "better question" }]);
    expect(result.current.messages.map((m) => [m.id, m.content])).toEqual([
      ["u1", "better question"],
      ["a9", "fresh answer"],
    ]);
  });

  it("asks the server for the id of a message this page sent itself", async () => {
    const editMessage = vi.fn(async (_c: string, _m: string, _i: unknown, options?: ResolveActionOptions) => {
      options?.callbacks?.onDone?.(done("a-edit", "edited reply"));
      return undefined;
    });
    const getConversation = vi.fn(async () => ({
      conversation: conversation(),
      messages: [message({ id: "srv-u1", role: "user", content: "hello" }), message({ id: "srv-a1", content: "ok" })],
    }));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ editMessage, getConversation }), agentId: "agent" }),
      { wrapper }
    );
    await act(async () => {
      await result.current.sendMessage("hello");
    });
    const localId = result.current.messages.find((m) => m.role === "user")!.id;
    expect(localId).not.toBe("srv-u1");

    await act(async () => {
      expect(await result.current.editMessage(localId, "hello again")).toBe(true);
    });
    expect(getConversation).toHaveBeenCalled();
    expect(editMessage.mock.calls[0].slice(0, 3)).toEqual(["c1", "srv-u1", { content: "hello again" }]);
  });

  it("restores the conversation when the server refuses, and ignores an assistant message or an empty text", async () => {
    const editMessage = vi.fn(async () => {
      throw Object.assign(new Error("nope"), { code: "forbidden", status: 403 });
    });
    const { result } = await open(makeTransport({ editMessage }));
    await act(async () => {
      expect(await result.current.editMessage("u1", "changed")).toBe(false);
      expect(await result.current.editMessage("a1", "changed")).toBe(false);
      expect(await result.current.editMessage("u1", "   ")).toBe(false);
    });
    expect(editMessage).toHaveBeenCalledTimes(1);
    expect(result.current.messages.map((m) => [m.id, m.content])).toEqual([
      ["u1", "first question"],
      ["a1", "first answer"],
    ]);
  });
});

describe("feedback", () => {
  it("shows the rating at once, keeps what the server stored and tells the host", async () => {
    const sendFeedback = vi.fn(async () => ({ rating: "down" as const, reasons: ["too_long"], comment: "trimmed" }));
    const onFeedback = vi.fn();
    const { result } = await open(makeTransport({ sendFeedback }), { onFeedback });
    expect(result.current.canRate).toBe(true);
    await act(async () => {
      expect(await result.current.submitFeedback("a1", { rating: "down", reasons: ["too_long"], comment: "too wordy" })).toBe(true);
    });
    expect(sendFeedback).toHaveBeenCalledWith("c1", "a1", { rating: "down", reasons: ["too_long"], comment: "too wordy" });
    expect(result.current.messages.find((m) => m.id === "a1")?.feedback).toEqual({ rating: "down", reasons: ["too_long"], comment: "trimmed" });
    expect(onFeedback).toHaveBeenCalledWith({ conversationId: "c1", messageId: "a1", feedback: { rating: "down", reasons: ["too_long"], comment: "trimmed" } });
  });

  it("withdraws a rating", async () => {
    const sendFeedback = vi.fn(async () => null);
    const { result } = await open(makeTransport({ sendFeedback }));
    await act(async () => {
      await result.current.submitFeedback("a1", { rating: "up" });
    });
    expect(result.current.messages.find((m) => m.id === "a1")?.feedback).toEqual({ rating: "up" });
    await act(async () => {
      await result.current.submitFeedback("a1", { rating: null });
    });
    expect(result.current.messages.find((m) => m.id === "a1")?.feedback).toBeUndefined();
  });

  it("takes the rating back when the server refuses", async () => {
    const sendFeedback = vi.fn(async () => {
      throw Object.assign(new Error("off"), { code: "feedback_disabled", status: 403 });
    });
    const { result } = await open(makeTransport({ sendFeedback }));
    await act(async () => {
      expect(await result.current.submitFeedback("a1", { rating: "up" })).toBe(false);
    });
    expect(result.current.messages.find((m) => m.id === "a1")?.feedback).toBeUndefined();
    expect(result.current.error?.message).toMatch(/turned off/);
  });

  it("rates only assistant messages of the conversation", async () => {
    const sendFeedback = vi.fn();
    const { result } = await open(makeTransport({ sendFeedback }));
    await act(async () => {
      expect(await result.current.submitFeedback("u1", { rating: "up" })).toBe(false);
      expect(await result.current.submitFeedback("nope", { rating: "up" })).toBe(false);
    });
    expect(sendFeedback).not.toHaveBeenCalled();
  });
});

describe("messages carry the host's context", () => {
  it("sends the metadata the host gives, and the rest of the send is unchanged", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.(done("a1", "ok"));
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent", getMessageMetadata: () => ({ uiContext: { page: "orders" } }) }),
      { wrapper }
    );
    await act(async () => {
      await result.current.sendMessage("hi");
    });
    expect(sendMessageStream.mock.calls[0][1]).toMatchObject({ message: "hi", metadata: { uiContext: { page: "orders" } } });
  });

  it("sends none when there is no context", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.(done("a1", "ok"));
    });
    const { result } = renderHook(() => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent", getMessageMetadata: () => undefined }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("hi");
    });
    expect(sendMessageStream.mock.calls[0][1]).not.toHaveProperty("metadata");
  });
});

describe("tools of the host page", () => {
  const hostTool: PendingAction = { id: "h1", type: "client_tool", toolName: "open_ticket", toolCallId: "tc1", args: { id: 7 }, timeoutSeconds: 20 };
  const approval: PendingAction = { id: "a1", type: "tool_approval", toolName: "sandbox_exec" };

  function pausedTransport(resolveAction: ChatTransport["resolveAction"], actions: PendingAction[] = [hostTool]) {
    return makeTransport({
      sendMessageStream: async (_c, _o, cb) => {
        cb.onActionRequired?.({ type: "stream.action_required", conversationId: "c1", messageId: "p1", actions, timestamp: 1 });
        cb.onDone?.(done("p1", "", { status: "requires_action", pendingActions: actions }));
      },
      resolveAction,
    });
  }

  it("hands the call to the host, answers the action with its result and goes on with the turn", async () => {
    const resolveAction = vi.fn(async (_c: string, _a: string, _r: unknown, options?: ResolveActionOptions) => {
      options?.callbacks?.onDone?.(done("a-final", "Ticket 7 is open."));
      return undefined;
    });
    const onClientToolCall = vi.fn(async () => ({ ok: true as const, output: { opened: true } }));
    const onActionRequired = vi.fn();
    const { result } = renderHook(
      () => useChat({ transport: pausedTransport(resolveAction), agentId: "agent", onClientToolCall, onActionRequired }),
      { wrapper }
    );

    await act(async () => {
      await result.current.sendMessage("open ticket 7");
    });
    await waitFor(() => expect(resolveAction).toHaveBeenCalled());

    expect(onClientToolCall).toHaveBeenCalledTimes(1);
    expect(onClientToolCall).toHaveBeenCalledWith({ actionId: "h1", toolCallId: "tc1", name: "open_ticket", args: { id: 7 }, timeoutSeconds: 20 });
    expect(resolveAction.mock.calls[0].slice(0, 3)).toEqual(["c1", "h1", { type: "client_tool", output: { opened: true } }]);
    await waitFor(() => expect(result.current.messages[result.current.messages.length - 1]).toMatchObject({ id: "a-final" }));
    // never a card, never "waiting for you", never told to the host as an approval
    expect(result.current.awaitingAction).toBe(false);
    expect(result.current.composerState).toBe("open");
    expect(onActionRequired).not.toHaveBeenCalled();
    expect(onClientToolCall).toHaveBeenCalledTimes(1);
  });

  it("is busy while the host works, so the composer shows Stop", async () => {
    let finish!: (r: { ok: true; output: unknown }) => void;
    const onClientToolCall = vi.fn(() => new Promise<{ ok: true; output: unknown }>((resolve) => (finish = resolve)));
    const resolveAction = vi.fn(async (_c: string, _a: string, _r: unknown, options?: ResolveActionOptions) => {
      options?.callbacks?.onDone?.(done("a-final", "done"));
      return undefined;
    });
    const { result } = renderHook(
      () => useChat({ transport: pausedTransport(resolveAction), agentId: "agent", onClientToolCall }),
      { wrapper }
    );
    await act(async () => {
      await result.current.sendMessage("go");
    });
    await waitFor(() => expect(onClientToolCall).toHaveBeenCalled());
    expect(result.current.isStreaming).toBe(true);
    await act(async () => {
      finish({ ok: true, output: 1 });
    });
    await waitFor(() => expect(resolveAction).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });

  it("answers with an error text when the host cannot run the tool", async () => {
    const resolveAction = vi.fn(async (..._args: unknown[]) => undefined);
    const onClientToolCall = vi.fn(async () => ({ ok: false as const, error: "The host page did not answer" }));
    const { result } = renderHook(
      () => useChat({ transport: pausedTransport(resolveAction), agentId: "agent", onClientToolCall }),
      { wrapper }
    );
    await act(async () => {
      await result.current.sendMessage("go");
    });
    await waitFor(() => expect(resolveAction).toHaveBeenCalled());
    expect(resolveAction.mock.calls[0].slice(0, 3)).toEqual([
      "c1",
      "h1",
      { type: "client_tool", error: "The host page did not answer", output: { error: "The host page did not answer" } },
    ]);
  });

  it("treats a handler that throws as a failed call", async () => {
    const resolveAction = vi.fn(async (..._args: unknown[]) => undefined);
    const onClientToolCall = vi.fn(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(
      () => useChat({ transport: pausedTransport(resolveAction), agentId: "agent", onClientToolCall }),
      { wrapper }
    );
    await act(async () => {
      await result.current.sendMessage("go");
    });
    await waitFor(() => expect(resolveAction).toHaveBeenCalled());
    expect(resolveAction.mock.calls[0][2]).toMatchObject({ type: "client_tool", error: "boom" });
  });

  it("tries the answer again when the server is still letting go of the paused turn", async () => {
    const paused = message({ id: "p1", content: "", status: "requires_action", pendingActions: [hostTool] });
    let calls = 0;
    const resolveAction = vi.fn(async (_c: string, _a: string, _r: unknown, options?: ResolveActionOptions) => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("busy"), { code: "conversation_busy", status: 409 });
      options?.callbacks?.onDone?.(done("a-final", "second try worked"));
      return undefined;
    });
    const transport = makeTransport({
      ...pausedTransport(resolveAction),
      getConversation: async () => ({ conversation: conversation(), messages: [user, paused], pendingActions: [hostTool] }),
    });
    const onClientToolCall = vi.fn(async () => ({ ok: true as const, output: 1 }));
    const { result } = renderHook(() => useChat({ transport, agentId: "agent", onClientToolCall }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("go");
    });
    await waitFor(() => expect(resolveAction).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(() => expect(result.current.messages.some((m) => m.id === "a-final")).toBe(true));
    // the host was asked once
    expect(onClientToolCall).toHaveBeenCalledTimes(1);
  });

  it("does not keep re-rendering while the continuation streams", async () => {
    let renders = 0;
    let finish!: () => void;
    const gate = new Promise<void>((r) => (finish = r));
    const resolveAction = vi.fn(async (_c: string, _a: string, _r: unknown, options?: ResolveActionOptions) => {
      options?.callbacks?.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "a2", timestamp: 1 });
      await gate;
      options?.callbacks?.onDone?.(done("a-final", "ok"));
      return undefined;
    });
    const { result } = renderHook(
      () => {
        renders += 1;
        return useChat({ transport: pausedTransport(resolveAction), agentId: "agent", onClientToolCall: async () => ({ ok: true as const, output: null }) });
      },
      { wrapper }
    );
    await act(async () => {
      await result.current.sendMessage("go");
    });
    await waitFor(() => expect(resolveAction).toHaveBeenCalled());
    const before = renders;
    await new Promise((r) => setTimeout(r, 200));
    // a polling effect would have rendered about eight more times in 200 ms
    expect(renders - before).toBeLessThan(4);
    await act(async () => finish());
  });

  it("leaves the action alone when no host handler is given", async () => {
    const resolveAction = vi.fn(async (..._args: unknown[]) => undefined);
    const { result } = renderHook(() => useChat({ transport: pausedTransport(resolveAction), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("go");
    });
    await new Promise((r) => setTimeout(r, 60));
    expect(resolveAction).not.toHaveBeenCalled();
    expect(result.current.isStreaming).toBe(false);
  });

  it("tells the host about approvals but handles host tools next to them without a card", async () => {
    const resolveAction = vi.fn(async (..._args: unknown[]) => undefined);
    const onClientToolCall = vi.fn(async () => ({ ok: true as const, output: null }));
    const onActionRequired = vi.fn();
    const { result } = renderHook(
      () => useChat({ transport: pausedTransport(resolveAction, [hostTool, approval]), agentId: "agent", onClientToolCall, onActionRequired }),
      { wrapper }
    );
    await act(async () => {
      await result.current.sendMessage("go");
    });
    await waitFor(() => expect(onClientToolCall).toHaveBeenCalled());
    expect(onActionRequired).toHaveBeenCalledTimes(1);
    expect(onActionRequired).toHaveBeenCalledWith({ conversationId: "c1", action: approval });
    expect(result.current.pendingActions.map((e) => e.action.id)).toEqual(["a1"]);
  });
});
