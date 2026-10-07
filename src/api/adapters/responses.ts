import type { Citation, CitationMark } from "../../types";
import { buildHeaders, errorFromResponse, httpFetch, readSSE, type HttpOptions } from "../http";
import { StatelessTransport, type RunInput, type RunResult, type StatelessTransportOptions } from "./base";
import { textOf, userContentWithFiles } from "./files";

export interface ResponsesTransportOptions extends StatelessTransportOptions, HttpOptions {
  /** API root, e.g. `https://api.openai.com/v1` */
  baseUrl: string;
  /** Model name. Defaults to the selected agent id. */
  model?: string;
  /** Sent as `instructions` */
  instructions?: string;
  /** Request path under `baseUrl` */
  path?: string;
  /**
   * Let the server keep the conversation and chain turns with
   * `previous_response_id` (default). When false, the full history is resent
   * on every turn and `store: false` is requested.
   */
  serverState?: boolean;
  /** Extra fields merged into the request body (tools, reasoning, ...) */
  body?: Record<string, unknown>;
}

const TOOL_ITEMS = new Set([
  "function_call",
  "mcp_call",
  "web_search_call",
  "file_search_call",
  "code_interpreter_call",
  "computer_call",
]);

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string" && raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return { arguments: raw };
    }
  }
  return {};
}

/** Text, citations and tool items out of a finished `response` object. */
function readResponse(response: any) {
  let text = "";
  const citations: Citation[] = [];
  const marks: CitationMark[] = [];
  const tools: any[] = [];

  const cite = (c: Citation) => {
    if (!citations.some((x) => x.id === c.id)) citations.push(c);
  };

  for (const item of response?.output ?? []) {
    if (TOOL_ITEMS.has(item.type)) tools.push(item);
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text") continue;
      const base = text.length;
      text += part.text ?? "";
      for (const a of part.annotations ?? []) {
        if (a.type === "url_citation" && a.url) {
          cite({ id: a.url, title: a.title, link: a.url });
          marks.push({ offset: base + (a.end_index ?? 0), citationId: a.url });
        } else if (a.type === "file_citation" && a.file_id) {
          cite({ id: a.file_id, title: a.filename });
          marks.push({ offset: base + (a.index ?? 0), citationId: a.file_id });
        }
      }
    }
  }
  return { text, citations, marks, tools };
}

/** `POST /responses` — the OpenAI Responses API. */
export class ResponsesTransport extends StatelessTransport {
  constructor(private readonly options: ResponsesTransportOptions) {
    super(options);
  }

  protected async run(input: RunInput): Promise<RunResult> {
    const { options } = this;
    const previousId = input.conversation.state?.previousResponseId as string | undefined;
    const chained = options.serverState !== false && !!previousId;

    const current = {
      role: "user",
      content: userContentWithFiles(
        input.text,
        input.files,
        (url) => ({ type: "input_image", image_url: url }),
        (text) => ({ type: "input_text", text })
      ),
    };
    const history = chained
      ? []
      : input.history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role, content: textOf(m.content) }));

    const response = await httpFetch(
      options,
      `${options.baseUrl.replace(/\/$/, "")}${options.path ?? "/responses"}`,
      {
        method: "POST",
        headers: await buildHeaders(options),
        body: JSON.stringify({
          model: options.model ?? input.conversation.agentId,
          input: [...history, current],
          stream: input.stream,
          ...(options.instructions ? { instructions: options.instructions } : {}),
          ...(options.serverState === false ? { store: false } : {}),
          ...(chained ? { previous_response_id: previousId } : {}),
          ...options.body,
        }),
        signal: input.signal,
      }
    );
    if (!response.ok) throw await errorFromResponse(response);

    let completed: any;
    let streamed = "";
    const seenTools = new Set<string>();

    const emitTool = (item: any) => {
      const id = item.call_id ?? item.id;
      const name = item.name ?? item.type;
      input.emit.toolCall(id, name, parseArgs(item.arguments ?? item.action ?? item.queries));
      if (item.output !== undefined && item.output !== null) {
        input.emit.toolResult(id, name, item.output);
      }
      seenTools.add(id);
    };

    if (input.stream) {
      await readSSE(response, ({ event, data }) => {
        let e: any;
        try {
          e = JSON.parse(data);
        } catch {
          return;
        }
        switch (e.type ?? event) {
          case "response.output_text.delta":
            streamed += e.delta ?? "";
            input.emit.text(e.delta ?? "");
            break;
          case "response.output_item.added":
          case "response.output_item.done":
            if (TOOL_ITEMS.has(e.item?.type)) emitTool(e.item);
            break;
          case "response.completed":
            completed = e.response;
            break;
          case "response.failed":
            throw new Error(e.response?.error?.message ?? "Response failed");
          case "response.incomplete":
            completed = e.response;
            break;
          case "error":
            throw new Error(e.message ?? e.error?.message ?? "Stream error");
        }
      });
    } else {
      completed = await response.json();
      if (completed.error) throw new Error(completed.error.message ?? "Response failed");
    }

    const parsed = readResponse(completed);
    if (!input.stream) {
      parsed.tools.forEach((item) => {
        if (!seenTools.has(item.call_id ?? item.id)) emitTool(item);
      });
    }

    const usage = completed?.usage
      ? {
          inputTokens: completed.usage.input_tokens,
          outputTokens: completed.usage.output_tokens,
          totalTokens: completed.usage.total_tokens,
        }
      : undefined;

    // Citation offsets point into the final text, so prefer it over the
    // streamed deltas when the response object is available.
    const content = completed ? parsed.text : streamed;
    return {
      content,
      citations: parsed.citations.length ? parsed.citations : undefined,
      citationMarks: parsed.marks.length ? parsed.marks : undefined,
      usage,
      state: completed?.id && options.serverState !== false
        ? { previousResponseId: completed.id }
        : undefined,
    };
  }
}
