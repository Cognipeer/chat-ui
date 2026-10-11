import { describe, expect, it, vi } from "vitest";
import { exchangeToken, isReplayableBody, parseExchangeResponse, parseMoment, readErrorBody, renewalLeadMs } from "./session";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const as = (f: unknown) => f as unknown as typeof fetch;
const NOW = Date.parse("2026-10-11T12:00:00Z");

describe("parseMoment", () => {
  it("reads ISO strings, epoch seconds and epoch milliseconds", () => {
    expect(parseMoment("2026-10-11T12:00:00Z")).toBe(NOW);
    expect(parseMoment(NOW / 1000)).toBe(NOW);
    expect(parseMoment(NOW)).toBe(NOW);
    expect(parseMoment("later")).toBeUndefined();
    expect(parseMoment(0)).toBeUndefined();
    expect(parseMoment(null)).toBeUndefined();
  });
});

describe("parseExchangeResponse", () => {
  it("reads the session, its end and the user", () => {
    expect(parseExchangeResponse({ sessionToken: "cp_es_abc", expiresAt: "2026-10-11T13:00:00Z", user: { name: "Ada", email: "ada@example.com", id: "hidden" } }, NOW)).toEqual({
      token: "cp_es_abc",
      expiresAt: NOW + 3_600_000,
      issuedAt: NOW,
      user: { name: "Ada", email: "ada@example.com" },
    });
  });

  it("refuses an answer without a usable token or one that already ended", () => {
    for (const bad of [null, "x", {}, { sessionToken: "t" }, { sessionToken: "", expiresAt: NOW + 1000 }, { sessionToken: "t", expiresAt: NOW - 1000 }]) {
      expect(() => parseExchangeResponse(bad, NOW), JSON.stringify(bad)).toThrow(expect.objectContaining({ code: "invalid_response" }));
    }
  });
});

describe("exchangeToken", () => {
  const ok = { sessionToken: "cp_es_1", expiresAt: "2026-10-11T13:00:00Z", user: { name: "Ada" } };

  it("posts the token as JSON with no cookies and returns the session", async () => {
    const fetchMock = vi.fn(async () => json(ok));
    const session = await exchangeToken({ url: "/api/portal/p/embed/session", token: "host.jwt.token", fetch: as(fetchMock), now: () => NOW });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/portal/p/embed/session");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    expect(init.cache).toBe("no-store");
    expect(JSON.parse(String(init.body))).toEqual({ token: "host.jwt.token" });
    expect(session.token).toBe("cp_es_1");
  });

  it("throws the server's refusal with its code and reference", async () => {
    const fetchMock = vi.fn(async () => json({ error: { code: "IDENTITY_NOT_FOUND", message: "No such person", reference: "ref-123" } }, 403));
    await expect(exchangeToken({ url: "/x", token: "t", fetch: as(fetchMock) })).rejects.toMatchObject({
      code: "identity_not_found",
      status: 403,
      reference: "ref-123",
      message: "No such person",
    });
  });

  it("names a refusal that has no code after its status", async () => {
    await expect(exchangeToken({ url: "/x", token: "t", fetch: as(vi.fn(async () => json({}, 401))) })).rejects.toMatchObject({ code: "auth_failed", status: 401 });
    await expect(exchangeToken({ url: "/x", token: "t", fetch: as(vi.fn(async () => json({}, 429))) })).rejects.toMatchObject({ code: "rate_limited" });
    await expect(exchangeToken({ url: "/x", token: "t", fetch: as(vi.fn(async () => new Response("<html>", { status: 502 }))) })).rejects.toMatchObject({ code: "exchange_failed" });
  });

  it("reports a server that cannot be reached", async () => {
    await expect(exchangeToken({ url: "/x", token: "t", fetch: as(vi.fn(async () => Promise.reject(new TypeError("Failed to fetch")))) })).rejects.toMatchObject({ code: "network_error" });
  });
});

describe("readErrorBody", () => {
  it("reads the nested and the flat shapes", () => {
    expect(readErrorBody({ error: { code: "a", message: "m", reference: "r" } })).toEqual({ code: "a", message: "m", reference: "r" });
    expect(readErrorBody({ code: "a", message: "m", referenceCode: "r" })).toEqual({ code: "a", message: "m", reference: "r" });
    expect(readErrorBody({ error: "plain" })).toMatchObject({ message: "plain" });
    expect(readErrorBody(undefined)).toEqual({});
  });
});

describe("renewal", () => {
  it("renews a fifth of the session's life before its end, between 5 and 60 seconds", () => {
    expect(renewalLeadMs({ issuedAt: 0, expiresAt: 3_600_000 })).toBe(60_000);
    expect(renewalLeadMs({ issuedAt: 0, expiresAt: 100_000 })).toBe(20_000);
    expect(renewalLeadMs({ issuedAt: 0, expiresAt: 10_000 })).toBe(5_000);
  });

  it("knows which requests can be sent again", () => {
    expect(isReplayableBody(undefined)).toBe(true);
    expect(isReplayableBody('{"a":1}')).toBe(true);
    expect(isReplayableBody(new Blob(["x"]))).toBe(true);
    expect(isReplayableBody(new ReadableStream())).toBe(false);
  });
});
