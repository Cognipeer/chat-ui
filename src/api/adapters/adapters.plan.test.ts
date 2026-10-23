import { describe, expect, it } from "vitest";
import { StatelessTransport, type RunInput, type RunResult } from "./base";
import type { Message, PlanSnapshot } from "../../types";

const planOf = (...statuses: PlanSnapshot["steps"][number]["status"][]): PlanSnapshot => ({
  steps: statuses.map((status, i) => ({ id: i + 1, title: `Step ${i + 1}`, status })),
});

/** A backend that reports a plan, a call and a condensing pass the way an in-process agent would. */
class Planner extends StatelessTransport {
  constructor() {
    super({ defaultAgentId: "agent" });
  }
  protected async run({ emit }: RunInput): Promise<RunResult> {
    emit.plan(planOf("not-started", "not-started"));
    emit.toolCall("t1", "lookup", { q: "x" });
    emit.compaction({ phase: "start", id: "c1" });
    emit.compaction({ phase: "done", id: "c1" });
    emit.compaction({ phase: "skipped" });
    emit.toolResult("t1", "lookup", { ok: false });
    emit.plan(planOf("completed", "in-progress"));
    emit.plan({ steps: [] });
    emit.text("Done");
    return {};
  }
}

describe("StatelessTransport plan and compaction", () => {
  it("relays emit.plan and emit.compaction to the stream callbacks", async () => {
    const backend = new Planner();
    const conversation = await backend.createConversation({ agentId: "agent" });
    const seen: unknown[] = [];
    await backend.sendMessageStream(conversation.id, { message: "go" }, {
      onPlan: (plan) => seen.push(["plan", plan.steps.map((s) => s.status)]),
      onToolCall: () => seen.push(["tool"]),
      onCompaction: (e) => seen.push(["compaction", e]),
    });
    expect(seen).toEqual([
      ["plan", ["not-started", "not-started"]],
      ["tool"],
      ["compaction", { id: "c1", phase: "start" }],
      ["compaction", { id: "c1", phase: "done" }],
      ["compaction", { phase: "skipped" }],
      ["plan", ["completed", "in-progress"]],
    ]);
  });

  it("keeps the latest plan and the order of it all with the stored answer", async () => {
    const backend = new Planner();
    const conversation = await backend.createConversation({ agentId: "agent" });
    const sent = await backend.sendMessage(conversation.id, { message: "go" });
    const stored = (await backend.getConversation(conversation.id)).messages.find((m: Message) => m.role === "assistant")!;
    expect(sent.response.metadata?.plan).toEqual(planOf("completed", "in-progress"));
    expect(stored.metadata?.activity).toEqual([
      { kind: "plan", done: 0, total: 2, created: true },
      { kind: "tool", id: "t1", name: "lookup", status: "error" },
      // only a pass that finished is remembered: `start` and `skipped` are live notes
      { kind: "compaction", id: "c1" },
      { kind: "plan", done: 1, total: 2 },
    ]);
    expect(stored.metadata?.toolCallDetails).toHaveLength(1);
  });

  it("believes the operation a backend reports: an update is not a creation, a write is", async () => {
    class Told extends StatelessTransport {
      constructor() {
        super({ defaultAgentId: "agent" });
      }
      protected async run({ emit }: RunInput): Promise<RunResult> {
        // the plan was written in an earlier turn: this turn only changes it
        emit.plan({ ...planOf("completed", "in-progress"), operation: "update" });
        // then the agent starts over
        emit.plan({ ...planOf("not-started"), operation: "write" });
        emit.text("Done");
        return {};
      }
    }
    const backend = new Told();
    const conversation = await backend.createConversation({ agentId: "agent" });
    const seen: unknown[] = [];
    await backend.sendMessageStream(conversation.id, { message: "go" }, { onPlan: (plan) => seen.push(plan.operation) });
    expect(seen).toEqual(["update", "write"]);
    const stored = (await backend.getConversation(conversation.id)).messages.find((m: Message) => m.role === "assistant")!;
    expect(stored.metadata?.activity).toEqual([
      { kind: "plan", done: 1, total: 2 },
      { kind: "plan", done: 0, total: 1, created: true },
    ]);
  });

  it("a backend that reports neither leaves no plan or activity on the answer", async () => {
    class Plain extends StatelessTransport {
      protected async run(): Promise<RunResult> {
        return { content: "hi" };
      }
    }
    const backend = new Plain({ defaultAgentId: "agent" });
    const conversation = await backend.createConversation({ agentId: "agent" });
    const sent = await backend.sendMessage(conversation.id, { message: "go" });
    expect(sent.response.metadata).toBeUndefined();
  });
});
