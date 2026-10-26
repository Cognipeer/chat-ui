import type { ConversationEvent, FileAttachment, PlanSnapshot, StopReason } from "../types";
import { normalizeStopReason } from "./runtime";
import {
  emptyTurnFlow,
  flowCompaction,
  flowPlan,
  flowText,
  flowToolEnd,
  flowToolStart,
  normalizePlan,
  type TurnFlowState,
} from "./plan";

/** A tool call seen in the event log. */
export interface FollowedTool {
  name: string;
  args: Record<string, unknown>;
  /** `{ ok: true }`, or `{ ok: false, error }` once the call ended (the log does not carry the result itself) */
  result?: unknown;
}

/**
 * What a turn that this page is only watching (another window started it, or this page
 * reloaded in the middle of it) has shown so far, folded from the conversation's event log.
 */
export interface FollowState {
  /** The answer so far: streamed text, or the whole answer of a turn that did not stream */
  text: string;
  /** Text deltas were seen (so `agent.message` repeats what is already there) */
  streamed: boolean;
  /**
   * A tool call came after `text`: those words announced it and are kept in `flow`; the next delta begins the text
   * afresh (a model that announces its calls writes the announcement and the answer in the same stream).
   */
  textClosed?: boolean;
  tools: Map<string, FollowedTool>;
  /**
   * The plan of the turn and what happened in it, in order (calls, plan changes, condensing passes), folded from
   * `agent.plan` / `agent.compaction` and the tool events. The finished message brings its own copy of the same
   * when the turn ends; this is what the page shows while the turn runs.
   */
  flow: TurnFlowState;
  /** The assistant message the turn wrote, once it did */
  messageId?: string;
  /** The user message of the followed turn, when its `user.message` (or the reattach snapshot) was in the part we saw */
  userMessage?: { id: string; content: string; files?: FileAttachment[]; origin?: string; reminderMessage?: string };
  /**
   * The run a reattach snapshot (`agent.message.snapshot`) seeded the text from, when it named one.
   * Its own `session.status_running`, replayed after the snapshot, must not wipe that text.
   */
  snapshotRunId?: string;
  /**
   * The plan of the turn this page shows as paused, asked for when a run begins that carries that turn on
   * (`session.status_running` with `trigger: "resume"` or `"timeout"`): the run's flow starts from it, so the plan card
   * stays and what the run writes next is an update of it, not a creation. Set by the page (`newFollowState`), never by
   * the log; a run that begins a turn (a person's message, a reminder) carries nothing.
   */
  carriedPlan?: () => PlanSnapshot | undefined;
  /**
   * The text comes from a reattach snapshot and no later run has proved otherwise. While it is set a
   * replayed `session.status_running` that names no run (or the snapshot's own) keeps the text; only a
   * different run (named on a start or on a delta), or a start after the turn went idle, begins afresh.
   */
  seeded?: boolean;
  /** The turn is over: why, and the runtime's wording */
  idle?: { stopReason?: StopReason; detail?: string; pendingActionIds: string[] };
  error?: { message: string; code?: string };
  /** Newest `seq` folded in */
  lastSeq?: number;
}

export const newFollowState = (carriedPlan?: () => PlanSnapshot | undefined): FollowState => ({
  text: "",
  streamed: false,
  tools: new Map(),
  flow: emptyTurnFlow(),
  ...(carriedPlan ? { carriedPlan } : {}),
});

const asString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
/** The run an event belongs to: stamped on the frame, or inside its data (a delta carries it there). */
const runIdOf = (event: ConversationEvent, data: Record<string, unknown>): string | undefined =>
  asString(event.runId) ?? asString(data.run_id) ?? asString(data.runId);
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** `origin: 'reminder'` (and what it was about) on a `user.message` / snapshot user message, flat or in `metadata`. */
function originOf(data: Record<string, unknown>): { origin?: string; reminderMessage?: string } {
  const meta = asRecord(data.metadata);
  const origin = asString(data.origin) ?? asString(meta.origin);
  if (!origin) return {};
  const reminder = asRecord(data.reminder ?? meta.reminder);
  const reminderMessage = asString(reminder.message);
  return { origin, ...(reminderMessage ? { reminderMessage } : {}) };
}

function filesOf(value: unknown): FileAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: FileAttachment[] = [];
  for (const item of value) {
    const f = asRecord(item);
    const id = asString(f.id);
    if (!id) continue;
    out.push({
      id,
      name: asString(f.name) ?? "file",
      mimeType: asString(f.mime_type) ?? asString(f.mimeType) ?? "application/octet-stream",
      size: typeof f.size === "number" ? f.size : 0,
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Folds one event into the state of a followed turn. Unknown event types are ignored (new ones
 * can appear in a future version); the cards of a pause are not tracked here, the conversation is
 * loaded again when the turn ends and brings them. Returns a new state when something changed.
 */
export function applyFollowEvent(state: FollowState, event: ConversationEvent): FollowState {
  const data = asRecord(event.data);
  const base: FollowState =
    typeof event.seq === "number" && (state.lastSeq === undefined || event.seq > state.lastSeq)
      ? { ...state, lastSeq: event.seq }
      : state;

  switch (event.type) {
    case "session.status_running": {
      // The log is replayed from before the run began, so the snapshot's own start comes through again: it
      // names the snapshot's run, or (a server that does not stamp it on the event) no run at all. What the
      // snapshot brought stays until another run proves itself.
      const incoming = runIdOf(event, data);
      // A run that answers or outlasts a pause carries its turn on: the plan the turn had is where the run starts
      const trigger = asString(data.trigger);
      const carried = trigger === "resume" || trigger === "timeout" ? base.carriedPlan?.() : undefined;
      if (base.seeded && !base.idle && (incoming === undefined || base.snapshotRunId === undefined || incoming === base.snapshotRunId)) {
        // (a flow that has seen nothing of the run yet takes the carried plan: a run joined through its snapshot is not told its start otherwise)
        const untouched = !base.flow.plan && base.flow.activity.length === 0;
        return { ...base, ...(carried && untouched ? { flow: emptyTurnFlow(carried) } : {}), error: undefined, snapshotRunId: base.snapshotRunId ?? incoming };
      }
      // A new run begins: nothing of the previous one is on screen any more (but the plan a paused turn carries on)
      return { ...base, text: "", streamed: false, textClosed: false, tools: new Map(), flow: emptyTurnFlow(carried), idle: undefined, error: undefined, messageId: undefined, snapshotRunId: undefined, seeded: false };
    }

    case "agent.message.snapshot": {
      // The server's first frame to a follower that joins a run in progress: everything the run has
      // written so far (live deltas are not replayed), and the user message that started it when the
      // stored history may not have it yet. Live deltas follow and add to it. Not stored: no `seq`.
      const text = asString(data.text) ?? "";
      const user = asRecord(data.user_message ?? data.userMessage);
      const userId = asString(user.id) ?? asString(user.message_id);
      return {
        ...base,
        text,
        streamed: text.length > 0 ? true : base.streamed,
        textClosed: false,
        snapshotRunId: runIdOf(event, data) ?? base.snapshotRunId,
        seeded: true,
        idle: undefined,
        ...(userId ? { userMessage: { id: userId, content: asString(user.content) ?? "", files: filesOf(user.files), ...originOf(user) } } : {}),
      };
    }

    case "user.message": {
      const id = asString(data.message_id);
      if (!id) return base;
      return {
        ...base,
        userMessage: { id, content: asString(data.content) ?? "", files: filesOf(data.files), ...originOf(data) },
      };
    }

    case "agent.message.delta": {
      const text = asString(data.text);
      if (!text) return base;
      if (base.seeded) {
        const incoming = runIdOf(event, data);
        // A delta of another run than the snapshot's: that run began without us seeing its start, and
        // nothing the snapshot seeded belongs to it
        if (incoming !== undefined && base.snapshotRunId !== undefined && incoming !== base.snapshotRunId) {
          return { ...base, text, streamed: true, textClosed: false, tools: new Map(), flow: emptyTurnFlow(), idle: undefined, error: undefined, messageId: undefined, snapshotRunId: incoming, seeded: false };
        }
        if (incoming !== undefined && base.snapshotRunId === undefined) {
          return { ...base, text: base.textClosed ? text : base.text + text, streamed: true, textClosed: false, snapshotRunId: incoming };
        }
      }
      // the words after a call begin the text afresh: the ones before it are in the flow
      return { ...base, text: base.textClosed ? text : base.text + text, streamed: true, textClosed: false };
    }

    case "agent.tool_use": {
      const id = asString(data.tool_call_id);
      if (!id) return base;
      const tools = new Map(base.tools);
      const name = asString(data.name) ?? "tool";
      tools.set(id, { name, args: asRecord(data.args) });
      // the words shown so far announced this call (kept ahead of it). A snapshot's text is everything the run wrote, from
      // before earlier calls too: it closes the text the same way, but where its words belong is not known
      const announced = !base.textClosed && base.text.trim() !== "";
      const flow = announced && !base.seeded ? flowText(base.flow, base.text) : base.flow;
      return { ...base, tools, flow: flowToolStart(flow, { id, name }), ...(announced ? { textClosed: true } : {}) };
    }

    case "agent.tool_result": {
      const id = asString(data.tool_call_id);
      const existing = id ? base.tools.get(id) : undefined;
      if (!id || !existing) return base;
      const tools = new Map(base.tools);
      const failed = data.ok === false;
      tools.set(id, { ...existing, result: failed ? { ok: false, error: asString(data.error) ?? "failed" } : { ok: true } });
      return { ...base, tools, flow: flowToolEnd(base.flow, id, failed) };
    }

    case "agent.plan": {
      // The whole plan as it is now; a replay of a state already shown changes nothing
      const flow = flowPlan(base.flow, normalizePlan(data));
      return flow === base.flow ? base : { ...base, flow };
    }

    case "agent.compaction": {
      // Only a finished pass is stored; it marks where in the turn the context was condensed
      return { ...base, flow: flowCompaction(base.flow, asString(data.id)) };
    }

    case "agent.message": {
      const content = asString(data.content);
      return {
        ...base,
        messageId: asString(data.message_id) ?? base.messageId,
        // A turn that did not stream shows its answer only now
        text: base.streamed ? base.text : content ?? base.text,
      };
    }

    case "session.error":
      return { ...base, error: { message: asString(data.message) ?? "The run failed", code: asString(data.code) } };

    case "session.status_idle":
      return {
        ...base,
        idle: {
          stopReason: normalizeStopReason(data.stop_reason),
          detail: asString(data.detail),
          pendingActionIds: Array.isArray(data.pending_action_ids)
            ? data.pending_action_ids.filter((id): id is string => typeof id === "string")
            : [],
        },
      };

    default:
      return base;
  }
}
