import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ChatI18nProvider } from "../providers";
import { useChatHistory } from "./useChatHistory";
import { AgentServerClient, type ChatTransport } from "../api";
import type { ConversationListItem } from "../types";
import tr from "../locales/tr.json";

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

describe("unpinning through the client when the answer echoes the pin that was removed", () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

  it("keeps the row unpinned, without an error, when the conversation as it is now is not pinned", async () => {
    const answers = [
      json({ id: "c", agentId: "agent", metadata: { pinned: true } }), // PATCH { pinned: true }: stored
      json({ id: "c", agentId: "agent", metadata: { pinned: true } }), // PATCH { pinned: false }: the echo of the old row
      json({ conversation: { id: "c", agentId: "agent", metadata: {} }, messages: [] }), // GET: how it is now
    ];
    const fetchMock = vi.fn(async () => answers.shift() ?? new Response("{}", { status: 500 }));
    const client = new AgentServerClient({ baseUrl: "http://x/api", fetch: fetchMock as unknown as typeof fetch });
    const { result } = await load(makeTransport({ pinConversation: (id, pinned) => client.pinConversation(id, pinned) }));
    await act(async () => {
      expect(await result.current.pinConversation("c", true)).toBe(true);
    });
    await act(async () => {
      expect(await result.current.pinConversation("c", false)).toBe(true);
    });
    expect(result.current.conversations.find((c) => c.id === "c")?.pinned).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("a refusal in the person's language", () => {
  const refusal = (code: string, message: string) => Object.assign(new Error(message), { code, status: 403 });
  const inLocale = (locale: "en" | "tr") =>
    ({ children }: { children: ReactNode }) => <ChatI18nProvider locale={locale}>{children}</ChatI18nProvider>;

  it("shows the friendly message of a refused rename or pin, and keeps the server's wording beside it", async () => {
    const renameConversation = vi.fn(async () => {
      throw refusal("action_disabled", "Renaming a conversation is switched off for this agent");
    });
    const pinConversation = vi.fn(async () => {
      throw refusal("rate_limited", "Slow down");
    });
    const transport = makeTransport({ renameConversation, pinConversation });
    const hook = renderHook(() => useChatHistory({ transport, autoLoad: false }), { wrapper: inLocale("tr") });
    await act(async () => {
      await hook.result.current.load();
    });
    await act(async () => {
      expect(await hook.result.current.renameConversation("b", "New")).toBe(false);
    });
    expect(hook.result.current.error?.message).toBe(tr["chat.error.code.action_disabled"]);
    expect((hook.result.current.error as { serverMessage?: string }).serverMessage).toBe("Renaming a conversation is switched off for this agent");
    await act(async () => {
      expect(await hook.result.current.pinConversation("c", true)).toBe(false);
    });
    expect(hook.result.current.error?.message).toBe(tr["chat.error.code.rate_limited"]);
  });

  it("leaves an error without a known code as it came", async () => {
    const renameConversation = vi.fn(async () => {
      throw refusal("SOMETHING_NEW", "Plain words");
    });
    const { result } = await load(makeTransport({ renameConversation }));
    await act(async () => {
      await result.current.renameConversation("b", "New");
    });
    expect(result.current.error?.message).toBe("Plain words");
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
