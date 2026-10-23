import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ChatI18nProvider } from "../providers";
import { useChat } from "./useChat";
import type { ChatTransport, FollowEventsOptions, StreamCallbacks } from "../api";
import type { Conversation, ConversationEvent, Message, PendingAction, PlanSnapshot, StreamDoneEvent } from "../types";

const now = new Date();
const wrapper = ({ children }: { children: ReactNode }) => <ChatI18nProvider locale="en">{children}</ChatI18nProvider>;

const conversation = (partial: Partial<Conversation> = {}): Conversation => ({ id: "c1", agentId: "agent", createdAt: now, updatedAt: now, ...partial });
const message = (partial: Partial<Message> = {}): Message => ({ id: "m1", conversationId: "c1", role: "assistant", content: "", createdAt: now, updatedAt: now, ...partial });

function transport(overrides: Partial<ChatTransport> = {}): ChatTransport {
  return {
    getAgents: async () => [],
    getConversations: async () => ({ conversations: [], total: 0, limit: 20, offset: 0, hasMore: false }),
    createConversation: async (p) => conversation({ agentId: p.agentId }),
    getConversation: async () => ({ conversation: conversation(), messages: [] }),
    deleteConversation: async () => {},
    sendMessage: async () => {
      throw new Error("unused");
    },
    sendMessageStream: async () => {},
    ...overrides,
  };
}

const plan = (...statuses: PlanSnapshot["steps"][number]["status"][]): PlanSnapshot => ({
  steps: statuses.map((status, i) => ({ id: i + 1, title: `Step ${i + 1}`, status })),
});
const approval: PendingAction = { id: "a1", type: "tool_approval", toolName: "issue_refund", args: {} };
const toolCall = (id: string, name: string) => ({ type: "stream.tool_call" as const, toolCallId: id, toolName: name, args: {}, timestamp: 1 });
const toolResult = (id: string, name: string, result: unknown) => ({ type: "stream.tool_result" as const, toolCallId: id, toolName: name, result, timestamp: 2 });
const done = (content = "All done", extra: Partial<StreamDoneEvent> = {}): StreamDoneEvent => ({
  type: "stream.done",
  conversationId: "c1",
  messageId: "m9",
  content,
  timestamp: 9,
  ...extra,
});

describe("useChat plan and activity", () => {
  it("keeps the live plan and condensing note while streaming, then writes plan and ordered activity with the answer", async () => {
    const send = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onPlan?.(plan("not-started", "not-started"));
      cb.onToolCall?.(toolCall("t1", "lookup"));
      cb.onToolResult?.(toolResult("t1", "lookup", { ok: true }));
      cb.onCompaction?.({ id: "c1", phase: "start" });
      cb.onCompaction?.({ id: "c1", phase: "done" });
      cb.onPlan?.(plan("completed", "in-progress"));
      // the same plan again is not news
      cb.onPlan?.(plan("completed", "in-progress"));
      cb.onToolCall?.(toolCall("t2", "issue_refund"));
      cb.onToolResult?.(toolResult("t2", "issue_refund", { error: "declined" }));
      cb.onDone?.(done());
    });
    const { result } = renderHook(() => useChat({ transport: transport({ sendMessageStream: send as ChatTransport["sendMessageStream"] }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("refund me");
    });
    const last = result.current.messages[result.current.messages.length - 1]!;
    expect(last.metadata?.plan).toEqual(plan("completed", "in-progress"));
    expect(last.metadata?.activity).toEqual([
      { kind: "plan", done: 0, total: 2, created: true },
      { kind: "tool", id: "t1", name: "lookup", status: "ok" },
      { kind: "compaction", id: "c1" },
      { kind: "plan", done: 1, total: 2 },
      { kind: "tool", id: "t2", name: "issue_refund", status: "error" },
    ]);
    // the existing keys are still there
    expect(last.metadata?.toolCallDetails).toHaveLength(2);
    // nothing of the turn is left live
    expect(result.current.plan).toBeUndefined();
    expect(result.current.isCondensing).toBe(false);
  });

  it("exposes the plan and the condensing note while the turn runs", async () => {
    const gate: { release?: () => void } = {};
    const send = vi.fn(
      (_c: string, _o: unknown, cb: StreamCallbacks) =>
        new Promise<void>((resolve) => {
          cb.onPlan?.(plan("in-progress", "not-started"));
          cb.onCompaction?.({ phase: "start" });
          gate.release = () => {
            cb.onCompaction?.({ phase: "skipped" });
            cb.onDone?.(done());
            resolve();
          };
        })
    );
    const { result } = renderHook(() => useChat({ transport: transport({ sendMessageStream: send as ChatTransport["sendMessageStream"] }), agentId: "agent" }), { wrapper });
    let sending!: Promise<boolean>;
    act(() => {
      sending = result.current.sendMessage("go");
    });
    await waitFor(() => expect(result.current.plan?.steps).toHaveLength(2));
    expect(result.current.isCondensing).toBe(true);
    await act(async () => {
      gate.release?.();
      await sending;
    });
    expect(result.current.plan).toBeUndefined();
    expect(result.current.isCondensing).toBe(false);
    // a skipped pass is not part of the record
    const last = result.current.messages[result.current.messages.length - 1]!;
    expect((last.metadata?.activity as Array<{ kind: string }>).map((e) => e.kind)).toEqual(["plan"]);
  });

  it("a turn without a plan, a pass or a call leaves the answer's metadata as it was", async () => {
    const send = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      cb.onDone?.(done("Plain"));
    });
    const { result } = renderHook(() => useChat({ transport: transport({ sendMessageStream: send as ChatTransport["sendMessageStream"] }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("hi");
    });
    expect(result.current.messages[result.current.messages.length - 1]!.metadata).toBeUndefined();
  });

  it("starts a new turn without the plan of the one before", async () => {
    let turn = 0;
    const send = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      turn += 1;
      if (turn === 1) cb.onPlan?.(plan("completed"));
      cb.onDone?.(done(`Answer ${turn}`, { messageId: `m${turn}` }));
    });
    const { result } = renderHook(() => useChat({ transport: transport({ sendMessageStream: send as ChatTransport["sendMessageStream"] }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("one");
    });
    await act(async () => {
      await result.current.sendMessage("two");
    });
    const answers = result.current.messages.filter((m) => m.role === "assistant");
    expect(answers[0]!.metadata?.plan).toEqual(plan("completed"));
    expect(answers[1]!.metadata).toBeUndefined();
  });

  it("follows a turn that runs elsewhere: the plan shows live and the stored message brings its own copy", async () => {
    const user = message({ id: "u1", role: "user", content: "research it" });
    const stored = message({ id: "m2", content: "Done", metadata: { plan: plan("completed", "completed"), activity: [{ kind: "plan", done: 2, total: 2, created: true }] } });
    const getConversation = vi
      .fn()
      .mockResolvedValueOnce({ conversation: conversation({ runtime: { status: "running", lastEventSeq: 7, activeRunId: "run_1" } }), messages: [user] })
      .mockResolvedValue({ conversation: conversation({ runtime: { status: "idle", stopReason: "end_turn", lastEventSeq: 12 } }), messages: [user, stored] });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const event = (type: string, data: Record<string, unknown>, seq?: number): ConversationEvent => ({ type, data, ...(seq !== undefined ? { seq } : {}) });
    const followEvents = vi.fn(async (_id: string, options: FollowEventsOptions) => {
      options.onEvent(event("agent.plan", { version: 1, steps: [{ id: 1, title: "Look up", status: "in-progress" }, { id: 2, title: "Reply", status: "not-started" }] }, 8));
      await gate;
      options.onEvent(event("agent.message", { content: "Done", message_id: "m2" }, 11));
      options.onEvent(event("session.status_idle", { stop_reason: "end_turn" }, 12));
    });
    const { result } = renderHook(() => useChat({ transport: transport({ getConversation, followEvents }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.loadConversation("c1");
    });
    await waitFor(() => expect(result.current.plan?.steps.map((s) => s.title)).toEqual(["Look up", "Reply"]));
    expect(result.current.isFollowing).toBe(true);
    await act(async () => {
      release();
    });
    await waitFor(() => expect(result.current.isFollowing).toBe(false));
    expect(result.current.plan).toBeUndefined();
    expect(result.current.messages.find((m) => m.id === "m2")?.metadata?.plan).toEqual(plan("completed", "completed"));
  });

  it("labels a plan created or updated by what the frame says, not by whether the turn showed one before", async () => {
    const send = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
      // the first plan of this turn only changes one the agent wrote in an earlier turn
      cb.onPlan?.({ ...plan("completed", "in-progress"), operation: "update" });
      cb.onPlan?.({ ...plan("not-started"), operation: "write" });
      cb.onDone?.(done());
    });
    const { result } = renderHook(() => useChat({ transport: transport({ sendMessageStream: send as ChatTransport["sendMessageStream"] }), agentId: "agent" }), { wrapper });
    await act(async () => {
      await result.current.sendMessage("go");
    });
    const last = result.current.messages[result.current.messages.length - 1]!;
    expect(last.metadata?.activity).toEqual([
      { kind: "plan", done: 1, total: 2 },
      { kind: "plan", done: 0, total: 1, created: true },
    ]);
  });

  describe("a turn that pauses for an answer and carries on", () => {
    /** Leg one writes a plan and pauses; `leg` is what the leg that answers it does. */
    async function pausedThenAnswered(leg: (cb: StreamCallbacks) => void) {
      const send = vi.fn(async (_c: string, _o: unknown, cb: StreamCallbacks) => {
        cb.onPlan?.(plan("completed", "in-progress"));
        cb.onActionRequired?.({ type: "stream.action_required", conversationId: "c1", messageId: "m1", actions: [approval], timestamp: 3 });
        cb.onDone?.(done("", { messageId: "m1", status: "requires_action", pendingActions: [approval] }));
      });
      const resolveAction = vi.fn(async (_c: string, _a: string, _r: unknown, options?: { callbacks?: StreamCallbacks }) => {
        leg(options!.callbacks!);
        return undefined;
      });
      const { result } = renderHook(
        () => useChat({ transport: transport({ sendMessageStream: send as ChatTransport["sendMessageStream"], resolveAction: resolveAction as ChatTransport["resolveAction"] }), agentId: "agent" }),
        { wrapper }
      );
      await act(async () => {
        await result.current.sendMessage("refund me");
      });
      await act(async () => {
        await result.current.resolveAction("a1", { type: "tool_approval", decision: "allow" });
      });
      return result.current.messages;
    }

    it("the leg that does not touch the plan leaves it with the message that paused: one plan card, not two", async () => {
      const messages = await pausedThenAnswered((cb) => {
        cb.onToolCall?.(toolCall("t1", "issue_refund"));
        cb.onToolResult?.(toolResult("t1", "issue_refund", { ok: true }));
        cb.onDone?.(done("Refunded", { messageId: "m2" }));
      });
      const paused = messages.find((m) => m.id === "m1")!;
      const leg = messages.find((m) => m.id === "m2")!;
      expect(paused.metadata?.plan).toEqual(plan("completed", "in-progress"));
      expect(leg.metadata?.plan).toBeUndefined();
      // what the leg did is still recorded
      expect(leg.metadata?.activity).toEqual([{ kind: "tool", id: "t1", name: "issue_refund", status: "ok" }]);
      expect(messages.filter((m) => m.metadata?.plan)).toHaveLength(1);
    });

    it("a leg that rewrites the same plan changes nothing either", async () => {
      const messages = await pausedThenAnswered((cb) => {
        cb.onPlan?.(plan("completed", "in-progress"));
        cb.onDone?.(done("Refunded", { messageId: "m2" }));
      });
      expect(messages.find((m) => m.id === "m2")?.metadata).toBeUndefined();
    });

    it("a leg that changes the plan keeps the new one, as an update of the plan the turn had", async () => {
      const messages = await pausedThenAnswered((cb) => {
        cb.onPlan?.(plan("completed", "completed"));
        cb.onDone?.(done("Refunded", { messageId: "m2" }));
      });
      const leg = messages.find((m) => m.id === "m2")!;
      expect(leg.metadata?.plan).toEqual(plan("completed", "completed"));
      expect(leg.metadata?.activity).toEqual([{ kind: "plan", done: 2, total: 2 }]);
      expect(messages.find((m) => m.id === "m1")?.metadata?.plan).toEqual(plan("completed", "in-progress"));
    });
  });

  describe("following the leg that carries a paused turn on", () => {
    const user = message({ id: "u1", role: "user", content: "refund me" });
    const event = (type: string, data: Record<string, unknown>, seq?: number): ConversationEvent => ({ type, data, ...(seq !== undefined ? { seq } : {}) });

    /** A page that shows the paused message, then follows the run that goes on with it; `events` come once the loaded messages are on screen. */
    async function follow(events: Array<[string, Record<string, unknown>]>) {
      const paused = message({ id: "m1", status: "requires_action", pendingActions: [approval], metadata: { plan: plan("completed", "in-progress"), activity: [{ kind: "plan", done: 1, total: 2, created: true }] } });
      const final = message({ id: "m2", content: "Refunded" });
      const getConversation = vi
        .fn()
        .mockResolvedValueOnce({ conversation: conversation({ runtime: { status: "running", lastEventSeq: 7, activeRunId: "run_2" } }), messages: [user, paused] })
        .mockResolvedValue({ conversation: conversation({ runtime: { status: "idle", stopReason: "end_turn", lastEventSeq: 12 } }), messages: [user, paused, final] });
      let begin!: () => void;
      const loaded = new Promise<void>((r) => (begin = r));
      let finish!: () => void;
      const finished = new Promise<void>((r) => (finish = r));
      const followEvents = vi.fn(async (_id: string, options: FollowEventsOptions) => {
        await loaded;
        let seq = 8;
        for (const [type, data] of events) options.onEvent(event(type, data, seq++));
        await finished;
        options.onEvent(event("session.status_idle", { stop_reason: "end_turn" }, seq));
      });
      const hook = renderHook(() => useChat({ transport: transport({ getConversation, followEvents }), agentId: "agent" }), { wrapper });
      await act(async () => {
        await hook.result.current.loadConversation("c1");
      });
      await waitFor(() => expect(hook.result.current.isFollowing).toBe(true));
      await act(async () => {
        begin();
      });
      const end = async () => {
        await act(async () => {
          finish();
        });
        await waitFor(() => expect(hook.result.current.isFollowing).toBe(false));
      };
      return { result: hook.result, finish: end };
    }

    it("keeps the plan card the turn had, instead of dropping it when the run begins", async () => {
      const { result, finish } = await follow([["session.status_running", { trigger: "resume" }]]);
      await waitFor(() => expect(result.current.plan).toEqual(plan("completed", "in-progress")));
      await finish();
      // the run is over: the stored messages are the truth
      expect(result.current.plan).toBeUndefined();
    });

    it("shows the plan the run writes next", async () => {
      const { result, finish } = await follow([
        ["session.status_running", { trigger: "resume" }],
        ["agent.plan", { operation: "update", steps: [{ id: 1, title: "Step 1", status: "completed" }, { id: 2, title: "Step 2", status: "completed" }] }],
      ]);
      await waitFor(() => expect(result.current.plan?.steps.map((s) => s.status)).toEqual(["completed", "completed"]));
      await finish();
    });

    it("a run that begins a turn carries nothing of the paused one", async () => {
      // the person sent a message instead of answering: the card of the paused turn is not the plan of this turn
      const { result, finish } = await follow([["session.status_running", { trigger: "message" }]]);
      expect(result.current.isFollowing).toBe(true);
      expect(result.current.plan).toBeUndefined();
      await finish();
    });
  });
});
