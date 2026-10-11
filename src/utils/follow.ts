import type { ConversationEvent, FileAttachment, StopReason } from "../types";
import { normalizeStopReason } from "./runtime";

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
  tools: Map<string, FollowedTool>;
  /** The assistant message the turn wrote, once it did */
  messageId?: string;
  /** The user message of the followed turn, when its `user.message` (or the reattach snapshot) was in the part we saw */
  userMessage?: { id: string; content: string; files?: FileAttachment[] };
  /**
   * The run a reattach snapshot (`agent.message.snapshot`) seeded the text from. Its own
   * `session.status_running`, replayed after the snapshot, must not wipe that text.
   */
  snapshotRunId?: string;
  /** The turn is over: why, and the runtime's wording */
  idle?: { stopReason?: StopReason; detail?: string; pendingActionIds: string[] };
  error?: { message: string; code?: string };
  /** Newest `seq` folded in */
  lastSeq?: number;
}

export const newFollowState = (): FollowState => ({ text: "", streamed: false, tools: new Map() });

const asString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

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
    case "session.status_running":
      // The run the snapshot seeded is the one that starts here (the log is replayed from before it began):
      // what the snapshot brought stays
      if (base.snapshotRunId !== undefined && event.runId === base.snapshotRunId) {
        return { ...base, idle: undefined, error: undefined };
      }
      // A new turn begins: nothing of the previous one is on screen any more
      return { ...base, text: "", streamed: false, tools: new Map(), idle: undefined, error: undefined, messageId: undefined, snapshotRunId: undefined };

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
        snapshotRunId: asString(data.run_id) ?? asString(data.runId) ?? event.runId ?? base.snapshotRunId,
        ...(userId ? { userMessage: { id: userId, content: asString(user.content) ?? "", files: filesOf(user.files) } } : {}),
      };
    }

    case "user.message": {
      const id = asString(data.message_id);
      if (!id) return base;
      return {
        ...base,
        userMessage: { id, content: asString(data.content) ?? "", files: filesOf(data.files) },
      };
    }

    case "agent.message.delta": {
      const text = asString(data.text);
      if (!text) return base;
      return { ...base, text: base.text + text, streamed: true };
    }

    case "agent.tool_use": {
      const id = asString(data.tool_call_id);
      if (!id) return base;
      const tools = new Map(base.tools);
      tools.set(id, { name: asString(data.name) ?? "tool", args: asRecord(data.args) });
      return { ...base, tools };
    }

    case "agent.tool_result": {
      const id = asString(data.tool_call_id);
      const existing = id ? base.tools.get(id) : undefined;
      if (!id || !existing) return base;
      const tools = new Map(base.tools);
      const failed = data.ok === false;
      tools.set(id, { ...existing, result: failed ? { ok: false, error: asString(data.error) ?? "failed" } : { ok: true } });
      return { ...base, tools };
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
