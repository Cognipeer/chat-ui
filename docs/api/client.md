# AgentServerClient

Low-level API client for direct communication with agent-server.

## Import

```tsx
import { AgentServerClient } from "@cognipeer/chat-ui";
```

## Constructor

```tsx
const client = new AgentServerClient({
  baseUrl: "/api/agents",
  agentId: "assistant",
  authorization?: "Bearer token",
  headers?: { "X-Custom": "value" },
});
```

## Options

```typescript
interface AgentServerClientOptions {
  baseUrl: string;
  agentId: string;
  authorization?: string;
  headers?: Record<string, string>;
}
```

## Methods

### Conversations

#### listConversations

```tsx
const { conversations, totalCount } = await client.listConversations({
  limit?: 20,
  offset?: 0,
});
```

#### getConversation

```tsx
const { conversation } = await client.getConversation(conversationId);
```

#### createConversation

```tsx
const { conversation } = await client.createConversation({
  title?: "New Chat",
});
```

#### updateConversation

```tsx
const { conversation } = await client.updateConversation(conversationId, {
  title: "Updated Title",
});
```

#### deleteConversation

```tsx
await client.deleteConversation(conversationId);
```

### Messages

#### getMessages

```tsx
const { messages } = await client.getMessages(conversationId, {
  limit?: 50,
  offset?: 0,
});
```

#### sendMessage

```tsx
const { message } = await client.sendMessage(conversationId, {
  message: "Hello!",
  streaming?: false,
  fileIds?: ["file-1", "file-2"],
});
```

#### streamMessage

```tsx
for await (const event of client.streamMessage(conversationId, {
  message: "Hello!",
  fileIds?: [],
})) {
  switch (event.type) {
    case "stream.start":
      console.log("Started");
      break;
    case "stream.text":
      console.log("Text:", event.text);
      break;
    case "stream.tool_call":
      console.log("Tool:", event.name, event.arguments);
      break;
    case "stream.tool_result":
      console.log("Result:", event.callId, event.result);
      break;
    case "stream.done":
      console.log("Done:", event.message);
      break;
    case "stream.error":
      console.error("Error:", event.error);
      break;
  }
}
```

### Files

#### uploadFile

```tsx
const { file } = await client.uploadFile(conversationId, file);
```

#### getFile

```tsx
const { file } = await client.getFile(conversationId, fileId);
```

#### deleteFile

```tsx
await client.deleteFile(conversationId, fileId);
```

## Examples

### Basic Usage

```tsx
const client = new AgentServerClient({
  baseUrl: "/api/agents",
  agentId: "assistant",
});

// Create conversation
const { conversation } = await client.createConversation();

// Send message
const { message } = await client.sendMessage(conversation.id, {
  message: "Hello!",
});

console.log("Response:", message.content);
```

### With Streaming

```tsx
const client = new AgentServerClient({
  baseUrl: "/api/agents",
  agentId: "assistant",
});

const { conversation } = await client.createConversation();

let fullText = "";

for await (const event of client.streamMessage(conversation.id, {
  message: "Tell me a story",
})) {
  if (event.type === "stream.text") {
    fullText += event.text;
    console.log("Current:", fullText);
  }
}

console.log("Final:", fullText);
```

### With Files

```tsx
const client = new AgentServerClient({
  baseUrl: "/api/agents",
  agentId: "assistant",
});

const { conversation } = await client.createConversation();

// Upload file
const fileInput = document.querySelector("input[type=file]");
const { file } = await client.uploadFile(
  conversation.id,
  fileInput.files[0]
);

// Send with file
for await (const event of client.streamMessage(conversation.id, {
  message: "Analyze this file",
  fileIds: [file.id],
})) {
  // Handle events
}
```

### With Authentication

```tsx
const client = new AgentServerClient({
  baseUrl: "/api/agents",
  agentId: "assistant",
  authorization: `Bearer ${getAccessToken()}`,
});
```

### Error Handling

```tsx
try {
  const { message } = await client.sendMessage(conversationId, {
    message: "Hello",
  });
} catch (error) {
  if (error.status === 401) {
    // Unauthorized - refresh token
    await refreshToken();
  } else if (error.status === 404) {
    // Conversation not found
    await createNewConversation();
  } else {
    // Other error
    console.error(error);
  }
}
```

### Custom Fetch

```tsx
const client = new AgentServerClient({
  baseUrl: "/api/agents",
  agentId: "assistant",
  fetch: (url, options) => {
    // Custom fetch implementation
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
});
```

## Stream Events

```typescript
type StreamEvent =
  | { type: "stream.start" }
  | { type: "stream.text"; text: string }
  | { type: "stream.tool_call"; callId: string; name: string; arguments: string }
  | { type: "stream.tool_result"; callId: string; result: any }
  | { type: "stream.done"; message: Message }
  | { type: "stream.error"; error: string };
```

## AbortController

```tsx
const controller = new AbortController();

// Cancel after 30 seconds
setTimeout(() => controller.abort(), 30000);

try {
  for await (const event of client.streamMessage(
    conversationId,
    { message: "Long task..." },
    { signal: controller.signal }
  )) {
    // Handle events
  }
} catch (error) {
  if (error.name === "AbortError") {
    console.log("Cancelled");
  }
}
```

## Related

- [useChat Hook](/api/use-chat)
- [Types](/api/types)
- [Agent Server Integration](/guide/agent-server)
