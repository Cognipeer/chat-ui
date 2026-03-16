# Getting Started

This guide gets your first `@cognipeer/chat-ui` surface running and helps you choose the right starting point for your product.

## When To Read This Page

Read this page if you are:

- integrating `chat-ui` for the first time
- validating that your backend contract is compatible
- deciding between the full `Chat` surface and `ChatMinimal`
- trying to get from install to a real on-screen chat without assembling lower-level primitives yourself

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

If you plan to use the built-in history experience, your backend should also expose conversation metadata and retrieval. If you only need a compact embedded chat, the integration surface can be much smaller.

## Choose Your Starting Surface

| Start with | Use it when | Trade-off |
| --- | --- | --- |
| `Chat` | You want the default product shell with history, conversation switching, uploads, and built-in layout | Less control over the overall page chrome |
| `ChatMinimal` | You want the core chat loop inside an existing app layout or support panel | No built-in history sidebar |
| Hooks + components | You need a custom workspace, router integration, or multiple coordinated panels | More assembly work up front |

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

## What You Get By Default

`Chat` is the quickest production-oriented entry point. It already handles:

- message rendering and streaming text updates
- the chat input, stop/retry interactions, and pending files
- history loading and conversation switching
- built-in tool-call display inside the assistant message flow
- theme switching through `theme` and `themeColors`

## With Authentication

If your agent server requires authentication:

```tsx
<Chat
  baseUrl="http://localhost:3000/api/agents"
  agentId="my-agent"
  authorization="Bearer your-token"
/>
```

## Minimal Embed Without History Sidebar

For a minimal chat without history:

```tsx
import { ChatMinimal } from "@cognipeer/chat-ui";

<ChatMinimal
  baseUrl="http://localhost:3000/api/agents"
  agentId="my-agent"
/>
```

Use `ChatMinimal` when the rest of the page already provides navigation, header controls, or session context.

## Production-Flavored Starting Point

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

## Recommended First Steps After It Renders

1. Confirm the chat container has a stable height and no parent layout is collapsing it.
2. Add authentication and custom headers if your backend requires them.
3. Decide whether you want the default history behavior or a custom history surface.
4. Tune theme tokens before writing any app-specific CSS overrides.
5. Validate streaming and tool-call behavior against a real backend response.

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

## First-Integration Troubleshooting

- Chat renders but has no visible height: the parent container is probably missing `height`, `h-screen`, or `h-full`.
- The UI looks unstyled: make sure `@cognipeer/chat-ui/styles.css` is imported exactly once.
- Requests are hitting the wrong backend route: double-check `baseUrl` and whether your app needs an absolute URL or a proxy path such as `/api/agents`.
- History is empty even after chatting: confirm your backend supports conversation persistence and listing, or switch to `ChatMinimal` / custom history logic.

## Next Steps

- [Theming](/guide/theming) - Customize colors and appearance
- [Streaming](/guide/streaming) - Real-time response handling
- [File Uploads](/guide/file-uploads) - Enable file attachments
- [State Management](/guide/state-management) - API-first vs React-controlled mode
- [Components](/components/chat) - Component reference
