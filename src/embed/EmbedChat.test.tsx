import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EmbedChat, type EmbedChatProps } from "./EmbedChat";

const last = <T,>(items: T[]): T | undefined => items[items.length - 1];
const HOST = "https://app.example.com";
const BASE = "/api/portal/support";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  vi.restoreAllMocks();
});

/** A fake iframe window whose parent records what is posted to it. */
function makeFrame(options: { framed?: boolean; search?: string } = {}) {
  const parent = { postMessage: vi.fn() };
  const listeners = new Set<(event: MessageEvent) => void>();
  const win: Record<string, unknown> = {
    location: { search: options.search ?? "", ancestorOrigins: undefined },
    addEventListener: (type: string, fn: (event: MessageEvent) => void) => type === "message" && listeners.add(fn),
    removeEventListener: (type: string, fn: (event: MessageEvent) => void) => type === "message" && listeners.delete(fn),
  };
  win.parent = options.framed === false ? win : parent;
  const posted = () => (parent.postMessage.mock.calls as Array<[Record<string, unknown>, string]>).map(([message]) => message);
  return {
    win: win as unknown as Window,
    parent,
    posted,
    of: (type: string) => posted().filter((m) => m.type === type),
    events: (name: string) => posted().filter((m) => m.type === "cp:event" && m.event === name),
    deliver: (data: unknown, over: { origin?: string; source?: unknown } = {}) =>
      act(() => {
        listeners.forEach((fn) => fn({ data, source: "source" in over ? over.source : parent, origin: over.origin ?? HOST } as unknown as MessageEvent));
      }),
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sse = (...events: object[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
const nowIso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

interface Seen {
  url: string;
  method: string;
  auth: string | null;
  body: unknown;
  credentials?: RequestCredentials;
}

/** The portal: an exchange route that hands out tokens from a queue, and a chat API that insists on a valid bearer. */
function makePortal(options: { exchange?: Array<() => Response>; messageFrames?: object[]; actionFrames?: object[]; sessionMs?: number } = {}) {
  const seen: Seen[] = [];
  const valid = new Set<string>();
  let issued = 0;
  const exchange = [...(options.exchange ?? [])];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    seen.push({ url, method, auth: headers.get("authorization"), body, credentials: init.credentials });

    if (url === `${BASE}/embed/session`) {
      if (method === "DELETE") return new Response(null, { status: 204 });
      const next = exchange.shift();
      if (next) {
        const response = next();
        if (response.ok) {
          // remember which token it handed out
          const clone = response.clone();
          valid.add(((await clone.json()) as { sessionToken: string }).sessionToken);
        }
        return response;
      }
      issued += 1;
      const token = `cp_es_${issued}`;
      valid.add(token);
      return json({ sessionToken: token, expiresAt: nowIso(options.sessionMs ?? 3_600_000), user: { name: "Ada", email: "ada@example.com" } });
    }
    const bearer = headers.get("authorization")?.replace(/^Bearer /, "");
    if (!bearer || !valid.has(bearer)) return json({ error: { code: "authentication_error", message: "Sign in" } }, 401);

    if (url === `${BASE}/agents`) return json({ agents: [{ id: "agent", name: "Helper" }] });
    if (url.startsWith(`${BASE}/conversations?`)) return json({ conversations: [], total: 0, limit: 20, offset: 0, hasMore: false });
    if (url === `${BASE}/conversations` && method === "POST") return json({ conversation: { id: "c1", agentId: "agent", createdAt: new Date(), updatedAt: new Date() } }, 201);
    if (url === `${BASE}/conversations/c1/messages` && method === "POST") {
      return sse(...(options.messageFrames ?? [{ type: "stream.done", conversationId: "c1", messageId: "a1", content: "Hello from the agent", timestamp: 1 }]));
    }
    if (url.startsWith(`${BASE}/conversations/c1/actions/`) && method === "POST") {
      return sse(...(options.actionFrames ?? [{ type: "stream.done", conversationId: "c1", messageId: "a2", content: "Done with the page tool", timestamp: 3 }]));
    }
    return json({ error: { code: "not_found" } }, 404);
  });
  return { fetchMock, seen, valid, tokenFor: (n: number) => `cp_es_${n}` };
}

function mount(frame: ReturnType<typeof makeFrame>, portal: ReturnType<typeof makePortal>, props: Partial<EmbedChatProps> = {}) {
  return render(
    <EmbedChat
      baseUrl={BASE}
      allowedOrigins={[HOST]}
      hostOrigin={HOST}
      window={frame.win}
      fetch={portal.fetchMock as unknown as typeof fetch}
      readyIntervalMs={50}
      enableFileUpload={false}
      showHistory={false}
      locale="en"
      {...props}
    />
  );
}

const signIn = async (frame: ReturnType<typeof makeFrame>, token = "host-jwt-1") => {
  await frame.deliver({ type: "cp:auth", v: 1, token });
};
const textbox = () => screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;

describe("the handshake", () => {
  it("asks the host for a token, trades it for a session, and shows the chat", async () => {
    const frame = makeFrame();
    const portal = makePortal();
    mount(frame, portal);
    expect(screen.getByText("Connecting...")).toBeTruthy();
    expect(frame.of("cp:ready").length).toBeGreaterThan(0);
    expect(frame.parent.postMessage.mock.calls.every((call) => call[1] === HOST)).toBe(true);

    await signIn(frame);
    await screen.findByText("Start a conversation");
    const exchange = portal.seen.find((r) => r.url === `${BASE}/embed/session`)!;
    expect(exchange.method).toBe("POST");
    expect(exchange.body).toEqual({ token: "host-jwt-1" });
    expect(exchange.credentials).toBe("omit");
    expect(exchange.auth).toBeNull();
    await waitFor(() => expect(frame.events("ready")).toHaveLength(1));
    expect(frame.events("ready")[0].data).toEqual({ user: { name: "Ada", email: "ada@example.com" } });
  });

  it("calls the chat API with the session's bearer token and no cookies", async () => {
    const frame = makeFrame();
    const portal = makePortal();
    mount(frame, portal);
    await signIn(frame);
    await screen.findByText("Start a conversation");
    const chatCalls = portal.seen.filter((r) => r.url.startsWith(`${BASE}/agents`));
    expect(chatCalls.length).toBeGreaterThan(0);
    expect(chatCalls.every((r) => r.auth === "Bearer cp_es_1" && r.credentials === "omit")).toBe(true);
  });

  it("reads the host's origin from the page's query string when it is not given", async () => {
    const frame = makeFrame({ search: `?origin=${encodeURIComponent(HOST)}&agent=x` });
    const portal = makePortal();
    render(
      <EmbedChat baseUrl={BASE} allowedOrigins={[HOST]} window={frame.win} fetch={portal.fetchMock as unknown as typeof fetch} enableFileUpload={false} showHistory={false} locale="en" />
    );
    expect(frame.of("cp:ready").length).toBeGreaterThan(0);
  });

  it("tells the host when no token comes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    const frame = makeFrame();
    mount(frame, makePortal(), { authTimeoutMs: 3000 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(screen.getByText("Waiting for the page to sign you in...")).toBeTruthy();
    expect(frame.events("auth:required")).toHaveLength(1);
  });

  it("ignores a token from another origin or window", async () => {
    const frame = makeFrame();
    const portal = makePortal();
    mount(frame, portal);
    await frame.deliver({ type: "cp:auth", v: 1, token: "forged" }, { origin: "https://evil.example" });
    await frame.deliver({ type: "cp:auth", v: 1, token: "forged" }, { source: {} });
    expect(portal.seen.filter((r) => r.url.endsWith("/embed/session"))).toHaveLength(0);
    expect(screen.getByText("Connecting...")).toBeTruthy();
  });
});

describe("refusals", () => {
  it("shows a refusal and posts nothing when the page is not allowed to embed the chat", () => {
    const frame = makeFrame();
    mount(frame, makePortal(), { hostOrigin: "https://evil.example" });
    expect(screen.getByRole("alert").textContent).toContain("This page is not allowed to embed the chat.");
    expect(frame.posted()).toEqual([]);
  });

  it("explains a page that is not in a frame", () => {
    const frame = makeFrame({ framed: false });
    mount(frame, makePortal());
    expect(screen.getByRole("alert").textContent).toContain("Open this chat from the page it is embedded in.");
  });

  it("shows why sign-in failed, with the reference, and tells the host", async () => {
    const frame = makeFrame();
    const portal = makePortal({ exchange: [() => json({ error: { code: "identity_not_found", message: "no user", reference: "ref-42" } }, 403)] });
    mount(frame, portal);
    await signIn(frame);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Your account is not set up for this chat");
    expect(alert.textContent).toContain("Reference: ref-42");
    expect(frame.events("auth:error")[0].data).toEqual({ code: "identity_not_found", status: 403, reference: "ref-42" });
  });

  it("lets the person try again after a failed sign-in", async () => {
    const frame = makeFrame();
    const portal = makePortal({ exchange: [() => json({ error: { code: "network_error" } }, 500)] });
    mount(frame, portal);
    await signIn(frame);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(last(frame.of("cp:token_request"))).toMatchObject({ reason: "expired" });
    await signIn(frame, "host-jwt-2");
    await screen.findByText("Start a conversation");
  });
});

describe("keeping the session alive", () => {
  it("asks for a new token before the session ends and swaps it without disturbing the chat", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    const frame = makeFrame();
    const portal = makePortal({ sessionMs: 100_000 });
    mount(frame, portal);
    await signIn(frame);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Start a conversation")).toBeTruthy();
    expect(frame.of("cp:token_request")).toHaveLength(0);

    // a fifth of the life before the end: 100 s -> asks at 80 s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(79_000);
    });
    expect(frame.of("cp:token_request")).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(frame.of("cp:token_request")).toEqual([{ type: "cp:token_request", v: 1, reason: "expiring" }]);

    await signIn(frame, "host-jwt-2");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // still the same chat, no sign-in screen in between
    expect(screen.getByText("Start a conversation")).toBeTruthy();
    expect(portal.seen.filter((r) => r.url.endsWith("/embed/session") && r.method === "POST")).toHaveLength(2);
    // the new session is what later requests use
    fireEvent.change(textbox(), { target: { value: "hello" } });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    const messageCall = portal.seen.find((r) => r.url === `${BASE}/conversations/c1/messages`)!;
    expect(messageCall.auth).toBe("Bearer cp_es_2");
  });

  it("shows 'Session expired' when no new token comes before the end, and recovers when one does", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    const frame = makeFrame();
    const portal = makePortal({ sessionMs: 30_000 });
    mount(frame, portal);
    await signIn(frame);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    expect(screen.getByText("Session expired")).toBeTruthy();
    expect(frame.events("auth:error").map((e) => (e.data as { code: string }).code)).toContain("session_expired");
    expect(frame.of("cp:token_request").map((m) => m.reason)).toContain("expired");

    await signIn(frame, "host-jwt-3");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Start a conversation")).toBeTruthy();
  });

  it("renews and repeats a request the server turned down as unauthorised", async () => {
    const frame = makeFrame();
    const portal = makePortal();
    mount(frame, portal);
    await signIn(frame);
    await screen.findByText("Start a conversation");
    // the server revokes the session behind the page's back
    portal.valid.clear();

    fireEvent.change(textbox(), { target: { value: "hello" } });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    await waitFor(() => expect(frame.of("cp:token_request")).toContainEqual({ type: "cp:token_request", v: 1, reason: "rejected" }));
    await signIn(frame, "host-jwt-2");
    await screen.findByText("Hello from the agent");
    const attempts = portal.seen.filter((r) => r.url === `${BASE}/conversations` && r.method === "POST");
    expect(attempts.map((r) => r.auth)).toEqual(["Bearer cp_es_1", "Bearer cp_es_2"]);
  });
});

describe("the host's commands", () => {
  it("prefills the composer and sends when asked", async () => {
    const frame = makeFrame();
    const portal = makePortal();
    mount(frame, portal);
    await signIn(frame);
    await screen.findByText("Start a conversation");
    await frame.deliver({ type: "cp:prefill", v: 1, text: "Where is order 12?" });
    expect(textbox().value).toBe("Where is order 12?");
    await frame.deliver({ type: "cp:prefill", v: 1, text: "Send this", send: true });
    await screen.findByText("Hello from the agent");
    const sent = portal.seen.find((r) => r.url === `${BASE}/conversations/c1/messages`)!;
    expect((sent.body as { message: string }).message).toBe("Send this");
  });

  it("sends the host's UI context with a message, labelled as unverified", async () => {
    const frame = makeFrame();
    const portal = makePortal();
    mount(frame, portal);
    await signIn(frame);
    await screen.findByText("Start a conversation");
    await frame.deliver({ type: "cp:context", v: 1, context: { page: "orders", orderId: 12 } });
    fireEvent.change(textbox(), { target: { value: "status?" } });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    await screen.findByText("Hello from the agent");
    const sent = portal.seen.find((r) => r.url === `${BASE}/conversations/c1/messages`)!;
    expect((sent.body as { metadata: unknown }).metadata).toEqual({ uiContext: { page: "orders", orderId: 12 }, uiContextUntrusted: true });
  });

  it("signs out: forgets the session, asks the server to revoke it, and shows a signed-out screen", async () => {
    const frame = makeFrame();
    const portal = makePortal();
    mount(frame, portal);
    await signIn(frame);
    await screen.findByText("Start a conversation");
    await frame.deliver({ type: "cp:logout", v: 1 });
    expect(await screen.findByText("You have been signed out")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    await waitFor(() => expect(portal.seen.some((r) => r.method === "DELETE" && r.url === `${BASE}/embed/session`)).toBe(true));
    expect(portal.seen.find((r) => r.method === "DELETE")!.auth).toBe("Bearer cp_es_1");
    // a new token signs in again, and the host hears `ready` again
    await signIn(frame, "host-jwt-2");
    await screen.findByText("Start a conversation");
    await waitFor(() => expect(frame.events("ready")).toHaveLength(2));
  });
});

describe("events for the host", () => {
  it("reports the conversation starting, the message sent and the answer, with sizes and not text", async () => {
    const frame = makeFrame();
    mount(frame, makePortal());
    await signIn(frame);
    await screen.findByText("Start a conversation");
    fireEvent.change(textbox(), { target: { value: "private question" } });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    await screen.findByText("Hello from the agent");
    expect(frame.events("conversation:started")[0].data).toEqual({ conversationId: "c1" });
    expect(frame.events("message:sent")[0].data).toMatchObject({ conversationId: "c1", length: 16 });
    expect(frame.events("message:sent")[0].data).not.toHaveProperty("text");
    expect(frame.events("message:completed")[0].data).toMatchObject({ messageId: "a1", length: 20 });
    expect(frame.events("message:completed")[0].data).not.toHaveProperty("text");
  });

  it("includes the text when the portal allows it", async () => {
    const frame = makeFrame();
    mount(frame, makePortal(), { eventContent: "text" });
    await signIn(frame);
    await screen.findByText("Start a conversation");
    fireEvent.change(textbox(), { target: { value: "question" } });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    await screen.findByText("Hello from the agent");
    expect(frame.events("message:sent")[0].data).toMatchObject({ text: "question" });
    expect(frame.events("message:completed")[0].data).toMatchObject({ text: "Hello from the agent" });
  });

  it("reports an approval and its answer, and a limit", async () => {
    const approval = { id: "ap1", type: "tool_approval", toolName: "send_email", args: {} };
    const frame = makeFrame();
    mount(frame, makePortal({
      messageFrames: [
        { type: "stream.action_required", conversationId: "c1", messageId: "p1", actions: [approval], timestamp: 1 },
        { type: "stream.done", conversationId: "c1", messageId: "p1", content: "", status: "requires_action", pendingActions: [approval], timestamp: 2 },
      ],
    }));
    await signIn(frame);
    await screen.findByText("Start a conversation");
    fireEvent.change(textbox(), { target: { value: "mail it" } });
    fireEvent.keyDown(textbox(), { key: "Enter" });
    await waitFor(() => expect(frame.events("action:required")).toHaveLength(1));
    expect(frame.events("action:required")[0].data).toEqual({ conversationId: "c1", actionId: "ap1", kind: "tool_approval", tool: "send_email" });
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(frame.events("action:resolved")).toHaveLength(1));
    expect(frame.events("action:resolved")[0].data).toMatchObject({ actionId: "ap1", kind: "tool_approval", decision: "allow" });
  });
});

describe("tools of the host page", () => {
  const hostTool = { id: "h1", type: "client_tool", toolName: "open_ticket", toolCallId: "tc1", args: { id: 7 } };
  const frames = [
    { type: "stream.action_required", conversationId: "c1", messageId: "p1", actions: [hostTool], timestamp: 1 },
    { type: "stream.done", conversationId: "c1", messageId: "p1", content: "", status: "requires_action", pendingActions: [hostTool], timestamp: 2 },
  ];
  const declared = [{ name: "open_ticket", description: "Open a ticket", inputSchema: { type: "object", required: ["id"], properties: { id: { type: "number" } } }, timeoutSeconds: 30 }];

  async function start(frame: ReturnType<typeof makeFrame>, portal: ReturnType<typeof makePortal>, props: Partial<EmbedChatProps> = {}) {
    mount(frame, portal, { clientTools: declared, ...props });
    await signIn(frame);
    await screen.findByText("Start a conversation");
    fireEvent.change(textbox(), { target: { value: "open ticket 7" } });
    fireEvent.keyDown(textbox(), { key: "Enter" });
  }

  it("posts the call to the host without drawing a card, then carries on with the host's result", async () => {
    const frame = makeFrame();
    const portal = makePortal({ messageFrames: frames });
    await start(frame, portal);
    await waitFor(() => expect(frame.of("cp:tool_call")).toHaveLength(1));
    expect(frame.of("cp:tool_call")[0]).toEqual({ type: "cp:tool_call", v: 1, callId: "h1", name: "open_ticket", args: { id: 7 } });
    expect(screen.queryByRole("button", { name: /Approve|Deny/ })).toBeNull();
    expect(screen.queryByText(/waiting for your response/i)).toBeNull();
    expect(last(frame.events("action:required"))?.data).toEqual({ kind: "client_tool", actionId: "h1", tool: "open_ticket" });

    await frame.deliver({ type: "cp:tool_result", v: 1, callId: "h1", ok: true, output: { opened: 7 } });
    await screen.findByText("Done with the page tool");
    const resolve = portal.seen.find((r) => r.url === `${BASE}/conversations/c1/actions/h1`)!;
    expect(resolve.body).toMatchObject({ resolution: { type: "client_tool", output: { opened: 7 } } });
    expect(resolve.auth).toBe("Bearer cp_es_1");
    expect(last(frame.events("action:resolved"))?.data).toMatchObject({ kind: "client_tool", actionId: "h1", tool: "open_ticket", ok: true });
  });

  it("answers the agent with an error when the host reports one", async () => {
    const frame = makeFrame();
    const portal = makePortal({ messageFrames: frames });
    await start(frame, portal);
    await waitFor(() => expect(frame.of("cp:tool_call")).toHaveLength(1));
    await frame.deliver({ type: "cp:tool_result", v: 1, callId: "h1", ok: false, error: "ticket 7 does not exist" });
    await screen.findByText("Done with the page tool");
    const resolve = portal.seen.find((r) => r.url === `${BASE}/conversations/c1/actions/h1`)!;
    expect((resolve.body as { resolution: unknown }).resolution).toEqual({ type: "client_tool", error: "ticket 7 does not exist", output: { error: "ticket 7 does not exist" } });
  });

  it("times out when the host never answers", async () => {
    const frame = makeFrame();
    const portal = makePortal({ messageFrames: [{ ...frames[0], actions: [{ ...hostTool, timeoutSeconds: 1 }] }, { ...frames[1], pendingActions: [{ ...hostTool, timeoutSeconds: 1 }] }] });
    await start(frame, portal);
    await waitFor(() => expect(frame.of("cp:tool_call")).toHaveLength(1));
    await screen.findByText("Done with the page tool", {}, { timeout: 3000 });
    const resolve = portal.seen.find((r) => r.url === `${BASE}/conversations/c1/actions/h1`)!;
    expect((resolve.body as { resolution: { error: string } }).resolution.error).toBe("The host page did not answer");
  });

  it("never calls a tool the portal did not declare, and checks the arguments against the schema first", async () => {
    const stranger = { ...hostTool, id: "h2", toolName: "delete_everything" };
    const frame = makeFrame();
    const portal = makePortal({
      messageFrames: [
        { type: "stream.action_required", conversationId: "c1", messageId: "p1", actions: [stranger], timestamp: 1 },
        { type: "stream.done", conversationId: "c1", messageId: "p1", content: "", status: "requires_action", pendingActions: [stranger], timestamp: 2 },
      ],
    });
    await start(frame, portal);
    await screen.findByText("Done with the page tool");
    expect(frame.of("cp:tool_call")).toHaveLength(0);
    const refused = portal.seen.find((r) => r.url === `${BASE}/conversations/c1/actions/h2`)!;
    expect((refused.body as { resolution: { error: string } }).resolution.error).toContain('"delete_everything" is not available');

    cleanup();
    const bad = { ...hostTool, id: "h3", args: { id: "seven" } };
    const frame2 = makeFrame();
    const portal2 = makePortal({
      messageFrames: [
        { type: "stream.action_required", conversationId: "c1", messageId: "p1", actions: [bad], timestamp: 1 },
        { type: "stream.done", conversationId: "c1", messageId: "p1", content: "", status: "requires_action", pendingActions: [bad], timestamp: 2 },
      ],
    });
    await start(frame2, portal2);
    await screen.findByText("Done with the page tool");
    expect(frame2.of("cp:tool_call")).toHaveLength(0);
    expect((portal2.seen.find((r) => r.url.endsWith("/actions/h3"))!.body as { resolution: { error: string } }).resolution.error).toContain("do not fit the tool");
  });
});

describe("drawing around the chat", () => {
  it("lets the portal wrap the chat once the person is signed in, with the session to call its API", async () => {
    const frame = makeFrame();
    const portal = makePortal();
    const wrap = vi.fn((chat: React.ReactNode, session: { getHeaders: () => Record<string, string>; user?: { name?: string } }) => (
      <div data-testid="wrapper">
        <p>Signed in as {session.user?.name}</p>
        {chat}
      </div>
    ));
    mount(frame, portal, { wrapChat: wrap });
    expect(screen.queryByTestId("wrapper")).toBeNull();
    await signIn(frame);
    const wrapper = await screen.findByTestId("wrapper");
    expect(within(wrapper).getByText("Signed in as Ada")).toBeTruthy();
    expect(last(wrap.mock.calls)![1].getHeaders()).toEqual({ Authorization: "Bearer cp_es_1" });
  });
});
