# Basic Usage

A simple chat implementation with default settings.

## Full Example

```tsx
import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

export default function ChatPage() {
  return (
    <div className="h-screen bg-gray-900">
      <Chat
        baseUrl="/api/agents"
        agentId="assistant"
        theme="dark"
      />
    </div>
  );
}
```

## Step by Step

### 1. Install the package

```bash
npm install @cognipeer/chat-ui
```

### 2. Import styles

```tsx
import "@cognipeer/chat-ui/styles.css";
```

### 3. Add the Chat component

```tsx
import { Chat } from "@cognipeer/chat-ui";

<Chat
  baseUrl="/api/agents"
  agentId="assistant"
/>
```

### 4. Ensure proper sizing

The Chat component fills its container:

```tsx
<div className="h-screen">
  <Chat ... />
</div>
```

## With Authentication

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  authorization="Bearer your-token"
/>
```

## With Callbacks

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  onMessageSent={(message) => {
    console.log("User sent:", message.content);
  }}
  onMessageReceived={(message) => {
    console.log("Agent replied:", message.content);
  }}
  onError={(error) => {
    console.error("Error:", error.message);
  }}
/>
```

## Next.js Example

```tsx
// app/chat/page.tsx
"use client";

import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

export default function ChatPage() {
  return (
    <main className="h-screen">
      <Chat
        baseUrl="/api/agents"
        agentId="assistant"
        theme="dark"
      />
    </main>
  );
}
```

## Result

The basic setup gives you:

- ✅ Dark themed chat interface
- ✅ Message streaming
- ✅ Conversation history sidebar
- ✅ File upload support
- ✅ Tool call visualization
- ✅ Auto-scroll
- ✅ Responsive design

## Related

- [Custom Theme](/examples/custom-theme)
- [Minimal](/examples/minimal)
- [Getting Started](/guide/getting-started)
