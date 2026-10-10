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

describe("useChat refused files", () => {
  const empty = (name: string) => new File([], name, { type: "text/plain" });

  it("shows a refusal through error as well as onError", async () => {
    const onError = vi.fn();
    const { result } = renderHook(
      () => useChat({ transport: makeTransport(), agentId: "agent", maxFileSize: 3, onError }),
      { wrapper }
    );
    await attach(result, file("big.txt"));
    expect(result.current.pendingFiles).toEqual([]);
    expect(result.current.error?.message).toBe("File big.txt exceeds maximum size");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe("File big.txt exceeds maximum size");
  });

  it("refuses a file over the count and keeps the ones that fit", async () => {
    const onError = vi.fn();
    const { result } = renderHook(
      () => useChat({ transport: makeTransport(), agentId: "agent", maxFiles: 2, onError }),
      { wrapper }
    );
    await attach(result, file("a.txt"), file("b.txt"), file("c.txt"));
    expect(result.current.pendingFiles.map((f) => f.name)).toEqual(["a.txt", "b.txt"]);
    expect(result.current.error?.message).toBe("Maximum 2 files allowed");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("refuses a 0-byte file with a clear message", async () => {
    const onError = vi.fn();
    const { result } = renderHook(
      () => useChat({ transport: makeTransport(), agentId: "agent", onError }),
      { wrapper }
    );
    await attach(result, empty("blank.txt"), file("ok.txt"));
    expect(result.current.pendingFiles.map((f) => f.name)).toEqual(["ok.txt"]);
    expect(result.current.error?.message).toBe("File blank.txt is empty");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("reports several refusals of one drop together, and each one to onError", async () => {
    const onError = vi.fn();
    const { result } = renderHook(
      () => useChat({ transport: makeTransport(), agentId: "agent", allowedFileTypes: [".pdf"], onError }),
      { wrapper }
    );
    await attach(result, file("a.txt", "text/plain"), file("b.png", "image/png"), file("blank", ""));
    expect(result.current.pendingFiles).toEqual([]);
    expect(result.current.error?.message).toBe(
      "File type text/plain not allowed; File type image/png not allowed; File type blank not allowed"
    );
    expect(onError).toHaveBeenCalledTimes(3);
  });

  it("leaves error alone when every file is accepted", async () => {
    const { result } = renderHook(() => useChat({ transport: makeTransport(), agentId: "agent" }), { wrapper });
    await attach(result, file("a.txt"));
    expect(result.current.error).toBeNull();
  });
});

describe("useChat refused sends", () => {
  it("resolves true for a message the server took", async () => {
    const { result } = renderHook(() => useChat({ transport: makeTransport(), agentId: "agent" }), { wrapper });
    let sent: boolean | undefined;
    await act(async () => {
      sent = await result.current.sendMessage("hello");
    });
    expect(sent).toBe(true);
    expect(result.current.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("resolves false when a file upload is refused, with the files still attached", async () => {
    const uploadFile = vi.fn().mockRejectedValue(new Error("A session holds at most 2 files."));
    const sendMessageStream = vi.fn();
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile, sendMessageStream }), agentId: "agent", fileTransport: "upload" }),
      { wrapper }
    );
    await attach(result, file("a.txt"));
    let sent: boolean | undefined;
    await act(async () => {
      sent = await result.current.sendMessage("second batch");
    });
    expect(sent).toBe(false);
    expect(sendMessageStream).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
    expect(result.current.pendingFiles).toHaveLength(1);
    expect(result.current.error?.message).toContain("at most 2 files");
  });

  it("takes the bubble back and re-attaches the files when the server refuses the message", async () => {
    const sendMessageStream = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("Answer the request above first"), { code: "action_pending" }))
      .mockImplementationOnce(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
        cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "read", timestamp: 2 });
      });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent" }),
      { wrapper }
    );
    await attach(result, file("a.txt"));
    let sent: boolean | undefined;
    await act(async () => {
      sent = await result.current.sendMessage("read this");
    });
    expect(sent).toBe(false);
    expect(result.current.messages).toEqual([]);
    expect(result.current.pendingFiles.map((f) => f.name)).toEqual(["a.txt"]);
    expect(result.current.error?.message).toBe("Answer the request above first");

    // the retry carries the file again, content included
    await act(async () => {
      sent = await result.current.sendMessage("read this");
    });
    expect(sent).toBe(true);
    expect((sendMessageStream.mock.calls[1][1] as { files?: Array<{ name: string; content: string }> }).files?.[0]).toMatchObject({
      name: "a.txt",
      content: "aGVsbG8=",
    });
    expect(result.current.pendingFiles).toEqual([]);
  });

  it("does the same without streaming", async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error("offline"));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ sendMessage }), agentId: "agent", streaming: false }),
      { wrapper }
    );
    let sent: boolean | undefined;
    await act(async () => {
      sent = await result.current.sendMessage("hello");
    });
    expect(sent).toBe(false);
    expect(result.current.messages).toEqual([]);
  });

  it("keeps the bubble and resolves true once the server started answering", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "u1", timestamp: 1 });
      throw new Error("connection lost");
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent" }),
      { wrapper }
    );
    let sent: boolean | undefined;
    await act(async () => {
      sent = await result.current.sendMessage("hello");
    });
    expect(sent).toBe(true);
    expect(result.current.messages.map((m) => m.role)).toEqual(["user"]);
    expect(result.current.error?.message).toBe("connection lost");
  });
});
