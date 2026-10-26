# @cognipeer/chat-ui

**Customizable React chat UI for AI agents, with streaming, file uploads, tool-call visualization and a ready-made connection to `@cognipeer/agent-server`.**

[![npm version](https://img.shields.io/npm/v/@cognipeer/chat-ui)](https://www.npmjs.com/package/@cognipeer/chat-ui) [![npm downloads](https://img.shields.io/npm/dm/@cognipeer/chat-ui)](https://www.npmjs.com/package/@cognipeer/chat-ui) [![license](https://img.shields.io/github/license/Cognipeer/chat-ui)](LICENSE) [![docs](https://img.shields.io/badge/docs-docs.cognipeer.com-0A7CFF)](https://docs.cognipeer.com/chat-ui/) [![GitHub stars](https://img.shields.io/github/stars/Cognipeer/chat-ui?style=social)](https://github.com/Cognipeer/chat-ui)

[Docs](https://docs.cognipeer.com/chat-ui/) · [Quick start](#quick-start) · [Changelog](docs/changelog.md) · [Contact](mailto:developer@cognipeer.com)

A customizable React chat UI component library for AI agents. Features a ChatGPT-like dark theme, streaming support, file uploads, tool call visualization, and seamless integration with `@cognipeer/agent-server`.


Documentation: <https://docs.cognipeer.com/chat-ui/guide/getting-started>
## Features

- 🎨 **Customizable Theme** - Dark/light modes with full color customization
- 📡 **Streaming Support** - Real-time SSE streaming with text updates
- 📁 **File Uploads** - Pick, drag and drop or paste files; image thumbnails; send files without text
- 🔧 **Tool Call UI** - Expandable tool call visualization
- ✅ **Approvals and Questions** - Approve tool calls and answer agent questions inline (agent-server 0.3.0+, see `docs/guide/approvals.md`)
- 🔁 **Runs that outlive the page** - Reload in the middle of a turn and it is picked up again, a dropped connection is not an error, and Stop really stops the run on the server (see `docs/guide/runs.md`)
- 💸 **Usage limits** - A meter, a "limit reached" notice and, where the host allows, raise-and-continue (see `docs/guide/budgets.md`)
- 💬 **Chat History** - Sidebar with conversation history, status badges (working, waiting for you, limit reached) and keyboard-operable rows
- 🎯 **Customizable Actions** - Add feedback buttons or custom actions to messages
- 🏢 **Portal experience** - Copy / regenerate / edit, thumbs with reasons, rename / pin / bulk-delete history, starters and a Markdown welcome, deep links, AI label and legal links, announcements, a terms gate, export and background alerts - each off until you switch it on (see `docs/guide/portal-experience.md`)
- 🪟 **Embeddable** - `EmbedChat` runs in an iframe signed in with an identity token your server signs: strict `postMessage` origin checks, an in-memory bearer session that renews itself, events for the host page and tools of the host page the agent can call (see `docs/guide/embed.md`)
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

## Choosing a model

When the agent advertises two or more `models` (`AgentInfo.models`, agent-server >= 0.4.0), the composer shows a `ModelPicker` pill left of the send button. The pick is kept per conversation (a reopened conversation shows the model of its last answer; a new chat starts on the default) and is sent as `model` with every message, regenerate and edit.

```tsx
<Chat baseUrl="/api/agents" agentId="support" showAnsweredWith /> {/* "Answered with <model>" under answers (default true) */}
```

The picker is keyboard accessible (arrows, Home/End, Enter, Escape), follows the theme tokens and becomes a bottom sheet on narrow screens. A divider marks a change of model in the thread. Use it on its own: `<ModelPicker models={...} value={key} onChange={setKey} />`; with `useChat`, pass `getModel: () => key`. Answers report their model in `metadata.model` (also `metadata.agentModel`, `metadata.cognipeer.agent_model`).

## Reasoning ("Thinking")

When the server streams the model's reasoning (agent-server >= 0.5.0, `stream.thinking`), it is kept apart from the answer: each assistant message carries `reasoning`, shown in a collapsible, keyboard accessible "Thinking" block above the answer (open while the model is still reasoning, folded once the answer starts). Reasoning is plain text and follows the theme tokens; strings are `chat.reasoning.*` (English, Turkish). Stored messages that carry `metadata.reasoning` / `metadata.thinking` show it too.

```tsx
<Chat baseUrl="/api/agents" agentId="support" showReasoning={false} /> {/* hide the block (default true) */}
<Chat baseUrl="/api/agents" agentId="support" reasoningEffort="high" /> {/* sent with each message; no picker yet */}
```

An agent with `AgentInfo.showReasoning === false` never shows the block. With `useChat`, `streamingReasoning` holds the reasoning of the running turn and `getReasoningEffort: () => "low"` sets the effort sent (`none` | `minimal` | `low` | `medium` | `high`, also `SendMessageOptions.reasoningEffort`). Use the block on its own: `<ThinkingBlock reasoning={text} />`. A custom `StreamCallbacks` gets `onThinking(text, fullThinking)`.

## Plan and activity

When the agent keeps a plan (agent-server >= 0.9.0, `capabilities.plan`, `stream.plan` frames) the chat shows it as a card above the live answer: "Plan · 2 of 5", a thin progress bar, a collapse button (`aria-expanded`) and one row per step with its status (not started, in progress, completed, blocked); the step in progress is bold. Only titles and status are shown. While the agent condenses its earlier context (`stream.compaction`, `phase: "start"`) a line says "Condensing earlier context…" until the pass is `done` or `skipped`. Nothing shows for an agent that sends neither.

When the turn is over, the plan stays above the answer as a collapsed card ("Plan ✓ 5 of 5 done"; open by default while the plan is not complete). In `appearance="modern"` the "Worked for 24s" timeline also lists, in the order they happened, the calls, "Plan created · 5 steps", "Plan updated · 2 of 5" and an "Earlier context condensed" divider for each condensing pass. The classic appearance shows the plan card only.

`useChat` writes what it saw into the finished message, so a reload shows the same; a server that keeps the history (the Console portal) writes the same shape:

```ts
message.metadata.plan      // PlanSnapshot: { version?, operation?, steps: [{ id?, title, status }] } - the latest plan of the turn
message.metadata.activity  // ActivityEntry[], in the order it happened:
//   { kind: 'tool', id?, name, label?, status?: 'ok' | 'error' }
//   { kind: 'plan', version?, done, total, created? }
//   { kind: 'compaction', id? }
//   { kind: 'text', text }     - words the agent wrote before a tool call ("Let me look that up.")
```

A model that announces its calls (Claude models do) writes the announcement in the same text stream as its answer. Once a tool starts after some words, `useChat` keeps those words as a `text` entry ahead of the call, sets `workingAfterText` so the list shows what runs now under them, and starts the shown text afresh with the next words: the answer is not glued to the announcement.

A plan frame says what the agent did to the plan in `operation` (`"write"`: it wrote the plan out, `"update"`: it changed steps of the plan it had; agent-server >= 0.9.0 sends it). That is what tells "Plan created" (`created: true`) from "Plan updated". A server that does not send it gets its first plan of a turn marked created. A turn that paused for an answer goes on with the plan it had when it carries on (an answer, `continueConversation`, or a followed run whose `session.status_running` has `trigger: "resume"` or `"timeout"`): what the plan does next is an update, and the message of that leg keeps `metadata.plan` only when the leg wrote or changed it, so the card is drawn once.

A message without `metadata.activity` lists its calls, then its reasoning, as before. A custom `StreamCallbacks` gets `onPlan(plan)` and `onCompaction({ id?, phase })`; `useChat` returns `plan` and `isCondensing`; an in-process adapter reports them with `emit.plan(plan)` and `emit.compaction({ id?, phase? })`. `PlanCard` is exported for hosts that draw their own list. Strings are `chat.plan.*`, `chat.activity.plan*`, `chat.activity.condensed` and `chat.live.condensing` (English, Turkish).

## Appearance (classic / modern)

`appearance` chooses how the chat is drawn. The default, `classic`, is the look the chat always had, so an existing integration changes nothing. `modern` is opt-in:

- the person's messages are bubbles on the right; answers are plain text, without avatars or a shaded band;
- the steps of a turn (reasoning, tool calls, answered approvals and questions) fold into one line, "Worked for 24s · Web Search ×4", which opens a timeline; an approval or question that still waits stays a card;
- a slim header names the agent; the sidebar groups chats by date (Today, Yesterday, Previous 7 days, ...), lists the agents on top, and can show a `brand` (title, logo) and the signed-in `account` with a menu (sign out);
- the empty chat shows the agents as cards when there is a choice, then the chosen agent's welcome and starters;
- the composer is one rounded box with a single line of notes under it;
- the chat uses the system UI font at 15px (set `--chat-font-family` / `--chat-font-size` to change it) instead of inheriting the page's font.

```tsx
<Chat
  baseUrl="/api/agents"
  appearance="modern"
  brand={{ title: "Acme assistants", logo: "/logo.svg" }}
  account={{ name: "Ayşe Yılmaz", detail: "ayse@acme.com", onSignOut: () => signOut() }}
/>
```

Components drawn outside `<Chat>` read the appearance from `ChatAppearanceProvider`. `TurnActivity` and `buildTurnBlocks` are exported for hosts that draw their own message list.

## Using Hooks Directly

For more control, use the hooks directly. A custom layout shows approval and question cards through `actions`, and the composer follows `composerState` (one value for a waiting card, a turn running elsewhere, a used-up usage limit, a read-only chat):

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

  return (
    <div className="flex flex-col h-full">
      <ChatMessageList
        messages={chat.messages}
        isStreaming={chat.isStreaming}
        streamingText={chat.streamingText}
        // Without `actions`, approvals and questions show as read-only
        actions={{ onResolve: chat.resolveAction, canResolve: chat.canResolveActions }}
        // Pictures and downloads of a loaded conversation
        resolveFileUrl={chat.resolveFileUrl}
      />
      <ChatInput
        onSend={(text) =>
          chat.answerableQuestion && chat.composerState === "answer"
            ? chat.resolveAction(chat.answerableQuestion.actionId, {
                type: "user_question",
                answers: { [chat.answerableQuestion.question.question]: text },
              })
            : chat.sendMessage(text)
        }
        onStop={chat.stop}
        isLoading={chat.isStreaming}
        isUploading={chat.isUploading}
        state={chat.composerState}
        pendingFiles={chat.pendingFiles}
        onFilesAdd={chat.addFiles}
        onFileRemove={chat.removeFile}
        onFileRetry={chat.retryFile}
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

Files are attached with the paperclip, by dropping them on the composer, or by pasting (a screenshot or a copied file). Images show as thumbnails in the composer and in the conversation. A message can carry files and no text (`attachmentsOnlyMessage` sets the text that goes with it).

With `fileTransport="upload-on-select"` each file is stored the moment it is picked, as itself (raw body, no base64) with a progress bar on its chip; `"upload"` stores them when the message is sent. The agent says what it takes (`capabilities.attachments`: limits per conversation, accepted types, whether it reads images, how long files are kept), the chat counts what the conversation holds ("3 of 10 files in this chat") and marks expired files and files whose text could not be read. An agent that does not read images gets a warning when an image is attached. See `docs/guide/file-uploads.md`.

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
| `allowedFileTypes`, `maxFileSize`, `maxFiles` | | any, 10 MB, 10 | Upload limits (an agent's `capabilities.attachments` or `metadata` can narrow them) |
| `maxFilesScope` | `"message" \| "conversation"` | `"message"` | What `maxFiles` counts (an agent's own `maxFiles` counts per conversation) |
| `fileTransport` | `"inline" \| "upload" \| "upload-on-select"` | `"inline"` | Files in the message body, uploaded when sending, or uploaded as they are picked |
| `attachmentsOnlyMessage` | `string` | localized "review the attached files" | Text sent with files and no typed text (`""` sends none) |
| `enableToolApprovals`, `enableQuestions` | `boolean` | `true` | Answer approvals / questions in this app |
| `allowArgumentEdit` | `boolean` | `false` | Edit a tool call's arguments in the approval card |
| `expiryWarningSeconds` | `number` | `600` | Cards turn amber with this much time left |
| `pendingActionComposerMode` | `"block" \| "cancel"` | `"block"` | Composer while a card waits |
| `readOnly` | `boolean` | `false` | A transcript: the composer is closed |
| `showStatus` | `boolean` | `true` | Status badges in the history |
| `showBudgetMeter` | `boolean` | `true` | The spent / limit bar of a conversation with a usage limit |
| `allowBudgetContinue`, `allowBudgetEdit` | `boolean` | `false` | Let a person continue / raise a used-up limit (an agent's `capabilities.budget` overrides them) |
| `renderStopNotice`, `renderBudgetBanner` | `function` | - | Replace the notice under a stopped answer / the usage-limit banner |
| `renderToolApproval`, `renderQuestion` | `function` | - | Replace a card |
| `renderImage` | `function` | - | Draw images yourself (e.g. fetch with credentials) |
| `renderMessageActions` | `function` | - | Custom message actions |
| `renderAvatar` | `function` | - | Custom avatar |
| `renderEmptyState` | `function` | - | Custom empty state |
| `renderHeader` | `function` | - | Custom header |
| `appearance` | `"classic" \| "modern"` | `"classic"` | How the chat is drawn (see Appearance) |
| `brand` | `ChatBrand` | - | `modern`: title and logo at the top of the sidebar |
| `account` | `ChatAccount` | - | `modern`: the signed-in person at the foot of the sidebar, with a menu (`onSignOut`, `menu`) |

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
- `isFollowing` - Only watching a turn that runs elsewhere (another window, or this page before a reload)
- `streamingText` - Current streaming text
- `error` - Current error
- `pendingFiles` - Files pending upload (images carry a local `previewUrl`; files stored on their own carry `status` and `progress`)
- `isUploading` - Files are going up (for the message being sent, or stored as they were picked)
- `heldFiles`, `retryFile(id)`, `resolveFileUrl` - Files the conversation holds, retry a failed upload, a URL for a stored file
- `composerState` - `"open" | "blocked" | "cancel" | "answer" | "following" | "budget_paused" | "readonly"`
- `budget`, `spentUsd`, `budgetExhausted`, `canContinue`, `canUpdateBudget`, `continueConversation()`, `updateBudget(budget, { continue })` - Usage limit (see `docs/guide/budgets.md`)
- `activeToolCalls` - Active tool calls
- `plan`, `isCondensing` - The agent's plan for the running turn, and whether it is condensing its earlier context (see "Plan and activity")
- `pendingActions`, `awaitingAction`, `isResolvingAction`, `canResolveActions`, `answerableQuestion`, `resolveAction(actionId, resolution)` - Approvals and questions (see `docs/guide/approvals.md`)
- `sendMessage(content)` - Send a message
- `addFiles(files)` - Add files
- `removeFile(id)` - Remove a file
- `clearMessages()` - Clear messages
- `loadConversation(id)` - Load a conversation
- `createConversation(title?)` - Create new conversation
- `retry()` - Retry last message
- `stop()` - Stop generation: cancels the run on the server where the transport can (agent-server), keeps the partial answer as stopped; otherwise it only closes the connection

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

## Cognipeer open-source projects

| Project | What it does |
| --- | --- |
| [Cognipeer Console](https://github.com/Cognipeer/console) | Self-hosted AI gateway and control plane: OpenAI-compatible routing, RAG, MCP hub, guardrails and agent tracing |
| [console-sdk](https://github.com/Cognipeer/console-sdk) | TypeScript SDK for the Cognipeer Console API |
| [agent-sdk](https://github.com/Cognipeer/agent-sdk) | Lightweight, message-first agent runtime |
| [agent-server](https://github.com/Cognipeer/agent-server) | Ready-made REST API layer for AI agents |
| [to-markdown](https://github.com/Cognipeer/to-markdown) | Convert PDF, Office, HTML and more to Markdown for LLM pipelines |
| [graph-builder](https://github.com/Cognipeer/graph-builder) | Turn text sources into a queryable graph |
| [cognipeer-observability](https://github.com/Cognipeer/cognipeer-observability) | Drop-in agent tracing for LangChain, LangGraph, OpenAI Agents and OpenTelemetry |

If this project is useful to you, a ⭐ on GitHub helps other developers find it.

Questions or enterprise support: [developer@cognipeer.com](mailto:developer@cognipeer.com).

## License

MIT
