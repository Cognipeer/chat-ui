import type { ContentPart } from "../../types";
import { StatelessTransport, type ResolveInput, type RunInput, type RunResult, type StatelessTransportOptions } from "./base";
import { textOf, userContentWithFiles } from "./files";
import {
  applySdkResolution,
  detectSdkPendingActions,
  portableSdkState,
  supportsSdkPause,
} from "../../utils/sdkActions";

/**
 * The part of an `@cognipeer/agent-sdk` agent this adapter uses
 * (`createSmartAgent(...)` / `createAgent(...)` satisfy it), declared
 * structurally so chat-ui does not depend on the SDK.
 */
export interface AgentSdkAgent {
  invoke(
    state: { messages: Array<{ role: string; content: string | ContentPart[] }> } | Record<string, any>,
    config?: Record<string, any>
  ): Promise<{
    content: string;
    metadata?: { usage?: any };
    /** The run's state; when it holds pending approvals / questions the turn paused */
    state?: any;
  }>;
  /** Present on agents that can pause for a person (`createSmartAgent`): applies an approval to a paused state */
  resolveToolApproval?: (state: any, resolution: any) => any;
  /** Applies the answer to a question to a paused state */
  resolveUserQuestion?: (state: any, resolution: any) => any;
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

  /** `invoke` config that streams a run into the chat. */
  private invokeConfig(emit: RunInput["emit"], stream: boolean, signal: AbortSignal | undefined): Record<string, any> {
    let calls = 0;
    const idOf = (e: any, name: string) => e.id ?? `${name}-${calls}`;
    return {
      ...this.options.invokeConfig,
      stream,
      cancellationToken: signal,
      // The final chunk repeats the whole answer, so only deltas are used.
      onStream: (chunk: { text: string; isFinal?: boolean }) => {
        if (!chunk.isFinal) emit.text(chunk.text);
      },
      onProgress: (p: { message?: string }) => {
        if (p.message) emit.progress(p.message);
      },
      onEvent: (e: any) => {
        if (e.type === "progress" && e.message) return emit.progress(e.message);
        if (e.type !== "tool_call") return;
        if (e.phase === "start") {
          calls += 1;
          emit.toolCall(idOf(e, e.name), e.name, e.args ?? {});
        } else if (e.phase === "success") {
          emit.toolResult(idOf(e, e.name), e.name, e.result);
        } else if (e.phase === "error") {
          emit.toolResult(idOf(e, e.name), e.name, { error: e.error?.message ?? "Tool failed" });
        }
      },
    };
  }

  /** What a finished `invoke` is to the chat: the answer, or a pause with its state kept for the answers. */
  private resultOf(result: Awaited<ReturnType<AgentSdkAgent["invoke"]>>, signal: AbortSignal | undefined): RunResult {
    const u = result.metadata?.usage;
    const pendingActions = detectSdkPendingActions(result);
    return {
      content: result.content,
      usage: u
        ? {
            inputTokens: u.inputTokens ?? u.prompt_tokens ?? u.input_tokens,
            outputTokens: u.outputTokens ?? u.completion_tokens ?? u.output_tokens,
            totalTokens: u.totalTokens ?? u.total_tokens,
          }
        : undefined,
      ...(pendingActions.length > 0 ? { pendingActions } : {}),
      ...(signal?.aborted ? { stopReason: "cancelled" as const, status: "cancelled" as const } : {}),
      // The paused state stays with the thread until every action is answered; a plain turn clears it
      state: { sdkState: pendingActions.length > 0 ? portableSdkState(result.state) : undefined },
    };
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

    const result = await entry.agent.invoke({ messages }, this.invokeConfig(input.emit, input.stream, input.signal));
    return this.resultOf(result, input.signal);
  }

  /** The agent can pause (`createSmartAgent`), so its cards can be answered here. */
  protected canResolve(): boolean {
    return Object.values(this.options.agents).some((entry) => supportsSdkPause(entry.agent));
  }

  /**
   * Applies the answer to the paused state kept with the thread. While other actions of the same
   * pause wait, only the decision is recorded; the last answer runs the agent on.
   */
  protected async resolve(input: ResolveInput): Promise<RunResult> {
    const entry = this.options.agents[input.conversation.agentId];
    if (!entry) throw new Error(`Unknown agent: ${input.conversation.agentId}`);
    const kept = input.conversation.state?.sdkState;
    if (!kept || !supportsSdkPause(entry.agent)) {
      throw Object.assign(new Error("This request can no longer be continued. Send a new message instead."), {
        code: "action_not_resumable",
        status: 409,
      });
    }

    const state = applySdkResolution(entry.agent, kept, input.action, input.resolution);
    if (input.siblings.length > 0) {
      return { pendingActions: input.siblings, state: { sdkState: portableSdkState(state) } };
    }
    const result = await entry.agent.invoke(state as Record<string, any>, this.invokeConfig(input.emit, input.stream, input.signal));
    return this.resultOf(result, input.signal);
  }
}
