import type { ClientToolResult } from "../types";
import {
  EMBED_PROTOCOL_VERSION,
  MAX_TOOL_OUTPUT_BYTES,
  isAllowedOrigin,
  jsonPayloadError,
  normalizeOrigin,
  parseHostMessage,
  type EmbedEventName,
  type EmbedToHostMessage,
  type HostToEmbedMessage,
  type TokenRequestReason,
} from "./protocol";

/** Why the bridge would not start. Nothing is posted in any of these cases. */
export type BridgeRefusal =
  /** The page is not inside a frame, so there is no host to talk to */
  | "not_framed"
  /** The host did not say who it is (no `origin`), or is not one of the allowed origins */
  | "origin_not_allowed"
  /** The browser says the embedding page is another origin than the one the host declared */
  | "ancestor_mismatch";

export interface EmbedBridgeOptions {
  /** Origins that may embed this page: exact matches only */
  allowedOrigins: readonly string[];
  /** The origin the host declared (the `origin` query parameter of the iframe URL) */
  hostOrigin: string | undefined;
  /** Called with a token the host sent (answers `cp:ready` and `requestToken`) */
  onAuth: (token: string) => void;
  onPrefill?: (text: string, send: boolean) => void;
  onContext?: (context: Record<string, unknown> | null) => void;
  onLogout?: () => void;
  /** This page's window (tests pass a fake) */
  window?: Window;
  /** How often `cp:ready` is repeated until the host answers, in ms (default 500) */
  readyIntervalMs?: number;
  /** How many times `cp:ready` is sent at most (default 60: about 30 seconds) */
  readyAttempts?: number;
}

interface PendingTool {
  resolve: (result: ClientToolResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * The iframe's end of the host conversation. It talks to `window.parent` only, with the host's origin
 * as the target (never `*`), and listens only to messages whose source is the parent window and whose
 * origin is the declared, allowed one. Anything else is ignored without a word.
 */
export class EmbedBridge {
  private readonly win: Window;
  private readonly hostOrigin: string | undefined;
  private readonly tools = new Map<string, PendingTool>();
  private readyTimer: ReturnType<typeof setInterval> | undefined;
  private started = false;
  private heard = false;
  /** Set when `start` refuses */
  refusal: BridgeRefusal | undefined;

  constructor(private readonly options: EmbedBridgeOptions) {
    this.win = options.window ?? window;
    this.hostOrigin = normalizeOrigin(options.hostOrigin);
  }

  /** The origin messages are exchanged with (once the bridge has started). */
  get origin(): string | undefined {
    return this.started ? this.hostOrigin : undefined;
  }

  /** Starts listening and asking for a token. Returns the reason when it refuses to. */
  start(): BridgeRefusal | undefined {
    if (this.started) return undefined;
    const parent = this.parentWindow();
    if (!parent) return (this.refusal = "not_framed");
    if (!this.hostOrigin || !isAllowedOrigin(this.hostOrigin, this.options.allowedOrigins)) {
      return (this.refusal = "origin_not_allowed");
    }
    // Where the browser tells us the embedding page is (Chromium, Safari), it must be who the host says it is
    const ancestors = (this.win.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
    if (ancestors && ancestors.length > 0 && normalizeOrigin(ancestors[0]) !== this.hostOrigin) {
      return (this.refusal = "ancestor_mismatch");
    }
    this.started = true;
    this.win.addEventListener("message", this.onMessage);
    this.sendReady();
    const interval = this.options.readyIntervalMs ?? 500;
    const attempts = this.options.readyAttempts ?? 60;
    let sent = 1;
    this.readyTimer = setInterval(() => {
      if (this.heard || sent >= attempts) return this.stopReady();
      sent += 1;
      this.sendReady();
    }, interval);
    return undefined;
  }

  stop(): void {
    this.stopReady();
    if (this.started) this.win.removeEventListener("message", this.onMessage);
    this.started = false;
    for (const pending of this.tools.values()) {
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, error: "The chat was closed" });
    }
    this.tools.clear();
  }

  /** Asks the host for a new token; it answers with `cp:auth`. */
  requestToken(reason: TokenRequestReason): void {
    this.post({ type: "cp:token_request", v: EMBED_PROTOCOL_VERSION, reason });
  }

  /** Tells the host something happened in the chat. */
  emit(event: EmbedEventName, data: Record<string, unknown> = {}): void {
    this.post({ type: "cp:event", v: EMBED_PROTOCOL_VERSION, event, data });
  }

  /**
   * Hands a tool call to the host page and waits for its answer. Resolves with a failure when the
   * host does not answer in time, answers with something that is not JSON, or more than 64 KB.
   */
  callTool(call: { callId: string; name: string; args: Record<string, unknown> }, timeoutMs: number): Promise<ClientToolResult> {
    if (this.tools.has(call.callId)) return Promise.resolve({ ok: false, error: "That tool call is already running" });
    return new Promise<ClientToolResult>((resolve) => {
      const timer = setTimeout(() => {
        this.tools.delete(call.callId);
        resolve({ ok: false, error: "The host page did not answer" });
      }, timeoutMs);
      this.tools.set(call.callId, { resolve, timer });
      this.post({ type: "cp:tool_call", v: EMBED_PROTOCOL_VERSION, callId: call.callId, name: call.name, args: call.args });
    });
  }

  private parentWindow(): Window | undefined {
    const parent = this.win.parent;
    return parent && parent !== this.win ? parent : undefined;
  }

  private post(message: EmbedToHostMessage): void {
    const parent = this.parentWindow();
    if (!this.started || !parent || !this.hostOrigin) return;
    try {
      parent.postMessage(message, this.hostOrigin);
    } catch {
      // the parent went away
    }
  }

  private sendReady() {
    this.post({ type: "cp:ready", v: EMBED_PROTOCOL_VERSION });
  }

  private stopReady() {
    if (this.readyTimer) clearInterval(this.readyTimer);
    this.readyTimer = undefined;
  }

  private onMessage = (event: MessageEvent) => {
    if (!this.started || event.source !== this.parentWindow() || event.origin !== this.hostOrigin) return;
    const message: HostToEmbedMessage | undefined = parseHostMessage(event.data);
    if (!message) return;
    switch (message.type) {
      case "cp:auth":
        // the host is there and answering: no need to keep asking
        this.heard = true;
        this.stopReady();
        this.options.onAuth(message.token);
        break;
      case "cp:tool_result": {
        const pending = this.tools.get(message.callId);
        // an answer to a call that is not running (or already answered) is ignored
        if (!pending) break;
        this.tools.delete(message.callId);
        clearTimeout(pending.timer);
        if (!message.ok) {
          pending.resolve({ ok: false, error: message.error ?? "The host page reported an error" });
          break;
        }
        const problem = jsonPayloadError(message.output, MAX_TOOL_OUTPUT_BYTES);
        pending.resolve(
          problem
            ? { ok: false, error: problem === "too_large" ? "The host page's answer is too large" : "The host page's answer is not valid JSON" }
            : { ok: true, ...(message.output !== undefined ? { output: message.output } : {}) }
        );
        break;
      }
      case "cp:prefill":
        this.options.onPrefill?.(message.text, message.send === true);
        break;
      case "cp:context":
        this.options.onContext?.(message.context);
        break;
      case "cp:logout":
        this.options.onLogout?.();
        break;
    }
  };
}
