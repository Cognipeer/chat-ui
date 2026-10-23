import type { ActivityEntry, Message, PlanOperation, PlanSnapshot, PlanStep, PlanStepStatus } from "../types";

/** A plan longer than this is cut (agent-server cuts at the same number). */
export const MAX_PLAN_STEPS = 100;
/** A step title longer than this is cut. */
const MAX_TITLE_CHARS = 500;

const STATUSES: ReadonlySet<string> = new Set<PlanStepStatus>(["not-started", "in-progress", "completed", "blocked"]);
const OPERATIONS: ReadonlySet<string> = new Set<PlanOperation>(["write", "update"]);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/**
 * A plan as the chat shows it, read from a wire frame, a stored event or a message's metadata. Only titles and
 * status are kept, with the version and what the agent did to the plan (`operation`). A step without a title is
 * left out, a status the chat does not know reads as not started and an operation it does not know is dropped, so
 * a newer server cannot make a plan disappear. Undefined when nothing usable is left (no plan to show).
 */
export function normalizePlan(value: unknown): PlanSnapshot | undefined {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.steps)) return undefined;
  const steps: PlanStep[] = [];
  for (const raw of record.steps) {
    if (steps.length >= MAX_PLAN_STEPS) break;
    const step = asRecord(raw);
    if (!step || typeof step.title !== "string") continue;
    const title = step.title.trim();
    if (!title) continue;
    const id = typeof step.id === "string" || (typeof step.id === "number" && Number.isFinite(step.id)) ? step.id : undefined;
    steps.push({
      ...(id !== undefined ? { id } : {}),
      title: title.length > MAX_TITLE_CHARS ? `${title.slice(0, MAX_TITLE_CHARS - 1)}…` : title,
      status: typeof step.status === "string" && STATUSES.has(step.status) ? (step.status as PlanStepStatus) : "not-started",
    });
  }
  if (steps.length === 0) return undefined;
  const version = typeof record.version === "number" && Number.isFinite(record.version) ? record.version : undefined;
  const operation = typeof record.operation === "string" && OPERATIONS.has(record.operation) ? (record.operation as PlanOperation) : undefined;
  return { ...(version !== undefined ? { version } : {}), ...(operation ? { operation } : {}), steps };
}

/** How far a plan is: steps done of all, the step being worked on, and whether every step is done. */
export function planProgress(plan: PlanSnapshot): { done: number; total: number; current?: PlanStep; complete: boolean } {
  const total = plan.steps.length;
  const done = plan.steps.filter((step) => step.status === "completed").length;
  return { done, total, current: plan.steps.find((step) => step.status === "in-progress"), complete: total > 0 && done === total };
}

/** What a plan shows: two frames with the same fingerprint look the same, so the second is not news. */
function fingerprint(plan: PlanSnapshot): string {
  return JSON.stringify(plan.steps.map((step) => [step.title, step.status]));
}

/** The plan a stored message carries (`metadata.plan`), or undefined. */
export function readPlan(message: Pick<Message, "metadata">): PlanSnapshot | undefined {
  return normalizePlan(asRecord(message.metadata)?.plan);
}

/**
 * The plan the turn at the end of these messages has so far: the newest plan among the assistant messages after the
 * person's last one. A turn that paused for an answer carries its plan into the leg that carries on.
 */
export function turnPlanOf(messages: ReadonlyArray<Pick<Message, "role" | "metadata">>): PlanSnapshot | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "user") return undefined;
    const plan = message.role === "assistant" ? readPlan(message) : undefined;
    if (plan) return plan;
  }
  return undefined;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * The ordered activity a stored message carries (`metadata.activity`). Entries that do not read as one are
 * left out; undefined when none is left, so the caller falls back to the order it always used.
 */
export function readActivity(message: Pick<Message, "metadata">): ActivityEntry[] | undefined {
  const raw = asRecord(message.metadata)?.activity;
  if (!Array.isArray(raw)) return undefined;
  const entries: ActivityEntry[] = [];
  for (const item of raw) {
    const entry = asRecord(item);
    if (!entry) continue;
    if (entry.kind === "tool" && typeof entry.name === "string" && entry.name) {
      entries.push({
        kind: "tool",
        ...(typeof entry.id === "string" ? { id: entry.id } : {}),
        name: entry.name,
        ...(typeof entry.label === "string" && entry.label ? { label: entry.label } : {}),
        ...(entry.status === "ok" || entry.status === "error" ? { status: entry.status } : {}),
      });
    } else if (entry.kind === "plan" && finite(entry.done) && finite(entry.total)) {
      entries.push({
        kind: "plan",
        ...(finite(entry.version) ? { version: entry.version } : {}),
        done: entry.done,
        total: entry.total,
        ...(entry.created === true ? { created: true } : {}),
      });
    } else if (entry.kind === "compaction") {
      entries.push({ kind: "compaction", ...(typeof entry.id === "string" ? { id: entry.id } : {}) });
    }
  }
  return entries.length > 0 ? entries : undefined;
}

/** Whether a tool's result says the call failed (`{ ok: false }`, `{ error }`, `{ isError: true }`). */
export function toolResultFailed(result: unknown): boolean {
  const record = asRecord(result);
  if (!record) return false;
  if (record.ok === false || record.isError === true) return true;
  return typeof record.error === "string" && record.error.length > 0;
}

// ---------------------------------------------------------------------------
// What a turn has done so far, in the order it happened
// ---------------------------------------------------------------------------

/**
 * The plan and the ordered activity of the turn being watched. Plain data, changed only through the `flow*`
 * functions below (each returns the next state), so the live hook, the follower of a turn that runs elsewhere and
 * the in-process adapters all record a turn the same way.
 */
export interface TurnFlowState {
  /** The latest plan of the turn */
  plan?: PlanSnapshot;
  /**
   * This leg wrote or changed the plan. A plan a leg starts with (the one a paused turn carries into the leg that
   * answers it) is not a change: it already sits in the message that paused, so it is not written again.
   */
  planChanged?: boolean;
  activity: ActivityEntry[];
}

export const emptyTurnFlow = (plan?: PlanSnapshot): TurnFlowState => ({ ...(plan ? { plan } : {}), activity: [] });

/** A tool call began. A call seen again (same id) only updates its label. */
export function flowToolStart(flow: TurnFlowState, call: { id?: string; name: string; label?: string }): TurnFlowState {
  if (call.id !== undefined) {
    const at = flow.activity.findIndex((entry) => entry.kind === "tool" && entry.id === call.id);
    if (at >= 0) {
      const existing = flow.activity[at] as Extract<ActivityEntry, { kind: "tool" }>;
      if (!call.label || existing.label === call.label) return flow;
      const activity = flow.activity.slice();
      activity[at] = { ...existing, label: call.label };
      return { ...flow, activity };
    }
  }
  const entry: ActivityEntry = {
    kind: "tool",
    ...(call.id !== undefined ? { id: call.id } : {}),
    name: call.name,
    ...(call.label ? { label: call.label } : {}),
  };
  return { ...flow, activity: [...flow.activity, entry] };
}

/** A tool call ended; its entry says whether it went well. A call that was never seen is ignored. */
export function flowToolEnd(flow: TurnFlowState, id: string, failed: boolean): TurnFlowState {
  const at = flow.activity.findIndex((entry) => entry.kind === "tool" && entry.id === id);
  if (at < 0) return flow;
  const activity = flow.activity.slice();
  activity[at] = { ...(flow.activity[at] as Extract<ActivityEntry, { kind: "tool" }>), status: failed ? "error" : "ok" };
  return { ...flow, activity };
}

/**
 * The agent wrote or changed its plan. A frame that says what the agent did (`operation`) is believed: a plan it
 * wrote out is marked `created`, one it changed is not. A frame that does not say (an older server) is judged by the
 * turn so far: its first plan is marked `created`. A frame that shows the same steps in the same state as the plan
 * already held (a replay, a rewrite without a change) adds nothing.
 */
export function flowPlan(flow: TurnFlowState, plan: PlanSnapshot | undefined): TurnFlowState {
  if (!plan) return flow;
  if (flow.plan && fingerprint(flow.plan) === fingerprint(plan)) return flow;
  const { done, total } = planProgress(plan);
  // without the word of the server: a leg that carries on a paused turn starts with the plan the turn already had,
  // so what it writes first is an update, not a creation
  const created = plan.operation !== undefined ? plan.operation === "write" : !flow.plan && !flow.activity.some((entry) => entry.kind === "plan");
  const entry: ActivityEntry = {
    kind: "plan",
    ...(plan.version !== undefined ? { version: plan.version } : {}),
    done,
    total,
    ...(created ? { created: true } : {}),
  };
  return { plan, planChanged: true, activity: [...flow.activity, entry] };
}

/** A condensing pass finished at this point of the turn. A pass with an id already recorded is not recorded twice. */
export function flowCompaction(flow: TurnFlowState, id?: string): TurnFlowState {
  if (id !== undefined && flow.activity.some((entry) => entry.kind === "compaction" && entry.id === id)) return flow;
  return { ...flow, activity: [...flow.activity, { kind: "compaction", ...(id !== undefined ? { id } : {}) }] };
}

/**
 * What a finished turn keeps in its message's `metadata` (nothing for a turn that did none of it). The plan is kept
 * only when this leg wrote or changed it: a leg that merely carried it on would draw the plan of the message that
 * paused a second time.
 */
export function flowMetadata(flow: TurnFlowState): { plan?: PlanSnapshot; activity?: ActivityEntry[] } {
  return {
    ...(flow.plan && flow.planChanged ? { plan: flow.plan } : {}),
    ...(flow.activity.length > 0 ? { activity: flow.activity } : {}),
  };
}
