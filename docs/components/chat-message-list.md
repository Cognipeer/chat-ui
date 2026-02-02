# ChatMessageList Component

Renders a list of messages with auto-scroll.

## Import

```tsx
import { ChatMessageList } from "@cognipeer/chat-ui";
```

## Usage

```tsx
<ChatMessageList
  messages={messages}
  isLoading={isLoading}
  streamingText={streamingText}
/>
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `messages` | `Message[]` | Array of messages |
| `isLoading` | `boolean` | Whether loading/streaming |
| `streamingText` | `string` | Current streaming text |
| `streamingMessage` | `Partial<Message>` | Streaming message data |
| `activeToolCalls` | `Map` | Active tool calls |
| `renderMessage` | `Function` | Custom message renderer |
| `renderToolCall` | `Function` | Custom tool call renderer |
| `renderActions` | `Function` | Custom action buttons |
| `renderEmpty` | `Function` | Empty state renderer |
| `className` | `string` | Container class name |

## Examples

### Basic

```tsx
const messages = [
  { id: "1", role: "user", content: "Hello", createdAt: "..." },
  { id: "2", role: "assistant", content: "Hi there!", createdAt: "..." },
];

<ChatMessageList messages={messages} />
```

### With Streaming

```tsx
<ChatMessageList
  messages={messages}
  isLoading={true}
  streamingText="I'm typing a response..."
/>
```

### Custom Message Rendering

```tsx
<ChatMessageList
  messages={messages}
  renderMessage={({ message, isStreaming, streamingText }) => (
    <div className={`message ${message.role}`}>
      <Avatar role={message.role} />
      <div className="content">
        {isStreaming ? streamingText : message.content}
      </div>
    </div>
  )}
/>
```

### Custom Empty State

```tsx
<ChatMessageList
  messages={[]}
  renderEmpty={() => (
    <div className="empty-state">
      <h3>Welcome to Chat!</h3>
      <p>Start a conversation by sending a message.</p>
    </div>
  )}
/>
```

### With Actions

```tsx
<ChatMessageList
  messages={messages}
  renderActions={({ message, isStreaming }) => {
    if (isStreaming || message.role !== "assistant") return null;
    
    return (
      <div>
        <button>Copy</button>
        <button>Feedback</button>
      </div>
    );
  }}
/>
```

## Auto-Scroll Behavior

The list automatically scrolls to:

- New messages
- Streaming content updates
- Bottom when sending a message

Scroll is paused when user scrolls up.

## Virtual Scrolling

For large message lists, consider wrapping in a virtual list:

```tsx
import { FixedSizeList } from "react-window";

<FixedSizeList
  height={600}
  itemCount={messages.length}
  itemSize={100}
>
  {({ index, style }) => (
    <div style={style}>
      <ChatMessage message={messages[index]} />
    </div>
  )}
</FixedSizeList>
```

## Styling

```css
.chat-message-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.chat-message-list::-webkit-scrollbar {
  width: 8px;
}

.chat-message-list::-webkit-scrollbar-thumb {
  background: var(--chat-border-primary);
  border-radius: 4px;
}
```

## Related

- [ChatMessage](/components/chat-message)
- [Chat](/components/chat)
- [useChat Hook](/api/use-chat)
