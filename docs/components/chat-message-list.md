# ChatMessageList Component

Renders a list of messages with auto-scroll, the streaming reply and the progress of tool calls.

## Import

```tsx
import { ChatMessageList } from "@cognipeer/chat-ui";
```

## Usage

```tsx
const chat = useChat({ baseUrl: "/api/agents", agentId: "assistant" });

<ChatMessageList
  messages={chat.messages}
  isStreaming={chat.isStreaming}
  streamingText={chat.streamingText}
  progressMessage={chat.progressMessage}
  activeToolCalls={chat.activeToolCalls}
  actions={{ onResolve: chat.resolveAction, canResolve: chat.canResolveActions }}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `messages` | `Message[]` | required | Array of messages |
| `isStreaming` | `boolean` | `false` | A reply is streaming |
| `streamingText` | `string` | - | Current streaming text |
| `progressMessage` | `string` | - | Progress line shown while waiting |
| `activeToolCalls` | `Map` | - | Tool calls of the running turn |
| `actions` | `ChatActionsConfig` | - | How approval / question cards behave. Without `onResolve` they are read-only ("Waiting for approval in another app"); see [Approvals and Questions](/guide/approvals#custom-layouts) |
| `autoScroll` | `boolean` | `true` | Scroll to new messages |
| `showAvatars`, `showTimestamps` | `boolean` | `true`, `false` | Message chrome |
| `enableCitations` | `boolean` | `true` | Sources under answers |
| `renderActions` | `(props: MessageActionProps) => ReactNode` | - | Custom action buttons |
| `renderAvatar` | `(role) => ReactNode` | - | Custom avatar |
| `renderImage` | `(props: ImageRenderProps) => ReactNode` | - | Draw images yourself |
| `renderStopNotice` | `(props: StopNoticeRenderProps) => ReactNode` | - | Replace the notice under an answer that stopped early |
| `resolveFileUrl` | `(file, { disposition? }) => Promise<string \| undefined>` | - | How stored files without a URL are shown and downloaded; pass `chat.resolveFileUrl` |
| `hasEarlier`, `isLoadingEarlier`, `onLoadEarlier` | `boolean`, `boolean`, `() => void` | `false`, `false`, - | A "Show earlier messages" button above the first message; pass `chat.hasEarlierMessages`, `chat.isLoadingEarlierMessages` and `chat.loadEarlierMessages`. The list keeps the reader's place when the older page arrives |
| `interrupted`, `onRetryInterrupted` | `boolean`, `() => void` | `false`, - | The list ends on a message of the person's that the run never answered: a "The reply was interrupted" notice follows it, with Retry when `onRetryInterrupted` is given; pass `chat.interrupted` and `chat.retryInterrupted` |
| `emptyState` | `ReactNode` | built-in | Shown when there are no messages |
| `className` | `string` | - | Container class name |

## Examples

### Basic

```tsx
const messages = [
  { id: "1", conversationId: "c", role: "user", content: "Hello", createdAt: new Date(), updatedAt: new Date() },
  { id: "2", conversationId: "c", role: "assistant", content: "Hi there!", createdAt: new Date(), updatedAt: new Date() },
];

<ChatMessageList messages={messages} />
```

### With Streaming

```tsx
<ChatMessageList messages={messages} isStreaming streamingText="I'm typing a response..." />
```

### Custom Empty State

```tsx
<ChatMessageList
  messages={[]}
  emptyState={
    <div className="empty-state">
      <h3>Welcome to Chat!</h3>
      <p>Start a conversation by sending a message.</p>
    </div>
  }
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

With `autoScroll` the list scrolls itself to the bottom when the messages, the streaming text or the tool calls change. Only the list scrolls: the page around it, and any other scrollable ancestor, stays where it is.

## Accessibility

The list is a labelled live `log`. While a reply streams it is `aria-busy`, so a screen reader reads the finished answer once instead of every chunk. When an approval or question card appears in a conversation that is already on screen, a hidden assertive live region announces it and the first new card takes keyboard focus (unless the person is typing). Cards that arrive with a loaded conversation are not announced and do not take focus.

## Virtual Scrolling

For very large message lists, render `ChatMessage` inside a virtual list instead:

```tsx
import { FixedSizeList } from "react-window";

<FixedSizeList height={600} itemCount={messages.length} itemSize={100}>
  {({ index, style }) => (
    <div style={style}>
      <ChatMessage message={messages[index]} />
    </div>
  )}
</FixedSizeList>
```

## Styling

The list scrolls with the `.chat-scrollbar` styles from `styles.css`; colours come from the theme variables. See [Theming](/guide/theming).

## Related

- [ChatMessage](/components/chat-message)
- [Chat](/components/chat)
- [useChat Hook](/api/use-chat)
