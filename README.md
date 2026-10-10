# @cognipeer/chat-ui

A customizable React chat UI component library for AI agents. Features a ChatGPT-like dark theme, streaming support, file uploads, tool call visualization, and seamless integration with `@cognipeer/agent-server`.


Documentation: <https://docs.cognipeer.com/chat-ui/guide/getting-started>
## Features

- 🎨 **Customizable Theme** - Dark/light modes with full color customization
- 📡 **Streaming Support** - Real-time SSE streaming with text updates
- 📁 **File Uploads** - Pick, drag and drop or paste files; image thumbnails; send files without text
- 🔧 **Tool Call UI** - Expandable tool call visualization
- ✅ **Approvals and Questions** - Approve tool calls and answer agent questions inline (agent-server 0.3.0+, see `docs/guide/approvals.md`)
- 💬 **Chat History** - Sidebar with conversation history
- 🎯 **Customizable Actions** - Add feedback buttons or custom actions to messages
- 🌍 **Internationalization** - English and Turkish built in, your own strings and locales on top; friendly messages for server error codes
- ♿ **Accessible** - Labelled controls, a live message log, focus moved to approval and question cards
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

Replace or add strings with the `customMessages` prop of `Chat`, or with a `ChatI18nProvider` around it. `Chat` honours an enclosing provider: its locale applies unless `locale` is given, and its custom messages are merged under the ones given to `Chat`.

```tsx
import { Chat } from "@cognipeer/chat-ui";

<Chat
  baseUrl="..."
  agentId="..."
  customMessages={{
    en: { "chat.input.placeholder": "Write your message here..." },
    tr: { "chat.input.placeholder": "Mesajınızı buraya yazın..." },
  }}
/>
```

```tsx
import { Chat, ChatI18nProvider } from "@cognipeer/chat-ui";

<ChatI18nProvider locale="tr" customMessages={{ tr: { "chat.input.placeholder": "Bir şey sorun..." } }}>
  <Chat baseUrl="..." agentId="..." />
</ChatI18nProvider>
```

### Another language

Any locale code works once its strings are supplied; keys you leave out fall back to English, key by key:

```tsx
<Chat locale="de" customMessages={{ de: { "chat.input.placeholder": "Nachricht eingeben...", "chat.input.send": "Senden" } }} />
```

The message keys are in `src/locales/en.json`.

### Server error messages

A failed request whose `code` the library knows (`conversation_busy`, `rate_limited`, `action_expired`, `file_too_large`, ...) is shown as a localized, friendly message (`chat.error.code.<code>`) instead of the server's English text. The error keeps its `code` and `status`, and the server's own wording is on `serverMessage`. Codes without a string show the server's message. Override a string like any other (`customMessages`).

### Supported Locales

- `en` - English (default)
- `tr` - Turkish
- any other code, with `customMessages`

**Language Detection:**
1. The `locale` prop, or the locale of an enclosing `ChatI18nProvider`
2. URL query parameter (`?lang=en` or `?lang=tr`)
3. Falls back to `defaultLocale` prop (default: `en`)

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

For more control, use the hooks directly. A custom layout shows approval and question cards through `actions`, and the composer follows `pendingMode`:

```tsx
import { useChat, ChatMessageList, ChatInput } from "@cognipeer/chat-ui";

function CustomChat() {
  const chat = useChat({
    baseUrl: "http://localhost:3000/api",
    agentId: "my-agent",
    streaming: true,
    onMessageReceived: (message) => {
      console.log("New message:", message);
    },
  });

  // What the composer does while an approval or question is waiting
  const pendingMode = !chat.awaitingAction
    ? undefined
    : chat.answerableQuestion
      ? "answer"
      : "blocked"; // or "cancel", if the server's pendingActionPolicy is "cancel"

  return (
    <div className="flex flex-col h-full">
      <ChatMessageList
        messages={chat.messages}
        isStreaming={chat.isStreaming}
        streamingText={chat.streamingText}
        // Without `actions`, approvals and questions show as read-only
        actions={{ onResolve: chat.resolveAction, canResolve: chat.canResolveActions }}
      />
      <ChatInput
        onSend={(text) =>
          chat.answerableQuestion && pendingMode === "answer"
            ? chat.resolveAction(chat.answerableQuestion.actionId, {
                type: "user_question",
                answers: { [chat.answerableQuestion.question.question]: text },
              })
            : chat.sendMessage(text)
        }
        onStop={chat.stop}
        isLoading={chat.isStreaming}
        isUploading={chat.isUploading}
        pendingMode={pendingMode}
        pendingFiles={chat.pendingFiles}
        onFilesAdd={chat.addFiles}
        onFileRemove={chat.removeFile}
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

Files are attached with the paperclip, by dropping them on the composer, or by pasting (a screenshot or a copied file). Images show as thumbnails in the composer and in the conversation. A message can carry files and no text (`attachmentsOnlyMessage` sets the text that goes with it). An agent that says `metadata.acceptsImages: false` gets a warning when an image is attached. See `docs/guide/file-uploads.md`.

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
| `baseUrl` | `string` | required unless `transport` | Base URL for the API |
| `transport` | `ChatTransport` | - | Another backend (see `docs/guide/transports.md`) |
| `agentId` | `string` | first agent | Agent ID to use |
| `authorization` | `string` | - | Authorization header value |
| `headers` | `object` | - | Custom headers |
| `getHeaders` | `function` | - | Fresh headers before every request |
| `streaming` | `boolean` | `true` | Enable streaming |
| `showHistory` | `boolean` | `true` | Show history sidebar |
| `theme` | `"light" \| "dark"` | `"dark"` | Theme mode |
| `themeColors` | `ChatTheme["colors"]` | - | Custom colors, including `success` / `danger` / `warning` / `info` (and `...Bg`) |
| `locale` | `string` | enclosing provider, else auto-detect | Override locale |
| `defaultLocale` | `string` | `"en"` | Default locale |
| `onLocaleChange` | `function` | - | Callback when locale changes |
| `customMessages` | `Record<locale, Record<key, string>>` | - | Replace or add UI strings |
| `enableFileUpload` | `boolean` | `true` | Enable file uploads |
| `allowedFileTypes`, `maxFileSize`, `maxFiles` | | any, 10 MB, 10 | Upload limits (an agent's `metadata` can narrow them) |
| `fileTransport` | `"inline" \| "upload"` | `"inline"` | Files in the message body, or uploaded first |
| `attachmentsOnlyMessage` | `string` | localized "review the attached files" | Text sent with files and no typed text (`""` sends none) |
| `enableToolApprovals`, `enableQuestions` | `boolean` | `true` | Answer approvals / questions in this app |
| `allowArgumentEdit` | `boolean` | `false` | Edit a tool call's arguments in the approval card |
| `expiryWarningSeconds` | `number` | `600` | Cards turn amber with this much time left |
| `pendingActionComposerMode` | `"block" \| "cancel"` | `"block"` | Composer while a card waits |
| `renderToolApproval`, `renderQuestion` | `function` | - | Replace a card |
| `renderImage` | `function` | - | Draw images yourself (e.g. fetch with credentials) |
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
- `pendingFiles` - Files pending upload (images carry a local `previewUrl`)
- `isUploading` - Files are being read or uploaded for a message being sent
- `activeToolCalls` - Active tool calls
- `pendingActions`, `awaitingAction`, `isResolvingAction`, `canResolveActions`, `answerableQuestion`, `resolveAction(actionId, resolution)` - Approvals and questions (see `docs/guide/approvals.md`)
- `sendMessage(content)` - Send a message
- `addFiles(files)` - Add files
- `removeFile(id)` - Remove a file
- `clearMessages()` - Clear messages
- `loadConversation(id)` - Load a conversation
- `createConversation(title?)` - Create new conversation
- `retry()` - Retry last message
- `stop()` - Stop generation (detaches from the stream; it does not cancel the run on the server)

### `useChatHistory(options)`

History management hook.

Returns:
- `conversations` - Conversation list
- `isLoading` - Loading state
- `hasMore` - Has more items
- `load()` - Load conversations
- `loadMore()` - Load more
- `refresh()` - Refresh list
- `deleteConversation(id)` - Delete conversation

### `useI18n()`

Internationalization hook.

Returns:
- `t(key, values?)` - Translate a key
- `locale` - Current locale code
- `has(key)` - Whether a message exists for the key
- `setLocale(locale)` - Change locale (also updates URL query param)
- `formatNumber(value, options?)` - Format a number
- `formatDate(value, options?)` - Format a date
- `formatRelativeTime(value, unit)` - Format relative time

Outside a `ChatI18nProvider` the hook answers in English.

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
  /* status colours, each with a tinted background */
  --chat-success: #34d399;
  --chat-success-bg: rgba(16, 185, 129, 0.12);
  --chat-danger: #f87171;
  --chat-danger-bg: rgba(239, 68, 68, 0.12);
  --chat-warning: #fbbf24;
  --chat-warning-bg: rgba(245, 158, 11, 0.14);
  --chat-info: #60a5fa;
  --chat-info-bg: rgba(59, 130, 246, 0.12);
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
