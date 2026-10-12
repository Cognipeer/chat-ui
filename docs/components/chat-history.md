# ChatHistory Component

The conversation history sidebar. `Chat` renders it for you (`showHistory`); use it directly in a custom layout.

## Import

```tsx
import { ChatHistory } from "@cognipeer/chat-ui";
```

## Usage

```tsx
const history = useChatHistory({ baseUrl: "/api/agents" });

<ChatHistory
  conversations={history.conversations}
  selectedId={chat.conversation?.id}
  isLoading={history.isLoading}
  hasMore={history.hasMore}
  onSelect={(item) => chat.loadConversation(item.id)}
  onDelete={history.deleteConversation}
  onNewChat={chat.clearMessages}
  onLoadMore={history.loadMore}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `conversations` | `ConversationListItem[]` | required | The list |
| `selectedId` | `string` | - | The open conversation |
| `onSelect` | `(item: ConversationListItem) => void` | required | A row was opened |
| `onDelete` | `(id: string) => void` | - | Shows a delete button on each row |
| `onNewChat` | `() => void` | - | Shows the "New Chat" button |
| `isLoading`, `hasMore`, `onLoadMore` | | | Paging; a "Load more" button shows while `hasMore` |
| `enableSearch` | `boolean` | `false` | A search box over the titles |
| `showAgentName` | `boolean` | `false` | The agent's name next to the time |
| `showStatus` | `boolean` | `true` | A badge on rows that are working, waiting for you or stopped on their usage limit |
| `selectedStatus` | `RuntimeStatus` | - | What the open conversation is doing, as this page knows it; replaces the badge of the selected row |
| `isOpen`, `onClose` | | `true` | The sidebar as an overlay on small screens (a backdrop, Escape closes it) |
| `header`, `footer` | `ReactNode` | | Replace the header or add a footer |
| `className` | `string` | - | Container class name |

## Status badges

Each `ConversationListItem` may carry `runtime` (agent-server 0.3.0+). The badge:

| `runtime.status` | Badge |
| --- | --- |
| `running` | Working |
| `requires_action` | Waiting for you |
| `budget_paused`, or `budget` spent (`spentUsd >= budget.maxCostUsd`) | Limit reached |
| `idle`, absent | none |

`Chat` passes `selectedStatus` for the open conversation, because it knows before the list does, and fetches the list again when a turn ends. In your own layout refresh the list when the status may have changed (`useChatHistory().refresh()`).

## Keyboard

Every row is a real `<button>`, in a labelled list:

- **Tab**, **Enter**, **Space** - reach and open a conversation (`aria-current` marks the open one);
- **Arrow Up / Down**, **Home**, **End** - move between rows;
- **Escape** - closes the sidebar where it is an overlay;
- the **delete** button is a button of its own (named after the conversation: "Delete conversation: Quarterly report"), hidden until the row is hovered or has keyboard focus, and it does not open the row.

## Conversation structure

```typescript
interface ConversationListItem {
  id: string;
  title?: string;
  agentName?: string;
  agentId: string;
  runtime?: ConversationRuntime;     // { status, stopReason?, lastEventSeq?, ... }
  budget?: ConversationBudget | null;
  spentUsd?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

## Examples

### With search

```tsx
<ChatHistory
  conversations={conversations}
  enableSearch
  onSelect={handleSelect}
  onDelete={handleDelete}
  onNewChat={handleNew}
/>
```

### Without badges

```tsx
<ChatHistory conversations={conversations} showStatus={false} onSelect={handleSelect} />
```

### Collapsible sidebar

```tsx
function CollapsibleHistory() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Menu</button>
      <ChatHistory conversations={conversations} isOpen={open} onClose={() => setOpen(false)} onSelect={handleSelect} />
    </>
  );
}
```

## Styling

The sidebar uses the theme variables: `--chat-bg-secondary` (background), `--chat-bg-hover` (the open row), `--chat-bg-tertiary` (hover), `--chat-border-primary`, and the status colours for the badges (`--chat-info`, `--chat-warning`, `--chat-danger` with their `-bg` tints). See [Theming](/guide/theming).

## Related

- [useChatHistory Hook](/api/use-chat-history)
- [Chat](/components/chat)
- [History Guide](/guide/history)
- [Running turns, Stop and reattach](/guide/runs)
