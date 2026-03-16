---
layout: home

hero:
  name: Chat UI
  text: Ship Polished Chat Surfaces For AI Agents
  tagline: A production-ready React chat UI with streaming, tool-call rendering, history, uploads, and theme controls for real product integrations.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Study Architecture
      link: /guide/architecture

features:
  - title: Streaming That Feels Product Ready
    details: Render partial assistant output, tool-call activity, and follow-up UI without stitching together a chat surface from low-level primitives.
  - title: Tool Calls With Inspectable State
    details: Show arguments, results, and expandable tool traces in a way that fits operational agent workflows instead of generic message bubbles.
  - title: History, Sessions, And Workspace Chat
    details: Move from a minimal single-thread chat to a full sidebar-based conversation experience without changing your application model.
  - title: Theming Without Forking The UI
    details: Tune dark and light surfaces, accent colors, spacing, and overrides through tokens and props while keeping the core interaction model intact.
  - title: Uploads, Feedback, And Product Hooks
    details: Add file attachments, custom message actions, and integration hooks where teams usually end up rebuilding the chat stack by hand.
  - title: React Integration That Scales
    details: Use the full `Chat` surface, `ChatMinimal`, lower-level hooks, or component composition patterns depending on how much control your product needs.
---

## Start Here

If you are integrating `chat-ui` for the first time, this is the shortest useful reading order:

1. [Getting Started](/guide/getting-started) to get a working chat surface on screen quickly.
2. [Core Concepts](/guide/core-concepts) to understand the message model, streaming flow, and session behavior.
3. [Architecture](/guide/architecture) to see how components, hooks, and the agent client fit together.

If you already know the basics, jump directly to the section that matches your task:

- Need a full-screen product surface with built-in history? Start with [Chat](/components/chat) and [History](/guide/history).
- Need a compact embed or support panel? Start with [ChatMinimal](/components/chat-minimal) and [Theming](/guide/theming).
- Need to own the layout yourself? Start with [API Reference](/api/) and [Architecture](/guide/architecture).

## Choose Your Integration Path

| Start with | Best for | What you get |
| --- | --- | --- |
| `Chat` | Product teams that want the fastest path to a complete workspace chat | Built-in message list, input, history sidebar, streaming, uploads, and conversation management |
| `ChatMinimal` | Embedded assistants, widgets, and narrow layouts | The same chat loop without the workspace-style history shell |
| Hooks + components | Teams that need custom chrome, app-specific panels, or cross-page orchestration | Control over layout and state ownership while reusing the library's networking and rendering primitives |

## Quick Start

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

## Docs Map

- [Guide](/guide/getting-started): task-focused setup, concepts, theming, uploads, history, and integration guidance.
- [Architecture](/guide/architecture): how the library is layered, where state lives, and what to customize at each level.
- [API Reference](/api/): hooks, providers, client utilities, and shared types for custom implementations.
- [Examples](/examples/): compact patterns you can copy into a product integration.
- [Components](/components/): surface-level component details once you know which entry point you need.

## Production Checklist

- Confirm your backend can accept messages, stream assistant output, and return conversation metadata if you plan to use history.
- Give the parent container an explicit height so the chat shell can size correctly.
- Decide early whether you want the full `Chat` surface, `ChatMinimal`, or a custom hook-driven layout.
- Set theme tokens before writing brittle CSS overrides. Start with [Theming](/guide/theming).
- Decide how tool calls should appear in your product and whether the default inline rendering is enough.
- If you need persistent sessions, define your history strategy up front with [History](/guide/history).

## What This Site Covers

- A fast path from install to production-ready chat UI without rebuilding assistant surfaces from scratch.
- Clear guidance for when to use the full workspace chat, `ChatMinimal`, or lower-level hooks and building blocks.
- Practical documentation for streaming, theming, uploads, history, custom actions, and agent-server integration.
- A product-led docs surface that keeps `chat-ui` branding while using the same presentation shell as the broader Cognipeer docs stack.
