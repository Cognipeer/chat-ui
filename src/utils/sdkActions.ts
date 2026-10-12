import type { ActionResolution, PendingAction, UserQuestion } from "../types";

/**
 * Bridge to `@cognipeer/agent-sdk` pauses, for the in-process `AgentSdkTransport`: what an
 * `invoke` result that stopped for an approval or a question looks like, and how an answer is
 * handed back. (agent-server does the same on its side.)
 */

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function isoOf(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(typeof value === "number" || typeof value === "string" ? value : NaN);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

/** Pending approvals and questions of an `invoke` result's state, as chat actions. */
export function detectSdkPendingActions(result: { state?: unknown } | undefined): PendingAction[] {
  const state = result?.state;
  if (!isObject(state)) return [];
  const out: PendingAction[] = [];

  for (const entry of Array.isArray(state.pendingApprovals) ? state.pendingApprovals : []) {
    if (!isObject(entry) || entry.status !== "pending" || typeof entry.id !== "string") continue;
    const meta = isObject(entry.metadata) ? entry.metadata : undefined;
    const expiresAt = isoOf(entry.expiresAt ?? meta?.expiresAt);
    out.push({
      id: entry.id,
      type: "tool_approval",
      toolName: String(entry.toolName ?? ""),
      ...(typeof entry.toolCallId === "string" ? { toolCallId: entry.toolCallId } : {}),
      ...(typeof meta?.prompt === "string" ? { title: meta.prompt } : {}),
      ...(typeof meta?.summary === "string" && meta.summary !== "" ? { summary: meta.summary } : {}),
      ...(isObject(entry.args) ? { args: entry.args } : {}),
      ...(expiresAt ? { expiresAt } : {}),
    });
  }

  for (const entry of Array.isArray(state.pendingUserQuestions) ? state.pendingUserQuestions : []) {
    if (!isObject(entry) || entry.status !== "pending" || typeof entry.id !== "string") continue;
    const questions: UserQuestion[] = (Array.isArray(entry.questions) ? entry.questions : []).map((q: any) => ({
      question: String(q.question ?? ""),
      ...(q.header ? { header: q.header } : {}),
      ...(q.multiSelect !== undefined ? { multiSelect: q.multiSelect } : {}),
      ...(q.placeholder ? { placeholder: q.placeholder } : {}),
      ...(q.required !== undefined ? { required: q.required } : {}),
      ...(Array.isArray(q.options)
        ? {
            options: q.options.map((o: any) => ({
              label: o.label,
              ...(o.value !== undefined ? { value: o.value } : {}),
              ...(o.description ? { description: o.description } : {}),
              ...(typeof o.preview === "string" && o.preview !== "" ? { preview: o.preview } : {}),
            })),
          }
        : {}),
    }));
    const expiresAt = isoOf(entry.expiresAt ?? (isObject(entry.metadata) ? entry.metadata.expiresAt : undefined));
    out.push({
      id: entry.id,
      type: "user_question",
      questions,
      ...(typeof entry.allowFreeText === "boolean" ? { allowFreeText: entry.allowFreeText } : {}),
      ...(expiresAt ? { expiresAt } : {}),
    });
  }
  return out;
}

/**
 * `{ "<question text>": "value" | ["v1", ...] }` as the SDK takes answers: a value that is an
 * option (by value or label) is a selection, anything else free text.
 */
export function toSdkAnswers(
  questions: UserQuestion[],
  answers: Record<string, string | string[]> | undefined
): Record<string, { values: string[]; freeText?: string }> {
  const out: Record<string, { values: string[]; freeText?: string }> = {};
  for (const q of questions) {
    const raw = answers?.[q.question] ?? (q.header ? answers?.[q.header] : undefined);
    if (raw === undefined || raw === null) continue;
    const given = (Array.isArray(raw) ? raw : [raw]).filter((v) => typeof v === "string" && v.trim() !== "");
    if (given.length === 0) continue;
    const byLabel = new Map<string, string>();
    for (const o of q.options ?? []) {
      byLabel.set(o.value ?? o.label, o.value ?? o.label);
      byLabel.set(o.label, o.value ?? o.label);
    }
    const values: string[] = [];
    const free: string[] = [];
    for (const v of given) {
      const matched = byLabel.get(v);
      if (matched !== undefined) values.push(matched);
      else free.push(v);
    }
    out[q.question] = { values, ...(free.length ? { freeText: free.join(", ") } : {}) };
  }
  return out;
}

/** The slice of an agent-sdk agent that takes answers. */
export interface SdkResolver {
  resolveToolApproval?: (state: any, resolution: any) => any;
  resolveUserQuestion?: (state: any, resolution: any) => any;
}

export const supportsSdkPause = (agent: SdkResolver): boolean =>
  typeof agent.resolveToolApproval === "function" && typeof agent.resolveUserQuestion === "function";

/** Applies one answer to a paused SDK state (does not run the agent). Throws the SDK's own error on invalid input. */
export function applySdkResolution(
  agent: SdkResolver,
  state: unknown,
  action: PendingAction,
  resolution: ActionResolution,
  decidedBy = "user"
): unknown {
  if (action.type === "tool_approval" && resolution.type === "tool_approval") {
    return agent.resolveToolApproval!(state, {
      id: action.id,
      approved: resolution.decision === "allow",
      ...(resolution.approvedArgs ? { approvedArgs: resolution.approvedArgs } : {}),
      decidedBy,
      comment: resolution.comment,
    });
  }
  if (action.type === "user_question" && resolution.type === "user_question") {
    return agent.resolveUserQuestion!(state, {
      id: action.id,
      answers: toSdkAnswers(action.questions, resolution.answers),
      answeredBy: decidedBy,
      cancelled: resolution.cancelled === true,
    });
  }
  throw new Error(`Resolution type "${resolution.type}" does not match action type "${action.type}"`);
}

/** A paused SDK state as plain JSON, without the live runtime (`agent`) the SDK re-attaches on invoke. */
export function portableSdkState(state: unknown): unknown {
  if (!isObject(state)) return state;
  const { agent: _runtime, ...rest } = state;
  try {
    return JSON.parse(JSON.stringify(rest));
  } catch {
    return rest;
  }
}
