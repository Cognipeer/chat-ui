# Chat Component

The main chat component with history sidebar.

## Import

```tsx
import { Chat } from "@cognipeer/chat-ui";
```

## Usage

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  theme="dark"
/>
```

## Props

`Chat` works on its own and inside a `ChatI18nProvider`. It needs a `baseUrl` (or a `transport`); without an `agentId` it lists the server's agents and lets the person pick one.

### Connection

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `baseUrl` | `string` | - | Base URL of the agent server API (not needed with `transport`) |
| `transport` | `ChatTransport` | - | Another backend, see [Transports](/guide/transports) |
| `agentId` | `string` | first agent | ID of the agent to chat with |
| `authorization` | `string` | - | Authorization header |
| `headers` | `Record<string, string>` | - | Custom headers |
| `getHeaders` | `() => headers \| Promise<headers>` | - | Fresh headers before every request |
| `fetch` | `typeof fetch` | - | Replacement for `fetch` |
| `conversationId` | `string` | - | Conversation to open |
| `initialMessages` | `Message[]` | - | Messages to start with |
| `streaming` | `boolean` | `true` | Enable streaming |

### Look

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `theme` | `"dark" \| "light"` | `"dark"` | Theme mode |
| `themeColors` | `ChatTheme["colors"]` | - | Any colour key, including the status colours `success`, `danger`, `warning`, `info` and their `...Bg` tints |
| `className` | `string` | - | Container class name |
| `showHistory` | `boolean` | `true` | Show history sidebar |
| `defaultHistoryOpen` | `boolean` | `false` | Sidebar open at first (mobile) |
| `showAgentName` | `boolean` | when several agents | Agent name under each conversation title |
| `showAvatars`, `showTimestamps` | `boolean` | `true`, `false` | Message chrome |
| `inputPlaceholder` | `string` | localized | Composer placeholder |
| `autoScroll` | `boolean` | `true` | Scroll to new messages |
| `autoFocusInput` | `boolean` | `false` | Focus the composer on mount and after new chat / selection |
| `enableMessageSearch` | `boolean` | `false` | Search box in the history |
| `enableCitations` | `boolean` | `true` | Sources under answers |

### Language

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `locale` | `string` | enclosing `ChatI18nProvider`, else `?lang`, else `defaultLocale` | Locale code (`en`, `tr`, or one you supply) |
| `defaultLocale` | `string` | `"en"` | Used when nothing else decides |
| `onLocaleChange` | `(locale) => void` | - | Called when the locale changes |
| `customMessages` | `Record<locale, Record<key, string>>` | - | Replace or add strings; merged over an enclosing provider's. Keys a locale leaves out fall back to English |

### Files

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `enableFileUpload` | `boolean` | `true` | Enable file uploads (an agent's `metadata.enableFileUpload` overrides it) |
| `allowedFileTypes` | `string[]` | any | Allowed MIME types / extensions |
| `maxFileSize` | `number` | `10MB` | Max file size in bytes |
| `maxFiles` | `number` | `10` | Max files per message |
| `fileTransport` | `"inline" \| "upload"` | `"inline"` | Files in the message body, or uploaded first |
| `attachmentsOnlyMessage` | `string` | localized | Text sent with files and no typed text (`""` sends none) |
| `renderImage` | `(props: ImageRenderProps) => ReactNode` | - | Draw images yourself, e.g. fetch them with credentials |

### Approvals and questions

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `enableToolApprovals` | `boolean` | `true` | Answer approvals in this app |
| `enableQuestions` | `boolean` | `true` | Answer questions in this app |
| `allowArgumentEdit` | `boolean` | `false` | Edit a call's arguments in the approval card (an agent's `capabilities.approvalArgsEdit` overrides it) |
| `expiryWarningSeconds` | `number` | `600` | Cards turn amber with this much time left |
| `pendingActionComposerMode` | `"block" \| "cancel"` | `"block"` | What the composer does while a card waits (an agent's `metadata.pendingActionComposerMode` overrides it) |
| `renderToolApproval`, `renderQuestion` | `function` | built-in cards | Replace a card |
| `onActionResolved` | `function` | - | Called after the server accepted an answer |

### Callback Props

| Prop | Type | Description |
|------|------|-------------|
| `onMessageSent` | `(message: Message) => void` | Called when user sends a message |
| `onMessageReceived` | `(message: Message) => void` | Called when response is received |
| `onStreamText` | `(chunk: string, fullText: string) => void` | Called on each text chunk |
| `onToolCall` | `(name: string, args: object) => void` | Called when tool is called |
| `onToolResult` | `(name: string, result: any) => void` | Called when tool returns |
| `onConversationCreated` | `(conv: Conversation) => void` | Called on new conversation |
| `onConversationSelected` | `(item: ConversationListItem) => void` | Called on conversation switch |
| `onConversationTitleGenerated` | `(id: string, title: string) => void` | The server named the conversation |
| `onAgentChange` | `(agentId: string) => void` | The selected agent changed |
| `onError` | `(error: Error) => void` | Called on error (a refused file, a failed request) |

### Render Props

| Prop | Type | Description |
|------|------|-------------|
| `renderMessageActions` | `(props: MessageActionProps) => ReactNode` | Custom message actions |
| `renderAvatar` | `(role) => ReactNode` | Custom avatar |
| `renderEmptyState` | `() => ReactNode` | Custom empty state |
| `renderHeader` | `(props) => ReactNode` | Custom header |
| `renderHistoryHeader`, `renderHistoryFooter` | `() => ReactNode` | Custom sidebar header / footer |
| `renderToolApproval`, `renderQuestion` | `function` | See above |
| `renderImage` | `function` | See above |

## Accessibility

The composer and its buttons are labelled; the message list is a live `log` (busy while a reply streams, so the finished answer is read once); an error is an `alert`. An approval or question that appears while the person is not typing takes keyboard focus and is announced, and focus returns to the composer once the last card is answered. Spinners and pulses stop under `prefers-reduced-motion`.

## Examples

### Basic

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
/>
```

### With Auth

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  authorization="Bearer your-token"
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

### Custom Colors

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  themeColors={{
    bgPrimary: "#1a1a2e",
    accentPrimary: "#e94560",
  }}
/>
```

### With Callbacks

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  onMessageSent={(msg) => console.log("Sent:", msg)}
  onMessageReceived={(msg) => console.log("Received:", msg)}
  onError={(err) => console.error("Error:", err)}
/>
```

### With Feedback Actions

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  renderMessageActions={({ message, isStreaming }) => {
    if (isStreaming || message.role !== "assistant") return null;
    
    return (
      <div className="flex gap-2">
        <button onClick={() => sendFeedback(message.id, "up")}>👍</button>
        <button onClick={() => sendFeedback(message.id, "down")}>👎</button>
      </div>
    );
  }}
/>
```

### Images Only

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="vision"
  allowedFileTypes={["image/*"]}
  maxFiles={1}
/>
```

### Your Own Strings

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  locale="tr"
  customMessages={{ tr: { "chat.input.placeholder": "Bir şey sorun..." } }}
/>
```

### No History

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  showHistory={false}
/>
```

## TypeScript

```tsx
import { Chat, type ChatProps } from "@cognipeer/chat-ui";

const props: ChatProps = {
  baseUrl: "/api/agents",
  agentId: "assistant",
  theme: "dark",
};

<Chat {...props} />
```

## Sizing

The Chat component fills its container:

```tsx
// Full screen
<div className="h-screen">
  <Chat ... />
</div>

// Fixed height
<div style={{ height: 600 }}>
  <Chat ... />
</div>
```

## Related

- [ChatMinimal](/components/chat-minimal)
- [useChat Hook](/api/use-chat)
- [Getting Started](/guide/getting-started)
