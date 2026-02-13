# @cognipeer/chat-ui

A customizable React chat UI component library for AI agents. Features a ChatGPT-like dark theme, streaming support, file uploads, tool call visualization, and seamless integration with `@cognipeer/agent-server`.

## Features

- 🎨 **Customizable Theme** - Dark/light modes with full color customization
- 📡 **Streaming Support** - Real-time SSE streaming with text updates
- 📁 **File Uploads** - Built-in file attachment support
- 🔧 **Tool Call UI** - Expandable tool call visualization
- 💬 **Chat History** - Sidebar with conversation history
- 🎯 **Customizable Actions** - Add feedback buttons or custom actions to messages
- 🌍 **Internationalization** - Built-in i18n with English and Turkish support
- ⚛️ **React 18+** - Modern React with hooks
- 🎨 **Tailwind CSS** - Utility-first styling

## Installation

```bash
npm install @cognipeer/chat-ui
```

## Quick Start

### Basic Usage with Agent Server

```tsx
import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

function App() {
  return (
    <div className="h-screen">
      <Chat
        baseUrl="http://localhost:3000/api"
        agentId="my-agent"
        theme="dark"
      />
    </div>
  );
}
```

### With Authentication

```tsx
<Chat
  baseUrl="http://localhost:3000/api"
  agentId="my-agent"
  authorization="Bearer your-token-here"
  theme="dark"
/>
```

### Without History Sidebar

```tsx
import { ChatMinimal } from "@cognipeer/chat-ui";

<ChatMinimal
  baseUrl="http://localhost:3000/api"
  agentId="my-agent"
/>
```

## Custom Theme

### Using Theme Provider

```tsx
import { Chat } from "@cognipeer/chat-ui";

<Chat
  baseUrl="http://localhost:3000/api"
  agentId="my-agent"
  theme="dark"
  themeColors={{
    bgPrimary: "#1a1a2e",
    bgSecondary: "#16213e",
    bgTertiary: "#0f3460",
    textPrimary: "#eaeaea",
    textSecondary: "#a0a0a0",
    accentPrimary: "#e94560",
  }}
/>
```

### Direct Theme Provider Usage

```tsx
import { ChatThemeProvider, useChatTheme } from "@cognipeer/chat-ui";

function MyChat() {
  const { theme, setTheme } = useChatTheme();
  
  return (
    <button onClick={() => setTheme({ mode: theme.mode === "dark" ? "light" : "dark" })}>
      Toggle Theme
    </button>
  );
}

function App() {
  return (
    <ChatThemeProvider defaultMode="dark">
      <MyChat />
    </ChatThemeProvider>
  );
}
```

## Internationalization (i18n)

The library includes built-in internationalization support with English and Turkish translations. Language is detected from the URL query parameter (`?lang=en` or `?lang=tr`). If no query parameter is provided, it defaults to English (or the specified `defaultLocale`).

### Auto-detect from URL Query Parameter

```tsx
// URL: https://example.com/chat?lang=tr
<Chat
  baseUrl="http://localhost:3000/api"
  agentId="my-agent"
/>
// Will automatically use Turkish

// URL: https://example.com/chat (no query parameter)
<Chat
  baseUrl="http://localhost:3000/api"
  agentId="my-agent"
/>
// Will use English (default)
```

### Set Default Locale

```tsx
<Chat
  baseUrl="http://localhost:3000/api"
  agentId="my-agent"
  defaultLocale="tr"
/>
```

### Controlled Locale

```tsx
import { useState } from "react";
import { Chat, type SupportedLocale } from "@cognipeer/chat-ui";

function App() {
  const [locale, setLocale] = useState<SupportedLocale>("en");
  
  return (
    <>
      <button onClick={() => setLocale(locale === "en" ? "tr" : "en")}>
        Switch Language
      </button>
      <Chat
        baseUrl="http://localhost:3000/api"
        agentId="my-agent"
        locale={locale}
        onLocaleChange={setLocale}
      />
    </>
  );
}
```

### Using i18n Hook

```tsx
import { useI18n } from "@cognipeer/chat-ui";

function MyComponent() {
  const { t, locale, setLocale } = useI18n();
  
  return (
    <div>
      <p>{t("chat.input.placeholder")}</p>
      <p>Current language: {locale}</p>
      <button onClick={() => setLocale(locale === "en" ? "tr" : "en")}>
        {locale === "en" ? "Türkçe" : "English"}
      </button>
    </div>
  );
}
```

### Custom Messages

You can provide custom translations:

```tsx
import { ChatI18nProvider } from "@cognipeer/chat-ui";

<ChatI18nProvider
  defaultLocale="en"
  customMessages={{
    en: {
      "chat.input.placeholder": "Write your message here...",
    },
    tr: {
      "chat.input.placeholder": "Mesajınızı buraya yazın...",
    },
  }}
>
  <Chat baseUrl="..." agentId="..." />
</ChatI18nProvider>
```

### Supported Locales

- `en` - English (default)
- `tr` - Turkish

**Language Detection:**
1. URL query parameter (`?lang=en` or `?lang=tr`)
2. Falls back to `defaultLocale` prop (default: `en`)

All UI strings are automatically translated including:
- Input placeholders
- Button labels
- Messages
- Tooltips
- Error messages

## Custom Message Actions (Feedback)

```tsx
import { Chat, ThumbsUpIcon, ThumbsDownIcon } from "@cognipeer/chat-ui";

function MessageActions({ message, isStreaming }) {
  if (isStreaming) return null;
  
  const handleFeedback = (type: "up" | "down") => {
    console.log(`Feedback ${type} for message:`, message.id);
    // Send feedback to your API
  };
  
  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleFeedback("up")}
        className="p-1 hover:bg-gray-700 rounded"
      >
        <ThumbsUpIcon className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleFeedback("down")}
        className="p-1 hover:bg-gray-700 rounded"
      >
        <ThumbsDownIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

<Chat
  baseUrl="http://localhost:3000/api"
  agentId="my-agent"
  renderMessageActions={(props) => <MessageActions {...props} />}
/>
```

## Using Hooks Directly

For more control, use the hooks directly:

```tsx
import { useChat, ChatMessageList, ChatInput } from "@cognipeer/chat-ui";

function CustomChat() {
  const chat = useChat({
    baseUrl: "http://localhost:3000/api",
    agentId: "my-agent",
   locale` | `"en" \| "tr"` | - | Override locale (auto-detect if not set) |
| `defaultLocale` | `"en" \| "tr"` | `"en"` | Default locale |
| `onLocaleChange` | `function` | - | Callback when locale changes |
| ` streaming: true,
    onMessageReceived: (message) => {
      console.log("New message:", message);
    },
  });

  return (
    <div className="flex flex-col h-full">
      <ChatMessageList
        messages={chat.messages}
        isStreaming={chat.isLoading}
        streamingText={chat.streamingText}
      />
      <ChatInput
        onSend={chat.sendMessage}
        onStop={chat.stop}
        isLoading={chat.isLoading}
      />
    </div>
  );
}
```

## File Uploads

```tsx
<Chat
  baseUrl="http://localhost:3000/api"
  agentId="my-agent"
  enableFileUpload={true}
  allowedFileTypes={["image/*", ".pdf", ".txt"]}
  maxFileSize={10 * 1024 * 1024} // 10MB
  maxFiles={5}
/>
```

## Custom Callbacks

```tsx
<Chat
  baseUrl="http://localhost:3000/api"
  agentId="my-agent"
  onMessageSent={(message) => {
    console.log("User sent:", message);
  }}
  onMessageReceived={(message) => {
    console.log("Agent replied:", message);
  }}
  onStreamText={(chunk, fullText) => {
    console.log("Streaming:", chunk);
  }}
  onToolCall={(toolName, args) => {
    console.log("Tool called:", toolName, args);
  }}
  onToolResult={(toolName, result) => {
    console.log("Tool result:", toolName, result);
  }}
  onError={(error) => {
    console.error("Chat error:", error);
  }}
  onConversationCreated={(conversation) => {
    console.log("New conversation:", conversation);
  }}
  onConversationSelected={(conversation) => {
    console.log("Selected conversation:", conversation);
  }}
/>
```

## Custom API Integration

For non-agent-server backends, use the API client or hooks with custom implementations:

```tsx
import { useChat, AgentServerClient } from "@cognipeer/chat-ui";

// Create a custom client if needed
const customClient = new AgentServerClient({
  baseUrl: "https://your-api.com",
  agentId: "agent",
  headers: {
    "X-Custom-Header": "value",
  },
});

// Or extend the client class for fully custom implementations
```

## Components API

### `<Chat>`

Main chat component with all features.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `baseUrl` | `string` | required | Base URL for the API |
| `agentId` | `string` | required | Agent ID to use |
| `authorization` | `string` | - | Authorization header value |
| `headers` | `object` | - | Custom headers |
| `streaming` | `boolean` | `true` | Enable streaming |
| `showHistory` | `boolean` | `true` | Show history sidebar |
| `theme` | `"light" \| "dark"` | `"dark"` | Theme mode |
| `themeColors` | `object` | - | Custom colors |
| `enableFileUpload` | `boolean` | `true` | Enable file uploads |
| `renderMessageActions` | `function` | - | Custom message actions |
| `renderAvatar` | `function` | - | Custom avatar |
| `renderEmptyState` | `function` | - | Custom empty state |
| `renderHeader` | `function` | - | Custom header |

### `<ChatMinimal>`

Simplified chat without history sidebar.

### `<ChatMessage>`

Individual message component.

### `<ChatMessageList>`

List of messages with auto-scroll.

### `<ChatInput>`

Input component with file upload support.

### `<ChatHistory>`

History sidebar component.

### `<ToolCall>` / `<ToolCalls>`

Tool call visualization components.

## Hooks

### `useChat(options)`

Main chat state management hook.

Returns:
- `messages` - Current messages
- `conversation` - Current conversation
- `isLoading` - Loading state
- `streamingText` - Current streaming text
- `error` - Current error
- `pendingFiles` - Files pending upload
- `activeToolCalls` - Active tool calls
- `sendMessage(content)` - Send a message
- `addFiles(files)` - Add files
- `removeFile(id)` - Remove a file
- `clearMessages()` - Clear messages
- `loadConversation(id)` - Load a conversation
- `createConversation(title?)` - Create new conversation
- `retry()` - Retry last message
- `stop()` - Stop generation

### `useChatHistory(options)`

History management hook.

Returns:
- `conversations` - Conversation list
- `isLoading` - Loading state
- `hasMore` - Has more items
- `load()` - Load conversations

### `useI18n()`

Internationalization hook.

Returns:
- `t(key, values?)` - Translate a key
- `locale` - Current locale (`"en"` or `"tr"`)
- `setLocale(locale)` - Change locale (also updates URL query param)
- `formatNumber(value, options?)` - Format a number
- `formatDate(value, options?)` - Format a date
- `formatRelativeTime(value, unit)` - Format relative time
- `loadMore()` - Load more
- `refresh()` - Refresh list
- `deleteConversation(id)` - Delete conversation

## Styling with Tailwind

The library uses CSS variables for theming. You can override them:

```css
:root {
  --chat-bg-primary: #212121;
  --chat-bg-secondary: #171717;
  --chat-bg-tertiary: #2f2f2f;
  --chat-bg-hover: #3f3f3f;
  --chat-text-primary: #ececec;
  --chat-text-secondary: #b4b4b4;
  --chat-text-tertiary: #8e8e8e;
  --chat-text-inverse: #171717;
  --chat-border-primary: #3f3f3f;
  --chat-border-secondary: #2f2f2f;
  --chat-accent-primary: #10a37f;
  --chat-accent-secondary: #1a7f64;
}
```

## Next.js Integration

```tsx
// app/chat/page.tsx
"use client";

import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

export default function ChatPage() {
  return (
    <div className="h-screen">
      <Chat
        baseUrl="/api/agents"
        agentId="my-agent"
      />
    </div>
  );
}
```

## License

MIT
