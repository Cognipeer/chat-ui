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

### Required Props

| Prop | Type | Description |
|------|------|-------------|
| `baseUrl` | `string` | Base URL for the agent server API |
| `agentId` | `string` | ID of the agent to chat with |

### Optional Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `theme` | `"dark" \| "light"` | `"dark"` | Theme mode |
| `themeColors` | `ThemeColors` | - | Custom theme colors |
| `authorization` | `string` | - | Authorization header |
| `headers` | `Record<string, string>` | - | Custom headers |
| `conversationId` | `string` | - | Initial conversation ID |
| `streaming` | `boolean` | `true` | Enable streaming |
| `showHistory` | `boolean` | `true` | Show history sidebar |
| `enableFileUpload` | `boolean` | `true` | Enable file uploads |
| `allowedFileTypes` | `string[]` | `["*"]` | Allowed file types |
| `maxFileSize` | `number` | `10MB` | Max file size |
| `maxFiles` | `number` | `10` | Max files per message |
| `className` | `string` | - | Container class name |

### Callback Props

| Prop | Type | Description |
|------|------|-------------|
| `onMessageSent` | `(message: Message) => void` | Called when user sends a message |
| `onMessageReceived` | `(message: Message) => void` | Called when response is received |
| `onStreamText` | `(chunk: string, fullText: string) => void` | Called on each text chunk |
| `onToolCall` | `(name: string, args: object) => void` | Called when tool is called |
| `onToolResult` | `(name: string, result: any) => void` | Called when tool returns |
| `onConversationCreated` | `(conv: Conversation) => void` | Called on new conversation |
| `onConversationSelected` | `(conv: Conversation) => void` | Called on conversation switch |
| `onConversationDeleted` | `(id: string) => void` | Called on conversation delete |
| `onError` | `(error: Error) => void` | Called on error |

### Render Props

| Prop | Type | Description |
|------|------|-------------|
| `renderMessage` | `(props: MessageProps) => ReactNode` | Custom message renderer |
| `renderMessageActions` | `(props: ActionProps) => ReactNode` | Custom message actions |
| `renderFilePreview` | `(props: FileProps) => ReactNode` | Custom file preview |
| `renderToolCall` | `(props: ToolCallProps) => ReactNode` | Custom tool call renderer |
| `renderHistoryItem` | `(props: HistoryItemProps) => ReactNode` | Custom history item |
| `renderEmpty` | `() => ReactNode` | Custom empty state |

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
import { Chat, ChatProps } from "@cognipeer/chat-ui";

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
