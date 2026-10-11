import { describe, expect, it } from "vitest";
import { resolveAgentSettings, type AgentSettingsDefaults } from "./agent";
import type { AgentInfo } from "../types";

const defaults: AgentSettingsDefaults = {
  enableFileUpload: true,
  pendingActionComposerMode: "block",
  allowArgumentEdit: false,
  allowBudgetContinue: false,
  allowBudgetEdit: false,
};
const agent = (extra: Partial<AgentInfo>): AgentInfo => ({ id: "a", name: "A", ...extra });

describe("resolveAgentSettings", () => {
  it("is the host's props for an agent that says nothing", () => {
    expect(resolveAgentSettings(undefined, { ...defaults, maxFileSize: 5, maxFiles: 2, allowedFileTypes: ["image/*"] })).toEqual({
      fileUpload: true,
      maxFileSize: 5,
      maxFiles: 2,
      maxFilesScope: "message",
      allowedFileTypes: ["image/*"],
      acceptsImages: undefined,
      retentionDays: undefined,
      composerMode: "block",
      argumentEdit: false,
      budgetContinue: false,
      budgetEdit: false,
    });
  });

  it("reads what agent-server reports in capabilities.attachments", () => {
    const s = resolveAgentSettings(
      agent({
        capabilities: { attachments: { enabled: true, maxFiles: 3, maxFileSize: 1000, allowedMimeTypes: ["image/*"], acceptsImages: true, retentionDays: 30 } },
      }),
      defaults
    );
    expect(s).toMatchObject({ fileUpload: true, maxFiles: 3, maxFilesScope: "conversation", maxFileSize: 1000, allowedFileTypes: ["image/*"], acceptsImages: true, retentionDays: 30 });
  });

  it("falls back to the older metadata keys, and capabilities win over them", () => {
    const old = resolveAgentSettings(
      agent({ metadata: { enableFileUpload: false, maxFileSize: 7, maxFiles: 4, allowedFileTypes: ["text/*"], acceptsImages: false, fileRetentionDays: 14 } }),
      { ...defaults, maxFileSize: 100, maxFiles: 9 }
    );
    expect(old).toMatchObject({ fileUpload: false, maxFileSize: 7, maxFiles: 4, maxFilesScope: "conversation", allowedFileTypes: ["text/*"], acceptsImages: false, retentionDays: 14 });

    const both = resolveAgentSettings(
      agent({ metadata: { maxFiles: 4, acceptsImages: true }, capabilities: { attachments: { maxFiles: 2, acceptsImages: false } } }),
      defaults
    );
    expect(both).toMatchObject({ maxFiles: 2, acceptsImages: false });
  });

  it("keeps the older capabilities.acceptsImages", () => {
    expect(resolveAgentSettings(agent({ capabilities: { acceptsImages: false } }), defaults).acceptsImages).toBe(false);
  });

  it("an agent's maxFiles counts per conversation unless it says per message; the host's own counts per message unless told", () => {
    expect(resolveAgentSettings(agent({ metadata: { maxFiles: 4, maxFilesScope: "message" } }), defaults).maxFilesScope).toBe("message");
    expect(resolveAgentSettings(agent({ capabilities: { attachments: { maxFiles: 4, maxFilesScope: "message" } } }), defaults).maxFilesScope).toBe("message");
    expect(resolveAgentSettings(undefined, { ...defaults, maxFiles: 4 }).maxFilesScope).toBe("message");
    expect(resolveAgentSettings(undefined, { ...defaults, maxFiles: 4, maxFilesScope: "conversation" }).maxFilesScope).toBe("conversation");
    // no number from the agent, but the scope said: the scope is believed
    expect(resolveAgentSettings(agent({ metadata: { maxFilesScope: "conversation" } }), { ...defaults, maxFiles: 4 }).maxFilesScope).toBe("conversation");
  });

  it("an agent's empty list of types means any and replaces the host's", () => {
    expect(resolveAgentSettings(agent({ capabilities: { attachments: { allowedMimeTypes: [] } } }), { ...defaults, allowedFileTypes: ["image/*"] }).allowedFileTypes).toEqual([]);
  });

  it("ignores values that are not usable numbers or flags", () => {
    const s = resolveAgentSettings(
      agent({ metadata: { maxFileSize: -1, maxFiles: "3", enableFileUpload: "yes" }, capabilities: { attachments: { retentionDays: 0 } } }),
      { ...defaults, maxFileSize: 10, maxFiles: 5 }
    );
    expect(s).toMatchObject({ fileUpload: true, maxFileSize: 10, maxFiles: 5, retentionDays: undefined });
  });

  it("the composer mode, argument editing and the budget buttons follow the agent over the props", () => {
    const s = resolveAgentSettings(
      agent({ metadata: { pendingActionComposerMode: "cancel" }, capabilities: { approvalArgsEdit: true, budget: { allowContinue: true, allowEdit: true } } }),
      defaults
    );
    expect(s).toMatchObject({ composerMode: "cancel", argumentEdit: true, budgetContinue: true, budgetEdit: true });
    const off = resolveAgentSettings(
      agent({ metadata: { pendingActionComposerMode: "reject" }, capabilities: { budget: { allowEdit: false } } }),
      { ...defaults, pendingActionComposerMode: "cancel", allowBudgetEdit: true, allowBudgetContinue: true }
    );
    expect(off).toMatchObject({ composerMode: "cancel", budgetEdit: false, budgetContinue: true });
  });
});
