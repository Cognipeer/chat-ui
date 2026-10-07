import type { ContentPart } from "../../types";
import { buildHeaders, errorFromResponse, httpFetch, readSSE, type HttpOptions } from "../http";
import { StatelessTransport, type RunInput, type RunResult, type StatelessTransportOptions } from "./base";
import { textOf, userContentWithFiles } from "./files";

export interface ChatCompletionsTransportOptions extends StatelessTransportOptions, HttpOptions {
  /** API root, e.g. `https://api.openai.com/v1` */
  baseUrl: string;
  /** Model name. Defaults to the selected agent id, so each "agent" can be a model/deployment. */
  model?: string;
  /** Prepended as a system message */
  systemPrompt?: string;
  /** Request path under `baseUrl` */
  path?: string;
  /** Extra fields merged into the request body (temperature, tools, ...) */
  body?: Record<string, unknown>;
}

interface PartialToolCall {
  id: string;
  name: string;
  args: string;
}

/** `POST /chat/completions` — OpenAI and compatible gateways. */
export class ChatCompletionsTransport extends StatelessTransport {
  constructor(private readonly options: ChatCompletionsTransportOptions) {
    super(options);
  }

  protected async run(input: RunInput): Promise<RunResult> {
    const { options } = this;
    const messages: Array<{ role: string; content: string | ContentPart[] }> = [];
    if (options.systemPrompt) messages.push({ role: "system", content: options.systemPrompt });
    for (const m of input.history) {
      if (m.role === "user" || m.role === "assistant") {
        messages.push({ role: m.role, content: textOf(m.content) });
      }
    }
    messages.push({
      role: "user",
      content: userContentWithFiles(
        input.text,
        input.files,
        (url) => ({ type: "image_url", image_url: { url } }),
        (text) => ({ type: "text", text })
      ),
    });

    const response = await httpFetch(
      options,
      `${options.baseUrl.replace(/\/$/, "")}${options.path ?? "/chat/completions"}`,
      {
        method: "POST",
        headers: await buildHeaders(options),
        body: JSON.stringify({
          model: options.model ?? input.conversation.agentId,
          messages,
          stream: input.stream,
          ...options.body,
        }),
        signal: input.signal,
      }
    );
    if (!response.ok) throw await errorFromResponse(response);

    const toolCalls = new Map<number, PartialToolCall>();
    let usage: RunResult["usage"];
    let content = "";

    const readUsage = (u: any) => {
      if (!u) return;
      usage = {
        inputTokens: u.prompt_tokens,
        outputTokens: u.completion_tokens,
        totalTokens: u.total_tokens,
      };
    };

    if (input.stream) {
      let done = false;
      await readSSE(response, ({ data }) => {
        if (done) return;
        const payload = data.trim();
        if (payload === "[DONE]") {
          done = true;
          return;
        }
        let chunk: any;
        try {
          chunk = JSON.parse(payload);
        } catch {
          return;
        }
        if (chunk.error) throw new Error(chunk.error.message ?? "Stream error");
        readUsage(chunk.usage);

        const delta = chunk.choices?.[0]?.delta;
        if (!delta) return;
        if (typeof delta.content === "string" && delta.content) {
          content += delta.content;
          input.emit.text(delta.content);
        }
        for (const tc of delta.tool_calls ?? []) {
          const current = toolCalls.get(tc.index ?? 0) ?? { id: "", name: "", args: "" };
          if (tc.id) current.id = tc.id;
          if (tc.function?.name) current.name = tc.function.name;
          if (tc.function?.arguments) current.args += tc.function.arguments;
          toolCalls.set(tc.index ?? 0, current);
        }
      });
    } else {
      const json: any = await response.json();
      const message = json.choices?.[0]?.message;
      content = typeof message?.content === "string" ? message.content : "";
      readUsage(json.usage);
      (message?.tool_calls ?? []).forEach((tc: any, i: number) =>
        toolCalls.set(i, {
          id: tc.id ?? `call_${i}`,
          name: tc.function?.name ?? "tool",
          args: tc.function?.arguments ?? "",
        })
      );
    }

    // The model asked for tools. This transport never executes them (the
    // gateway or host does), so they are shown for information only.
    toolCalls.forEach((tc, index) => {
      let args: Record<string, unknown> = {};
      try {
        args = tc.args ? JSON.parse(tc.args) : {};
      } catch {
        args = { arguments: tc.args };
      }
      input.emit.toolCall(tc.id || `call_${index}`, tc.name, args);
    });

    return { content, usage };
  }
}
