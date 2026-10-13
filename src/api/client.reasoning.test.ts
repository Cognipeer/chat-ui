import { describe, expect, it, vi } from "vitest";
import { AgentServerClient } from "./client";

const sse = (events: unknown[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });

describe("AgentServerClient reasoning", () => {
  it("keeps stream.thinking out of the answer text", async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        { type: "stream.thinking", thinking: "Let me ", timestamp: 1 },
        { type: "stream.thinking", thinking: "think.", timestamp: 2 },
        { type: "stream.text", text: "Hi", timestamp: 3 },
        { type: "stream.done", conversationId: "c1", messageId: "m1", content: "Hi", timestamp: 4 },
      ])
    );
    const client = new AgentServerClient({ baseUrl: "http://x/", fetch: fetchMock as unknown as typeof fetch });
    const texts: string[] = [];
    const thoughts: string[] = [];
    await client.sendMessageStream("c1", { message: "yo", reasoningEffort: "high" }, {
      onText: (_t, full) => texts.push(full),
      onThinking: (_t, full) => thoughts.push(full),
    });
    expect(texts).toEqual(["Hi"]);
    expect(thoughts).toEqual(["Let me ", "Let me think."]);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ message: "yo", reasoningEffort: "high", stream: true });
  });

  it("sends reasoningEffort on regenerate and edit only when set", async () => {
    const fetchMock = vi.fn(async () => sse([{ type: "stream.done", conversationId: "c1", messageId: "m", content: "", timestamp: 1 }]));
    const client = new AgentServerClient({ baseUrl: "http://x/", fetch: fetchMock as unknown as typeof fetch });
    await client.regenerateMessage("c1", "m1", { stream: true, callbacks: {}, reasoningEffort: "low" });
    await client.regenerateMessage("c1", "m1", { stream: true, callbacks: {} });
    await client.editMessage("c1", "m1", { content: "x", reasoningEffort: "none" }, { stream: true, callbacks: {} });
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(bodies[0]).toMatchObject({ reasoningEffort: "low" });
    expect(bodies[1]).not.toHaveProperty("reasoningEffort");
    expect(bodies[2]).toMatchObject({ content: "x", reasoningEffort: "none" });
  });
});
