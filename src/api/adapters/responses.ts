import type { Citation, CitationMark } from "../../types";
import { buildHeaders, errorFromResponse, httpFetch, readSSE, type HttpOptions } from "../http";
import { StatelessTransport, type ResolveInput, type RunInput, type RunResult, type StatelessTransportOptions } from "./base";
import { textOf, userContentWithFiles } from "./files";
import { AuthedFileUrls, outputFilesFromWire } from "./outputFiles";
import { pendingActionsFromWire, resolutionToWire, stopFromResponse } from "../../utils/wire";

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
  /**
   * Where answers to an approval or a question go, for a Console client API endpoint that stops
   * a response with `status: "requires_action"`. Default:
   * `<baseUrl>/agents/sessions/<session id>/actions/<action id>` (the session id is the response
   * id without its `resp_` prefix).
   */
  actionUrl?: (target: { sessionId: string; actionId: string; baseUrl: string }) => string;
  /** Let the chat answer a paused response's approvals and questions (default true). `false`: the cards are read-only. */
  resolveActions?: boolean;
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

/**
 * A finished `response` object as the chat's `RunResult`: text, citations and usage, plus - for a
 * Console client API response that waits on a person (`status: "requires_action"`) - its open
 * approvals / questions, and why a stopped response stopped.
 */
export function resultFromResponse(
  completed: any,
  streamed = "",
  options: { serverState?: boolean; baseUrl?: string } & HttpOptions = {}
): RunResult {
  const parsed = readResponse(completed);
  const usage = completed?.usage
    ? {
        inputTokens: completed.usage.input_tokens,
        outputTokens: completed.usage.output_tokens,
        totalTokens: completed.usage.total_tokens,
      }
    : undefined;

  // A Console response that waits on a person: its open approvals / questions
  const paused = completed?.status === "requires_action" && completed?.required_action?.type === "agent_actions";
  const pendingActions = paused ? pendingActionsFromWire(completed.required_action.actions) : [];
  const stop = stopFromResponse(completed);
  const incomplete = completed?.status === "incomplete";
  const sessionId = paused && typeof completed?.id === "string" ? completed.id.replace(/^resp_/, "") : undefined;

  // Citation offsets point into the final text, so prefer it over the
  // streamed deltas when the response object is available.
  const content = completed ? parsed.text : streamed;

  // Files the agent wrote for the user (Console `output_files`), or the `file_path` annotations that name them
  const files = options.baseUrl
    ? outputFilesFromWire(completed?.output_files ?? filesFromAnnotations(completed, sessionIdOf(completed)), options.baseUrl, options)
    : [];
  return {
    content,
    ...(files.length > 0 ? { files } : {}),
    citations: parsed.citations.length ? parsed.citations : undefined,
    citationMarks: parsed.marks.length ? parsed.marks : undefined,
    usage,
    ...(pendingActions.length > 0 ? { pendingActions } : {}),
    ...(incomplete ? { status: "incomplete" as const } : {}),
    ...(stop.stopReason ? { stopReason: stop.stopReason } : incomplete ? { stopReason: "limit" as const } : {}),
    ...(stop.stopDetail ? { stopDetail: stop.stopDetail } : {}),
    state: {
      ...(completed?.id && options.serverState !== false ? { previousResponseId: completed.id } : {}),
      ...(sessionId ? { sessionId } : {}),
    },
  };
}

/** A Console response id is `resp_<session id>`. */
function sessionIdOf(response: any): string | undefined {
  return typeof response?.id === "string" && response.id.startsWith("resp_") ? response.id.slice(5) : undefined;
}

/** `file_path` annotations as `output_files`-shaped entries, for a response that carries only the annotations. */
function filesFromAnnotations(response: any, sessionId: string | undefined) {
  if (!sessionId) return [];
  const seen = new Set<string>();
  const out: Array<{ id: string; name: string; download_url: string }> = [];
  for (const item of response?.output ?? []) {
    for (const part of item?.content ?? []) {
      for (const a of part?.annotations ?? []) {
        if (a?.type !== "file_path" || typeof a.file_id !== "string" || seen.has(a.file_id)) continue;
        seen.add(a.file_id);
        out.push({
          id: a.file_id,
          name: a.filename ?? a.file_id,
          download_url: `/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(a.file_id)}/content`,
        });
      }
    }
  }
  return out;
}

/** `POST /responses` — the OpenAI Responses API. */
export class ResponsesTransport extends StatelessTransport {
  constructor(private readonly options: ResponsesTransportOptions) {
    super(options);
    this.fileUrls = new AuthedFileUrls(options);
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
          case "response.created":
          case "response.in_progress":
            // the id Stop needs to reach this very response
            if (typeof e.response?.id === "string") input.track({ responseId: e.response.id });
            break;
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

    if (!input.stream) {
      readResponse(completed).tools.forEach((item) => {
        if (!seenTools.has(item.call_id ?? item.id)) emitTool(item);
      });
    }

    return resultFromResponse(completed, streamed, options);
  }

  private actionTarget(sessionId: string | undefined, actionId: string): string | undefined {
    if (!sessionId) return undefined;
    const baseUrl = this.options.baseUrl.replace(/\/$/, "");
    if (this.options.actionUrl) return this.options.actionUrl({ sessionId, actionId, baseUrl });
    return `${baseUrl}/agents/sessions/${encodeURIComponent(sessionId)}/actions/${encodeURIComponent(actionId)}`;
  }

  /**
   * Stops the turn the conversation runs on the server: `POST <path>/<response id>/cancel`. The id is
   * the one the running response announced in its first stream event (`response.created`), so even a
   * first turn can be stopped; without a running turn of this page it is the last response of the chain.
   */
  protected async cancelRun(
    conversation: { state?: Record<string, unknown> },
    context: { live?: Record<string, unknown> } = {}
  ): Promise<boolean> {
    if (this.options.serverState === false) return false;
    const id = (context.live?.responseId ?? conversation.state?.previousResponseId) as string | undefined;
    if (!id) return false;
    const { options } = this;
    const response = await httpFetch(
      options,
      `${options.baseUrl.replace(/\/$/, "")}${options.path ?? "/responses"}/${encodeURIComponent(id)}/cancel`,
      { method: "POST", headers: await buildHeaders(options) }
    );
    if (!response.ok) throw await errorFromResponse(response);
    const body = (await response.json().catch(() => ({}))) as { cancelled?: boolean };
    return body.cancelled === true;
  }

  protected canResolve(): boolean {
    return this.options.resolveActions !== false;
  }

  /** Answers an approval / question through the Console client API (`POST .../actions/:actionId`). */
  protected async resolve(input: ResolveInput): Promise<RunResult> {
    const { options } = this;
    const sessionId = input.conversation.state?.sessionId as string | undefined;
    const url = this.actionTarget(sessionId, input.action.id);
    if (!url) throw Object.assign(new Error("This conversation cannot take answers here."), { code: "not_supported", status: 404 });

    const response = await httpFetch(options, url, {
      method: "POST",
      headers: await buildHeaders(options),
      body: JSON.stringify(resolutionToWire(input.resolution)),
      signal: input.signal,
    });
    if (!response.ok) throw await errorFromResponse(response);
    const completed = await response.json();

    const result = resultFromResponse(completed, "", options);
    // The endpoint answers in one piece; show it as the streamed answer
    if (input.stream && result.content) input.emit.setText(result.content);
    return result;
  }
}
