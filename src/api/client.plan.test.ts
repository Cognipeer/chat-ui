import { describe, expect, it, vi } from "vitest";
import { AgentServerClient } from "./client";
import type { PlanSnapshot } from "../types";

const sse = (events: unknown[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });

describe("AgentServerClient plan and compaction frames", () => {
  it("hands stream.plan and stream.compaction to the callbacks, in order with the other frames", async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        { type: "stream.plan", timestamp: 1, plan: { version: 1, steps: [{ id: 1, title: "Look up", status: "in-progress", owner: "x" }, { id: 2, title: "Reply", status: "not-started" }] } },
        { type: "stream.tool_call", timestamp: 2, toolCallId: "t1", toolName: "lookup", args: {} },
        { type: "stream.compaction", timestamp: 3, id: "c1", phase: "start" },
        { type: "stream.compaction", timestamp: 4, id: "c1", phase: "done" },
        { type: "stream.compaction", timestamp: 5, phase: "skipped" },
        { type: "stream.done", timestamp: 6, conversationId: "c1", messageId: "m1", content: "ok" },
      ])
    );
    const client = new AgentServerClient({ baseUrl: "http://x/", fetch: fetchMock as unknown as typeof fetch });
    const seen: unknown[] = [];
    await client.sendMessageStream("c1", { message: "go" }, {
      onPlan: (plan: PlanSnapshot) => seen.push(["plan", plan]),
      onToolCall: () => seen.push(["tool"]),
      onCompaction: (e) => seen.push(["compaction", e]),
      onDone: () => seen.push(["done"]),
    });
    expect(seen).toEqual([
      ["plan", { version: 1, steps: [{ id: 1, title: "Look up", status: "in-progress" }, { id: 2, title: "Reply", status: "not-started" }] }],
      ["tool"],
      ["compaction", { id: "c1", phase: "start" }],
      ["compaction", { id: "c1", phase: "done" }],
      ["compaction", { phase: "skipped" }],
      ["done"],
    ]);
  });

  it("hands on what the agent did to the plan, and leaves out a word it does not know", async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        { type: "stream.plan", timestamp: 1, plan: { version: 1, operation: "write", steps: [{ title: "Look up", status: "in-progress" }] } },
        { type: "stream.plan", timestamp: 2, plan: { version: 2, operation: "update", steps: [{ title: "Look up", status: "completed" }] } },
        { type: "stream.plan", timestamp: 3, plan: { version: 3, operation: "rewrite", steps: [{ title: "Reply", status: "in-progress" }] } },
        { type: "stream.done", timestamp: 4, conversationId: "c1", messageId: "m1", content: "ok" },
      ])
    );
    const client = new AgentServerClient({ baseUrl: "http://x/", fetch: fetchMock as unknown as typeof fetch });
    const seen: PlanSnapshot[] = [];
    await client.sendMessageStream("c1", { message: "go" }, { onPlan: (plan) => seen.push(plan) });
    expect(seen.map((plan) => [plan.version, plan.operation])).toEqual([
      [1, "write"],
      [2, "update"],
      // the frame still shows: a newer server may say more than the chat knows
      [3, undefined],
    ]);
  });

  it("ignores a plan with no usable step and a compaction frame with an unknown phase", async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        { type: "stream.plan", timestamp: 1, plan: { steps: [] } },
        { type: "stream.plan", timestamp: 2 },
        { type: "stream.compaction", timestamp: 3, phase: "weird" },
        { type: "stream.done", timestamp: 4, conversationId: "c1", messageId: "m1", content: "ok" },
      ])
    );
    const client = new AgentServerClient({ baseUrl: "http://x/", fetch: fetchMock as unknown as typeof fetch });
    const onPlan = vi.fn();
    const onCompaction = vi.fn();
    const onDone = vi.fn();
    await client.sendMessageStream("c1", { message: "go" }, { onPlan, onCompaction, onDone });
    expect(onPlan).not.toHaveBeenCalled();
    expect(onCompaction).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("an older caller without the callbacks is not affected", async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        { type: "stream.plan", timestamp: 1, plan: { steps: [{ title: "A", status: "completed" }] } },
        { type: "stream.compaction", timestamp: 2, phase: "done" },
        { type: "stream.done", timestamp: 3, conversationId: "c1", messageId: "m1", content: "ok" },
      ])
    );
    const client = new AgentServerClient({ baseUrl: "http://x/", fetch: fetchMock as unknown as typeof fetch });
    const onDone = vi.fn();
    await client.sendMessageStream("c1", { message: "go" }, { onDone });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
