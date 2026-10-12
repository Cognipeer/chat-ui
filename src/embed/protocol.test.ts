import { describe, expect, it } from "vitest";
import {
  EMBED_PROTOCOL_VERSION,
  MAX_CONTEXT_BYTES,
  MAX_TOKEN_CHARS,
  MAX_TOOL_OUTPUT_BYTES,
  byteLength,
  isAllowedOrigin,
  jsonPayloadError,
  normalizeOrigin,
  parseHostMessage,
} from "./protocol";

describe("origins", () => {
  it("reduces a URL to its origin and refuses anything that is not http(s)", () => {
    expect(normalizeOrigin("https://app.example.com/some/path?x=1")).toBe("https://app.example.com");
    expect(normalizeOrigin("https://app.example.com:8443")).toBe("https://app.example.com:8443");
    expect(normalizeOrigin("http://localhost:4177")).toBe("http://localhost:4177");
    for (const bad of ["null", "", "javascript:alert(1)", "file:///etc/passwd", "app.example.com", "*", undefined, 5]) {
      expect(normalizeOrigin(bad), String(bad)).toBeUndefined();
    }
  });

  it("allows exactly the listed origins - no wildcards, no subdomains, no other ports or schemes", () => {
    const allowed = ["https://app.example.com", "http://localhost:4177"];
    expect(isAllowedOrigin("https://app.example.com", allowed)).toBe(true);
    expect(isAllowedOrigin("http://localhost:4177", allowed)).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com", allowed)).toBe(false);
    expect(isAllowedOrigin("https://app.example.com.evil.io", allowed)).toBe(false);
    expect(isAllowedOrigin("https://sub.app.example.com", allowed)).toBe(false);
    expect(isAllowedOrigin("http://app.example.com", allowed)).toBe(false);
    expect(isAllowedOrigin("https://app.example.com:8443", allowed)).toBe(false);
    expect(isAllowedOrigin("null", allowed)).toBe(false);
    expect(isAllowedOrigin("https://app.example.com", ["*"])).toBe(false);
    expect(isAllowedOrigin("https://app.example.com", [])).toBe(false);
  });
});

describe("parseHostMessage", () => {
  const v = EMBED_PROTOCOL_VERSION;

  it("accepts the messages of version 1 and drops unknown keys", () => {
    expect(parseHostMessage({ type: "cp:auth", v, token: "abc.def.ghi", extra: 1 })).toEqual({ type: "cp:auth", v, token: "abc.def.ghi" });
    expect(parseHostMessage({ type: "cp:logout", v })).toEqual({ type: "cp:logout", v });
    expect(parseHostMessage({ type: "cp:prefill", v, text: "hi", send: true })).toEqual({ type: "cp:prefill", v, text: "hi", send: true });
    expect(parseHostMessage({ type: "cp:prefill", v, text: "hi" })).toEqual({ type: "cp:prefill", v, text: "hi" });
    expect(parseHostMessage({ type: "cp:context", v, context: { page: "orders" } })).toEqual({ type: "cp:context", v, context: { page: "orders" } });
    expect(parseHostMessage({ type: "cp:context", v, context: null })).toEqual({ type: "cp:context", v, context: null });
  });

  it("rejects the wrong version, the wrong shape and what is not ours", () => {
    for (const bad of [
      null,
      "cp:auth",
      [],
      { type: "cp:auth", token: "x" },
      { type: "cp:auth", v: 2, token: "x" },
      { type: "cp:auth", v, token: "" },
      { type: "cp:auth", v, token: 7 },
      { type: "cp:auth", v, token: "x".repeat(MAX_TOKEN_CHARS + 1) },
      { type: "webpack:hot", v },
      { type: "cp:unknown", v },
      { type: "cp:prefill", v },
      { type: "cp:prefill", v, text: "x".repeat(9000) },
      { type: "cp:context", v, context: "text" },
      { type: "cp:context", v, context: [1] },
      { type: "cp:context", v, context: { blob: "x".repeat(MAX_CONTEXT_BYTES) } },
      { type: "cp:tool_result", v },
      { type: "cp:tool_result", v, callId: "c1" },
    ]) {
      expect(parseHostMessage(bad), JSON.stringify(bad)?.slice(0, 60)).toBeUndefined();
    }
  });

  it("reads a tool result: output when it worked, a bounded error when it did not", () => {
    expect(parseHostMessage({ type: "cp:tool_result", v, callId: "c1", ok: true, output: { n: 1 } })).toEqual({ type: "cp:tool_result", v, callId: "c1", ok: true, output: { n: 1 } });
    expect(parseHostMessage({ type: "cp:tool_result", v, callId: "c1", ok: true })).toEqual({ type: "cp:tool_result", v, callId: "c1", ok: true });
    expect(parseHostMessage({ type: "cp:tool_result", v, callId: "c1", ok: false, error: "no ticket" })).toEqual({ type: "cp:tool_result", v, callId: "c1", ok: false, error: "no ticket" });
    expect(parseHostMessage({ type: "cp:tool_result", v, callId: "c1", ok: false })).toMatchObject({ ok: false, error: expect.any(String) });
    const long = parseHostMessage({ type: "cp:tool_result", v, callId: "c1", ok: false, error: "e".repeat(5000) });
    expect((long as { error: string }).error).toHaveLength(2000);
  });
});

describe("tool output limits", () => {
  it("accepts JSON up to 64 KB", () => {
    expect(jsonPayloadError({ a: 1 }, MAX_TOOL_OUTPUT_BYTES)).toBeUndefined();
    expect(jsonPayloadError(undefined, MAX_TOOL_OUTPUT_BYTES)).toBeUndefined();
    expect(jsonPayloadError("x".repeat(MAX_TOOL_OUTPUT_BYTES), MAX_TOOL_OUTPUT_BYTES)).toBe("too_large");
    // counted in bytes, not characters
    expect(jsonPayloadError("é".repeat(40_000), MAX_TOOL_OUTPUT_BYTES)).toBe("too_large");
    expect(byteLength("é")).toBe(2);
  });

  it("refuses what is not JSON", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(jsonPayloadError(cycle, 1000)).toBe("not_json");
    expect(jsonPayloadError(() => 1, 1000)).toBe("not_json");
    expect(jsonPayloadError(10n, 1000)).toBe("not_json");
  });
});
