# Streaming

Real-time response streaming with SSE support.

## Overview

Chat UI supports Server-Sent Events (SSE) for real-time streaming of AI responses. This provides a better user experience as users see the response as it's generated.

## Enable Streaming

Streaming is enabled by default:

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  streaming={true}  // Default
/>
```

To disable streaming:

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  streaming={false}
/>
```

## Stream Events

The chat handles these SSE events:

### Text Streaming

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  onStreamText={(chunk, fullText) => {
    console.log("Chunk:", chunk);
    console.log("Full text so far:", fullText);
  }}
/>
```

### Tool Calls

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  onToolCall={(toolName, args) => {
    console.log("Tool called:", toolName);
    console.log("Arguments:", args);
  }}
  onToolResult={(toolName, result) => {
    console.log("Tool result:", toolName, result);
  }}
/>
```

## Stream UI Behavior

While streaming:

1. **Typing indicator** - Shows while waiting for response
2. **Incremental text** - Text appears as it's received
3. **Tool calls** - Displayed inline as they occur
4. **Stop button** - Stops the turn (on agent-server 0.3.0+ the run itself, see [Running turns](/guide/runs))

## A stream is not the run

On `@cognipeer/agent-server` 0.3.0 or later a streamed request is only a *subscriber* of the run that executes the turn. If the connection drops, the page does not report a failure: the turn goes on without it, so the page looks at the conversation again and follows what is still running (`GET /conversations/:id/events/stream`) or shows what finished. Every `stream.*` frame carries `seq`, the position in the conversation's event log, and `stream.done` carries `stopReason` (`end_turn`, `cancelled`, `limit`, `budget_reached`, ...), `runId` and - for a conversation with a usage limit - `budget` and `spentUsd`. A stopped answer gets a notice, see [Running turns](/guide/runs#why-an-answer-ended).

## Stop Streaming

Users can stop the stream using the stop button, or programmatically. With a transport that can cancel (`AgentServerClient`) `stop()` stops the run on the server, closes the stream and keeps the text received so far as an answer marked stopped; otherwise it only closes the connection:

```tsx
import { useChat } from "@cognipeer/chat-ui";

function CustomChat() {
  const { isLoading, stop, sendMessage } = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  return (
    <div>
      {isLoading && (
        <button onClick={stop}>
          Stop Generation
        </button>
      )}
    </div>
  );
}
```

## Streaming State

Track streaming state with hooks:

```tsx
import { useChat } from "@cognipeer/chat-ui";

function CustomChat() {
  const {
    isLoading,      // True while streaming
    streamingText,  // Current accumulated text
    activeToolCalls,// Map of active tool calls
  } = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  return (
    <div>
      {isLoading && <div>Generating...</div>}
      {streamingText && <div>Current: {streamingText}</div>}
    </div>
  );
}
```

## Error Handling

Handle stream errors:

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  onError={(error) => {
    console.error("Stream error:", error);
    // Show error notification
  }}
/>
```

## Retry Failed Requests

```tsx
import { useChat } from "@cognipeer/chat-ui";

function CustomChat() {
  const { error, retry } = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  return (
    <div>
      {error && (
        <div>
          <p>Error: {error.message}</p>
          <button onClick={retry}>Retry</button>
        </div>
      )}
    </div>
  );
}
```

## Custom Stream Handler

For custom implementations, use the API client directly:

```tsx
import { AgentServerClient } from "@cognipeer/chat-ui";

const client = new AgentServerClient({
  baseUrl: "/api/agents",
  agentId: "assistant",
});

async function streamMessage(conversationId: string, message: string) {
  const response = await client.sendMessage(conversationId, {
    message,
    streaming: true,
  });

  for await (const event of response.stream) {
    switch (event.type) {
      case "stream.start":
        console.log("Stream started");
        break;
      case "stream.text":
        console.log("Text:", event.text);
        break;
      case "stream.tool_call":
        console.log("Tool:", event.name, event.arguments);
        break;
      case "stream.done":
        console.log("Done:", event.message);
        break;
    }
  }
}
```

## Performance

Tips for optimal streaming performance:

1. **Use efficient selectors** - Avoid re-rendering the entire message list
2. **Virtualization** - Consider virtual scrolling for long conversations
3. **Debounce updates** - Throttle UI updates if needed

```tsx
// The built-in components handle this automatically
<ChatMessageList
  messages={messages}
  isStreaming={isLoading}
  streamingText={streamingText}
/>
```

## Next Steps

- [File Uploads](/guide/file-uploads)
- [Tool Calls](/guide/tool-calls)
- [useChat Hook](/api/use-chat)
