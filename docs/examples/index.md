# Examples

Learn by exploring practical examples of Chat UI usage.

## Getting Started

- [Basic Usage](/examples/basic) - Simple chat implementation
- [Custom Theme](/examples/custom-theme) - Theming and colors
- [Minimal](/examples/minimal) - Without history sidebar

## Advanced

- [With Feedback](/examples/with-feedback) - Add feedback buttons
- [Custom Hooks](/examples/custom-hooks) - Build with hooks and context

## Live Examples

Check out the [chat-ui-examples](https://github.com/Cognipeer/chat-ui-examples) repository for runnable examples.

## Code Snippets

### Quick Start

```tsx
import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

function App() {
  return (
    <div className="h-screen">
      <Chat
        baseUrl="/api/agents"
        agentId="assistant"
      />
    </div>
  );
}
```

### With All Features

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  theme="dark"
  streaming={true}
  showHistory={true}
  enableFileUpload={true}
  allowedFileTypes={["image/*", ".pdf"]}
  maxFileSize={10 * 1024 * 1024}
  onMessageSent={(msg) => console.log("Sent:", msg)}
  onMessageReceived={(msg) => console.log("Received:", msg)}
  onError={(err) => console.error(err)}
  renderMessageActions={({ message, isStreaming }) => {
    if (isStreaming || message.role !== "assistant") return null;
    return (
      <div>
        <button>👍</button>
        <button>👎</button>
      </div>
    );
  }}
/>
```

### Custom Implementation

```tsx
import { useChat, ChatMessageList, ChatInput } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

function CustomChat() {
  const {
    messages,
    isLoading,
    streamingText,
    sendMessage,
    stop,
  } = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  return (
    <div className="flex flex-col h-screen">
      <header className="p-4 border-b">
        <h1>My Custom Chat</h1>
      </header>
      
      <ChatMessageList
        messages={messages}
        isLoading={isLoading}
        streamingText={streamingText}
      />
      
      <ChatInput
        onSubmit={sendMessage}
        isLoading={isLoading}
        onStop={stop}
      />
    </div>
  );
}
```

## Related

- [Getting Started](/guide/getting-started)
- [Components](/components/chat)
- [Hooks](/api/hooks)
