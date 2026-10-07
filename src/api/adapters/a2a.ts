import type { AgentInfo, FileAttachment } from "../../types";
import { buildHeaders, errorFromResponse, httpFetch, readSSE, type HttpOptions } from "../http";
import { StatelessTransport, type RunInput, type RunResult, type StatelessTransportOptions } from "./base";
import { makeId } from "./files";

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
  methods?: { send: string; stream: string };
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

  protected async run(input: RunInput): Promise<RunResult> {
    const { options } = this;
    const methods = options.methods ?? { send: "message/send", stream: "message/stream" };

    let rpcUrl: string;
    if (options.rpcUrl) {
      rpcUrl = options.rpcUrl;
    } else {
      const card = await this.loadCard().catch(() => undefined);
      rpcUrl = card?.url ?? this.root();
    }

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
    const files: FileAttachment[] = [];

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
      state: { contextId: newContextId, taskId: openTaskId },
    };
  }
}
