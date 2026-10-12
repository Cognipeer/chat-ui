import type { AgentModelOption, Message } from "../types";

/**
 * The model key an answer reports: `metadata.model` (agent-server), `metadata.agentModel`, or
 * `metadata.cognipeer.agent_model` (the Console). Absent for a message that says none.
 */
export function modelOfMessage(message: Pick<Message, "role" | "metadata">): string | undefined {
  if (message.role !== "assistant") return undefined;
  const meta = message.metadata;
  if (!meta) return undefined;
  const nested = meta.cognipeer && typeof meta.cognipeer === "object" ? (meta.cognipeer as Record<string, unknown>).agent_model : undefined;
  for (const value of [meta.model, meta.agentModel, nested]) {
    if (typeof value === "string" && value !== "") return value;
  }
  return undefined;
}

/** The label of a model key among the agent's models; `undefined` for a key the agent does not offer. */
export function modelLabel(models: AgentModelOption[] | undefined, key: string | undefined): string | undefined {
  return key ? models?.find((m) => m.key === key)?.label : undefined;
}
