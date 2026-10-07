import type { ContentPart } from "../../types";
import { StatelessTransport, type RunInput, type RunResult, type StatelessTransportOptions } from "./base";
import { textOf, userContentWithFiles } from "./files";

/**
 * The part of an `@cognipeer/agent-sdk` agent this adapter uses
 * (`createSmartAgent(...)` / `createAgent(...)` satisfy it), declared
 * structurally so chat-ui does not depend on the SDK.
 */
export interface AgentSdkAgent {
  invoke(
    state: { messages: Array<{ role: string; content: string | ContentPart[] }> },
    config?: Record<string, any>
  ): Promise<{
    content: string;
    metadata?: { usage?: any };
  }>;
}

export interface AgentSdkEntry {
  agent: AgentSdkAgent;
  name?: string;
  description?: string;
}

export interface AgentSdkTransportOptions extends Omit<StatelessTransportOptions, "agents"> {
  /** Agents by id; the id is what `<Chat agentId>` selects. */
  agents: Record<string, AgentSdkEntry>;
  /** Extra per-call config passed to `agent.invoke` */
  invokeConfig?: Record<string, any>;
}

/**
 * Runs an agent-sdk agent in the same process as the UI (browser or Next.js
 * server component) — no agent-server needed.
 */
export class AgentSdkTransport extends StatelessTransport {
  constructor(private readonly options: AgentSdkTransportOptions) {
    super({
      ...options,
      agents: Object.entries(options.agents).map(([id, e]) => ({
        id,
        name: e.name ?? id,
        description: e.description,
      })),
    });
  }

  protected async run(input: RunInput): Promise<RunResult> {
    const entry = this.options.agents[input.conversation.agentId];
    if (!entry) throw new Error(`Unknown agent: ${input.conversation.agentId}`);

    const messages = input.history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as string, content: textOf(m.content) as string | ContentPart[] }));
    messages.push({
      role: "user",
      content: userContentWithFiles(
        input.text,
        input.files,
        (url) => ({ type: "image_url", image_url: { url } }),
        (text) => ({ type: "text", text })
      ),
    });

    let calls = 0;
    const idOf = (e: any, name: string) => e.id ?? `${name}-${calls}`;

    const result = await entry.agent.invoke(
      { messages },
      {
        ...this.options.invokeConfig,
        stream: input.stream,
        cancellationToken: input.signal,
        // The final chunk repeats the whole answer, so only deltas are used.
        onStream: (chunk: { text: string; isFinal?: boolean }) => {
          if (!chunk.isFinal) input.emit.text(chunk.text);
        },
        onProgress: (p: { message?: string }) => {
          if (p.message) input.emit.progress(p.message);
        },
        onEvent: (e: any) => {
          if (e.type === "progress" && e.message) return input.emit.progress(e.message);
          if (e.type !== "tool_call") return;
          if (e.phase === "start") {
            calls += 1;
            input.emit.toolCall(idOf(e, e.name), e.name, e.args ?? {});
          } else if (e.phase === "success") {
            input.emit.toolResult(idOf(e, e.name), e.name, e.result);
          } else if (e.phase === "error") {
            input.emit.toolResult(idOf(e, e.name), e.name, { error: e.error?.message ?? "Tool failed" });
          }
        },
      }
    );

    const u = result.metadata?.usage;
    return {
      content: result.content,
      usage: u
        ? {
            inputTokens: u.inputTokens ?? u.prompt_tokens ?? u.input_tokens,
            outputTokens: u.outputTokens ?? u.completion_tokens ?? u.output_tokens,
            totalTokens: u.totalTokens ?? u.total_tokens,
          }
        : undefined,
    };
  }
}
