import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { Chat, type ChatProps } from "./Chat";
import type { ChatTransport, FollowEventsOptions, StreamCallbacks, UploadFileParams } from "../../api";
import type { AgentInfo, Conversation, ConversationListItem, FileAttachment, Message } from "../../types";

afterEach(cleanup);

// jsdom has no layout, so the message list's scroll-to-bottom has nothing to call
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const render = (ui: ReactElement) => rtlRender(<ChatI18nProvider locale="en">{ui}</ChatI18nProvider>);
const now = new Date();
let counter = 0;

const message = (partial: Partial<Message>): Message => ({
  id: "m",
  conversationId: "c1",
  role: "assistant",
  content: "",
  createdAt: now,
  updatedAt: now,
  ...partial,
});
const conversation = (partial: Partial<Conversation> = {}): Conversation => ({ id: "c1", agentId: "a", createdAt: now, updatedAt: now, ...partial });
const row = (partial: Partial<ConversationListItem> = {}): ConversationListItem => ({ id: "c1", agentId: "a", title: "Research", createdAt: now, updatedAt: now, ...partial });
const agent = (extra: Partial<AgentInfo> = {}): AgentInfo => ({ id: "a", name: "Alpha", ...extra });

function transportFor(options: {
  agents?: AgentInfo[];
  conversations?: ConversationListItem[];
  conversation?: Conversation;
  messages?: Message[];
  overrides?: Partial<ChatTransport>;
}): ChatTransport {
  const { agents = [agent()], conversations = [row()], conversation: conv = conversation(), messages = [] } = options;
  return {
    getAgents: async () => agents,
    getConversations: async () => ({ conversations, total: conversations.length, limit: 20, offset: 0, hasMore: false }),
    createConversation: async (p) => conversation({ id: "new", agentId: p.agentId }),
    getConversation: async () => ({ conversation: conv, messages }),
    deleteConversation: async () => {},
    sendMessage: async () => {
      throw new Error("unused");
    },
    sendMessageStream: async (_c, _o, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "new", messageId: "m9", content: "ok", timestamp: 1 });
    },
    ...options.overrides,
  };
}

function renderChat(transport: ChatTransport, props: Partial<ChatProps> = {}) {
  counter += 1;
  return render(<Chat baseUrl={`http://run-${counter}`} transport={transport} {...props} />);
}

const textbox = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const user = message({ id: "u1", role: "user", content: "research it" });

describe("Chat reattaches to a turn that is still running", () => {
  it("follows it: the composer says so, Stop is there, the live text shows, then the stored answer replaces it", async () => {
    let emit!: FollowEventsOptions["onEvent"];
    const cancel = vi.fn(async () => ({ cancelled: true, settled: true }));
    const followEvents = vi.fn((_id: string, options: FollowEventsOptions) => {
      emit = options.onEvent;
      return new Promise<void>((resolve) => options.signal?.addEventListener("abort", () => resolve()));
    });
    let stored = false;
    const getConversation = vi.fn(async () =>
      stored
        ? { conversation: conversation({ runtime: { status: "idle", stopReason: "end_turn", lastEventSeq: 9 } }), messages: [user, message({ id: "m2", content: "The report is ready." })] }
        : { conversation: conversation({ runtime: { status: "running", lastEventSeq: 3 } }), messages: [user] }
    );
    renderChat(transportFor({ conversation: undefined, messages: [user], overrides: { followEvents, cancel, getConversation } }), { conversationId: "c1" });

    await screen.findByText("This conversation is still answering. You can stop it here.");
    expect(textbox().disabled).toBe(true);
    expect(followEvents.mock.calls[0][1].after).toBe(3);
    act(() => {
      emit({ type: "agent.message.delta", data: { text: "Almost there" } });
    });
    expect(await screen.findByText("Almost there")).toBeTruthy();

    fireEvent.click(screen.getByTitle("Stop generation"));
    expect(cancel).toHaveBeenCalledWith("c1");

    stored = true;
    act(() => {
      emit({ type: "agent.message", seq: 8, data: { content: "The report is ready.", message_id: "m2" } });
      emit({ type: "session.status_idle", seq: 9, data: { stop_reason: "end_turn" } });
    });
    expect(await screen.findByText("The report is ready.")).toBeTruthy();
    await waitFor(() => expect(textbox().disabled).toBe(false));
    expect(screen.queryByText(/is still answering/)).toBeNull();
    expect(screen.queryByText("Almost there")).toBeNull();
  });

  it("the history marks it as working while it runs and waiting for you when it stops for an approval", async () => {
    const list: ConversationListItem[] = [row({ runtime: { status: "running", lastEventSeq: 3 } }), row({ id: "c2", title: "Deploy", runtime: { status: "requires_action", lastEventSeq: 1 } })];
    renderChat(transportFor({ conversations: list, overrides: { resolveAction: async () => undefined } }));
    expect(await screen.findByText("Working")).toBeTruthy();
    expect(screen.getByText("Waiting for you")).toBeTruthy();
    expect(within(screen.getByText("Research").closest("li")!).getByText("Working")).toBeTruthy();
    expect(within(screen.getByText("Deploy").closest("li")!).getByText("Waiting for you")).toBeTruthy();
  });

  it("opening a conversation from the list follows it too", async () => {
    const followEvents = vi.fn((_id: string, options: FollowEventsOptions) => new Promise<void>((resolve) => options.signal?.addEventListener("abort", () => resolve())));
    renderChat(
      transportFor({
        conversation: conversation({ runtime: { status: "running", lastEventSeq: 5 } }),
        messages: [user],
        overrides: { followEvents },
      })
    );
    fireEvent.click(await screen.findByText("Research"));
    await screen.findByText(/is still answering/);
    expect(followEvents).toHaveBeenCalledTimes(1);
    // the selected row says what this page knows
    await waitFor(() => expect(within(screen.getByText("Research").closest("li")!).getByText("Working")).toBeTruthy());
  });
});

describe("Chat shows why an answer stopped", () => {
  it("a stopped answer in the history carries its notice, from the status and the metadata", async () => {
    renderChat(
      transportFor({
        messages: [
          user,
          message({ id: "m2", content: "I got as far as", status: "cancelled", metadata: { stopReason: "cancelled" } }),
          message({ id: "m3", role: "user", content: "again" }),
          message({ id: "m4", content: "This one hit a wall", status: "incomplete", metadata: { stopReason: "limit" } }),
        ],
      }),
      { conversationId: "c1" }
    );
    expect(await screen.findByText("Stopped before it finished.")).toBeTruthy();
    expect(screen.getByText("The assistant reached a limit and stopped.")).toBeTruthy();
  });
});

describe("Chat and the conversation's usage limit", () => {
  const budget = { maxCostUsd: 5, onReach: "pause" as const };
  const pausedConversation = () => conversation({ budget, spentUsd: 5.2, runtime: { status: "budget_paused", stopReason: "budget_reached", lastEventSeq: 4 } });

  it("shows the notice, closes the composer, and says to ask an administrator by default", async () => {
    renderChat(transportFor({ conversation: pausedConversation(), messages: [user, message({ id: "m2", content: "cut", status: "incomplete", stopReason: "budget_reached" })] }), { conversationId: "c1" });
    expect(await screen.findByText("This conversation reached its usage limit", { selector: "div" })).toBeTruthy();
    expect(screen.getByText(/Ask an administrator to raise the limit\./)).toBeTruthy();
    expect(textbox().disabled).toBe(true);
    expect(textbox().placeholder).toBe("This conversation reached its usage limit");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("5");
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("the meter can be hidden by the host", async () => {
    renderChat(transportFor({ conversation: conversation({ budget, spentUsd: 1, runtime: { status: "idle", lastEventSeq: 1 } }), messages: [user] }), { conversationId: "c1", showBudgetMeter: false });
    await screen.findByText("research it");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("with the host's permission a person raises the limit and the paused turn carries on", async () => {
    // the server's answer to the change: raised, and the turn it stopped is still paused
    const updateBudget = vi.fn(async (_id: string, next: unknown) => conversation({ budget: next as typeof budget, spentUsd: 5.2, runtime: { status: "budget_paused", stopReason: "budget_reached", lastEventSeq: 4 } }));
    let continued = false;
    const continueConversation = vi.fn(async (_id: string, options?: { callbacks?: StreamCallbacks }) => {
      options?.callbacks?.onDone?.({
        type: "stream.done", conversationId: "c1", messageId: "m3", content: "and the rest", stopReason: "end_turn",
        budget: { maxCostUsd: 10, onReach: "pause" }, spentUsd: 5.6, timestamp: 1,
      });
      continued = true;
      return undefined;
    });
    const getConversation = vi.fn(async () =>
      continued
        ? { conversation: conversation({ budget: { maxCostUsd: 10, onReach: "pause" }, spentUsd: 5.6, runtime: { status: "idle", stopReason: "end_turn", lastEventSeq: 7 } }), messages: [user, message({ id: "m2", content: "cut" }), message({ id: "m3", content: "and the rest" })] }
        : { conversation: pausedConversation(), messages: [user, message({ id: "m2", content: "cut" })] }
    );
    renderChat(
      transportFor({ conversation: pausedConversation(), messages: [user, message({ id: "m2", content: "cut" })], overrides: { updateBudget, continueConversation, getConversation } }),
      { conversationId: "c1", allowBudgetEdit: true }
    );
    const field = (await screen.findByLabelText("New limit (USD)")) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "10" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Increase and continue" }));
    });
    expect(updateBudget).toHaveBeenCalledWith("c1", { maxCostUsd: 10, onReach: "pause" });
    expect(await screen.findByText("and the rest")).toBeTruthy();
    await waitFor(() => expect(textbox().disabled).toBe(false));
    expect(screen.queryByText("This conversation reached its usage limit", { selector: "div" })).toBeNull();
    expect(screen.getByText("$5.60 of $10.00 used")).toBeTruthy();
  });

  it("Increase and continue only reopens when the server says the turn is not continuable (it had finished its answer)", async () => {
    const updateBudget = vi.fn(async (_id: string, next: unknown) =>
      conversation({ budget: next as typeof budget, spentUsd: 5.2, continuable: false, runtime: { status: "idle", stopReason: "budget_reached", lastEventSeq: 4 } })
    );
    const continueConversation = vi.fn(async () => undefined);
    renderChat(
      transportFor({ conversation: pausedConversation(), messages: [user, message({ id: "m2", content: "a complete answer" })], overrides: { updateBudget, continueConversation } }),
      { conversationId: "c1", allowBudgetEdit: true }
    );
    fireEvent.change((await screen.findByLabelText("New limit (USD)")) as HTMLInputElement, { target: { value: "10" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Increase and continue" }));
    });
    expect(updateBudget).toHaveBeenCalledWith("c1", { maxCostUsd: 10, onReach: "pause" });
    await waitFor(() => expect(textbox().disabled).toBe(false));
    expect(continueConversation).not.toHaveBeenCalled();
    expect(screen.getByText("$5.20 of $10.00 used")).toBeTruthy();
  });

  it("the agent can allow Continue on its own", async () => {
    const continueConversation = vi.fn(async () => undefined);
    renderChat(
      transportFor({
        agents: [agent({ capabilities: { budget: { allowContinue: true } } })],
        conversation: pausedConversation(),
        messages: [user],
        overrides: { continueConversation },
      }),
      { conversationId: "c1" }
    );
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(continueConversation).toHaveBeenCalledWith("c1", expect.objectContaining({ stream: true }));
  });

  it("shows the continuation as the live turn, next to the answer it carries on instead of over it", async () => {
    let finish!: () => void;
    let continued = false;
    const continueConversation = vi.fn(async (_id: string, options?: { callbacks?: StreamCallbacks }) => {
      options?.callbacks?.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "m2", timestamp: 1 });
      options?.callbacks?.onText?.("and the rest", "and the rest");
      await new Promise<void>((resolve) => (finish = resolve));
      options?.callbacks?.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m3", content: "and the rest", stopReason: "end_turn", timestamp: 2 });
      continued = true;
      return undefined;
    });
    const cut = message({ id: "m2", content: "The answer was cut", status: "incomplete", stopReason: "budget_reached" });
    const getConversation = vi.fn(async () =>
      continued
        ? { conversation: conversation({ budget, spentUsd: 5.3, runtime: { status: "idle", stopReason: "end_turn", lastEventSeq: 7 } }), messages: [user, cut, message({ id: "m3", content: "and the rest" })] }
        : { conversation: pausedConversation(), messages: [user, cut] }
    );
    renderChat(
      transportFor({
        agents: [agent({ capabilities: { budget: { allowContinue: true } } })],
        conversation: pausedConversation(),
        messages: [user, cut],
        overrides: { continueConversation, getConversation },
      }),
      { conversationId: "c1" }
    );
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await screen.findByText("and the rest");
    // once, and the answer it carries on is still there
    expect(screen.getAllByText("and the rest")).toHaveLength(1);
    expect(screen.getByText("The answer was cut")).toBeTruthy();
    await act(async () => {
      finish();
    });
    await waitFor(() => expect(screen.getAllByText("and the rest")).toHaveLength(1));
    expect(screen.getByText("The answer was cut")).toBeTruthy();
  });

  it("the history marks a conversation stopped on its limit", async () => {
    renderChat(transportFor({ conversations: [row({ budget, spentUsd: 6, runtime: { status: "budget_paused", lastEventSeq: 1 } })] }));
    expect(await screen.findByText("Limit reached")).toBeTruthy();
  });
});

describe("Chat reads the composer from what the agent says", () => {
  it("hides the paperclip for an agent that takes no attachments", async () => {
    renderChat(transportFor({ agents: [agent({ capabilities: { attachments: { enabled: false } } })] }));
    await screen.findByRole("textbox");
    await waitFor(() => expect(screen.queryByTitle("Attach files")).toBeNull());
  });

  it("warns on a picture when the agent says its model does not read images", async () => {
    renderChat(transportFor({ agents: [agent({ capabilities: { attachments: { enabled: true, acceptsImages: false } } })] }));
    const input = (await screen.findByTitle("Attach files")).parentElement!.querySelector("input[type=file]") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["x"], "cat.png", { type: "image/png" })] } });
    });
    expect(await screen.findByText("This assistant can't see images. An attached image will be sent but may be ignored.")).toBeTruthy();
  });

  it("does not warn when the agent reads images", async () => {
    renderChat(transportFor({ agents: [agent({ capabilities: { attachments: { enabled: true, acceptsImages: true } } })] }));
    const input = (await screen.findByTitle("Attach files")).parentElement!.querySelector("input[type=file]") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["x"], "cat.png", { type: "image/png" })] } });
    });
    await screen.findByText("cat.png");
    expect(screen.queryByText(/can't see images/)).toBeNull();
  });

  it("counts the files the conversation holds, from the server, against the agent's limit, and says how long they are kept", async () => {
    const listFiles = vi.fn(async () => ({ files: [{ id: "f1", name: "a.pdf", mimeType: "application/pdf", size: 1 } as FileAttachment, { id: "f2", name: "b.pdf", mimeType: "application/pdf", size: 1 } as FileAttachment], total: 2, maxFiles: 3 }));
    renderChat(
      transportFor({
        agents: [agent({ capabilities: { attachments: { enabled: true, maxFiles: 3, retentionDays: 30 } } })],
        messages: [{ ...user, files: [{ id: "f1", name: "a.pdf", mimeType: "application/pdf", size: 1 }, { id: "f2", name: "b.pdf", mimeType: "application/pdf", size: 1 }] }],
        overrides: { listFiles },
      }),
      { conversationId: "c1" }
    );
    expect(await screen.findByText("2 of 3 files in this chat")).toBeTruthy();
    expect(screen.getByText(/Files are kept for 30 days/)).toBeTruthy();
    const input = screen.getByTitle("Attach files").parentElement!.querySelector("input[type=file]") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(["x"], "c.pdf", { type: "application/pdf" }), new File(["y"], "d.pdf", { type: "application/pdf" })] },
      });
    });
    expect(await screen.findByText("This chat can hold 3 files; 3 already attached")).toBeTruthy();
    expect(screen.getByText("3 of 3 files in this chat")).toBeTruthy();
  });

  it("shows a file past its deadline in the history as expired", async () => {
    renderChat(
      transportFor({
        messages: [{ ...user, files: [{ id: "f1", name: "old.pdf", mimeType: "application/pdf", size: 1 }] }],
        overrides: { listFiles: async () => ({ files: [], total: 0 }) },
      }),
      { conversationId: "c1" }
    );
    expect(await screen.findByText("Expired")).toBeTruthy();
  });
});

describe("Chat stores files as they are picked", () => {
  it("shows progress on the chip, sends only the ids, and ends with the files in the bubble", async () => {
    let report!: (p: { loaded: number; total: number }) => void;
    let finish!: (file: FileAttachment) => void;
    const uploadFile = vi.fn(
      (p: UploadFileParams) =>
        new Promise<FileAttachment>((resolve) => {
          report = p.onProgress!;
          finish = resolve;
        })
    );
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "new", messageId: "m9", content: "read it", timestamp: 1 });
    });
    renderChat(transportFor({ overrides: { uploadFile, sendMessageStream, supportsRawUpload: true } }), { fileTransport: "upload-on-select" });
    const input = (await screen.findByTitle("Attach files")).parentElement!.querySelector("input[type=file]") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["hello"], "notes.txt", { type: "text/plain" })] } });
    });
    const chip = (await screen.findByText("notes.txt")).closest("li")!;
    await waitFor(() => expect(within(chip).getByRole("progressbar")).toBeTruthy());
    act(() => report({ loaded: 1, total: 2 }));
    expect(within(chip).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
    fireEvent.change(textbox(), { target: { value: "read" } });
    expect((screen.getByTitle("Send message") as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      finish({ id: "srv-1", name: "notes.txt", mimeType: "text/plain", size: 5 });
    });
    await waitFor(() => expect((screen.getByTitle("Send message") as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      fireEvent.click(screen.getByTitle("Send message"));
    });
    expect(await screen.findByText("read it")).toBeTruthy();
    expect((sendMessageStream.mock.calls[0][1] as { fileIds?: string[] }).fileIds).toEqual(["srv-1"]);
  });
});

describe("Chat: files that go up with the message (stored first)", () => {
  it("the bubble's chip shows how far the upload is, offers no Download until the file is stored, then does", async () => {
    let report!: (p: { loaded: number; total: number }) => void;
    let finish!: (file: FileAttachment) => void;
    const uploadFile = vi.fn(
      (p: UploadFileParams) =>
        new Promise<FileAttachment>((resolve) => {
          report = p.onProgress!;
          finish = resolve;
        })
    );
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "new", messageId: "m9", content: "read it", timestamp: 1 });
    });
    const getFileUrl = vi.fn(async () => "blob:stored");
    renderChat(transportFor({ overrides: { uploadFile, sendMessageStream, getFileUrl, supportsRawUpload: true } }), { fileTransport: "upload" });
    const input = (await screen.findByTitle("Attach files")).parentElement!.querySelector("input[type=file]") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["hello"], "notes.txt", { type: "text/plain" })] } });
    });
    fireEvent.change(textbox(), { target: { value: "read" } });
    await act(async () => {
      fireEvent.click(screen.getByTitle("Send message"));
    });

    // the message is on screen at once; its chip is the one in the transcript, going up
    const bubble = (await screen.findByText("read")).closest(".group") as HTMLElement;
    await waitFor(() => expect(within(bubble).getByRole("progressbar")).toBeTruthy());
    act(() => report({ loaded: 1, total: 4 }));
    expect(within(bubble).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("25");
    expect(within(bubble).getByText("Uploading 25%")).toBeTruthy();
    expect(within(bubble).queryByText("Download")).toBeNull();
    expect(sendMessageStream).not.toHaveBeenCalled();

    await act(async () => {
      finish({ id: "srv-1", name: "notes.txt", mimeType: "text/plain", size: 5 });
    });
    expect(await screen.findByText("read it")).toBeTruthy();
    // stored: the bubble's chip is plain and can be downloaded
    await waitFor(() => expect(within(bubble).queryByRole("progressbar")).toBeNull());
    expect(within(bubble).getByText("Download")).toBeTruthy();
    expect((sendMessageStream.mock.calls[0][1] as { fileIds?: string[] }).fileIds).toEqual(["srv-1"]);
  });
});

describe("Chat: a reply that was interrupted", () => {
  const stopped = () => conversation({ runtime: { status: "idle", stopReason: "error", lastEventSeq: 4, pendingActionIds: [] } });
  const asked = message({ id: "u1", role: "user", content: "summarize the report", files: [{ id: "f1", name: "report.pdf", mimeType: "application/pdf", size: 10 }] });

  it("says so under the message that got no answer, and sends it again (with its stored files) on Retry", async () => {
    let answered = false;
    const getConversation = vi.fn(async () =>
      answered
        ? { conversation: conversation({ runtime: { status: "idle", stopReason: "end_turn", lastEventSeq: 8 } }), messages: [asked, message({ id: "u2", role: "user", content: "summarize the report", files: asked.files }), message({ id: "m2", content: "Here it is." })] }
        : { conversation: stopped(), messages: [asked] }
    );
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onStart?.({ type: "stream.start", conversationId: "c1", messageId: "m2", timestamp: 1 });
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m2", content: "Here it is.", stopReason: "end_turn", timestamp: 2 });
      answered = true;
    });
    renderChat(transportFor({ overrides: { getConversation, sendMessageStream } }), { conversationId: "c1" });

    expect(await screen.findByText("The reply was interrupted")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Here it is.")).toBeTruthy();
    expect(sendMessageStream).toHaveBeenCalledTimes(1);
    expect(sendMessageStream.mock.calls[0][0]).toBe("c1");
    expect(sendMessageStream.mock.calls[0][1]).toMatchObject({ message: "summarize the report", fileIds: ["f1"] });
    // answered: no notice any more
    await waitFor(() => expect(screen.queryByText("The reply was interrupted")).toBeNull());
  });

  it("a transcript says it too, but has nothing to send with", async () => {
    renderChat(transportFor({ conversation: stopped(), messages: [asked] }), { conversationId: "c1", readOnly: true });
    expect(await screen.findByText("The reply was interrupted")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("no notice for a conversation that ended well, or whose last message is an answer", async () => {
    renderChat(transportFor({ conversation: conversation({ runtime: { status: "idle", stopReason: "end_turn", lastEventSeq: 4 } }), messages: [asked] }), { conversationId: "c1" });
    await screen.findByText("summarize the report");
    expect(screen.queryByText("The reply was interrupted")).toBeNull();
    cleanup();
    renderChat(transportFor({ conversation: stopped(), messages: [asked, message({ id: "m2", content: "partial", status: "incomplete", stopReason: "error" })] }), { conversationId: "c1" });
    await screen.findByText("partial");
    expect(screen.queryByText("The reply was interrupted")).toBeNull();
    expect(screen.getByText("Something went wrong and the assistant stopped.")).toBeTruthy();
  });

  it("a host's own stop notice renders it, with the retry", async () => {
    const sendMessageStream = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.({ type: "stream.done", conversationId: "c1", messageId: "m2", content: "ok", timestamp: 1 });
    });
    renderChat(transportFor({ conversation: stopped(), messages: [asked], overrides: { sendMessageStream } }), {
      conversationId: "c1",
      renderStopNotice: (p) => (p.onRetry ? <button onClick={p.onRetry}>again {p.message.id}</button> : <span>no retry</span>),
    });
    fireEvent.click(await screen.findByRole("button", { name: "again u1" }));
    await waitFor(() => expect(sendMessageStream).toHaveBeenCalledTimes(1));
  });
});
