import type {
  ActionResolution,
  ActionState,
  ActionStatus,
  Message,
  PendingAction,
  UserQuestion,
} from "../types";

type QuestionAction = Extract<PendingAction, { type: "user_question" }>;

/** Value an option submits: its `value`, falling back to its label. */
export function optionValue(option: { label: string; value?: string }): string {
  return option.value ?? option.label;
}

/**
 * Whether a question has to be answered. Required unless the server says
 * `required: false` (the agent SDK's rule: a missing answer to a required question is refused).
 */
export function isQuestionRequired(question: Pick<UserQuestion, "required">): boolean {
  return question.required !== false;
}

function isAction(value: unknown): value is PendingAction {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  if (typeof a.id !== "string") return false;
  if (a.type === "tool_approval") return typeof a.toolName === "string";
  if (a.type === "user_question") return Array.isArray(a.questions);
  return false;
}

/** The action kind a record names: `type`, or `kind` as the Console writes it on a message snapshot. */
function kindOf(value: unknown): "tool_approval" | "user_question" | undefined {
  if (!value || typeof value !== "object") return undefined;
  const a = value as Record<string, unknown>;
  const kind = a.type ?? a.kind;
  return kind === "tool_approval" || kind === "user_question" ? kind : undefined;
}

/** Keeps only well-formed actions; servers may send anything. */
export function normalizeActions(value: unknown): PendingAction[] {
  if (!Array.isArray(value)) return [];
  const out: PendingAction[] = [];
  for (const item of value) {
    const kind = kindOf(item);
    if (!kind) continue;
    const action = { ...(item as Record<string, unknown>), type: kind };
    if (isAction(action)) out.push(action);
  }
  return out;
}

const SETTLED: ReadonlySet<string> = new Set(["resolved", "cancelled", "expired"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** A resolution as a server writes it (`{ decision, comment, answers, ... }`, with or without `type`), or undefined. */
function resolutionOf(kind: "tool_approval" | "user_question", value: unknown): ActionResolution | undefined {
  if (!isRecord(value)) return undefined;
  if (kind === "tool_approval") {
    if (value.decision !== "allow" && value.decision !== "deny") return undefined;
    return {
      type: "tool_approval",
      decision: value.decision,
      ...(typeof value.comment === "string" && value.comment ? { comment: value.comment } : {}),
      ...(isRecord(value.approvedArgs) ? { approvedArgs: value.approvedArgs } : {}),
      ...(value.rememberForSession === true ? { rememberForSession: true } : {}),
    };
  }
  const answers: Record<string, string | string[]> = {};
  if (isRecord(value.answers)) {
    for (const [question, answer] of Object.entries(value.answers)) {
      if (typeof answer === "string") answers[question] = answer;
      else if (Array.isArray(answer) && answer.every((a) => typeof a === "string")) answers[question] = answer as string[];
    }
  }
  return { type: "user_question", answers, ...(value.cancelled === true ? { cancelled: true } : {}) };
}

/**
 * The state a server records for an action that is no longer open: an entry of the
 * message's `actionStates`, or a settled entry of `metadata.pendingActions` (`status`,
 * `resolution`, `resolvedBy`, `resolvedAt`). Undefined for an open or unknown entry.
 */
export function settledStateOf(entry: unknown, kind?: "tool_approval" | "user_question"): ActionState | undefined {
  if (!isRecord(entry)) return undefined;
  const status = entry.status;
  if (typeof status !== "string" || !SETTLED.has(status)) return undefined;
  const resolved = kind ?? kindOf(entry);
  const resolution = resolved ? resolutionOf(resolved, entry.resolution) : undefined;
  // A request nobody answered in time is refused by the server on its own behalf (`system:timeout`):
  // to the person it is a lapsed request, not a denial they made
  const lapsed = status === "resolved" && typeof entry.resolvedBy === "string" && entry.resolvedBy.startsWith("system:timeout");
  return {
    status: lapsed ? "expired" : (status as ActionStatus),
    ...(resolution ? { resolution } : {}),
    ...(typeof entry.resolvedBy === "string" ? { resolvedBy: entry.resolvedBy } : {}),
    ...(typeof entry.resolvedAt === "string" ? { resolvedAt: entry.resolvedAt } : {}),
  };
}

/**
 * Everything a loaded message says about how its actions ended: its `actionStates`,
 * `metadata.actionStates`, and the settled entries of `metadata.pendingActions`
 * (first one that names an action wins, in that order).
 */
function recordedStates(message: Message, actions: PendingAction[]): Record<string, ActionState> {
  const meta = message.metadata as Record<string, unknown> | undefined;
  const out: Record<string, ActionState> = {};

  const metaStates = isRecord(meta?.actionStates) ? meta.actionStates : undefined;
  for (const action of actions) {
    const own = message.actionStates?.[action.id];
    if (own) {
      out[action.id] = own;
      continue;
    }
    const fromMeta = settledStateOf(metaStates?.[action.id], action.type);
    if (fromMeta) out[action.id] = fromMeta;
  }

  const snapshot = Array.isArray(meta?.pendingActions) ? meta.pendingActions : [];
  for (const entry of snapshot) {
    const id = isRecord(entry) && typeof entry.id === "string" ? entry.id : undefined;
    if (!id || out[id]) continue;
    const action = actions.find((a) => a.id === id);
    const state = action ? settledStateOf(entry, action.type) : undefined;
    if (state) out[id] = state;
  }
  return out;
}

/** An action is waiting for an answer unless the UI has seen it settle. */
export function isActionPending(message: Message, actionId: string): boolean {
  const status = message.actionStates?.[actionId]?.status;
  return status === undefined || status === "pending" || status === "resolving";
}

export interface PendingActionEntry {
  messageId: string;
  action: PendingAction;
  state?: ActionState;
}

/** Every action that still needs an answer, oldest first. */
export function collectPendingActions(messages: Message[]): PendingActionEntry[] {
  const out: PendingActionEntry[] = [];
  for (const message of messages) {
    for (const action of message.pendingActions ?? []) {
      if (isActionPending(message, action.id)) {
        out.push({ messageId: message.id, action, state: message.actionStates?.[action.id] });
      }
    }
  }
  return out;
}

/**
 * The one case the composer can answer: a single pending question without
 * options. Anything else needs the card.
 */
export function singleFreeTextQuestion(entries: PendingActionEntry[]): {
  action: QuestionAction;
  question: UserQuestion;
} | null {
  if (entries.length !== 1) return null;
  const { action, state } = entries[0];
  if (state?.status === "resolving") return null;
  if (action.type !== "user_question" || action.questions.length !== 1) return null;
  const question = action.questions[0];
  if (question.options && question.options.length > 0) return null;
  return { action, question };
}

/**
 * Re-attaches pending actions to a loaded conversation.
 *
 * `reported` is the server's own list (`pendingActions` on the conversation
 * response) and is authoritative when present. Without it the last assistant
 * message decides: actions it carries count as pending only while it is
 * `requires_action` (or has no status).
 *
 * An action that is not pending shows how it ended when the message says so (its
 * `actionStates`, or a settled entry with `status` / `resolution` in
 * `metadata.pendingActions`); otherwise it is shown as plainly resolved.
 */
export function restorePendingActions(
  messages: Message[],
  reported?: unknown
): Message[] {
  const serverList = Array.isArray(reported) ? normalizeActions(reported) : undefined;

  // Actions the server only reports at the top level belong to the last assistant message.
  let lastAssistant = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      lastAssistant = i;
      break;
    }
  }

  const reportedIds = new Set((serverList ?? []).map((a) => a.id));

  return messages.map((message, index) => {
    const own = normalizeActions(
      message.pendingActions ?? (message.metadata as Record<string, unknown> | undefined)?.pendingActions
    );
    let actions = own;
    if (index === lastAssistant && serverList) {
      const known = new Set(own.map((a) => a.id));
      actions = [...own, ...serverList.filter((a) => !known.has(a.id))];
    }
    if (actions.length === 0) return message;

    const isLast = index === lastAssistant;
    const recorded = recordedStates(message, actions);
    const actionStates: Record<string, ActionState> = { ...message.actionStates };
    for (const action of actions) {
      // What the server reports as open is open, whatever an older copy of the message says
      if (serverList && reportedIds.has(action.id)) {
        delete actionStates[action.id];
        continue;
      }
      if (actionStates[action.id]) continue;
      if (recorded[action.id]) {
        actionStates[action.id] = recorded[action.id];
        continue;
      }
      const pending = serverList
        ? false
        : isLast && (message.status === undefined || message.status === "requires_action");
      if (!pending) actionStates[action.id] = { status: "resolved" };
    }

    const stillPending = actions.some((a) => !actionStates[a.id]);
    return {
      ...message,
      pendingActions: actions,
      status: message.status ?? (stillPending ? "requires_action" : undefined),
      actionStates,
    };
  });
}

/** Marks the given actions as settled in a message list. */
export function setActionStates(
  messages: Message[],
  updates: Record<string, ActionState>
): Message[] {
  const ids = Object.keys(updates);
  if (ids.length === 0) return messages;
  return messages.map((message) => {
    const mine = (message.pendingActions ?? []).filter((a) => updates[a.id]);
    if (mine.length === 0) return message;
    const actionStates = { ...message.actionStates };
    for (const a of mine) actionStates[a.id] = updates[a.id];
    return { ...message, actionStates };
  });
}

/** What a card shows once an action is settled, as plain text. */
export function summarizeAnswers(answers: Record<string, string | string[]>): string[] {
  return Object.values(answers)
    .map((v) => (Array.isArray(v) ? v.join(", ") : v))
    .filter((v) => v.length > 0);
}

/** The UI state a resolution leads to. */
export function stateForResolution(resolution: ActionResolution): ActionState {
  const cancelled = resolution.type === "user_question" && resolution.cancelled;
  return { status: cancelled ? "cancelled" : "resolved", resolution };
}

/**
 * The card state an error code leads to when the server says the action can no
 * longer be answered: answered elsewhere, expired, or cancelled. `undefined` for
 * any other error (the action may still be open, so the card goes back to pending).
 */
export function stateForSpentAction(code: string | undefined): ActionState | undefined {
  switch (typeof code === "string" ? code.toLowerCase() : code) {
    case "action_not_pending":
      return { status: "resolved" };
    case "action_expired":
      return { status: "expired" };
    case "action_cancelled":
      return { status: "cancelled" };
    default:
      return undefined;
  }
}

/**
 * Messages freshly loaded from the server, with what this app already knows about how
 * its own cards ended. A server that does not record the outcome reports a settled
 * action as plainly resolved; an Expired or Cancelled card the person just saw must not
 * turn into "Answered" on a refresh.
 */
export function keepSettledDetail(loaded: Message[], current: Message[]): Message[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  return loaded.map((message) => {
    const before = byId.get(message.id);
    if (!before?.actionStates || !message.actionStates) return message;
    let changed = false;
    const actionStates = { ...message.actionStates };
    for (const [id, state] of Object.entries(actionStates)) {
      const known = before.actionStates[id];
      const vague = state.status === "resolved" && !state.resolution;
      if (known && vague && known.status !== "pending" && known.status !== "resolving") {
        actionStates[id] = known;
        changed = true;
      }
    }
    return changed ? { ...message, actionStates } : message;
  });
}

/** When an action stops being answerable, as epoch milliseconds, or undefined without a usable deadline. */
export function actionDeadline(action: Pick<PendingAction, "expiresAt">): number | undefined {
  if (!action.expiresAt) return undefined;
  const at = Date.parse(action.expiresAt);
  return Number.isFinite(at) ? at : undefined;
}

/**
 * Marks as Expired the actions that are still open in `messages` although their deadline has passed.
 * A server only settles a lapsed action when its own sweep runs (a minute apart by default), so a
 * conversation fetched in between still lists it as open; the card has already shown Expired and
 * must not come back to life. An action the UI has settled or is sending an answer for is left alone.
 */
export function expireLapsedActions(messages: Message[], now: number = Date.now()): Message[] {
  return messages.map((message) => {
    let lapsed: Record<string, ActionState> | undefined;
    for (const action of message.pendingActions ?? []) {
      const status = message.actionStates?.[action.id]?.status;
      if (status !== undefined && status !== "pending") continue;
      const at = actionDeadline(action);
      if (at !== undefined && at <= now) (lapsed ??= {})[action.id] = { status: "expired" };
    }
    return lapsed ? { ...message, actionStates: { ...message.actionStates, ...lapsed } } : message;
  });
}

export type CountdownUnit = "day" | "hour" | "minute" | "second";

/**
 * A remaining time as one value and unit for `Intl.RelativeTimeFormat`
 * ("in 23 hours", "in 9 minutes"): the largest unit that fits, rounded up so the
 * display never reads zero while time is left.
 */
export function splitRemaining(ms: number): { value: number; unit: CountdownUnit } {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds >= 86400) return { value: Math.floor(seconds / 86400), unit: "day" };
  if (seconds >= 3600) return { value: Math.floor(seconds / 3600), unit: "hour" };
  if (seconds >= 60) return { value: Math.floor(seconds / 60), unit: "minute" };
  return { value: seconds, unit: "second" };
}
