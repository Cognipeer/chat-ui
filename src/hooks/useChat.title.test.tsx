import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ChatI18nProvider } from "../providers";
import { useChat } from "./useChat";
import type { ChatTransport, StreamCallbacks } from "../api";
import type { Conversation } from "../types";

const now = new Date();
const wrapper = ({ children }: { children: ReactNode }) => <ChatI18nProvider locale="en">{children}</ChatI18nProvider>;
const conversation = (partial: Partial<Conversation> = {}): Conversation => ({ id: "c1", agentId: "agent", createdAt: now, updatedAt: now, ...partial });

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

describe("the title after the done frame", () => {
  it("ends the turn at the done frame, takes the title later, and leaves a turn started in between alone", async () => {
    const titleGate = gate();
    const secondGate = gate();
    const seen: StreamCallbacks[] = [];
    let call = 0;
    const transport: ChatTransport = {
      getAgents: async () => [],
      getConversations: async () => ({ conversations: [], total: 0, limit: 20, offset: 0, hasMore: false }),
      createConversation: async () => conversation(),
      getConversation: async () => ({ conversation: conversation(), messages: [] }),
      deleteConversation: async () => {},
      sendMessage: async () => {
        throw new Error("unused");
      },
      sendMessageStream: async (_c, _o, cb) => {
        seen.push(cb);
        call += 1;
        if (call === 1) {
          cb.onText?.("Answer", "Answer");
          cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "a1", content: "Answer", timestamp: 1 });
          // the stream stays open while the title model works
          await titleGate.promise;
          cb.onTitle?.({ type: "stream.title", conversationId: "c1", title: "Trip to Lisbon", timestamp: 2 });
          return;
        }
        cb.onText?.("Second", "Second");
        await secondGate.promise;
        cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "a2", content: "Second", timestamp: 3 });
      },
    };
    const onConversationTitleGenerated = vi.fn();
    const { result } = renderHook(() => useChat({ transport, agentId: "agent", streaming: true, onConversationTitleGenerated }), { wrapper });

    let first!: Promise<boolean>;
    act(() => {
      first = result.current.sendMessage("plan a trip");
    });
    // the answer is in and the turn is over (copy / feedback show), although the request is still open
    await waitFor(() => expect(result.current.messages.map((m) => m.content)).toEqual(["plan a trip", "Answer"]));
    expect(result.current.isStreaming).toBe(false);
    // the client is asked to take the title as its own frame
    expect(typeof seen[0]!.onTitle).toBe("function");

    // the next message goes while the title is still on its way
    let second!: Promise<boolean>;
    act(() => {
      second = result.current.sendMessage("and then?");
    });
    await waitFor(() => expect(result.current.streamingText).toBe("Second"));
    expect(result.current.isStreaming).toBe(true);

    // the title arrives and the first request ends: the running turn is not touched
    await act(async () => {
      titleGate.open();
      await first;
    });
    expect(result.current.conversation?.title).toBe("Trip to Lisbon");
    expect(onConversationTitleGenerated).toHaveBeenCalledWith("c1", "Trip to Lisbon");
    expect(result.current.isStreaming).toBe(true);

    await act(async () => {
      secondGate.open();
      await second;
    });
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages.map((m) => m.content)).toEqual(["plan a trip", "Answer", "and then?", "Second"]);
  });
});
