import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    expect(result.current.error?.message).toBe("File big.txt is larger than the 3 Bytes limit");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe("File big.txt is larger than the 3 Bytes limit");
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
    // the server says action_pending: shown as the localized message, the server's wording kept aside
    expect(result.current.error?.message).toBe("The assistant is waiting for your answer above. Answer it to continue.");
    expect((result.current.error as { serverMessage?: string } | null)?.serverMessage).toBe("Answer the request above first");
    expect((result.current.error as { code?: string } | null)?.code).toBe("action_pending");

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

describe("useChat sends files without text", () => {
  const sentTo = () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m1", content: "ok", timestamp: 2 });
    });
    return sendMessageStream;
  };
  const messageOf = (stream: ReturnType<typeof sentTo>) => (stream.mock.calls[0][1] as { message: string }).message;

  it("sends the default text with the files when the text is empty", async () => {
    const sendMessageStream = sentTo();
    const { result } = renderHook(() => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent" }), { wrapper });
    await attach(result, file("a.txt"));
    let sent: boolean | undefined;
    await act(async () => {
      sent = await result.current.sendMessage("");
    });
    expect(sent).toBe(true);
    expect(messageOf(sendMessageStream)).toBe("Please review the attached files.");
    expect(result.current.messages[0]).toMatchObject({ role: "user", content: "Please review the attached files." });
    expect(result.current.messages[0].files).toHaveLength(1);
  });

  it("uses the configured text, and an empty one when asked to", async () => {
    const custom = sentTo();
    const first = renderHook(
      () => useChat({ transport: makeTransport({ sendMessageStream: custom }), agentId: "agent", attachmentsOnlyMessage: "Summarize this" }),
      { wrapper }
    );
    await attach(first.result, file("a.txt"));
    await act(async () => {
      await first.result.current.sendMessage("   ");
    });
    expect(messageOf(custom)).toBe("Summarize this");

    const none = sentTo();
    const second = renderHook(
      () => useChat({ transport: makeTransport({ sendMessageStream: none }), agentId: "agent", attachmentsOnlyMessage: "" }),
      { wrapper }
    );
    await attach(second.result, file("a.txt"));
    await act(async () => {
      await second.result.current.sendMessage("");
    });
    expect(messageOf(none)).toBe("");
  });

  it("speaks the locale for the default text", async () => {
    const trWrapper = ({ children }: { children: ReactNode }) => <ChatI18nProvider locale="tr">{children}</ChatI18nProvider>;
    const sendMessageStream = sentTo();
    const { result } = renderHook(() => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent" }), { wrapper: trWrapper });
    await attach(result, file("a.txt"));
    await act(async () => {
      await result.current.sendMessage("");
    });
    expect(messageOf(sendMessageStream)).toBe("Lütfen ekli dosyaları inceleyin.");
  });

  it("still sends nothing for empty text and no files", async () => {
    const sendMessageStream = sentTo();
    const { result } = renderHook(() => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent" }), { wrapper });
    let sent: boolean | undefined;
    await act(async () => {
      sent = await result.current.sendMessage("  ");
    });
    expect(sent).toBe(false);
    expect(sendMessageStream).not.toHaveBeenCalled();
  });

  it("keeps the typed text over the default", async () => {
    const sendMessageStream = sentTo();
    const { result } = renderHook(() => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent" }), { wrapper });
    await attach(result, file("a.txt"));
    await act(async () => {
      await result.current.sendMessage("what is in here?");
    });
    expect(messageOf(sendMessageStream)).toBe("what is in here?");
  });
});

describe("useChat: uploading", () => {
  it("is uploading while the files are being stored, and the files stay attached if it fails", async () => {
    let finish!: (file: { id: string; name: string; mimeType: string; size: number }) => void;
    const uploadFile = vi.fn(() => new Promise<{ id: string; name: string; mimeType: string; size: number }>((resolve) => (finish = resolve)));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile }), agentId: "agent", fileTransport: "upload" }),
      { wrapper }
    );
    await attach(result, file("a.txt"));
    expect(result.current.isUploading).toBe(false);

    let sending!: Promise<boolean>;
    act(() => {
      sending = result.current.sendMessage("read");
    });
    await vi.waitFor(() => expect(result.current.isUploading).toBe(true));
    await act(async () => {
      finish({ id: "f1", name: "a.txt", mimeType: "text/plain", size: 5 });
      await sending;
    });
    expect(result.current.isUploading).toBe(false);
  });

  it("is not uploading when a message carries no files", async () => {
    const { result } = renderHook(() => useChat({ transport: makeTransport(), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("hello");
    });
    expect(result.current.isUploading).toBe(false);
  });

  it("is not uploading after a failed upload", async () => {
    const uploadFile = vi.fn(async () => {
      throw new Error("nope");
    });
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ uploadFile }), agentId: "agent", fileTransport: "upload" }),
      { wrapper }
    );
    await attach(result, file("a.txt"));
    await act(async () => {
      await result.current.sendMessage("read");
    });
    expect(result.current.isUploading).toBe(false);
    expect(result.current.pendingFiles).toHaveLength(1);
  });
});

describe("useChat: image previews", () => {
  const created: string[] = [];
  const revoked: string[] = [];
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

  beforeEach(() => {
    created.length = 0;
    revoked.length = 0;
    URL.createObjectURL = () => {
      const url = `blob:test/${created.length}`;
      created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };
  });

  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
  });

  it("gives an image a local thumbnail URL, and other files none", async () => {
    const { result } = renderHook(() => useChat({ transport: makeTransport(), agentId: "agent" }), { wrapper });
    await attach(result, file("cat.png", "image/png"), file("notes.txt"));
    const [image, text] = result.current.pendingFiles;
    expect(image.previewUrl).toBe("blob:test/0");
    expect(text.previewUrl).toBeUndefined();
    expect(created).toHaveLength(1);
  });

  it("releases the URL when the file is removed", async () => {
    const { result } = renderHook(() => useChat({ transport: makeTransport(), agentId: "agent" }), { wrapper });
    await attach(result, file("cat.png", "image/png"));
    act(() => result.current.removeFile(result.current.pendingFiles[0].id));
    expect(revoked).toEqual(["blob:test/0"]);
    expect(result.current.pendingFiles).toEqual([]);
  });

  it("keeps the thumbnail on the sent message, and releases it when the chat is left or the hook unmounts", async () => {
    const { result, unmount } = renderHook(() => useChat({ transport: makeTransport(), agentId: "agent" }), { wrapper });
    await attach(result, file("cat.png", "image/png"));
    await act(async () => {
      await result.current.sendMessage("look");
    });
    expect(result.current.messages[0].files?.[0].previewUrl).toBe("blob:test/0");
    expect(revoked).toEqual([]);

    act(() => result.current.clearMessages());
    expect(revoked).toEqual(["blob:test/0"]);

    await attach(result, file("dog.png", "image/png"));
    unmount();
    expect(revoked).toEqual(["blob:test/0", "blob:test/1"]);
  });

  it("brings a refused message's thumbnail back with its file", async () => {
    const sendMessageStream = vi.fn(async () => {
      throw new Error("nope");
    });
    const { result } = renderHook(() => useChat({ transport: makeTransport({ sendMessageStream }), agentId: "agent" }), { wrapper });
    await attach(result, file("cat.png", "image/png"));
    await act(async () => {
      await result.current.sendMessage("look");
    });
    expect(result.current.pendingFiles[0].previewUrl).toBe("blob:test/0");
    expect(revoked).toEqual([]);
  });

  it("gives no local URL to a picture that can carry script, since an object URL opens in the page's own origin", async () => {
    const { result } = renderHook(() => useChat({ transport: makeTransport(), agentId: "agent" }), { wrapper });
    await attach(result, file("logo.svg", "image/svg+xml"), file("cat.png", "image/png"), file("anim.gif", "image/gif"));
    const [svg, png, gif] = result.current.pendingFiles;
    expect(svg.previewUrl).toBeUndefined();
    expect(png.previewUrl).toBeDefined();
    expect(gif.previewUrl).toBeDefined();
    expect(created).toHaveLength(2);
  });

  it.each(["inline", "upload"] as const)("pictures waiting in the composer keep their previews when another conversation is opened (%s)", async (fileTransport) => {
    const getConversation = vi.fn(async (id: string) => ({
      conversation: { id, agentId: "agent", createdAt: new Date(), updatedAt: new Date() },
      messages: [],
    }));
    const { result } = renderHook(() => useChat({ transport: makeTransport({ getConversation }), agentId: "agent", fileTransport }), { wrapper });
    await attach(result, file("cat.png", "image/png"));
    const waiting = result.current.pendingFiles[0];
    await act(async () => {
      await result.current.loadConversation("other");
    });
    expect(result.current.pendingFiles.map((f) => f.id)).toEqual([waiting.id]);
    expect(revoked).toEqual([]);

    // what has left the page is released all the same
    act(() => result.current.removeFile(waiting.id));
    expect(revoked).toEqual([waiting.previewUrl]);
  });

  it("releases the previews of files that are dropped with the conversation they were picked in (upload-on-select)", async () => {
    const uploadFile = vi.fn(async (p: { file: { name: string } }) => ({ id: `f-${p.file.name}`, name: p.file.name, mimeType: "image/png", size: 5 }));
    const getConversation = vi.fn(async (id: string) => ({
      conversation: { id, agentId: "agent", createdAt: new Date(), updatedAt: new Date() },
      messages: [],
    }));
    const { result } = renderHook(
      () => useChat({ transport: makeTransport({ getConversation, uploadFile }), agentId: "agent", fileTransport: "upload-on-select" }),
      { wrapper }
    );
    await attach(result, file("cat.png", "image/png"));
    await act(async () => {
      await result.current.loadConversation("other");
    });
    expect(result.current.pendingFiles).toEqual([]);
    expect(revoked).toEqual(["blob:test/0"]);
  });

  it("works where the browser cannot make object URLs", async () => {
    (URL as { createObjectURL?: unknown }).createObjectURL = undefined;
    const { result } = renderHook(() => useChat({ transport: makeTransport(), agentId: "agent" }), { wrapper });
    await attach(result, file("cat.png", "image/png"));
    expect(result.current.pendingFiles[0].previewUrl).toBeUndefined();
  });
});
