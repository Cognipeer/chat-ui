import type {
  ActionResolution,
  ActionState,
  Message,
  PendingAction,
  UserQuestion,
} from "../types";

type QuestionAction = Extract<PendingAction, { type: "user_question" }>;

/** Value an option submits: its `value`, falling back to its label. */
export function optionValue(option: { label: string; value?: string }): string {
  return option.value ?? option.label;
}

function isAction(value: unknown): value is PendingAction {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  if (typeof a.id !== "string") return false;
  if (a.type === "tool_approval") return typeof a.toolName === "string";
  if (a.type === "user_question") return Array.isArray(a.questions);
  return false;
}

/** Keeps only well-formed actions; servers may send anything. */
export function normalizeActions(value: unknown): PendingAction[] {
  return Array.isArray(value) ? value.filter(isAction) : [];
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
 * `requires_action` (or has no status). Anything else is shown as resolved.
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
    const actionStates: Record<string, ActionState> = { ...message.actionStates };
    for (const action of actions) {
      if (actionStates[action.id]) continue;
      const pending = serverList
        ? reportedIds.has(action.id)
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
