import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ChatI18nProvider } from "../providers";
import { useChat } from "./useChat";
import type { ChatTransport, StreamCallbacks } from "../api";
import type { PendingAction } from "../types";

const approval: PendingAction = { id: "a1", type: "tool_approval", toolName: "sandbox_exec", args: { cmd: "ls" } };

const wrapper = ({ children }: { children: ReactNode }) => (
  <ChatI18nProvider locale="en">{children}</ChatI18nProvider>
);

function makeTransport(overrides: Partial<ChatTransport> = {}): ChatTransport {
  return {
    getAgents: async () => [],
    getConversations: async () => ({ conversations: [], total: 0, limit: 20, offset: 0, hasMore: false }),
    createConversation: async (p) => ({
      id: "c1",
      agentId: p.agentId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    getConversation: async () => {
      throw new Error("unused");
    },
    deleteConversation: async () => {},
    sendMessage: async () => {
      throw new Error("unused");
    },
    sendMessageStream: async (_c, _o, cb: StreamCallbacks) => {
      cb.onActionRequired?.({ type: "stream.action_required", conversationId: "c1", messageId: "m1", actions: [approval], timestamp: 1 });
      cb.onDone?.({
        type: "stream.done",
        conversationId: "c1",
        messageId: "m1",
        content: "",
        status: "requires_action",
        pendingActions: [approval],
        timestamp: 2,
      });
    },
    ...overrides,
  };
}

describe("useChat approvals", () => {
  it("attaches pending actions to the paused message and settles them on resolve", async () => {
    const resolveAction = vi.fn(async (_c: string, _a: string, _r: unknown, options?: { callbacks?: StreamCallbacks }) => {
      options?.callbacks?.onActionResolved?.({
        type: "stream.action_resolved",
        conversationId: "c1",
        actionId: "a1",
        resolution: { type: "tool_approval", decision: "allow" },
        timestamp: 3,
      });
      options?.callbacks?.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m2", content: "Listed.", timestamp: 4 });
      return undefined;
    });
    const onActionResolved = vi.fn();
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ resolveAction }), agentId: "agent", onActionResolved }),
      { wrapper }
    );

    await act(async () => {
      await result.current.sendMessage("list files");
    });

    expect(result.current.awaitingAction).toBe(true);
    const paused = result.current.messages.find((m) => m.id === "m1");
    expect(paused?.pendingActions).toEqual([approval]);
    expect(paused?.status).toBe("requires_action");
    expect(result.current.canResolveActions).toBe(true);

    await act(async () => {
      await result.current.resolveAction("a1", { type: "tool_approval", decision: "allow" });
    });

    expect(resolveAction).toHaveBeenCalledTimes(1);
    expect(resolveAction.mock.calls[0].slice(0, 3)).toEqual(["c1", "a1", { type: "tool_approval", decision: "allow" }]);
    expect(result.current.awaitingAction).toBe(false);
    expect(result.current.messages.find((m) => m.id === "m1")?.actionStates?.a1.status).toBe("resolved");
    // the continuation is a new assistant message
    expect(result.current.messages[result.current.messages.length - 1]).toMatchObject({ id: "m2", content: "Listed." });
    expect(onActionResolved).toHaveBeenCalledWith(expect.objectContaining({ actionId: "a1" }));
  });

  it("puts the card back when the answer is rejected before anything streamed", async () => {
    const resolveAction = vi.fn(async () => {
      throw new Error("Network down");
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ resolveAction }), agentId: "agent" }),
      { wrapper }
    );
    await act(async () => {
      await result.current.sendMessage("go");
    });
    await act(async () => {
      await result.current.resolveAction("a1", { type: "tool_approval", decision: "deny" });
    });
    expect(result.current.awaitingAction).toBe(true);
    expect(result.current.error?.message).toBe("Network down");
  });

  it("does not add a message when the server only reports the remaining actions", async () => {
    const second: PendingAction = { id: "a2", type: "tool_approval", toolName: "other" };
    const transport = makeTransport({
      sendMessageStream: async (_c, _o, cb) => {
        cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "", status: "requires_action", pendingActions: [approval, second], timestamp: 1 });
      },
      resolveAction: async (_c, _a, _r, options) => {
        options?.callbacks?.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m2", content: "", status: "requires_action", pendingActions: [second], timestamp: 2 });
        return undefined;
      },
    });
    const { result } = renderHook(() => useChat({ transport, agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("go");
    });
    const before = result.current.messages.length;
    await act(async () => {
      await result.current.resolveAction("a1", { type: "tool_approval", decision: "allow" });
    });
    expect(result.current.messages).toHaveLength(before);
    expect(result.current.pendingActions.map((e) => e.action.id)).toEqual(["a2"]);
  });

  it("restores pending actions when a conversation is loaded", async () => {
    const transport = makeTransport({
      getConversation: async () => ({
        conversation: { id: "c1", agentId: "agent", createdAt: new Date(), updatedAt: new Date() },
        messages: [
          { id: "u", conversationId: "c1", role: "user", content: "go", createdAt: new Date(), updatedAt: new Date() },
          { id: "m1", conversationId: "c1", role: "assistant", content: "", createdAt: new Date(), updatedAt: new Date() },
        ],
        pendingActions: [approval],
      }),
    });
    const { result } = renderHook(() => useChat({ transport, agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    await waitFor(() => expect(result.current.awaitingAction).toBe(true));
    expect(result.current.pendingActions[0].messageId).toBe("m1");
  });

  it("cancels waiting actions locally when composer mode is cancel", async () => {
    const send = vi.fn();
    let first = true;
    const transport = makeTransport({
      sendMessageStream: async (_c, _o, cb) => {
        if (first) {
          first = false;
          cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "", status: "requires_action", pendingActions: [approval], timestamp: 1 });
        } else {
          send();
          cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m3", content: "ok", timestamp: 2 });
        }
      },
    });
    const { result } = renderHook(
      () => useChat({ transport, agentId: "agent", pendingActionComposerMode: "cancel" }),
      { wrapper }
    );
    await act(async () => {
      await result.current.sendMessage("go");
    });
    expect(result.current.awaitingAction).toBe(true);
    await act(async () => {
      await result.current.sendMessage("never mind");
    });
    expect(send).toHaveBeenCalled();
    expect(result.current.awaitingAction).toBe(false);
    expect(result.current.messages.find((m) => m.id === "m1")?.actionStates?.a1.status).toBe("cancelled");
  });
  it("does not duplicate the paused message when the done event reuses its id and content", async () => {
    const second: PendingAction = { id: "a2", type: "tool_approval", toolName: "other" };
    const transport = makeTransport({
      sendMessageStream: async (_c, _o, cb) => {
        cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "Working on it", status: "requires_action", pendingActions: [approval, second], timestamp: 1 });
      },
      resolveAction: async (_c, _a, _r, options) => {
        options?.callbacks?.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "Working on it", status: "requires_action", pendingActions: [second], timestamp: 2 });
        return undefined;
      },
    });
    const { result } = renderHook(() => useChat({ transport, agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("go");
    });
    const before = result.current.messages.map((m) => m.id);
    await act(async () => {
      await result.current.resolveAction("a1", { type: "tool_approval", decision: "allow" });
    });
    expect(result.current.messages.map((m) => m.id)).toEqual(before);
    expect(result.current.pendingActions.map((e) => e.action.id)).toEqual(["a2"]);
  });

  it("keeps waiting actions usable when a cancel-mode send is rejected", async () => {
    let first = true;
    const transport = makeTransport({
      sendMessageStream: async (_c, _o, cb) => {
        if (first) {
          first = false;
          cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "", status: "requires_action", pendingActions: [approval], timestamp: 1 });
        } else {
          throw Object.assign(new Error("action pending"), { code: "action_pending" });
        }
      },
    });
    const { result } = renderHook(
      () => useChat({ transport, agentId: "agent", pendingActionComposerMode: "cancel" }),
      { wrapper }
    );
    await act(async () => {
      await result.current.sendMessage("go");
    });
    await act(async () => {
      await result.current.sendMessage("again");
    });
    expect(result.current.awaitingAction).toBe(true);
    expect(result.current.messages.find((m) => m.id === "m1")?.actionStates?.a1?.status).not.toBe("cancelled");
  });
});
