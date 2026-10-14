import type { AgentInfo, FileAttachment, PendingAction } from "../../types";
import { buildHeaders, errorFromResponse, httpFetch, readSSE, type HttpOptions } from "../http";
import { StatelessTransport, type ResolveInput, type RunInput, type RunResult, type StatelessTransportOptions } from "./base";
import { makeId } from "./files";
import { resultFromResponse } from "./responses";
import { pendingActionsFromWire, resolutionToWire } from "../../utils/wire";
import { normalizeStopReason } from "../../utils/runtime";

export interface A2ATransportOptions extends Omit<StatelessTransportOptions, "agents">, HttpOptions {
  /** Base URL of the A2A server; the agent card is read from `<baseUrl>/.well-known/agent-card.json` */
  baseUrl: string;
  /** JSON-RPC endpoint. Defaults to the card's `url`, then `baseUrl`. */
  rpcUrl?: string;
  /** Agent card path under `baseUrl` */
  cardPath?: string;
  /** Id shown for this agent. Defaults to `defaultAgentId`. */
  agentId?: string;
  /** JSON-RPC method names. Defaults are the A2A 0.3 names. */
  methods?: { send: string; stream: string; cancel?: string };
  /**
   * Where the answer to an approval or a question goes, for a server that stops a task with
   * `input-required` and lists the open actions in `metadata.pendingActions` (the Console client
   * API: `POST <client API>/agents/sessions/<contextId>/actions/<actionId>`). Without it the
   * cards are shown but read-only: A2A itself has no way to answer them.
   */
  actionUrl?: (target: { contextId: string; taskId?: string; actionId: string; baseUrl: string }) => string;
}

const INTERRUPTED = new Set(["input-required", "auth-required"]);
const FAILED = new Set(["failed", "rejected", "canceled"]);

function partsText(parts: any[] | undefined): string {
  return (parts ?? [])
    .map((p) => (p.kind === "text" || typeof p.text === "string" ? p.text ?? "" : ""))
    .join("");
}

function partsFiles(parts: any[] | undefined): FileAttachment[] {
  const out: FileAttachment[] = [];
  for (const p of parts ?? []) {
    if (p.kind !== "file" || !p.file) continue;
    const mimeType = p.file.mimeType ?? "application/octet-stream";
    const url = p.file.uri ?? (p.file.bytes ? `data:${mimeType};base64,${p.file.bytes}` : undefined);
    if (!url) continue;
    out.push({ id: makeId(), name: p.file.name ?? "file", mimeType, size: 0, url });
  }
  return out;
}

/** A2A (Agent2Agent) over JSON-RPC: `message/send` and `message/stream`. */
export class A2ATransport extends StatelessTransport {
  private card?: Promise<any>;

  constructor(private readonly options: A2ATransportOptions) {
    super({ ...options, agents: undefined });
  }

  private root() {
    return this.options.baseUrl.replace(/\/$/, "");
  }

  private loadCard(): Promise<any> {
    this.card ??= (async () => {
      const path = this.options.cardPath ?? "/.well-known/agent-card.json";
      const res = await httpFetch(this.options, `${this.root()}${path}`, {
        method: "GET",
        headers: await buildHeaders(this.options),
      });
      if (!res.ok) throw await errorFromResponse(res);
      return res.json();
    })().catch((err) => {
      this.card = undefined; // retry next time
      throw err;
    });
    return this.card;
  }

  async getAgents(): Promise<AgentInfo[]> {
    const id = this.options.agentId ?? this.options.defaultAgentId ?? "a2a";
    try {
      const card = await this.loadCard();
      return [{ id, name: card.name ?? id, description: card.description, version: card.version, metadata: { card } }];
    } catch {
      return [{ id, name: id }];
    }
  }

  private async rpcUrl(): Promise<string> {
    if (this.options.rpcUrl) return this.options.rpcUrl;
    const card = await this.loadCard().catch(() => undefined);
    return card?.url ?? this.root();
  }

  protected async run(input: RunInput): Promise<RunResult> {
    const { options } = this;
    const methods = options.methods ?? { send: "message/send", stream: "message/stream" };

    const rpcUrl = await this.rpcUrl();

    const contextId = input.conversation.state?.contextId as string | undefined;
    const taskId = input.conversation.state?.taskId as string | undefined;

    const parts: any[] = [{ kind: "text", text: input.text }];
    for (const f of input.files ?? []) {
      parts.push({ kind: "file", file: { name: f.name, mimeType: f.mimeType, bytes: f.content } });
    }

    const response = await httpFetch(options, rpcUrl, {
      method: "POST",
      headers: await buildHeaders(options, {
        Accept: input.stream ? "text/event-stream, application/json" : "application/json",
      }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: makeId(),
        method: input.stream ? methods.stream : methods.send,
        params: {
          message: {
            kind: "message",
            messageId: makeId(),
            role: "user",
            parts,
            ...(contextId ? { contextId } : {}),
            ...(taskId ? { taskId } : {}),
          },
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
      }),
      signal: input.signal,
    });
    if (!response.ok) throw await errorFromResponse(response);

    // Folded view of everything the agent has sent so far.
    const artifacts = new Map<string, string>();
    let messageText = "";
    let statusText = "";
    let shownText = "";
    let newContextId = contextId;
    let openTaskId: string | undefined;
    let pendingActions: PendingAction[] = [];
    let stopReason: RunResult["stopReason"];
    let stopDetail: string | undefined;
    const files: FileAttachment[] = [];

    // The Console reports why a task stopped, and what an `input-required` one waits on, in `metadata`
    const readMetadata = (metadata: any) => {
      if (!metadata || typeof metadata !== "object") return;
      const actions = pendingActionsFromWire(metadata.pendingActions);
      if (actions.length > 0) pendingActions = actions;
      const reason = normalizeStopReason(metadata.stopReason);
      if (reason) stopReason = reason;
      if (typeof metadata.stopDetail === "string" && metadata.stopDetail) stopDetail = metadata.stopDetail;
    };

    const artifactText = () => Array.from(artifacts.values()).join("\n\n");
    const show = (full: string) => {
      if (full.startsWith(shownText)) input.emit.text(full.slice(shownText.length));
      else input.emit.setText(full);
      shownText = full;
    };

    const fail = (state: string, message: any) => {
      throw new Error(partsText(message?.parts) || `Task ${state}`);
    };

    const applyStatus = (taskIdValue: string | undefined, status: any) => {
      if (!status) return;
      const text = partsText(status.message?.parts);
      if (FAILED.has(status.state)) fail(status.state, status.message);
      if (INTERRUPTED.has(status.state)) {
        openTaskId = taskIdValue;
        statusText = text;
        if (!artifacts.size) show(text);
      } else if (status.state === "completed") {
        if (text) statusText = text;
        if (!artifacts.size && text) show(text);
      } else if (text) {
        input.emit.progress(text);
      }
    };

    const handle = (result: any) => {
      if (!result) return;
      if (result.contextId) newContextId = result.contextId;
      // what Stop needs to reach this task; a task's own event names it `id`, the others `taskId`
      const runningTask = result.kind === "task" ? result.id : result.taskId;
      if (result.contextId || runningTask) {
        input.track({
          ...(result.contextId ? { contextId: result.contextId } : {}),
          ...(typeof runningTask === "string" && runningTask ? { taskId: runningTask } : {}),
        });
      }
      switch (result.kind) {
        case "message": {
          if (result.role === "user") return;
          const text = partsText(result.parts);
          messageText += text;
          files.push(...partsFiles(result.parts));
          if (!artifacts.size) show(messageText);
          break;
        }
        case "task": {
          readMetadata(result.metadata);
          for (const a of result.artifacts ?? []) {
            artifacts.set(a.artifactId ?? makeId(), partsText(a.parts));
            files.push(...partsFiles(a.parts));
          }
          if (artifacts.size) show(artifactText());
          applyStatus(result.id, result.status);
          break;
        }
        case "artifact-update": {
          const id = result.artifact?.artifactId ?? "default";
          const text = partsText(result.artifact?.parts);
          artifacts.set(id, result.append ? (artifacts.get(id) ?? "") + text : text);
          files.push(...partsFiles(result.artifact?.parts));
          show(artifactText());
          break;
        }
        case "status-update":
          readMetadata(result.metadata);
          applyStatus(result.taskId, result.status);
          break;
      }
    };

    const handleRpc = (rpc: any) => {
      if (rpc?.error) throw new Error(rpc.error.message ?? "A2A request failed");
      handle(rpc?.result);
    };

    const contentType = response.headers.get("content-type") ?? "";
    if (input.stream && contentType.includes("text/event-stream")) {
      await readSSE(response, ({ data }) => {
        let rpc: any;
        try {
          rpc = JSON.parse(data);
        } catch {
          return;
        }
        handleRpc(rpc);
      });
    } else {
      handleRpc(await response.json());
    }

    return {
      content: artifactText() || messageText || statusText,
      files: files.length ? files : undefined,
      ...(pendingActions.length > 0 ? { pendingActions } : {}),
      ...(stopReason && stopReason !== "requires_action" ? { stopReason } : {}),
      ...(stopDetail ? { stopDetail } : {}),
      state: { contextId: newContextId, taskId: openTaskId },
    };
  }

  /**
   * Stops the running task with JSON-RPC `tasks/cancel`. The task id is the one the server's events
   * named; a server that answers a whole turn at once (the Console's `message/send`) names it only in
   * the answer, so the id is derived the way the Console numbers it: `task_<contextId>_<index of the
   * answer in the conversation>`. A first turn has no context yet, so there is nothing to stop but the
   * connection.
   */
  protected async cancelRun(
    conversation: { state?: Record<string, unknown> },
    context: { live?: Record<string, unknown>; messages: unknown[] }
  ): Promise<boolean> {
    const { options } = this;
    const state = conversation.state ?? {};
    const contextId = (context.live?.contextId ?? state.contextId) as string | undefined;
    let id = context.live?.taskId as string | undefined;
    if (!id && context.live && contextId) id = `task_${contextId}_${context.messages.length}`;
    id ??= state.taskId as string | undefined;
    if (!id) return false;

    const method = options.methods?.cancel ?? "tasks/cancel";
    const response = await httpFetch(options, await this.rpcUrl(), {
      method: "POST",
      headers: await buildHeaders(options, { Accept: "application/json" }),
      body: JSON.stringify({ jsonrpc: "2.0", id: makeId(), method, params: { id } }),
    });
    if (!response.ok) throw await errorFromResponse(response);
    const rpc = (await response.json().catch(() => ({}))) as { error?: { code?: number; message?: string }; result?: { status?: { state?: string } } };
    if (rpc.error) {
      // "not cancelable" / "task not found": the turn is not running, which is no failure of Stop
      if (rpc.error.code === -32002 || rpc.error.code === -32001 || rpc.error.code === -32004) return false;
      throw new Error(rpc.error.message ?? "A2A cancel failed");
    }
    return rpc.result?.status?.state === "canceled";
  }

  protected canResolve(): boolean {
    return Boolean(this.options.actionUrl);
  }

  /** Answers an approval / question through `actionUrl`; the task then carries on (or stops again). */
  protected async resolve(input: ResolveInput): Promise<RunResult> {
    const { options } = this;
    const contextId = (input.conversation.state?.contextId as string | undefined) ?? input.conversation.id;
    const taskId = input.conversation.state?.taskId as string | undefined;
    const url = options.actionUrl?.({
      contextId,
      taskId,
      actionId: input.action.id,
      baseUrl: options.baseUrl.replace(/\/$/, ""),
    });
    if (!url) throw Object.assign(new Error("This conversation cannot take answers here."), { code: "not_supported", status: 404 });

    const response = await httpFetch(options, url, {
      method: "POST",
      headers: await buildHeaders(options),
      body: JSON.stringify(resolutionToWire(input.resolution)),
      signal: input.signal,
    });
    if (!response.ok) throw await errorFromResponse(response);

    const result = resultFromResponse(await response.json(), "", { serverState: false });
    if (input.stream && result.content) input.emit.setText(result.content);
    // The open task was answered: the next message starts a new one in the same context
    return { ...result, state: { contextId, taskId: result.pendingActions?.length ? taskId : undefined } };
  }
}
