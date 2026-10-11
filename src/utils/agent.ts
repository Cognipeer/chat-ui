import type { AgentInfo } from "../types";

/** What the host passed as props; the agent's own answers refine them. */
export interface AgentSettingsDefaults {
  enableFileUpload: boolean;
  allowedFileTypes?: string[];
  maxFileSize?: number;
  maxFiles?: number;
  maxFilesScope?: "conversation" | "message";
  pendingActionComposerMode: "block" | "cancel";
  allowArgumentEdit: boolean;
  allowBudgetContinue: boolean;
  allowBudgetEdit: boolean;
}

/** The composer, the cards and the budget banner as one agent wants them. */
export interface AgentSettings {
  /** Show the paperclip and take files */
  fileUpload: boolean;
  maxFileSize?: number;
  maxFiles?: number;
  /** What `maxFiles` counts */
  maxFilesScope: "conversation" | "message";
  allowedFileTypes?: string[];
  /** `false`: the agent's model does not look at images (warn on an attached one); undefined: unknown */
  acceptsImages?: boolean;
  /** Days an uploaded file is kept, when the agent says */
  retentionDays?: number;
  composerMode: "block" | "cancel";
  argumentEdit: boolean;
  budgetContinue: boolean;
  budgetEdit: boolean;
}

const positive = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;

const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item !== "") : undefined;

const flag = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined);

/**
 * One place that decides how the chat adapts to the selected agent. Precedence, per field:
 * `capabilities.attachments` (what agent-server reports), then the older `metadata` keys, then
 * the host's props.
 *
 * - `maxFiles` from the agent counts files per **conversation** (agent-server's rule) unless the
 *   agent says `maxFilesScope: "message"`; a `maxFiles` that only came from the host's props
 *   counts per message unless the host says otherwise.
 * - an empty `allowedMimeTypes` means any type.
 */
export function resolveAgentSettings(agent: AgentInfo | undefined, defaults: AgentSettingsDefaults): AgentSettings {
  const meta = agent?.metadata;
  const caps = agent?.capabilities;
  const attachments = caps?.attachments;

  const fileUpload = flag(attachments?.enabled) ?? flag(meta?.enableFileUpload) ?? defaults.enableFileUpload;

  const agentMaxFiles = positive(attachments?.maxFiles) ?? positive(meta?.maxFiles);
  const scopeSaid = attachments?.maxFilesScope ?? meta?.maxFilesScope;
  const maxFilesScope: "conversation" | "message" =
    scopeSaid === "conversation" || scopeSaid === "message"
      ? scopeSaid
      : agentMaxFiles !== undefined
        ? "conversation"
        : defaults.maxFilesScope ?? "message";

  // An empty list from the agent means "any type" (it replaces the host's list); no list leaves the host's
  const allowedFileTypes = strings(attachments?.allowedMimeTypes) ?? strings(meta?.allowedFileTypes) ?? defaults.allowedFileTypes;

  const cap = meta?.pendingActionComposerMode;

  return {
    fileUpload,
    maxFileSize: positive(attachments?.maxFileSize) ?? positive(meta?.maxFileSize) ?? defaults.maxFileSize,
    maxFiles: agentMaxFiles ?? defaults.maxFiles,
    maxFilesScope,
    allowedFileTypes,
    acceptsImages: flag(attachments?.acceptsImages) ?? flag(caps?.acceptsImages) ?? flag(meta?.acceptsImages),
    retentionDays: positive(attachments?.retentionDays) ?? positive(meta?.fileRetentionDays),
    composerMode: cap === "block" || cap === "cancel" ? cap : defaults.pendingActionComposerMode,
    argumentEdit: caps?.approvalArgsEdit ?? defaults.allowArgumentEdit,
    budgetContinue: caps?.budget?.allowContinue ?? defaults.allowBudgetContinue,
    budgetEdit: caps?.budget?.allowEdit ?? defaults.allowBudgetEdit,
  };
}
