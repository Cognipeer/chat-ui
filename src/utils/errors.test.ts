import { describe, expect, it } from "vitest";
import { isConflictCode, localizeError, normalizeErrorCode, type CodedError } from "./errors";
import en from "../locales/en.json";
import tr from "../locales/tr.json";

const strings = en as Record<string, string>;
const t = (id: string, values?: Record<string, unknown>) =>
  (strings[id] ?? id).replace("{detail}", String(values?.detail ?? ""));
const has = (id: string) => id in strings;

const coded = (message: string, code?: string, status?: number): CodedError =>
  Object.assign(new Error(message), { code, status });

describe("error codes", () => {
  it("treats PENDING_ACTION and pending_action as one code", () => {
    expect(normalizeErrorCode("PENDING_ACTION")).toBe("pending_action");
    expect(normalizeErrorCode("  Rate_Limited ")).toBe("rate_limited");
    expect(normalizeErrorCode(undefined)).toBeUndefined();
    expect(normalizeErrorCode("")).toBeUndefined();
    expect(normalizeErrorCode(42)).toBeUndefined();
  });

  it("knows which codes mean the page is stale", () => {
    for (const code of ["action_pending", "PENDING_ACTION", "CONVERSATION_BUSY", "conversation_busy"]) {
      expect(isConflictCode(code)).toBe(true);
    }
    for (const code of ["rate_limited", "action_expired", undefined, ""]) {
      expect(isConflictCode(code)).toBe(false);
    }
  });
});

describe("localizeError", () => {
  it("replaces the message for a known code and keeps the code, status and the server's wording", () => {
    const original = coded("Server busy", "CONVERSATION_BUSY", 409);
    const shown = localizeError(original, t, has) as CodedError;
    expect(shown.message).toBe(strings["chat.error.code.conversation_busy"]);
    expect(shown.code).toBe("CONVERSATION_BUSY");
    expect(shown.status).toBe(409);
    expect(shown.serverMessage).toBe("Server busy");
    expect(shown.cause).toBe(original);
  });

  it("puts the server's own message where a string asks for {detail}", () => {
    const shown = localizeError(coded("message is required", "VALIDATION_ERROR", 400), t, has);
    expect(shown.message).toBe("The request was not accepted. message is required");
  });

  it("returns the same error for an unknown or missing code", () => {
    const unknown = coded("Boom", "SOMETHING_NEW");
    expect(localizeError(unknown, t, has)).toBe(unknown);
    const plain = new Error("Network down");
    expect(localizeError(plain, t, has)).toBe(plain);
  });
});

describe("the strings behind the codes", () => {
  // Every code the agent server, the Console client API and the portal answer with
  const serverCodes = [
    "validation_error", "invalid_request", "invalid_approved_args", "not_found", "forbidden",
    "authentication_error", "authorization_unavailable", "internal_error", "agent_unavailable",
    "agent_access_denied", "not_supported", "cancelled", "action_not_pending", "action_expired",
    "action_cancelled", "action_pending", "pending_action", "conversation_busy", "action_forbidden",
    "action_not_resumable", "budget_reached", "rate_limited", "quota_exceeded", "too_many_conversations",
    "message_too_long", "guardrail_blocked", "file_quota_exceeded", "too_many_files", "file_too_large",
    "unsupported_file_type", "files_not_supported", "attachments_disabled", "attachment_not_found",
    "upload_failed", "storage_unavailable", "storage_not_configured", "licence_required",
    "portal_not_found", "portal_disabled", "portal_access_denied",
    "nothing_to_continue", "budget_forbidden", "invalid_budget", "budget_unavailable", "budget_misconfigured",
    "run_interrupted", "identity_required", "payload_too_large", "authorization_error", "conversation_conflict",
    "lease_lost", "storage_limit_exceeded",
    "not_latest_message", "message_not_found", "message_not_editable", "invalid_rating", "feedback_disabled",
    "export_disabled", "too_many_ids",
    "invalid_message_target", "invalid_feedback", "action_disabled", "export_format_unsupported",
    "invalid_client_tool_result", "task_busy", "task_finished", "unsupported_media_type", "invalid_host_result",
    // the portal: the terms a person has to accept before the chat takes a request
    "terms_required", "terms_changed", "invalid_version",
  ];

  it.each(Object.entries({ en, tr }))("%s has a message for every code", (_locale, messages) => {
    const table = messages as Record<string, string>;
    for (const code of serverCodes) {
      expect(table[`chat.error.code.${code}`], code).toBeTruthy();
    }
  });

  it("has no message for a code that is not in the list (keeps this test honest)", () => {
    const listed = Object.keys(en).filter((key) => key.startsWith("chat.error.code.")).map((key) => key.slice("chat.error.code.".length));
    expect(listed.sort()).toEqual([...serverCodes].sort());
  });
});
