# ChatMessage Component

Renders a single message in the chat.

## Import

```tsx
import { ChatMessage } from "@cognipeer/chat-ui";
```

## Usage

```tsx
<ChatMessage
  message={{
    id: "msg-1",
    role: "assistant",
    content: "Hello! How can I help you?",
    createdAt: new Date().toISOString(),
  }}
/>
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `message` | `Message` | The message to render |
| `isStreaming` | `boolean` | Whether message is streaming |
| `streamingText` | `string` | Current streaming text |
| `activeToolCalls` | `Map` | Active tool calls |
| `renderToolCall` | `Function` | Custom tool call renderer |
| `renderActions` | `Function` | Custom action buttons |
| `className` | `string` | Additional class names |

## Message Structure

```typescript
interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
  createdAt: string;
  toolCalls?: ToolCall[];
}

interface ContentPart {
  type: "text" | "image" | "file";
  text?: string;
  image?: { url: string };
  file?: { id: string; name: string; url: string };
}
```

## Examples

### User Message

```tsx
<ChatMessage
  message={{
    id: "1",
    role: "user",
    content: "What's the weather like?",
    createdAt: new Date().toISOString(),
  }}
/>
```

### Assistant Message

```tsx
<ChatMessage
  message={{
    id: "2",
    role: "assistant",
    content: "The weather is sunny with a high of 72°F.",
    createdAt: new Date().toISOString(),
  }}
/>
```

### With Tool Calls

```tsx
<ChatMessage
  message={{
    id: "3",
    role: "assistant",
    content: "Let me check the weather for you.",
    createdAt: new Date().toISOString(),
    toolCalls: [
      {
        id: "call-1",
        name: "get_weather",
        arguments: '{"location": "New York"}',
      },
    ],
  }}
/>
```

### Streaming

```tsx
<ChatMessage
  message={{
    id: "4",
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
  }}
  isStreaming={true}
  streamingText="I'm currently writing..."
/>
```

### With Files

```tsx
<ChatMessage
  message={{
    id: "5",
    role: "user",
    content: [
      { type: "text", text: "Analyze this image" },
      {
        type: "image",
        image: { url: "data:image/png;base64,..." },
      },
    ],
    createdAt: new Date().toISOString(),
  }}
/>
```

### With Actions

```tsx
<ChatMessage
  message={message}
  renderActions={() => (
    <div className="flex gap-2">
      <button>👍</button>
      <button>👎</button>
      <button>📋</button>
    </div>
  )}
/>
```

## Styling

```css
.chat-message {
  padding: 16px;
}

.chat-message.user {
  background: var(--chat-bg-tertiary);
}

.chat-message.assistant {
  background: transparent;
}

.chat-message-content {
  line-height: 1.6;
}

.chat-message-content pre {
  background: var(--chat-bg-secondary);
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
}
```

## Markdown Support

The component renders markdown content:

- **Bold** and *italic* text
- `inline code`
- Code blocks with syntax highlighting
- Lists and tables
- Links

## Related

- [ChatMessageList](/components/chat-message-list)
- [Chat](/components/chat)
- [Types](/api/types)
