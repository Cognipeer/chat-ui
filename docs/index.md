---
layout: home

hero:
  name: Chat UI
  text: React Chat Components for AI Agents
  tagline: Customizable, streaming-ready chat UI with dark/light themes, file uploads, and tool visualization
  image:
    src: /logo.svg
    alt: Chat UI
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/Cognipeer/chat-ui

features:
  - icon: 🎨
    title: Customizable Theme
    details: Dark and light modes with full color customization via CSS variables or props.
  - icon: 📡
    title: Streaming Support
    details: Real-time SSE streaming with text updates and tool call visualization.
  - icon: 📁
    title: File Uploads
    details: Built-in file attachment support with drag-and-drop and preview.
  - icon: 🔧
    title: Tool Call UI
    details: Expandable tool call visualization with arguments and results.
  - icon: 💬
    title: Chat History
    details: Sidebar with conversation history, search, and management.
  - icon: 🎯
    title: Customizable Actions
    details: Add feedback buttons, copy, or custom actions to messages.
  - icon: ⚛️
    title: React 18+
    details: Modern React with hooks, TypeScript support, and server components ready.
  - icon: 🎨
    title: Tailwind CSS
    details: Utility-first styling with easy customization.
---

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

## Basic Usage

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

## Features at a Glance

### Dark Theme (Default)

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  theme="dark"
/>
```

### Light Theme

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  theme="light"
/>
```

### With Authentication

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  authorization="Bearer your-token"
/>
```

### Minimal (No History)

```tsx
import { ChatMinimal } from "@cognipeer/chat-ui";

<ChatMinimal
  baseUrl="/api/agents"
  agentId="assistant"
/>
```

### Custom Theme Colors

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  themeColors={{
    bgPrimary: "#1a1a2e",
    bgSecondary: "#16213e",
    accentPrimary: "#e94560",
  }}
/>
```
