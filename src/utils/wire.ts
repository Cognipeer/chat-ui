import type { ActionResolution, PendingAction, StopReason, UserQuestion } from "../types";
import { normalizeStopReason } from "./runtime";

/**
 * Helpers for backends that speak the Console client API (`/client/v1`): the Responses API and
 * A2A endpoints report an approval or a question in snake_case, and take the answer as a REST body.
 * agent-server's own protocol is camelCase and needs none of this.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const str = (...values: unknown[]): string | undefined => values.find((v): v is string => typeof v === "string" && v !== "");
const bool = (...values: unknown[]): boolean | undefined => values.find((v): v is boolean => typeof v === "boolean");

function questionFromWire(raw: unknown): UserQuestion | undefined {
  if (!isRecord(raw)) return undefined;
  const question = str(raw.question);
  if (!question) return undefined;
  const options = Array.isArray(raw.options)
    ? raw.options.filter(isRecord).flatMap((o) => {
        const label = str(o.label);
        if (!label) return [];
        const value = str(o.value);
        const description = str(o.description);
        const preview = str(o.preview);
        return [{ label, ...(value ? { value } : {}), ...(description ? { description } : {}), ...(preview ? { preview } : {}) }];
      })
    : undefined;
  const header = str(raw.header);
  const placeholder = str(raw.placeholder);
  const multiSelect = bool(raw.multi_select, raw.multiSelect);
  const required = bool(raw.required);
  return {
    question,
    ...(header ? { header } : {}),
    ...(multiSelect !== undefined ? { multiSelect } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(required !== undefined ? { required } : {}),
    ...(options && options.length > 0 ? { options } : {}),
  };
}

/**
 * One pending action of the Console client wire (`kind`, `tool_name`, `allow_free_text`,
 * `expires_at`, snake_case questions), or of agent-server's camelCase form. Undefined for
 * anything that is not an open approval or question.
 */
export function pendingActionFromWire(raw: unknown): PendingAction | undefined {
  if (!isRecord(raw)) return undefined;
  const id = str(raw.id, raw.action_id, raw.actionId);
  if (!id) return undefined;
  const status = str(raw.status);
  if (status && status !== "pending") return undefined;
  const kind = str(raw.kind, raw.type);
  const expiresAt = str(raw.expires_at, raw.expiresAt);

  if (kind === "tool_approval") {
    const toolName = str(raw.tool_name, raw.toolName);
    if (!toolName) return undefined;
    const toolCallId = str(raw.tool_call_id, raw.toolCallId);
    const title = str(raw.title);
    const summary = str(raw.summary);
    // The JSON Schema of the arguments: the edit in the approval card is checked against it
    const argsSchema = [raw.args_schema, raw.argsSchema, raw.input_schema, raw.inputSchema].find(isRecord);
    return {
      id,
      type: "tool_approval",
      toolName,
      ...(toolCallId ? { toolCallId } : {}),
      ...(title ? { title } : {}),
      ...(summary ? { summary } : {}),
      ...(isRecord(raw.args) ? { args: raw.args } : {}),
      ...(argsSchema ? { argsSchema } : {}),
      ...(expiresAt ? { expiresAt } : {}),
    };
  }

  if (kind === "user_question") {
    const questions = (Array.isArray(raw.questions) ? raw.questions : [])
      .map(questionFromWire)
      .filter((q): q is UserQuestion => q !== undefined);
    if (questions.length === 0) return undefined;
    const allowFreeText = bool(raw.allow_free_text, raw.allowFreeText);
    return {
      id,
      type: "user_question",
      questions,
      ...(allowFreeText !== undefined ? { allowFreeText } : {}),
      ...(expiresAt ? { expiresAt } : {}),
    };
  }
  return undefined;
}

export function pendingActionsFromWire(list: unknown): PendingAction[] {
  if (!Array.isArray(list)) return [];
  return list.map(pendingActionFromWire).filter((a): a is PendingAction => a !== undefined);
}

/** The body `POST /client/v1/agents/sessions/:id/actions/:actionId` takes for an answer. */
export function resolutionToWire(resolution: ActionResolution): Record<string, unknown> {
  if (resolution.type === "tool_approval") {
    return {
      decision: resolution.decision,
      ...(resolution.comment ? { comment: resolution.comment } : {}),
      ...(resolution.approvedArgs ? { approved_args: resolution.approvedArgs } : {}),
      ...(resolution.rememberForSession ? { remember_for_session: true } : {}),
    };
  }
  return { answers: resolution.answers, ...(resolution.cancelled ? { cancelled: true } : {}) };
}

/**
 * Why a Console Responses object stopped: `stop_reason` mapped to agent-server's vocabulary, with
 * the runtime's `stop_detail` / `incomplete_details.reason` as the detail.
 */
export function stopFromResponse(body: unknown): { stopReason?: StopReason; stopDetail?: string } {
  if (!isRecord(body)) return {};
  const stopReason = normalizeStopReason(body.stop_reason);
  const incomplete = isRecord(body.incomplete_details) ? str(body.incomplete_details.reason) : undefined;
  const detail = str(body.stop_detail) ?? incomplete;
  return {
    ...(stopReason ? { stopReason } : {}),
    ...(detail ? { stopDetail: detail } : {}),
  };
}
