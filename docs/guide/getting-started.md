# Getting Started

This guide will help you set up `@cognipeer/chat-ui` in your React application.

## Installation

::: code-group

```bash [npm]
npm install @cognipeer/chat-ui
```

```bash [yarn]
yarn add @cognipeer/chat-ui
```

```bash [pnpm]
pnpm add @cognipeer/chat-ui
```

:::

## Prerequisites

- React 18 or later
- A running `@cognipeer/agent-server` backend (or compatible API)

## Quick Start

### 1. Import styles

```tsx
import "@cognipeer/chat-ui/styles.css";
```

### 2. Add the Chat component

```tsx
import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

function App() {
  return (
    <div className="h-screen">
      <Chat
        baseUrl="http://localhost:3000/api/agents"
        agentId="my-agent"
        theme="dark"
      />
    </div>
  );
}
```

### 3. That's it!

The Chat component will:
- Connect to your agent server
- Show a chat interface with input
- Display streaming responses
- Handle file uploads
- Show conversation history

## With Authentication

If your agent server requires authentication:

```tsx
<Chat
  baseUrl="http://localhost:3000/api/agents"
  agentId="my-agent"
  authorization="Bearer your-token"
/>
```

## Without History Sidebar

For a minimal chat without history:

```tsx
import { ChatMinimal } from "@cognipeer/chat-ui";

<ChatMinimal
  baseUrl="http://localhost:3000/api/agents"
  agentId="my-agent"
/>
```

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
        streaming={true}
        enableFileUpload={true}
        onMessageSent={(message) => {
          console.log("User sent:", message);
        }}
        onMessageReceived={(message) => {
          console.log("Agent replied:", message);
        }}
        onError={(error) => {
          console.error("Chat error:", error);
        }}
      />
    </div>
  );
}
```

## Component Sizing

The Chat component fills its container. Make sure the parent has a defined height:

```tsx
// ✅ Good - parent has height
<div className="h-screen">
  <Chat ... />
</div>

// ✅ Good - explicit height
<div style={{ height: '600px' }}>
  <Chat ... />
</div>

// ❌ Bad - no height defined
<div>
  <Chat ... />
</div>
```

## Next Steps

- [Theming](/guide/theming) - Customize colors and appearance
- [Streaming](/guide/streaming) - Real-time response handling
- [File Uploads](/guide/file-uploads) - Enable file attachments
- [State Management](/guide/state-management) - API-first vs React-controlled mode
- [Components](/components/chat) - Component reference
