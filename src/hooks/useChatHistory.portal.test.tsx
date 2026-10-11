import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ChatI18nProvider } from "../providers";
import { useChatHistory } from "./useChatHistory";
import type { ChatTransport } from "../api";
import type { ConversationListItem } from "../types";

const wrapper = ({ children }: { children: ReactNode }) => <ChatI18nProvider locale="en">{children}</ChatI18nProvider>;
const now = new Date();
const item = (id: string, title = `Chat ${id}`): ConversationListItem => ({ id, title, agentId: "agent", createdAt: now, updatedAt: now });

function makeTransport(overrides: Partial<ChatTransport> = {}): ChatTransport {
  return {
    getAgents: async () => [],
    getConversations: async () => ({ conversations: [item("a"), item("b"), item("c")], total: 3, limit: 20, offset: 0, hasMore: false }),
    createConversation: async () => {
      throw new Error("unused");
    },
    getConversation: async () => {
      throw new Error("unused");
    },
    deleteConversation: async () => {},
    sendMessage: async () => {
      throw new Error("unused");
    },
    sendMessageStream: async () => {},
    ...overrides,
  };
}

async function load(transport: ChatTransport) {
  const hook = renderHook(() => useChatHistory({ transport, autoLoad: false }), { wrapper });
  await act(async () => {
    await hook.result.current.load();
  });
  return hook;
}

describe("renaming", () => {
  it("shows the new title at once and keeps it when the server agrees", async () => {
    const renameConversation = vi.fn(async () => {});
    const { result } = await load(makeTransport({ renameConversation }));
    expect(result.current.canRename).toBe(true);
    await act(async () => {
      expect(await result.current.renameConversation("b", "  Budget talk ")).toBe(true);
    });
    expect(renameConversation).toHaveBeenCalledWith("b", "Budget talk");
    expect(result.current.conversations.find((c) => c.id === "b")?.title).toBe("Budget talk");
  });

  it("puts the old title back and reports the failure", async () => {
    const renameConversation = vi.fn(async () => {
      throw new Error("no way");
    });
    const { result } = await load(makeTransport({ renameConversation }));
    await act(async () => {
      expect(await result.current.renameConversation("b", "New")).toBe(false);
    });
    expect(result.current.conversations.find((c) => c.id === "b")?.title).toBe("Chat b");
    expect(result.current.error?.message).toBe("no way");
  });

  it("does nothing for an empty or unchanged title, or a transport that cannot rename", async () => {
    const renameConversation = vi.fn(async () => {});
    const { result } = await load(makeTransport({ renameConversation }));
    await act(async () => {
      expect(await result.current.renameConversation("b", "   ")).toBe(false);
      expect(await result.current.renameConversation("b", "Chat b")).toBe(false);
    });
    expect(renameConversation).not.toHaveBeenCalled();
    const plain = await load(makeTransport());
    expect(plain.result.current.canRename).toBe(false);
    await act(async () => {
      expect(await plain.result.current.renameConversation("b", "x")).toBe(false);
    });
  });
});

describe("pinning", () => {
  it("marks the conversation pinned and takes it back on failure", async () => {
    const pinConversation = vi.fn(async (_id: string, pinned: boolean) => {
      if (!pinned) throw new Error("denied");
    });
    const { result } = await load(makeTransport({ pinConversation }));
    expect(result.current.canPin).toBe(true);
    await act(async () => {
      expect(await result.current.pinConversation("c", true)).toBe(true);
    });
    expect(result.current.conversations.find((c) => c.id === "c")).toMatchObject({ pinned: true, metadata: { pinned: true } });
    await act(async () => {
      expect(await result.current.pinConversation("c", false)).toBe(false);
    });
    // the failed unpin leaves it pinned
    expect(result.current.conversations.find((c) => c.id === "c")?.pinned).toBe(true);
  });
});

describe("pinning against a server that does not do it", () => {
  it("keeps the pin when the server says it stored it", async () => {
    const pinConversation = vi.fn(async (_id: string, pinned: boolean) => pinned);
    const { result } = await load(makeTransport({ pinConversation }));
    await act(async () => {
      expect(await result.current.pinConversation("c", true)).toBe(true);
    });
    expect(result.current.conversations.find((c) => c.id === "c")).toMatchObject({ pinned: true });
    expect(result.current.error).toBeNull();
  });

  it("takes the row back when the server answers 200 but did not pin it", async () => {
    // agent-server drops a pin it was not asked for in the right place and still answers 200
    const pinConversation = vi.fn(async () => false);
    const { result } = await load(makeTransport({ pinConversation }));
    const before = result.current.conversations.find((c) => c.id === "c");
    await act(async () => {
      expect(await result.current.pinConversation("c", true)).toBe(false);
    });
    expect(result.current.conversations.find((c) => c.id === "c")).toEqual(before);
    expect(result.current.error?.message).toBeTruthy();
  });

  it("takes an unpin back when the conversation is still pinned", async () => {
    const pinConversation = vi.fn(async () => true);
    const { result } = await load(makeTransport({ pinConversation }));
    await act(async () => {
      await result.current.pinConversation("c", true);
    });
    await act(async () => {
      expect(await result.current.pinConversation("c", false)).toBe(false);
    });
    expect(result.current.conversations.find((c) => c.id === "c")?.pinned).toBe(true);
  });

  it("trusts a server that does not say what it stored", async () => {
    const pinConversation = vi.fn(async () => undefined);
    const { result } = await load(makeTransport({ pinConversation }));
    await act(async () => {
      expect(await result.current.pinConversation("c", true)).toBe(true);
    });
    expect(result.current.conversations.find((c) => c.id === "c")?.pinned).toBe(true);
  });
});

describe("deleting several", () => {
  it("uses the bulk route and drops what is gone from the list", async () => {
    const deleteConversations = vi.fn(async () => ({ deleted: ["a", "c"], failed: [{ id: "b", code: "forbidden" }] }));
    const { result } = await load(makeTransport({ deleteConversations }));
    let outcome!: { deleted: string[]; failed: string[] };
    await act(async () => {
      outcome = await result.current.deleteConversations(["a", "b", "c", "a"]);
    });
    expect(deleteConversations).toHaveBeenCalledWith(["a", "b", "c"]);
    expect(outcome).toEqual({ deleted: ["a", "c"], failed: ["b"] });
    expect(result.current.conversations.map((c) => c.id)).toEqual(["b"]);
    expect(result.current.error?.message).toBe("1 conversation could not be deleted");
  });

  it("deletes one by one when the transport has no bulk route", async () => {
    const deleteConversation = vi.fn(async (id: string) => {
      if (id === "b") throw new Error("x");
    });
    const { result } = await load(makeTransport({ deleteConversation }));
    let outcome!: { deleted: string[]; failed: string[] };
    await act(async () => {
      outcome = await result.current.deleteConversations(["a", "b"]);
    });
    expect(outcome).toEqual({ deleted: ["a"], failed: ["b"] });
    await waitFor(() => expect(result.current.conversations.map((c) => c.id)).toEqual(["b", "c"]));
  });

  it("keeps the list when the bulk call itself fails", async () => {
    const deleteConversations = vi.fn(async () => {
      throw new Error("offline");
    });
    const { result } = await load(makeTransport({ deleteConversations }));
    await act(async () => {
      expect(await result.current.deleteConversations(["a"])).toEqual({ deleted: [], failed: ["a"] });
    });
    expect(result.current.conversations).toHaveLength(3);
    expect(result.current.error?.message).toBe("offline");
  });
});
