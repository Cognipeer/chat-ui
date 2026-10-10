import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { ChatI18nProvider } from "../providers";
import { useChat } from "./useChat";
import type { ChatTransport, StreamCallbacks } from "../api";

const wrapper = ({ children }: { children: ReactNode }) => (
  <ChatI18nProvider locale="en">{children}</ChatI18nProvider>
);

function makeTransport(overrides: Partial<ChatTransport> = {}): ChatTransport {
  return {
    getAgents: async () => [],
    getConversations: async () => ({ conversations: [], total: 0, limit: 20, offset: 0, hasMore: false }),
    createConversation: async (p) => ({ id: "c1", agentId: p.agentId, createdAt: new Date(), updatedAt: new Date() }),
    getConversation: async () => {
      throw new Error("unused");
    },
    deleteConversation: async () => {},
    sendMessage: async () => {
      throw new Error("unused");
    },
    sendMessageStream: async (_c, _o, cb: StreamCallbacks) => {
      cb.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "u1", timestamp: 1 });
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "read", timestamp: 2 });
    },
    ...overrides,
  };
}

const file = (name: string, type = "text/plain") => new File(["hello"], name, { type });

async function attach(result: { current: ReturnType<typeof useChat> }, ...files: File[]) {
  await act(async () => {
    await result.current.addFiles(files);
  });
}

describe("useChat files", () => {
  it("fileTransport 'upload' stores each file first and sends only their ids", async () => {
    const uploadFile = vi.fn(async (p: { file: { name: string } }) => ({
      id: `f-${p.file.name}`, name: p.file.name, mimeType: "text/plain", size: 5,
    }));
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "u1", timestamp: 1 });
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "read", timestamp: 2 });
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile, sendMessageStream }), agentId: "agent", fileTransport: "upload" }),
      { wrapper }
    );
    await attach(result, file("a.txt"), file("b.txt"));
    await act(async () => {
      await result.current.sendMessage("read these");
    });

    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(uploadFile.mock.calls[0][0]).toMatchObject({ conversationId: "c1", file: { name: "a.txt", mimeType: "text/plain" } });
    const sent = sendMessageStream.mock.calls[0][1] as { files?: unknown; fileIds?: string[] };
    expect(sent.fileIds).toEqual(["f-a.txt", "f-b.txt"]);
    expect(sent.files).toBeUndefined();
    expect(result.current.pendingFiles).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("keeps the default: files travel inline in the message", async () => {
    const uploadFile = vi.fn();
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "ok", timestamp: 2 });
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile, sendMessageStream }), agentId: "agent" }),
      { wrapper }
    );
    await attach(result, file("a.txt"));
    await act(async () => {
      await result.current.sendMessage("read");
    });
    expect(uploadFile).not.toHaveBeenCalled();
    const sent = sendMessageStream.mock.calls[0][1] as { files?: Array<{ name: string; content: string }>; fileIds?: string[] };
    expect(sent.files?.[0]).toMatchObject({ name: "a.txt", content: "aGVsbG8=" });
    expect(sent.fileIds).toBeUndefined();
  });

  it("falls back to inline when the transport cannot upload", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "ok", timestamp: 2 });
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent", fileTransport: "upload" }),
      { wrapper }
    );
    await attach(result, file("a.txt"));
    await act(async () => {
      await result.current.sendMessage("read");
    });
    expect((sendMessageStream.mock.calls[0][1] as { files?: unknown[] }).files).toHaveLength(1);
  });

  it("a failed upload sends nothing, removes what was stored and keeps the files for another try", async () => {
    const uploadFile = vi
      .fn()
      .mockResolvedValueOnce({ id: "f1", name: "a.txt", mimeType: "text/plain", size: 5 })
      .mockRejectedValueOnce(new Error("File exceeds the 1 MB limit of this agent."));
    const deleteFile = vi.fn(async () => {});
    const sendMessageStream = vi.fn();
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile, deleteFile, sendMessageStream }), agentId: "agent", fileTransport: "upload" }),
      { wrapper }
    );
    await attach(result, file("a.txt"), file("b.txt"));
    await act(async () => {
      await result.current.sendMessage("read these");
    });
    expect(sendMessageStream).not.toHaveBeenCalled();
    expect(deleteFile).toHaveBeenCalledWith("f1");
    expect(result.current.error?.message).toContain("exceeds");
    expect(result.current.pendingFiles).toHaveLength(2);
  });

  it("removes the stored files when the server refuses the message", async () => {
    const uploadFile = vi.fn(async () => ({ id: "f1", name: "a.txt", mimeType: "text/plain", size: 5 }));
    const deleteFile = vi.fn(async () => {});
    const sendMessageStream = vi.fn(async () => {
      throw new Error("Answer the request above first");
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile, deleteFile, sendMessageStream }), agentId: "agent", fileTransport: "upload" }),
      { wrapper }
    );
    await attach(result, file("a.txt"));
    await act(async () => {
      await result.current.sendMessage("read");
    });
    expect(deleteFile).toHaveBeenCalledWith("f1");
    expect(result.current.error?.message).toBe("Answer the request above first");
  });

  it("matches wildcard media types such as image/*", async () => {
    const onError = vi.fn();
    const { result } = renderHook(
      () => useChat({ transport: makeTransport(), agentId: "agent", allowedFileTypes: ["image/*", ".pdf"], onError }),
      { wrapper }
    );
    await attach(result, file("p.png", "image/png"), file("d.pdf", "application/pdf"), file("n.txt", "text/plain"));
    expect(result.current.pendingFiles.map((f) => f.name)).toEqual(["p.png", "d.pdf"]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
