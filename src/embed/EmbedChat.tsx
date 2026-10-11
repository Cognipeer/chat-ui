"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Chat, type ChatProps } from "../components/chat/Chat";
import { ChatI18nProvider, ChatThemeProvider } from "../providers";
import { useI18n } from "../hooks/useI18n";
import { PRIMARY_BUTTON } from "../components/chat/styles";
import { AlertIcon, LoadingIcon } from "../components/chat/Icons";
import { validateAgainstSchema } from "../utils/jsonSchema";
import type { ChatController, ClientToolCall, ClientToolResult, Message } from "../types";
import { EmbedBridge, type BridgeRefusal } from "./bridge";
import type { EmbedEventName } from "./protocol";
import { exchangeToken, isReplayableBody, renewalLeadMs, type EmbedSession, type ExchangeError } from "./session";

/** A tool of the host page, as the administrator declared it. Only these exist for the agent. */
export interface EmbedClientToolDeclaration {
  name: string;
  description?: string;
  /** JSON Schema of the arguments; a call that does not fit it never reaches the host page */
  inputSchema?: Record<string, unknown>;
  /** How long the host page has to answer, in seconds (default 60, at most 600) */
  timeoutSeconds?: number;
}

/** What the embedded session offers to the pieces drawn around the chat (see `wrapChat`). */
export interface EmbedSessionApi {
  /** Headers that authenticate a request to the portal's API as this session */
  getHeaders: () => Record<string, string>;
  /** `fetch` with the session's bearer token and one retry after a renewal */
  fetch: typeof fetch;
  user?: { name?: string; email?: string };
}

export interface EmbedChatProps
  extends Omit<
    ChatProps,
    "baseUrl" | "transport" | "authorization" | "headers" | "getHeaders" | "fetch" | "onClientToolCall" | "controllerRef" | "getMessageMetadata"
  > {
  /** The portal's chat API, e.g. `/api/portal/support` */
  baseUrl: string;
  /** Where the host's token is exchanged (default `<baseUrl>/embed/session`) */
  sessionUrl?: string;
  /** Origins that may embed this page, exactly as configured for the portal */
  allowedOrigins: string[];
  /** The embedding page's origin as it declared itself (default: the `origin` query parameter of this page) */
  hostOrigin?: string;
  /** The host page's tools the agent may call */
  clientTools?: EmbedClientToolDeclaration[];
  /**
   * What the events sent to the host page carry. `none` (default): ids and sizes only. `text`: also the
   * text of messages. A host that embeds the chat can read it either way; this keeps it out of the
   * events of pages that do not need it.
   */
  eventContent?: "none" | "text";
  /** Draws something around the chat once the person is signed in (a terms gate, a banner) */
  wrapChat?: (chat: ReactNode, session: EmbedSessionApi) => ReactNode;
  /** How long to wait for the host's token before telling it (`auth:required`) that none came (default 10 s) */
  authTimeoutMs?: number;
  /** `fetch` for the exchange and the chat API (default: the global one) */
  fetch?: typeof fetch;
  /** This page's window (tests pass a fake) */
  window?: Window;
  /** How often the chat repeats its call for a token until the host answers (default 500 ms) */
  readyIntervalMs?: number;
}

type EmbedStatus =
  | { kind: "refused"; reason: BridgeRefusal }
  | { kind: "connecting"; slow: boolean }
  | { kind: "exchanging" }
  | { kind: "ready"; user?: EmbedSession["user"] }
  | { kind: "expired" }
  | { kind: "signedOut" }
  | { kind: "failed"; code: string; message: string; reference?: string };

/** How long a request for a fresh token waits for the host's answer. */
const TOKEN_WAIT_MS = 15_000;
const DEFAULT_TOOL_TIMEOUT_S = 60;
const MAX_TOOL_TIMEOUT_S = 600;

const LIMIT_CODES: ReadonlySet<string> = new Set(["rate_limited", "quota_exceeded", "too_many_conversations", "message_too_long", "budget_reached"]);

/**
 * `<Chat>` for a page that is embedded in another one (an iframe), signed in with an identity token
 * the host page's server signed. The chat loads, asks the host for the token over `postMessage`,
 * trades it for a short-lived session, and keeps that session alive by asking for new tokens before it
 * ends. Nothing is stored; the session token only ever sits in memory.
 *
 * The chat reports what happens (`message:sent`, `action:required`, ...) to the host page and lets
 * the agent call the tools the portal declared for the host page. See `./protocol` for the messages.
 */
export function EmbedChat(props: EmbedChatProps) {
  const { locale, defaultLocale, onLocaleChange, customMessages, theme = "dark", themeColors } = props;
  return (
    <ChatI18nProvider locale={locale} defaultLocale={defaultLocale} onLocaleChange={onLocaleChange} customMessages={customMessages}>
      <ChatThemeProvider defaultMode={theme} theme={{ mode: theme, colors: themeColors }}>
        <EmbedChatInner {...props} />
      </ChatThemeProvider>
    </ChatI18nProvider>
  );
}

function EmbedChatInner(props: EmbedChatProps) {
  const {
    baseUrl,
    sessionUrl,
    allowedOrigins,
    hostOrigin: hostOriginProp,
    clientTools = [],
    eventContent = "none",
    wrapChat,
    authTimeoutMs = 10_000,
    fetch: fetchProp,
    window: windowProp,
    readyIntervalMs,
    onMessageSent,
    onMessageReceived,
    onConversationCreated,
    onActionRequired,
    onActionResolved,
    onBudgetReached,
    onError,
    ...chatProps
  } = props;
  const { t } = useI18n();
  const win: Window | undefined = windowProp ?? (typeof window !== "undefined" ? window : undefined);
  const baseFetch: typeof fetch | undefined = fetchProp ?? (typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined);
  const endpoint = sessionUrl ?? `${baseUrl.replace(/\/+$/, "")}/embed/session`;

  const [status, setStatus] = useState<EmbedStatus>({ kind: "connecting", slow: false });
  const [sessionTick, setSessionTick] = useState(0);
  const sessionRef = useRef<EmbedSession | null>(null);
  const bridgeRef = useRef<EmbedBridge | null>(null);
  const contextRef = useRef<Record<string, unknown> | null>(null);
  const controllerRef = useRef<ChatController | null>(null);
  const waitersRef = useRef<Array<(ok: boolean) => void>>([]);
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exchangingRef = useRef(false);
  const queuedTokenRef = useRef<string | null>(null);
  const readyEmittedRef = useRef(false);
  const aliveRef = useRef(true);

  // Latest values for the callbacks the bridge keeps for the whole life of the page
  const latest = useRef({ endpoint, baseFetch, clientTools, eventContent });
  latest.current = { endpoint, baseFetch, clientTools, eventContent };

  const emit = useCallback((event: EmbedEventName, data: Record<string, unknown> = {}) => {
    bridgeRef.current?.emit(event, data);
  }, []);

  const settleWaiters = useCallback((ok: boolean) => {
    if (waitTimerRef.current) clearTimeout(waitTimerRef.current);
    waitTimerRef.current = null;
    const waiting = waitersRef.current;
    waitersRef.current = [];
    for (const resolve of waiting) resolve(ok);
  }, []);

  /** Asks the host for a new token and resolves whether a working session came of it. */
  const requestFreshToken = useCallback(
    (reason: "expiring" | "expired" | "rejected"): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        waitersRef.current.push(resolve);
        if (waitersRef.current.length > 1) return; // one request at a time; everyone waiting hears the answer
        bridgeRef.current?.requestToken(reason);
        waitTimerRef.current = setTimeout(() => settleWaiters(false), TOKEN_WAIT_MS);
      }),
    [settleWaiters]
  );

  const handleAuth = useCallback(
    async (token: string): Promise<void> => {
      // A token that arrives while another is being exchanged waits its turn
      if (exchangingRef.current) {
        queuedTokenRef.current = token;
        return;
      }
      exchangingRef.current = true;
      if (!sessionRef.current) setStatus({ kind: "exchanging" });
      try {
        const session = await exchangeToken({ url: latest.current.endpoint, token, fetch: latest.current.baseFetch });
        if (!aliveRef.current) return;
        sessionRef.current = session;
        setSessionTick((tick) => tick + 1);
        setStatus({ kind: "ready", user: session.user });
        settleWaiters(true);
        if (!readyEmittedRef.current) {
          readyEmittedRef.current = true;
          emit("ready", { user: session.user ?? null });
        }
      } catch (err) {
        if (!aliveRef.current) return;
        const failure = err as Partial<ExchangeError>;
        const code = failure.code ?? "auth_failed";
        emit("auth:error", { code, ...(failure.status ? { status: failure.status } : {}), ...(failure.reference ? { reference: failure.reference } : {}) });
        settleWaiters(false);
        // A session that still works is kept until it ends; a renewal that failed is the host's to hear about
        const current = sessionRef.current;
        if (!current || current.expiresAt <= Date.now()) {
          sessionRef.current = null;
          setStatus({ kind: "failed", code, message: failure.message ?? "", ...(failure.reference ? { reference: failure.reference } : {}) });
        }
      } finally {
        exchangingRef.current = false;
        const next = queuedTokenRef.current;
        queuedTokenRef.current = null;
        if (next && aliveRef.current) void handleAuth(next);
      }
    },
    [emit, settleWaiters]
  );
  const handleAuthRef = useRef(handleAuth);
  handleAuthRef.current = handleAuth;

  const logout = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    readyEmittedRef.current = false;
    setSessionTick((tick) => tick + 1);
    setStatus({ kind: "signedOut" });
    settleWaiters(false);
    // Best effort: the server revokes the session; a failure leaves it to expire
    const { endpoint: url, baseFetch: doFetch } = latest.current;
    if (session && doFetch) {
      try {
        await doFetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${session.token}` }, credentials: "omit" });
      } catch {
        // expires on its own
      }
    }
  }, [settleWaiters]);
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  // The conversation with the host page
  useEffect(() => {
    aliveRef.current = true;
    if (!win) return;
    const declared = hostOriginProp ?? new URLSearchParams(win.location.search).get("origin") ?? undefined;
    const bridge = new EmbedBridge({
      allowedOrigins,
      hostOrigin: declared,
      window: win,
      readyIntervalMs,
      onAuth: (token) => void handleAuthRef.current(token),
      onPrefill: (text, send) => controllerRef.current?.prefill(text, { send }),
      onContext: (context) => {
        contextRef.current = context;
      },
      onLogout: () => void logoutRef.current(),
    });
    bridgeRef.current = bridge;
    const refusal = bridge.start();
    if (refusal) setStatus({ kind: "refused", reason: refusal });
    return () => {
      aliveRef.current = false;
      bridge.stop();
      bridgeRef.current = null;
      settleWaiters(false);
    };
    // the bridge is for the life of the page: a changed prop would need a new handshake
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No token yet: tell the host, and say so on screen
  useEffect(() => {
    if (status.kind !== "connecting" || status.slow) return;
    const timer = setTimeout(() => {
      setStatus((current) => (current.kind === "connecting" ? { kind: "connecting", slow: true } : current));
      emit("auth:required", { reason: "no_token" });
    }, authTimeoutMs);
    return () => clearTimeout(timer);
  }, [status, authTimeoutMs, emit]);

  // The session is renewed before it ends, and marked expired when it ends without a renewal. The end does
  // not wait for the host: it is its own timer, whatever the renewal is doing.
  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const renew = async () => {
      if (cancelled || session.expiresAt - Date.now() <= 0) return;
      const renewed = await requestFreshToken("expiring");
      if (cancelled || sessionRef.current !== session) return;
      // Not yet: ask again, more often as the end gets nearer
      const left = session.expiresAt - Date.now();
      if (!renewed && left > 0) timers.push(setTimeout(renew, Math.min(10_000, Math.max(1000, left / 2))));
    };
    timers.push(setTimeout(renew, Math.max(0, session.expiresAt - renewalLeadMs(session) - Date.now())));
    timers.push(
      setTimeout(() => {
        if (cancelled || sessionRef.current !== session) return;
        setStatus((current) => (current.kind === "ready" ? { kind: "expired" } : current));
        emit("auth:error", { code: "session_expired" });
        // said again, whatever was asked before: the host may have lost the earlier request
        bridgeRef.current?.requestToken("expired");
      }, Math.max(0, session.expiresAt - Date.now()))
    );
    return () => {
      cancelled = true;
      for (const timer of timers) clearTimeout(timer);
    };
  }, [sessionTick, emit, requestFreshToken]);

  // `fetch` for the chat: the session's bearer token, no cookies, and one retry after a renewal
  const authedFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
      const doFetch = latest.current.baseFetch;
      if (!doFetch) throw new Error("fetch is not available");
      const attempt = () => {
        const session = sessionRef.current;
        if (!session) throw Object.assign(new Error("Not signed in"), { code: "authentication_error", status: 401 });
        const headers = new Headers(init.headers);
        headers.set("Authorization", `Bearer ${session.token}`);
        return doFetch(input, { ...init, headers, credentials: "omit" });
      };
      // A request never goes out with a token that is about to end
      const current = sessionRef.current;
      if (current && current.expiresAt - Date.now() < 5_000) await requestFreshToken("expiring");
      let response = await attempt();
      if (response.status === 401 && isReplayableBody(init.body)) {
        if (await requestFreshToken("rejected")) response = await attempt();
        else if (aliveRef.current) setStatus((now) => (now.kind === "ready" ? { kind: "expired" } : now));
      }
      return response;
    },
    [requestFreshToken]
  );

  const sessionApi = useMemo<EmbedSessionApi>(
    () => ({
      getHeaders: (): Record<string, string> => (sessionRef.current ? { Authorization: `Bearer ${sessionRef.current.token}` } : {}),
      fetch: authedFetch as typeof fetch,
      ...(status.kind === "ready" && status.user ? { user: status.user } : {}),
    }),
    [authedFetch, status]
  );

  // The agent calls a tool of the host page
  const onClientToolCall = useCallback(async (call: ClientToolCall): Promise<ClientToolResult> => {
    const bridge = bridgeRef.current;
    const declared = latest.current.clientTools.find((tool) => tool.name === call.name);
    if (!bridge || !declared) return { ok: false, error: `The tool "${call.name}" is not available on this page` };
    if (declared.inputSchema) {
      const issues = validateAgainstSchema(call.args, declared.inputSchema);
      if (issues.length > 0) {
        return { ok: false, error: `The arguments do not fit the tool: ${issues.map((i) => `${i.path || "arguments"} (${i.code})`).join(", ")}` };
      }
    }
    const seconds = Math.min(MAX_TOOL_TIMEOUT_S, Math.max(1, call.timeoutSeconds ?? declared.timeoutSeconds ?? DEFAULT_TOOL_TIMEOUT_S));
    const startedAt = Date.now();
    emit("action:required", { kind: "client_tool", actionId: call.actionId, tool: call.name });
    const result = await bridge.callTool({ callId: call.actionId, name: call.name, args: call.args }, seconds * 1000);
    emit("action:resolved", {
      kind: "client_tool",
      actionId: call.actionId,
      tool: call.name,
      ok: result.ok,
      durationMs: Date.now() - startedAt,
    });
    return result;
  }, [emit]);

  const getMessageMetadata = useCallback(
    () => (contextRef.current ? { uiContext: contextRef.current, uiContextUntrusted: true } : undefined),
    []
  );

  // What happens in the chat is told to the host page
  const textOf = (message: Message): string => {
    if (typeof message.content === "string") return message.content;
    return message.content.map((part) => (part.type === "text" && "text" in part ? String(part.text) : "")).join("");
  };
  const describe = (message: Message): Record<string, unknown> => ({
    conversationId: message.conversationId,
    messageId: message.id,
    length: textOf(message).length,
    ...(latest.current.eventContent === "text" ? { text: textOf(message).slice(0, 4000) } : {}),
  });

  const chat = (
    <Chat
      {...chatProps}
      baseUrl={baseUrl}
      fetch={authedFetch as typeof fetch}
      controllerRef={controllerRef}
      onClientToolCall={onClientToolCall}
      getMessageMetadata={getMessageMetadata}
      onConversationCreated={(conversation) => {
        emit("conversation:started", { conversationId: conversation.id });
        onConversationCreated?.(conversation);
      }}
      onMessageSent={(message) => {
        emit("message:sent", describe(message));
        onMessageSent?.(message);
      }}
      onMessageReceived={(message) => {
        emit("message:completed", describe(message));
        onMessageReceived?.(message);
      }}
      onActionRequired={(info) => {
        emit("action:required", {
          conversationId: info.conversationId,
          actionId: info.action.id,
          kind: info.action.type,
          ...(info.action.type === "tool_approval" ? { tool: info.action.toolName } : {}),
        });
        onActionRequired?.(info);
      }}
      onActionResolved={(info) => {
        // the host page's own tools were reported when they ended
        if (info.action?.type !== "client_tool") {
          emit("action:resolved", {
            conversationId: info.conversationId,
            actionId: info.actionId,
            kind: info.action?.type ?? info.resolution.type,
            ...(info.resolution.type === "tool_approval" ? { decision: info.resolution.decision } : {}),
          });
        }
        onActionResolved?.(info);
      }}
      onBudgetReached={(info) => {
        emit("limit:reached", { kind: "budget", conversationId: info.conversationId });
        onBudgetReached?.(info);
      }}
      onError={(error) => {
        const code = ((error as { code?: string }).code ?? "").toLowerCase();
        if (code && LIMIT_CODES.has(code)) emit("limit:reached", { kind: code });
        else emit("error", { ...(code ? { code } : {}), message: error.message });
        onError?.(error);
      }}
    />
  );

  if (status.kind === "ready") {
    return <>{wrapChat ? wrapChat(chat, sessionApi) : chat}</>;
  }
  return (
    <StatusPanel
      status={status}
      onReconnect={() => {
        setStatus({ kind: "connecting", slow: false });
        bridgeRef.current?.requestToken("expired");
      }}
      t={t}
    />
  );
  // `t` for the panel is passed down so the panel stays a plain function of its inputs
}

function StatusPanel({
  status,
  onReconnect,
  t,
}: {
  status: Exclude<EmbedStatus, { kind: "ready" }>;
  onReconnect: () => void;
  t: (id: string, values?: Record<string, unknown>) => string;
}) {
  let title: string;
  let body: string | undefined;
  let tone: "busy" | "problem" = "problem";
  let action: { label: string; run: () => void } | undefined;
  let reference: string | undefined;

  switch (status.kind) {
    case "connecting":
      tone = "busy";
      title = status.slow ? t("chat.embed.waitingHost") : t("chat.embed.connecting");
      break;
    case "exchanging":
      tone = "busy";
      title = t("chat.embed.signingIn");
      break;
    case "refused":
      title = t("chat.embed.refused.title");
      body = t(`chat.embed.refused.${status.reason}`);
      break;
    case "expired":
      title = t("chat.embed.expired.title");
      body = t("chat.embed.expired.body");
      action = { label: t("chat.embed.reconnect"), run: onReconnect };
      break;
    case "signedOut":
      tone = "busy";
      title = t("chat.embed.signedOut.title");
      body = t("chat.embed.signedOut.body");
      break;
    case "failed":
      title = t("chat.embed.failed.title");
      body =
        status.code === "identity_not_found"
          ? t("chat.embed.failed.identity_not_found")
          : status.code === "network_error"
            ? t("chat.embed.failed.network_error")
            : status.code === "rate_limited"
              ? t("chat.embed.failed.rate_limited")
              : t("chat.embed.failed.generic");
      reference = status.reference;
      action = { label: t("chat.embed.retry"), run: onReconnect };
      break;
  }

  return (
    <div
      data-chat-embed-status={status.kind}
      className="flex h-full w-full items-center justify-center bg-chat-bg-primary p-6 text-chat-text-primary"
    >
      <div role={tone === "busy" ? "status" : "alert"} className="max-w-sm text-center">
        {tone === "busy" ? (
          status.kind === "signedOut" ? null : <LoadingIcon className="mx-auto mb-3 h-6 w-6 animate-spin text-chat-text-tertiary motion-reduce:animate-none" />
        ) : (
          <AlertIcon className="mx-auto mb-3 h-7 w-7 text-chat-warning" />
        )}
        <h2 className="text-base font-semibold">{title}</h2>
        {body && <p className="mt-2 text-sm text-chat-text-secondary">{body}</p>}
        {reference && (
          <p className="mt-2 text-xs text-chat-text-tertiary">
            {t("chat.embed.reference", { reference })}
          </p>
        )}
        {action && (
          <button type="button" className={`${PRIMARY_BUTTON} mt-4`} onClick={action.run}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
