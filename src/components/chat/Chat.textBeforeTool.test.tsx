import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { Chat } from "./Chat";
import type { ChatTransport, StreamCallbacks } from "../../api";

/**
 * A model that announces its calls (Claude: "Let me look that up.", then the call) writes the announcement in the same
 * text stream as its answer. The calls it makes after those words must still show while they run.
 */

afterEach(() => cleanup());
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const now = new Date();
const render = (ui: ReactElement) => rtlRender(<ChatI18nProvider locale="en">{ui}</ChatI18nProvider>);
const toolCall = { type: "stream.tool_call" as const, toolName: "web_search", toolCallId: "t1", args: { query: "cognipeer" }, timestamp: 1 };
const toolResult = { type: "stream.tool_result" as const, toolName: "web_search", toolCallId: "t1", result: { ok: true }, timestamp: 2 };

/** A transport whose turn runs `steps` one by one, each when the test calls `next()`. */
function scripted(steps: Array<(cb: StreamCallbacks) => void>) {
  let callbacks: StreamCallbacks | undefined;
  let finish: (() => void) | undefined;
  let at = 0;
  const transport = {
    getAgents: async () => [{ id: "agent", name: "Helper" }],
    getConversations: async () => ({ conversations: [], total: 0, limit: 20, offset: 0, hasMore: false }),
    createConversation: async (p: { agentId: string }) => ({ id: "c-new", agentId: p.agentId, createdAt: now, updatedAt: now }),
    getConversation: async (id: string) => ({ conversation: { id, agentId: "agent", createdAt: now, updatedAt: now }, messages: [] }),
    deleteConversation: async () => {},
    sendMessage: async () => {
      throw new Error("unused");
    },
    sendMessageStream: (_c: string, _o: unknown, cb: StreamCallbacks) =>
      new Promise<void>((resolve) => {
        callbacks = cb;
        finish = resolve;
      }),
  } as unknown as ChatTransport;
  const next = async () => {
    await waitFor(() => expect(callbacks).toBeDefined());
    await act(async () => {
      steps[at++]!(callbacks!);
      if (at === steps.length) finish?.();
    });
  };
  return { transport, next };
}

let n = 0;
async function send(transport: ChatTransport, appearance: "modern" | "classic") {
  n += 1;
  render(<Chat baseUrl={`http://announce-${n}`} transport={transport} agentId="agent" enableFileUpload={false} appearance={appearance} />);
  fireEvent.change((await screen.findByRole("textbox")) as HTMLTextAreaElement, { target: { value: "find it" } });
  await act(async () => {
    fireEvent.click(screen.getByTitle("Send message"));
  });
}

const steps = [
  (cb: StreamCallbacks) => cb.onText?.("Let me look that up.", "Let me look that up."),
  (cb: StreamCallbacks) => cb.onToolCall?.(toolCall),
  (cb: StreamCallbacks) => {
    cb.onToolResult?.(toolResult);
    cb.onText?.("Found it.", "Let me look that up.Found it.");
  },
  (cb: StreamCallbacks) => cb.onDone?.({ type: "stream.done", conversationId: "c-new", messageId: "a1", content: "Found it.", timestamp: 3 }),
];

describe.each(["modern", "classic"] as const)("words before a call (%s)", (appearance) => {
  it("shows the call under the words while it runs, then the answer on its own", async () => {
    const { transport, next } = scripted(steps);
    await send(transport, appearance);

    await next();
    expect(screen.getByText("Let me look that up.")).toBeTruthy();

    await next();
    // the words stay, and what runs now shows under them
    expect(screen.getByText("Let me look that up.")).toBeTruthy();
    if (appearance === "modern") expect(screen.getByText("Running Web Search…")).toBeTruthy();
    else expect(screen.getAllByText(/Web Search/).length).toBeGreaterThan(0);

    await next();
    // the answer is not glued to the words before the call
    expect(screen.getByText("Found it.")).toBeTruthy();
    expect(screen.queryByText(/look that up\.Found/)).toBeNull();
    expect(screen.queryByText("Running Web Search…")).toBeNull();
  });
});

describe("the finished turn (modern)", () => {
  it("keeps the words before the call in the turn's activity, ahead of the call", async () => {
    const { transport, next } = scripted(steps);
    await send(transport, "modern");
    for (let i = 0; i < steps.length; i++) await next();

    expect(await screen.findByText("Found it.")).toBeTruthy();
    const summary = screen.getByRole("button", { expanded: false, name: /Worked/ });
    fireEvent.click(summary);
    const timeline = screen.getByRole("list", { name: "Steps" });
    const lines = Array.from(timeline.querySelectorAll("li")).map((li) => li.textContent);
    expect(lines[0]).toBe("Let me look that up.");
    expect(lines[1]).toContain("Web Search");
  });
});
