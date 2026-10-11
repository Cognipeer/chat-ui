import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ChatI18nProvider } from "../providers";
import { useChat } from "./useChat";
import type { ChatTransport, StreamCallbacks, UploadFileParams } from "../api";
import type { FileAttachment, Message } from "../types";

const now = new Date();

const wrapper = ({ children }: { children: ReactNode }) => (
  <ChatI18nProvider locale="en">{children}</ChatI18nProvider>
);

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeTransport(overrides: Partial<ChatTransport> = {}): ChatTransport {
  return {
    getAgents: async () => [],
    getConversations: async () => ({ conversations: [], total: 0, limit: 20, offset: 0, hasMore: false }),
    createConversation: async (p) => ({ id: "c1", agentId: p.agentId, createdAt: now, updatedAt: now }),
    getConversation: async () => ({ conversation: { id: "c1", agentId: "agent", createdAt: now, updatedAt: now }, messages: [] }),
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

const stored = (name: string, id = `f-${name}`): FileAttachment => ({ id, name, mimeType: "text/plain", size: 5 });
const file = (name: string, type = "text/plain", body = "hello") => new File([body], name, { type });

async function attach(result: { current: ReturnType<typeof useChat> }, ...files: File[]) {
  await act(async () => {
    await result.current.addFiles(files);
  });
}

describe("useChat: files sent as themselves", () => {
  it("a transport that takes raw uploads gets the file's bytes, not base64, with the conversation", async () => {
    const uploadFile = vi.fn(async (p: UploadFileParams) => stored(p.file.name));
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "ok", timestamp: 2 });
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile, sendMessageStream, supportsRawUpload: true }), agentId: "agent", fileTransport: "upload" }),
      { wrapper }
    );
    await attach(result, file("a.txt"));
    await act(async () => {
      await result.current.sendMessage("read");
    });
    const params = uploadFile.mock.calls[0][0];
    expect(params.conversationId).toBe("c1");
    expect(params.file.blob).toBeInstanceOf(Blob);
    expect(params.file.content).toBeUndefined();
    expect(params.file.mimeType).toBe("text/plain");
    expect(typeof params.onProgress).toBe("function");
    expect((sendMessageStream.mock.calls[0][1] as { fileIds?: string[] }).fileIds).toEqual(["f-a.txt"]);
  });

  it("a file the browser could not type goes up as application/octet-stream and is let through to the server", async () => {
    const uploadFile = vi.fn(async (p: UploadFileParams) => stored(p.file.name));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile, supportsRawUpload: true }), agentId: "agent", fileTransport: "upload", allowedFileTypes: ["application/pdf"] }),
      { wrapper }
    );
    await attach(result, file("report", ""));
    expect(result.current.error).toBeNull();
    expect(result.current.pendingFiles[0].mimeType).toBe("application/octet-stream");
    await act(async () => {
      await result.current.sendMessage("go");
    });
    expect(uploadFile.mock.calls[0][0].file.mimeType).toBe("application/octet-stream");
  });

  it("the bubble is on screen while the file goes up, with its chip showing progress, then plain with the stored id", async () => {
    const gate = deferred<FileAttachment>();
    let report!: (p: { loaded: number; total: number }) => void;
    const uploadFile = vi.fn((p: UploadFileParams) => {
      report = p.onProgress!;
      return gate.promise;
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile, supportsRawUpload: true }), agentId: "agent", fileTransport: "upload" }),
      { wrapper }
    );
    await attach(result, file("big.bin", "application/octet-stream"));
    let sending!: Promise<boolean>;
    act(() => {
      sending = result.current.sendMessage("here");
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0]).toMatchObject({ role: "user", content: "here" });
    expect(result.current.messages[0].files?.[0]).toMatchObject({ name: "big.bin", status: "uploading", progress: 0 });
    expect(result.current.pendingFiles).toEqual([]);
    expect(result.current.isUploading).toBe(true);

    act(() => report({ loaded: 50, total: 200 }));
    expect(result.current.messages[0].files?.[0].progress).toBe(0.25);

    await act(async () => {
      gate.resolve(stored("big.bin", "srv-1"));
      await sending;
    });
    const sent = result.current.messages[0].files?.[0];
    expect(sent).toMatchObject({ id: "srv-1", name: "big.bin" });
    expect(sent?.status).toBeUndefined();
    expect(sent?.progress).toBeUndefined();
    expect(result.current.isUploading).toBe(false);
  });

  it("Stop while the file is still going up cancels the upload, takes the bubble back and returns the file to the composer", async () => {
    let signal: AbortSignal | undefined;
    const uploadFile = vi.fn((p: UploadFileParams) => {
      signal = p.signal;
      return new Promise<FileAttachment>((_resolve, reject) => p.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    });
    const sendMessageStream = vi.fn();
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile, sendMessageStream, supportsRawUpload: true }), agentId: "agent", fileTransport: "upload" }),
      { wrapper }
    );
    await attach(result, file("big.bin", "application/octet-stream"));
    let sending!: Promise<boolean>;
    act(() => {
      sending = result.current.sendMessage("here");
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    act(() => result.current.stop());
    let sent: boolean | undefined;
    await act(async () => {
      sent = await sending;
    });
    expect(signal?.aborted).toBe(true);
    expect(sent).toBe(false); // the composer gets its text back
    expect(sendMessageStream).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
    expect(result.current.pendingFiles.map((f) => f.name)).toEqual(["big.bin"]);
    expect(result.current.error).toBeNull();
    expect(result.current.isUploading).toBe(false);
  });

  it("falls back to base64 when the transport does not take raw uploads", async () => {
    const uploadFile = vi.fn(async (p: UploadFileParams) => stored(p.file.name));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile }), agentId: "agent", fileTransport: "upload" }),
      { wrapper }
    );
    await attach(result, file("a.txt"));
    await act(async () => {
      await result.current.sendMessage("read");
    });
    expect(uploadFile.mock.calls[0][0].file).toMatchObject({ name: "a.txt", content: "aGVsbG8=" });
    expect(uploadFile.mock.calls[0][0].file.blob).toBeUndefined();
  });
});

describe("useChat: fileTransport upload-on-select", () => {
  it("stores each file as soon as it is picked, in a conversation made for it, with progress on its chip", async () => {
    const createConversation = vi.fn(async (p: { agentId: string }) => ({ id: "c1", agentId: p.agentId, createdAt: now, updatedAt: now }));
    const gate = deferred<FileAttachment>();
    let report!: (p: { loaded: number; total: number }) => void;
    const uploadFile = vi.fn((p: UploadFileParams) => {
      report = p.onProgress!;
      return gate.promise;
    });
    const onConversationCreated = vi.fn();
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ createConversation, uploadFile, supportsRawUpload: true }), agentId: "agent", fileTransport: "upload-on-select", onConversationCreated }),
      { wrapper }
    );
    let attaching!: Promise<void>;
    act(() => {
      attaching = result.current.addFiles([file("a.txt")]);
    });
    await waitFor(() => expect(result.current.pendingFiles[0]?.status).toBe("uploading"));
    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(onConversationCreated).toHaveBeenCalled();
    expect(result.current.conversation?.id).toBe("c1");
    expect(result.current.isUploading).toBe(true);
    expect(uploadFile.mock.calls[0][0].conversationId).toBe("c1");

    act(() => report({ loaded: 3, total: 4 }));
    expect(result.current.pendingFiles[0].progress).toBe(0.75);

    await act(async () => {
      gate.resolve({ ...stored("a.txt", "srv-1"), expiresAt: "2026-11-10T00:00:00.000Z" });
      await attaching;
    });
    expect(result.current.pendingFiles[0]).toMatchObject({ status: "ready", progress: 1, expiresAt: "2026-11-10T00:00:00.000Z" });
    expect(result.current.isUploading).toBe(false);
  });

  it("sends only the stored ids, without uploading again, and clears the chips", async () => {
    const uploadFile = vi.fn(async (p: UploadFileParams) => stored(p.file.name));
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "ok", timestamp: 2 });
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile, sendMessageStream, supportsRawUpload: true }), agentId: "agent", fileTransport: "upload-on-select" }),
      { wrapper }
    );
    await attach(result, file("a.txt"), file("b.txt"));
    expect(uploadFile).toHaveBeenCalledTimes(2);
    await act(async () => {
      expect(await result.current.sendMessage("read these")).toBe(true);
    });
    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect((sendMessageStream.mock.calls[0][1] as { fileIds?: string[]; files?: unknown }).fileIds).toEqual(["f-a.txt", "f-b.txt"]);
    expect((sendMessageStream.mock.calls[0][1] as { files?: unknown }).files).toBeUndefined();
    expect(result.current.pendingFiles).toEqual([]);
    expect(result.current.messages[0].files?.map((f) => f.id)).toEqual(["f-a.txt", "f-b.txt"]);
    expect(result.current.messages[0].files?.[0].status).toBeUndefined();
  });

  it("will not send while a file is still going up, or after one failed", async () => {
    const gate = deferred<FileAttachment>();
    const uploadFile = vi.fn(() => gate.promise);
    const sendMessageStream = vi.fn();
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile, sendMessageStream }), agentId: "agent", fileTransport: "upload-on-select" }),
      { wrapper }
    );
    let attaching!: Promise<void>;
    act(() => {
      attaching = result.current.addFiles([file("a.txt")]);
    });
    await waitFor(() => expect(result.current.pendingFiles[0]?.status).toBe("uploading"));
    let sent: boolean | undefined;
    await act(async () => {
      sent = await result.current.sendMessage("too early");
    });
    expect(sent).toBe(false);
    expect(sendMessageStream).not.toHaveBeenCalled();

    await act(async () => {
      gate.reject(Object.assign(new Error("too big"), { code: "file_too_large", status: 400 }));
      await attaching;
    });
    expect(result.current.pendingFiles[0]).toMatchObject({ status: "failed" });
    expect(result.current.error?.message).toBe("A file is larger than this assistant accepts. too big");
    await act(async () => {
      sent = await result.current.sendMessage("still no");
    });
    expect(sent).toBe(false);
  });

  it("a failed file can be tried again", async () => {
    const uploadFile = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("offline"), {}))
      .mockResolvedValueOnce(stored("a.txt"));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile }), agentId: "agent", fileTransport: "upload-on-select" }),
      { wrapper }
    );
    await attach(result, file("a.txt"));
    expect(result.current.pendingFiles[0].status).toBe("failed");
    const id = result.current.pendingFiles[0].id;
    await act(async () => {
      await result.current.retryFile(id);
    });
    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(result.current.pendingFiles[0]).toMatchObject({ status: "ready" });
    expect(result.current.error).toBeNull();
  });

  it("removing a stored file deletes it from the server; removing one that is going up stops the upload", async () => {
    let signal: AbortSignal | undefined;
    const uploadFile = vi.fn((p: UploadFileParams) => {
      if (p.file.name === "slow.txt") {
        signal = p.signal;
        return new Promise<FileAttachment>((_r, reject) => p.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      }
      return Promise.resolve(stored(p.file.name));
    });
    const deleteFile = vi.fn(async () => {});
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile, deleteFile }), agentId: "agent", fileTransport: "upload-on-select" }),
      { wrapper }
    );
    await attach(result, file("done.txt"));
    const doneId = result.current.pendingFiles[0].id;
    act(() => result.current.removeFile(doneId));
    expect(deleteFile).toHaveBeenCalledWith("f-done.txt");
    expect(result.current.pendingFiles).toEqual([]);

    let attaching!: Promise<void>;
    act(() => {
      attaching = result.current.addFiles([file("slow.txt")]);
    });
    await waitFor(() => expect(result.current.pendingFiles[0]?.status).toBe("uploading"));
    act(() => result.current.removeFile(result.current.pendingFiles[0].id));
    await act(async () => {
      await attaching;
    });
    expect(signal?.aborted).toBe(true);
    expect(result.current.pendingFiles).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("a refused message keeps the stored files attached for another try", async () => {
    const uploadFile = vi.fn(async (p: UploadFileParams) => stored(p.file.name));
    const deleteFile = vi.fn(async () => {});
    const sendMessageStream = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("Answer the request above first"), { code: "action_pending" }))
      .mockImplementationOnce(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
        cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "ok", timestamp: 2 });
      });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile, deleteFile, sendMessageStream }), agentId: "agent", fileTransport: "upload-on-select" }),
      { wrapper }
    );
    await attach(result, file("a.txt"));
    let sent: boolean | undefined;
    await act(async () => {
      sent = await result.current.sendMessage("read");
    });
    expect(sent).toBe(false);
    expect(deleteFile).not.toHaveBeenCalled();
    expect(result.current.pendingFiles[0]).toMatchObject({ name: "a.txt", status: "ready" });
    await act(async () => {
      sent = await result.current.sendMessage("read");
    });
    expect(sent).toBe(true);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect((sendMessageStream.mock.calls[1][1] as { fileIds?: string[] }).fileIds).toEqual(["f-a.txt"]);
  });

  it("files stored for one conversation are dropped when another is opened", async () => {
    const uploadFile = vi.fn(async (p: UploadFileParams) => stored(p.file.name));
    const deleteFile = vi.fn(async () => {});
    const getConversation = vi.fn(async (id: string) => ({ conversation: { id, agentId: "agent", createdAt: now, updatedAt: now }, messages: [] as Message[] }));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile, deleteFile, getConversation }), agentId: "agent", fileTransport: "upload-on-select" }),
      { wrapper }
    );
    await attach(result, file("a.txt"));
    await act(async () => {
      await result.current.loadConversation("c2");
    });
    expect(result.current.pendingFiles).toEqual([]);
    expect(deleteFile).toHaveBeenCalledWith("f-a.txt");
  });

  it("two files picked at once make one conversation", async () => {
    const createConversation = vi.fn(async (p: { agentId: string }) => ({ id: "c1", agentId: p.agentId, createdAt: now, updatedAt: now }));
    const uploadFile = vi.fn(async (p: UploadFileParams) => stored(p.file.name));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ createConversation, uploadFile }), agentId: "agent", fileTransport: "upload-on-select" }),
      { wrapper }
    );
    await act(async () => {
      await Promise.all([result.current.addFiles([file("a.txt")]), result.current.addFiles([file("b.txt")])]);
    });
    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(uploadFile).toHaveBeenCalledTimes(2);
  });

  it("without upload support the files stay attached and travel inline, as with fileTransport upload", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "ok", timestamp: 2 });
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent", fileTransport: "upload-on-select" }),
      { wrapper }
    );
    await attach(result, file("a.txt"));
    expect(result.current.pendingFiles[0].status).toBeUndefined();
    await act(async () => {
      await result.current.sendMessage("read");
    });
    expect((sendMessageStream.mock.calls[0][1] as { files?: Array<{ name: string }> }).files?.[0].name).toBe("a.txt");
  });
});

describe("useChat: how many files the conversation holds", () => {
  const history = (files: FileAttachment[]): Message[] => [
    { id: "u1", conversationId: "c1", role: "user", content: "earlier", files, createdAt: now, updatedAt: now },
  ];

  it("counts what the server's file list says, and refuses what would not fit the conversation", async () => {
    const getConversation = vi.fn(async () => ({
      conversation: { id: "c1", agentId: "agent", createdAt: now, updatedAt: now },
      messages: history([stored("a.txt"), stored("b.txt")]),
    }));
    const listFiles = vi.fn(async () => ({ files: [stored("a.txt"), stored("b.txt")], total: 2, maxFiles: 3 }));
    const onError = vi.fn();
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, listFiles }), agentId: "agent", conversationId: "c1", maxFiles: 3, maxFilesScope: "conversation", onError }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.heldFiles).toBe(2));
    expect(result.current.heldFilesMax).toBe(3);

    await attach(result, file("c.txt"), file("d.txt"));
    expect(result.current.pendingFiles.map((f) => f.name)).toEqual(["c.txt"]);
    expect(result.current.error?.message).toBe("This chat can hold 3 files; 2 already attached");
  });

  it("per message, what the conversation holds does not count", async () => {
    const getConversation = vi.fn(async () => ({
      conversation: { id: "c1", agentId: "agent", createdAt: now, updatedAt: now },
      messages: history([stored("a.txt"), stored("b.txt")]),
    }));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation }), agentId: "agent", conversationId: "c1", maxFiles: 2 }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.conversation).not.toBeNull());
    await attach(result, file("c.txt"), file("d.txt"));
    expect(result.current.pendingFiles).toHaveLength(2);
  });

  it("falls back to the files of the loaded messages when the transport cannot list them", async () => {
    const getConversation = vi.fn(async () => ({
      conversation: { id: "c1", agentId: "agent", createdAt: now, updatedAt: now },
      messages: history([stored("a.txt")]),
    }));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation }), agentId: "agent", conversationId: "c1", maxFiles: 1, maxFilesScope: "conversation" }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.heldFiles).toBe(1));
    await attach(result, file("b.txt"));
    expect(result.current.pendingFiles).toEqual([]);
  });

  it("a file the list no longer holds is marked expired, and its deadline and conversion state are attached", async () => {
    const getConversation = vi.fn(async () => ({
      conversation: { id: "c1", agentId: "agent", createdAt: now, updatedAt: now },
      messages: history([stored("kept.txt"), stored("gone.txt")]),
    }));
    const listFiles = vi.fn(async () => ({
      files: [{ ...stored("kept.txt"), expiresAt: "2030-01-01T00:00:00.000Z", conversionStatus: "failed" as const }],
      total: 1,
    }));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, listFiles }), agentId: "agent", conversationId: "c1" }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    const files = result.current.messages[0].files!;
    expect(files[0]).toMatchObject({ name: "kept.txt", expiresAt: "2030-01-01T00:00:00.000Z", conversionStatus: "failed" });
    expect(files[0].expired).toBeUndefined();
    expect(files[1]).toMatchObject({ name: "gone.txt", expired: true });
  });

  it("does not call a file gone when the list is only a page of a longer one", async () => {
    const getConversation = vi.fn(async () => ({
      conversation: { id: "c1", agentId: "agent", createdAt: now, updatedAt: now },
      messages: history([stored("a.txt"), stored("z.txt")]),
    }));
    const listFiles = vi.fn(async () => ({ files: [stored("a.txt")], total: 400, hasMore: true }));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, listFiles }), agentId: "agent", conversationId: "c1" }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0].files!.every((f) => !f.expired)).toBe(true);
  });

  it("looks at the list again after a message took its files", async () => {
    const listFiles = vi.fn(async () => ({ files: [stored("a.txt")], total: 1, maxFiles: 5 }));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ listFiles }), agentId: "agent", maxFiles: 5, maxFilesScope: "conversation" }),
      { wrapper }
    );
    await attach(result, file("a.txt"));
    await act(async () => {
      await result.current.sendMessage("read");
    });
    await waitFor(() => expect(listFiles).toHaveBeenCalledWith("c1"));
    expect(result.current.heldFiles).toBe(1);
  });
});
