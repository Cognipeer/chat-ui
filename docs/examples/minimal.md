# Minimal

Chat without history sidebar.

## Using ChatMinimal

```tsx
import { ChatMinimal } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

export default function MinimalChat() {
  return (
    <div className="h-screen bg-gray-900">
      <ChatMinimal
        baseUrl="/api/agents"
        agentId="assistant"
        theme="dark"
      />
    </div>
  );
}
```

## Using Chat with showHistory=false

```tsx
import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

export default function ChatNoHistory() {
  return (
    <div className="h-screen bg-gray-900">
      <Chat
        baseUrl="/api/agents"
        agentId="assistant"
        showHistory={false}
      />
    </div>
  );
}
```

## Embedded Widget

```tsx
import { ChatMinimal } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";
import { useState } from "react";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Main page content */}
      <main className="p-8">
        <h1>My App</h1>
        <p>Your main content here...</p>
      </main>
      
      {/* Floating chat button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 w-14 h-14 bg-green-600 text-white rounded-full shadow-lg"
      >
        💬
      </button>
      
      {/* Chat popup */}
      {open && (
        <div className="fixed bottom-20 right-4 w-96 h-[500px] shadow-2xl rounded-lg overflow-hidden">
          <ChatMinimal
            baseUrl="/api/agents"
            agentId="assistant"
            theme="dark"
          />
        </div>
      )}
    </>
  );
}
```

## With Fixed Conversation

```tsx
<ChatMinimal
  baseUrl="/api/agents"
  agentId="assistant"
  conversationId="conv-123"
/>
```

## In a Split Layout

```tsx
import { ChatMinimal } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

export default function SplitLayout() {
  return (
    <div className="flex h-screen">
      {/* Content side */}
      <main className="flex-1 p-8 overflow-y-auto">
        <h1>Documentation</h1>
        <p>Your documentation content...</p>
      </main>
      
      {/* Chat side */}
      <aside className="w-[400px] border-l border-gray-700">
        <ChatMinimal
          baseUrl="/api/agents"
          agentId="docs-helper"
          theme="dark"
        />
      </aside>
    </div>
  );
}
```

## When to Use

Use **ChatMinimal** when:
- Embedding chat in a larger UI
- Building a chat widget
- Don't need conversation persistence
- Want a simpler interface

Use **Chat** when:
- Building a dedicated chat page
- Need conversation history
- Want full features

## Related

- [ChatMinimal Component](/components/chat-minimal)
- [Basic Usage](/examples/basic)
- [Custom Hooks](/examples/custom-hooks)
