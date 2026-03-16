---
layout: home

hero:
  name: Chat UI
  text: Ship Polished Chat Surfaces For AI Agents
  tagline: A production-ready React chat UI with streaming, tool-call rendering, history, uploads, and theme controls for real product integrations.
  image:
    src: /ChatUI.svg
    alt: Chat UI
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

If you are integrating `chat-ui` for the first time, read the docs in this order:

1. [Getting Started](/guide/getting-started) to get a working chat surface on screen quickly.
2. [Core Concepts](/guide/core-concepts) to understand the message model, streaming flow, and session behavior.
3. [Architecture](/guide/architecture) to see how components, hooks, and the agent client fit together.

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

## What This Site Covers

- A fast path from install to production-ready chat UI without rebuilding assistant surfaces from scratch.
- Clear guidance for when to use the full workspace chat, `ChatMinimal`, or lower-level hooks and building blocks.
- Practical documentation for streaming, theming, uploads, history, custom actions, and agent-server integration.
- A product-led docs surface that keeps `chat-ui` branding while using the same presentation shell as the broader Cognipeer docs stack.
