import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { ChatI18nProvider } from "../providers";
import { useChat } from "./useChat";
import type { ChatTransport, StreamCallbacks } from "../api";

const wrapper = ({ children }: { children: ReactNode }) => <ChatI18nProvider locale="en">{children}</ChatI18nProvider>;

function transport(sendMessageStream: ChatTransport["sendMessageStream"]): ChatTransport {
  return {
    getAgents: async () => [],
    getConversations: async () => ({ conversations: [], total: 0, limit: 20, offset: 0, hasMore: false }),
    createConversation: async (p) => ({ id: "c1", agentId: p.agentId, createdAt: new Date(), updatedAt: new Date() }),
    getConversation: async () => { throw new Error("unused"); },
    deleteConversation: async () => {},
    sendMessage: async () => { throw new Error("unused"); },
    sendMessageStream,
  };
}

describe("useChat reasoning", () => {
  it("keeps reasoning per message, separate from the answer, and sends reasoningEffort", async () => {
    const seen: unknown[] = [];
    let midText = "";
    const send = vi.fn(async (_c: string, opts: unknown, cb: StreamCallbacks) => {
      seen.push(opts);
      cb.onThinking?.("a", "a");
      cb.onThinking?.("b", "ab");
      cb.onText?.("Hi", "Hi");
      midText = "Hi";
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "Hi", timestamp: 1 });
    });
    const { result } = renderHook(
      () => useChat({ transport: transport(send as ChatTransport["sendMessageStream"]), agentId: "agent", getReasoningEffort: () => "medium" }),
      { wrapper }
    );
    await act(async () => { await result.current.sendMessage("q"); });
    expect(seen[0]).toMatchObject({ message: "q", reasoningEffort: "medium" });
    const last = result.current.messages[result.current.messages.length - 1]!;
    expect(last.role).toBe("assistant");
    expect(last.content).toBe("Hi");
    expect(last.reasoning).toBe("ab");
    expect(midText).toBe("Hi");
    expect(result.current.streamingReasoning).toBe("");
  });

  it("sends no reasoningEffort when unset and leaves no reasoning on a plain answer", async () => {
    const send = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "Yo", timestamp: 1 });
    });
    const { result } = renderHook(() => useChat({ transport: transport(send as ChatTransport["sendMessageStream"]), agentId: "agent" }), { wrapper });
    await act(async () => { await result.current.sendMessage("q"); });
    expect(send.mock.calls[0]![1]).not.toHaveProperty("reasoningEffort");
    expect(result.current.messages[result.current.messages.length - 1]!.reasoning).toBeUndefined();
  });
});
