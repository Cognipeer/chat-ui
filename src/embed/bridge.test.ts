import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbedBridge } from "./bridge";

const last = <T,>(items: T[]): T | undefined => items[items.length - 1];
const HOST = "https://app.example.com";

/** A fake iframe window: its parent records what is posted to it, and `deliver` plays a message event. */
function makeFrame(options: { ancestor?: string[]; framed?: boolean } = {}) {
  const parent = { postMessage: vi.fn() };
  const listeners = new Set<(event: MessageEvent) => void>();
  const win: Record<string, unknown> = {
    location: { search: "", ancestorOrigins: options.ancestor },
    addEventListener: (type: string, fn: (event: MessageEvent) => void) => type === "message" && listeners.add(fn),
    removeEventListener: (type: string, fn: (event: MessageEvent) => void) => type === "message" && listeners.delete(fn),
  };
  win.parent = options.framed === false ? win : parent;
  return {
    win: win as unknown as Window,
    parent,
    listeners,
    posted: () => parent.postMessage.mock.calls as Array<[Record<string, unknown>, string]>,
    deliver: (data: unknown, over: { source?: unknown; origin?: string } = {}) =>
      listeners.forEach((fn) => fn({ data, source: "source" in over ? over.source : parent, origin: over.origin ?? HOST } as unknown as MessageEvent)),
  };
}

const make = (frame: ReturnType<typeof makeFrame>, over: Partial<ConstructorParameters<typeof EmbedBridge>[0]> = {}) => {
  const handlers = { onAuth: vi.fn(), onPrefill: vi.fn(), onContext: vi.fn(), onLogout: vi.fn() };
  const bridge = new EmbedBridge({ allowedOrigins: [HOST], hostOrigin: HOST, window: frame.win, ...handlers, ...over });
  return { bridge, ...handlers };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("starting", () => {
  it("says it is ready to the declared host, and only to it", () => {
    const frame = makeFrame();
    const { bridge } = make(frame);
    expect(bridge.start()).toBeUndefined();
    expect(frame.posted()).toEqual([[{ type: "cp:ready", v: 1 }, HOST]]);
    bridge.stop();
  });

  it("repeats the call until the host answers with a token, then stops", () => {
    const frame = makeFrame();
    const { bridge, onAuth } = make(frame, { readyIntervalMs: 100 });
    bridge.start();
    vi.advanceTimersByTime(350);
    expect(frame.posted().filter(([m]) => m.type === "cp:ready")).toHaveLength(4);
    frame.deliver({ type: "cp:auth", v: 1, token: "t1" });
    expect(onAuth).toHaveBeenCalledWith("t1");
    vi.advanceTimersByTime(1000);
    expect(frame.posted().filter(([m]) => m.type === "cp:ready")).toHaveLength(4);
    bridge.stop();
  });

  it("gives up asking after the configured number of tries", () => {
    const frame = makeFrame();
    const { bridge } = make(frame, { readyIntervalMs: 100, readyAttempts: 3 });
    bridge.start();
    vi.advanceTimersByTime(2000);
    expect(frame.posted().filter(([m]) => m.type === "cp:ready")).toHaveLength(3);
    bridge.stop();
  });

  it("does not stop asking because of a message that is not a token", () => {
    const frame = makeFrame();
    const { bridge } = make(frame, { readyIntervalMs: 100 });
    bridge.start();
    frame.deliver({ type: "cp:context", v: 1, context: { a: 1 } });
    vi.advanceTimersByTime(250);
    expect(frame.posted().filter(([m]) => m.type === "cp:ready").length).toBeGreaterThan(2);
    bridge.stop();
  });
});

describe("refusing to start", () => {
  it.each([
    ["no declared origin", { hostOrigin: undefined }, "origin_not_allowed"],
    ["an origin that is not allowed", { hostOrigin: "https://evil.example" }, "origin_not_allowed"],
    ["a wildcard allow-list", { allowedOrigins: ["*"] }, "origin_not_allowed"],
    ["an empty allow-list", { allowedOrigins: [] }, "origin_not_allowed"],
  ] as const)("posts nothing for %s", (_label, over, reason) => {
    const frame = makeFrame();
    const { bridge } = make(frame, over as never);
    expect(bridge.start()).toBe(reason);
    expect(bridge.refusal).toBe(reason);
    expect(frame.posted()).toEqual([]);
    expect(frame.listeners.size).toBe(0);
  });

  it("will not run outside a frame", () => {
    const frame = makeFrame({ framed: false });
    const { bridge } = make(frame);
    expect(bridge.start()).toBe("not_framed");
  });

  it("refuses when the browser says another page embeds it than the one the host declared", () => {
    const frame = makeFrame({ ancestor: ["https://evil.example"] });
    const { bridge } = make(frame);
    expect(bridge.start()).toBe("ancestor_mismatch");
    expect(frame.posted()).toEqual([]);
  });

  it("is happy when the browser agrees, and when the browser does not say", () => {
    expect(make(makeFrame({ ancestor: [HOST] })).bridge.start()).toBeUndefined();
    expect(make(makeFrame({ ancestor: [] })).bridge.start()).toBeUndefined();
  });
});

describe("listening", () => {
  it("accepts a token only from the parent window at the declared origin", () => {
    const frame = makeFrame();
    const { bridge, onAuth } = make(frame);
    bridge.start();
    const auth = { type: "cp:auth", v: 1, token: "secret" };
    frame.deliver(auth, { origin: "https://evil.example" });
    frame.deliver(auth, { source: {} });
    frame.deliver(auth, { source: null });
    frame.deliver(auth, { origin: "null" });
    frame.deliver({ ...auth, v: 9 });
    expect(onAuth).not.toHaveBeenCalled();
    frame.deliver(auth);
    expect(onAuth).toHaveBeenCalledTimes(1);
    bridge.stop();
  });

  it("passes prefill, context and logout on", () => {
    const frame = makeFrame();
    const { bridge, onPrefill, onContext, onLogout } = make(frame);
    bridge.start();
    frame.deliver({ type: "cp:prefill", v: 1, text: "hi", send: true });
    frame.deliver({ type: "cp:context", v: 1, context: { page: "x" } });
    frame.deliver({ type: "cp:logout", v: 1 });
    expect(onPrefill).toHaveBeenCalledWith("hi", true);
    expect(onContext).toHaveBeenCalledWith({ page: "x" });
    expect(onLogout).toHaveBeenCalled();
    bridge.stop();
  });

  it("stops listening and posting after stop()", () => {
    const frame = makeFrame();
    const { bridge, onAuth } = make(frame);
    bridge.start();
    bridge.stop();
    expect(frame.listeners.size).toBe(0);
    const before = frame.posted().length;
    bridge.emit("ready");
    bridge.requestToken("expired");
    expect(frame.posted()).toHaveLength(before);
    frame.deliver({ type: "cp:auth", v: 1, token: "late" });
    expect(onAuth).not.toHaveBeenCalled();
  });
});

describe("telling the host", () => {
  it("posts token requests and events to the host origin, never to *", () => {
    const frame = makeFrame();
    const { bridge } = make(frame);
    bridge.start();
    bridge.requestToken("expiring");
    bridge.emit("message:sent", { messageId: "m1", length: 5 });
    const messages = frame.posted();
    expect(messages[1]).toEqual([{ type: "cp:token_request", v: 1, reason: "expiring" }, HOST]);
    expect(messages[2]).toEqual([{ type: "cp:event", v: 1, event: "message:sent", data: { messageId: "m1", length: 5 } }, HOST]);
    expect(messages.every(([, target]) => target === HOST)).toBe(true);
    bridge.stop();
  });
});

describe("host tools", () => {
  const call = { callId: "act_1", name: "open_ticket", args: { id: 7 } };

  it("posts the call and resolves with the host's answer", async () => {
    const frame = makeFrame();
    const { bridge } = make(frame);
    bridge.start();
    const result = bridge.callTool(call, 5000);
    expect(last(frame.posted())).toEqual([{ type: "cp:tool_call", v: 1, ...call }, HOST]);
    frame.deliver({ type: "cp:tool_result", v: 1, callId: "act_1", ok: true, output: { opened: true } });
    await expect(result).resolves.toEqual({ ok: true, output: { opened: true } });
    bridge.stop();
  });

  it("resolves with the host's error", async () => {
    const frame = makeFrame();
    const { bridge } = make(frame);
    bridge.start();
    const result = bridge.callTool(call, 5000);
    frame.deliver({ type: "cp:tool_result", v: 1, callId: "act_1", ok: false, error: "ticket not found" });
    await expect(result).resolves.toEqual({ ok: false, error: "ticket not found" });
    bridge.stop();
  });

  it("gives up when the host does not answer in time", async () => {
    const frame = makeFrame();
    const { bridge } = make(frame);
    bridge.start();
    const result = bridge.callTool(call, 2000);
    vi.advanceTimersByTime(2001);
    await expect(result).resolves.toEqual({ ok: false, error: "The host page did not answer" });
    // a late answer changes nothing
    frame.deliver({ type: "cp:tool_result", v: 1, callId: "act_1", ok: true, output: 1 });
    bridge.stop();
  });

  it("takes the first answer only, and ignores answers to calls it never made or from another origin", async () => {
    const frame = makeFrame();
    const { bridge } = make(frame);
    bridge.start();
    const result = bridge.callTool(call, 5000);
    frame.deliver({ type: "cp:tool_result", v: 1, callId: "other", ok: true, output: "no" });
    frame.deliver({ type: "cp:tool_result", v: 1, callId: "act_1", ok: true, output: "forged" }, { origin: "https://evil.example" });
    frame.deliver({ type: "cp:tool_result", v: 1, callId: "act_1", ok: true, output: "real" });
    frame.deliver({ type: "cp:tool_result", v: 1, callId: "act_1", ok: true, output: "second" });
    await expect(result).resolves.toEqual({ ok: true, output: "real" });
    bridge.stop();
  });

  it("refuses an answer that is too large", async () => {
    const frame = makeFrame();
    const { bridge } = make(frame);
    bridge.start();
    const result = bridge.callTool(call, 5000);
    frame.deliver({ type: "cp:tool_result", v: 1, callId: "act_1", ok: true, output: "x".repeat(70_000) });
    await expect(result).resolves.toEqual({ ok: false, error: "The host page's answer is too large" });
    bridge.stop();
  });

  it("will not run the same call twice at once, and fails the open calls when stopped", async () => {
    const frame = makeFrame();
    const { bridge } = make(frame);
    bridge.start();
    const first = bridge.callTool(call, 5000);
    await expect(bridge.callTool(call, 5000)).resolves.toMatchObject({ ok: false });
    bridge.stop();
    await expect(first).resolves.toEqual({ ok: false, error: "The chat was closed" });
  });
});
