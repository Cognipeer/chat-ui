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
  rawUpload: true,                 // send files as themselves (default), false: base64 JSON
  reconnect: { retries: 6, delayMs: 500, maxDelayMs: 8000 },                    // followEvents
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

const { conversation, messages, pendingActions, messagesPage } = await client.getConversation(conversationId);
const older = await client.getConversation(conversationId, { before: messages[0].id, limit?: 50 });   // the page just older than a message
await client.updateConversation(conversationId, { title?, metadata?, budget? });
await client.deleteConversation(conversationId);
```

`messages` is the newest page of the history (agent-server sends `limits.messagePageSize`, 100 by default); `messagesPage` (`{ limit, order, hasMoreBefore, hasMoreAfter }`) says whether older messages exist, and `before` fetches them. `useChat` does this for you: see `hasEarlierMessages` and `loadEarlierMessages`. `pendingActions` lists the approvals and questions still waiting for an answer (agent-server 0.3.0+). `conversation.runtime` (`{ status, stopReason?, lastEventSeq, pendingActionIds, activeRunId? }`), `conversation.budget` and `conversation.spentUsd` come with the conversation and with each item of the list; a `runtime` or `budget` that is not well-formed is dropped.

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

### Runs: cancel, follow, continue

```tsx
// Stop the run on the server (POST /conversations/:id/cancel); the open approvals of a paused conversation are cancelled too
const { cancelled, runId, settled, cancelledActionIds, stopReason, runtime } = await client.cancel(conversationId);

// Replay the event log after `after`, then follow it live until aborted (GET /conversations/:id/events/stream)
const controller = new AbortController();
await client.followEvents(conversationId, {
  after: conversation.runtime?.lastEventSeq,
  signal: controller.signal,
  types: ["agent.message", "session.status_idle"],   // optional filter
  onEvent: ({ seq, type, data, runId, createdAt }) => {},
  onReconnect: (attempt) => {},
});

// Carry on a turn the usage limit stopped (POST /conversations/:id/continue)
await client.continueConversation(conversationId, { stream: true, callbacks: { onText, onDone } });
const reply = await client.continueConversation(conversationId);            // JSON

// Raise or remove the limit (PATCH /conversations/:id { budget })
const updated = await client.updateBudget(conversationId, { maxCostUsd: 20, onReach: "pause" });
await client.updateBudget(conversationId, null);
```

`followEvents` resolves when aborted. It opens the stream again from the last `seq` when the server closes it or the network drops (with backoff, up to `reconnect.retries` failed attempts in a row), and rejects with a refusal that retrying cannot fix (404, 403, ...). Events are `{ seq?, type, data, runId?, createdAt? }` with the Console's snake_case `data` (`tool_call_id`, `stop_reason`, ...); `agent.message.delta` frames (live text) have no `seq`. Unknown types arrive too: ignore them. See the [event types](/guide/runs).

`cancel` answers `200`, or `202` (`settled: false`) while the run is still winding down or runs on another node; nothing to cancel is `cancelled: false`, not an error. Errors carry `code` and `details` (`budget_forbidden`, `invalid_budget`, `budget_reached` with `details.spentUsd` / `maxCostUsd`, `nothing_to_continue`).

### Files

```tsx
// The file as itself: its bytes are the body, its own Content-Type (POST /files?name=&conversationId=)
const file = await client.uploadFile({
  file: { name: "a.pdf", mimeType: "application/pdf", blob: fileOrBlob },
  conversationId,                              // without it the file cannot be attached to a message
  onProgress: ({ loaded, total }) => {},       // XMLHttpRequest, unless you gave your own `fetch`
  signal: abortSignal,
});

// The JSON form
await client.uploadFile({ file: { name: "a.txt", content: "<base64>", mimeType: "text/plain" }, conversationId });

const { files, total, maxFiles } = await client.listFiles(conversationId);   // GET /conversations/:id/files
const info = await client.getFile(fileId);
await client.deleteFile(fileId);
const url = client.getFileContentUrl(fileId);        // GET /files/:id/content (needs the same credentials)
const shown = await client.getFileUrl({ id: fileId }, { disposition: "inline" });   // a URL an <img> can use
client.dispose();                                    // release the blob URLs getFileUrl made
```

`uploadFile` resolves to a `FileAttachment` (`id`, `name`, `mimeType`, `size`, `expiresAt?`, `conversionStatus?`). `supportsRawUpload` is `true` unless `rawUpload: false`; a `blob` given to a client that does not send raw bodies is read as base64.

`getFileUrl` is the file route itself when no credentials are configured. With `authorization`, `headers`, `getHeaders` or a custom `fetch`, the bytes are fetched with them and handed back as a blob URL, cached per file (the 200 most recently used are kept; `dispose()` releases them all, and `useChat` does so when a conversation is left). Only raster pictures keep their own type; any other blob is typed `application/octet-stream`, so a stored HTML or SVG file can not run on your page.

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

The streaming methods read Server-Sent Events whose `data` is a JSON `StreamEvent` (see [Types](/api/types#stream-events)): `stream.start`, `stream.text`, `stream.thinking`, `stream.tool_call`, `stream.tool_result`, `stream.progress`, `stream.action_required`, `stream.action_resolved`, `stream.error` and `stream.done`. Every frame may carry `seq`, its position in the conversation's event log, and `stream.done` may carry `stopReason`, `runId`, `budget`, `spentUsd` and `warnings`.

## Cancelling

Pass an `AbortSignal` to stop reading a stream. This detaches the browser; a turn on agent-server 0.3.0+ goes on without it. To stop the run itself, call `client.cancel(conversationId)`.

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
