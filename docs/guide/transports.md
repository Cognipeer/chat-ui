# Transports

`<Chat>` talks to its backend through a `ChatTransport`. Without one it uses `AgentServerClient` (the `@cognipeer/agent-server` REST API, selected by `baseUrl`). Pass `transport` to use anything else.

```tsx
<Chat transport={transport} agentId="assistant" />
```

| Backend | Transport | Conversation state |
| --- | --- | --- |
| `@cognipeer/agent-server` | `AgentServerClient` (default, via `baseUrl`) | Server |
| agent-sdk, in process | `AgentSdkTransport` | `ThreadStore` |
| OpenAI Chat Completions (and compatible gateways) | `ChatCompletionsTransport` | `ThreadStore` |
| OpenAI Responses API | `ResponsesTransport` | `ThreadStore` (plus `previous_response_id` on the server) |
| A2A (Agent2Agent, JSON-RPC) | `A2ATransport` | `ThreadStore` (plus `contextId`) |

## Auth

All HTTP transports, and `AgentServerClient`, accept the same options:

```ts
{
  authorization: "Bearer ...",             // static
  headers: { "X-Tenant": "acme" },         // static
  getHeaders: async () => ({ Authorization: `Bearer ${await getToken()}` }), // per request
  fetch: customFetch,                      // proxies, cookies, tests
}
```

`getHeaders` runs before every request, so a renewed token is picked up by the next call without rebuilding the client.

## Chat Completions

```ts
import { ChatCompletionsTransport } from "@cognipeer/chat-ui";

const transport = new ChatCompletionsTransport({
  baseUrl: "https://api.openai.com/v1",
  getHeaders: async () => ({ Authorization: `Bearer ${await getToken()}` }),
  agents: [{ id: "gpt-4o", name: "GPT-4o" }], // the agent id is the model unless `model` is set
  systemPrompt: "You are a helpful assistant.",
});
```

Tool calls the model requests are shown but never executed by the transport.

## Responses API

```ts
import { ResponsesTransport } from "@cognipeer/chat-ui";

const transport = new ResponsesTransport({
  baseUrl: "https://api.openai.com/v1",
  authorization: `Bearer ${key}`,
  agents: [{ id: "gpt-4o", name: "GPT-4o" }],
});
```

Turns are chained with `previous_response_id`; set `serverState: false` to resend the history instead. `url_citation` and `file_citation` annotations become citations and inline markers. Built-in tool items (web search, MCP, function calls) show as tool calls.

## A2A

```ts
import { A2ATransport } from "@cognipeer/chat-ui";

const transport = new A2ATransport({
  baseUrl: "https://agents.example.com/my-agent", // card at /.well-known/agent-card.json
  getHeaders: async () => ({ Authorization: `Bearer ${await getToken()}` }),
});
```

Uses `message/stream` (SSE) and `message/send`. `contextId` is kept per conversation, and a task left in `input-required` / `auth-required` is continued by the next message. Override `methods` for servers that use other method names.

## agent-sdk

```ts
import { AgentSdkTransport } from "@cognipeer/chat-ui";
import { createSmartAgent } from "@cognipeer/agent-sdk";

const transport = new AgentSdkTransport({
  agents: { assistant: { name: "Assistant", agent: createSmartAgent({ name: "Assistant", model }) } },
});
```

The agent runs in the same process as the UI. Tool calls, progress and streamed text are forwarded.

## Keeping threads

Chat Completions, Responses, A2A and agent-sdk have no conversation API, so the transport keeps threads in a `ThreadStore`:

- `MemoryThreadStore` (default) lasts until reload.
- `LocalStorageThreadStore` survives reloads in one browser.
- Implement `ThreadStore` (`list`, `get`, `save`, `delete`) to keep them in your own API.

## Writing your own

Implement `ChatTransport`, or extend `StatelessTransport` and implement `run()`: call your backend and report text, tool calls and progress through `input.emit`.
