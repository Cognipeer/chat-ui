# AgentServerClient

Low-level client for `@cognipeer/agent-server`. `Chat` and `useChat` create one from `baseUrl`; use it directly for your own UI. It implements [`ChatTransport`](/guide/transports), the interface every backend adapter implements.

## Import

```tsx
import { AgentServerClient } from "@cognipeer/chat-ui";
```

## Constructor

```tsx
const client = new AgentServerClient({
  baseUrl: "/api/agents",          // required
  authorization: "Bearer token",   // optional
  headers: { "X-Custom": "value" },
  getHeaders: async () => ({ Authorization: `Bearer ${await freshToken()}` }), // before every request
  fetch: (url, init) => fetch(url, { ...init, credentials: "include" }),       // proxies, cookies, tests
});
```

`getHeaders` is merged over `authorization` and `headers`. `agentId` is accepted but not used by the client; conversations carry their agent.

## Methods

### Agents

```tsx
const agents = await client.getAgents();        // GET /agents -> AgentInfo[]
const agent = await client.getAgent("support"); // GET /agents/:id
```

### Conversations

```tsx
const { conversations, total, limit, offset, hasMore } =
  await client.getConversations({ agentId?, userId?, limit?, offset? });

const conversation = await client.createConversation({ agentId: "support", title?, userId?, metadata? });

const { conversation, messages, pendingActions } = await client.getConversation(conversationId);
await client.updateConversation(conversationId, { title?, metadata? });
await client.deleteConversation(conversationId);
```

`pendingActions` lists the approvals and questions still waiting for an answer (agent-server 0.3.0+).

### Messages

```tsx
const { messages, total, hasMore } = await client.getMessages(conversationId, { limit?, offset?, order? });

// JSON response
const { message, response, status, pendingActions } = await client.sendMessage(conversationId, {
  message: "Hello!",
  fileIds: ["file-1"],   // files uploaded earlier with uploadFile
  files: [{ name: "a.txt", content: "<base64>", mimeType: "text/plain" }], // or inline
  metadata: {},
});

// Streaming: events arrive through callbacks
await client.sendMessageStream(
  conversationId,
  { message: "Hello!" },
  {
    onStart: (event) => {},
    onText: (chunk, fullText) => {},
    onToolCall: (event) => {},
    onToolResult: (event) => {},
    onProgress: (event) => {},
    onActionRequired: (event) => {},   // the turn paused for an approval or a question
    onActionResolved: (event) => {},
    onError: (error) => {},            // error.code when the event has one
    onDone: (event) => {},
  },
  abortSignal // optional
);
```

### Approvals and questions

```tsx
// Streams the continuation through options.callbacks
await client.resolveAction(conversationId, actionId, { type: "tool_approval", decision: "allow" }, {
  stream: true,
  callbacks: { onText: (chunk, full) => {}, onDone: (event) => {} },
  signal: abortSignal,
});

// Or returns the JSON response
const { response } = await client.resolveAction(conversationId, actionId, {
  type: "user_question",
  answers: { "Which region?": "eu" },
}) ?? {};
```

`POST /conversations/:conversationId/actions/:actionId` with `{ resolution, stream? }`. See [Approvals and Questions](/guide/approvals).

### Files

```tsx
const file = await client.uploadFile({
  file: { name: "a.txt", content: "<base64>", mimeType: "text/plain" },
  conversationId,   // optional
  metadata,         // optional
});
const info = await client.getFile(fileId);
await client.deleteFile(fileId);
const url = client.getFileContentUrl(fileId); // GET /files/:id/content
```

## Errors

A request that fails rejects with an `Error` whose `message` is the server's, plus `status` (HTTP status) and `code` when the server sent one:

```tsx
try {
  await client.sendMessage(conversationId, { message: "Hello" });
} catch (error) {
  if (error.status === 401) await refreshToken();
  else if (error.code === "conversation_busy") { /* a turn is still running */ }
}
```

`Chat` and `useChat` turn well-known codes into localized messages and recover from the 409 conflicts (a card waiting, a turn running) by fetching the conversation again; see [Approvals and Questions](/guide/approvals#errors).

## Stream events

The streaming methods read Server-Sent Events whose `data` is a JSON `StreamEvent` (see [Types](/api/types#stream-events)): `stream.start`, `stream.text`, `stream.thinking`, `stream.tool_call`, `stream.tool_result`, `stream.progress`, `stream.action_required`, `stream.action_resolved`, `stream.error` and `stream.done`.

## Cancelling

Pass an `AbortSignal` to stop reading a stream. This detaches the browser; it does not cancel the run on the server.

```tsx
const controller = new AbortController();
setTimeout(() => controller.abort(), 30000);

try {
  await client.sendMessageStream(conversationId, { message: "Long task..." }, { onText }, controller.signal);
} catch (error) {
  if (error.name === "AbortError") console.log("Detached");
}
```

## Related

- [useChat Hook](/api/use-chat)
- [Types](/api/types)
- [Agent Server Integration](/guide/agent-server)
- [Transports](/guide/transports)
