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

## What each backend supports

`ChatTransport` has one required core (conversations, `sendMessage`, `sendMessageStream`) and optional methods. The UI offers a feature only where the transport has the method:

| | agent-server | agent-sdk | Chat Completions | Responses | A2A |
| --- | :-: | :-: | :-: | :-: | :-: |
| Approvals and questions (`resolveAction`) | yes | agents that pause | no | Console client API | with `actionUrl` |
| Reattach to a running turn (`followEvents`) | yes | | | | |
| Stop on the server (`cancel`) | yes | | no (abort only) | `POST .../responses/<id>/cancel` | `tasks/cancel` |
| Usage limit (`updateBudget`, `continueConversation`) | yes | | | | |
| Cancel a reminder (`cancelReminder`) | yes (Console portal) | | | | |
| Stop reason on an answer | yes | cancelled | | limit, cancelled | limit |
| Files stored ahead (`uploadFile`, raw body, progress) | yes | | | | |
| Count of files in a conversation (`listFiles`), signed file URLs (`getFileUrl`) | yes | | | | |

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

Stop only closes the request: Chat Completions has no route to end a run on the server, so the provider may finish generating (and bill) after the page stopped listening.

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

Stop ends the run on the server with `POST <path>/<response id>/cancel`. The id is taken from the first stream event (`response.created`), so the first turn of a conversation can be stopped too. It needs `serverState` (the default); with `store: false` there is nothing to cancel.

A response with `status: "incomplete"` or a `stop_reason` of `limit` / `cancelled` / `budget_reached` is stored with its stop reason, so a notice shows under the answer.

### Approvals and questions

An endpoint that speaks the Console client API can stop a response for a person: `status: "requires_action"`, `stop_reason: "requires_action"` and `required_action: { type: "agent_actions", actions: [...] }` (snake_case: `kind`, `tool_name`, `allow_free_text`, `expires_at`; questions with `multi_select`). The transport turns the actions into cards and answers them with `POST <baseUrl>/agents/sessions/<session id>/actions/<action id>` (`{ decision, comment, approved_args, remember_for_session }` or `{ answers, cancelled }`), where the session id is the response id without its `resp_` prefix. The reply has the same shape, so it can stop again.

```ts
new ResponsesTransport({
  baseUrl: "https://console.example.com/api/client/v1",
  actionUrl: ({ sessionId, actionId, baseUrl }) => `${baseUrl}/agents/sessions/${sessionId}/actions/${actionId}`, // the default
  resolveActions: false,   // leave the cards read-only
});
```

Other Responses endpoints (OpenAI's own) never send `required_action` of this kind and are not affected.

## A2A

```ts
import { A2ATransport } from "@cognipeer/chat-ui";

const transport = new A2ATransport({
  baseUrl: "https://agents.example.com/my-agent", // card at /.well-known/agent-card.json
  getHeaders: async () => ({ Authorization: `Bearer ${await getToken()}` }),
});
```

Uses `message/stream` (SSE) and `message/send`. `contextId` is kept per conversation, and a task left in `input-required` / `auth-required` is continued by the next message. Override `methods` for servers that use other method names.

Stop sends JSON-RPC `tasks/cancel` (rename it with `methods.cancel`). The task id is the one the stream's events name; for a server that answers a turn in one piece (the Console's `message/send`) it is derived as `task_<contextId>_<index of the answer>`. A first turn has no context yet, so Stop can only close the connection there. A server that reports "not running" / "not found" is treated as nothing to stop.

`metadata.stopReason` / `stopDetail` of a task become the stop reason of the answer.

### Approvals and questions

A server that stops a task with `input-required` can list what it waits on in `metadata.pendingActions` (the Console client API does, in its snake_case form); they show as cards. A2A itself has no way to answer them, so the answer goes to a REST route you name:

```ts
new A2ATransport({
  baseUrl: "https://console.example.com/api/client/v1/a2a/my-agent",
  actionUrl: ({ contextId, actionId }) =>
    `https://console.example.com/api/client/v1/agents/sessions/${contextId}/actions/${actionId}`,
});
```

Without `actionUrl` the cards are read-only ("Waiting for approval in another app"). After an answer the open task is considered over: the next message starts a new one in the same context.

## agent-sdk

```ts
import { AgentSdkTransport } from "@cognipeer/chat-ui";
import { createSmartAgent } from "@cognipeer/agent-sdk";

const transport = new AgentSdkTransport({
  agents: { assistant: { name: "Assistant", agent: createSmartAgent({ name: "Assistant", model }) } },
});
```

The agent runs in the same process as the UI. Tool calls, progress and streamed text are forwarded.

An agent that can pause for a person (`createSmartAgent` has `resolveToolApproval` and `resolveUserQuestion`) shows its approvals and questions as cards. The paused state is kept with the thread (without the live runtime, as JSON, so a `LocalStorageThreadStore` keeps it), an answer is applied to it and, once every action of the pause is answered, the agent runs on. A turn cut off with Stop is stored as cancelled.

## Keeping threads

Chat Completions, Responses, A2A and agent-sdk have no conversation API, so the transport keeps threads in a `ThreadStore`:

- `MemoryThreadStore` (default) lasts until reload.
- `LocalStorageThreadStore` survives reloads in one browser.
- Implement `ThreadStore` (`list`, `get`, `save`, `delete`) to keep them in your own API.

## Writing your own

Implement `ChatTransport`, or extend `StatelessTransport` and implement `run()`: call your backend and report text, tool calls and progress through `input.emit`.

`run()` may return `pendingActions` (the turn stopped for a person), `stopReason` / `stopDetail` and `status`. To take answers, also implement `resolve(input)` (and `canResolve()` when that depends on your options): it is handed the action, the others of the same pause that still wait and the person's resolution, and returns what the agent did next. The base class keeps the paused message, records how each card ended and adds the continuation as a new message; `resolveAction` exists on the transport only when `canResolve()` is true, so the chat shows read-only cards otherwise.

A transport of your own can add the run methods too: `followEvents`, `cancel`, `cancelReminder`, `continueConversation`, `updateBudget`, `listFiles`, `getFileUrl`, and `uploadFile` with `supportsRawUpload`. They are all optional.
