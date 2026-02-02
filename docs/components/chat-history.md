# ChatHistory Component

Displays conversation history sidebar.

## Import

```tsx
import { ChatHistory } from "@cognipeer/chat-ui";
```

## Usage

```tsx
<ChatHistory
  conversations={conversations}
  currentConversationId={currentId}
  onSelect={handleSelect}
  onDelete={handleDelete}
  onNew={handleNew}
/>
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `conversations` | `Conversation[]` | List of conversations |
| `currentConversationId` | `string` | Currently active conversation |
| `isLoading` | `boolean` | Loading state |
| `hasMore` | `boolean` | More items to load |
| `onSelect` | `(conv: Conversation) => void` | Selection callback |
| `onDelete` | `(id: string) => void` | Delete callback |
| `onNew` | `() => void` | New conversation callback |
| `onLoadMore` | `() => void` | Load more callback |
| `renderItem` | `Function` | Custom item renderer |
| `className` | `string` | Container class name |

## Conversation Structure

```typescript
interface Conversation {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}
```

## Examples

### Basic

```tsx
<ChatHistory
  conversations={conversations}
  currentConversationId={currentConv?.id}
  onSelect={(conv) => loadConversation(conv.id)}
  onDelete={(id) => deleteConversation(id)}
  onNew={() => createConversation()}
/>
```

### With Load More

```tsx
<ChatHistory
  conversations={conversations}
  hasMore={hasMoreConversations}
  onLoadMore={loadMoreConversations}
  onSelect={handleSelect}
  onDelete={handleDelete}
  onNew={handleNew}
/>
```

### Custom Item Rendering

```tsx
<ChatHistory
  conversations={conversations}
  renderItem={({ conversation, isActive, onSelect, onDelete }) => (
    <div
      className={`item ${isActive ? "active" : ""}`}
      onClick={onSelect}
    >
      <span className="title">
        {conversation.title || "Untitled"}
      </span>
      <span className="date">
        {formatDate(conversation.updatedAt)}
      </span>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }}>
        🗑️
      </button>
    </div>
  )}
/>
```

### With Search

```tsx
function SearchableHistory() {
  const [search, setSearch] = useState("");
  const filtered = conversations.filter(c =>
    c.title?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search..."
      />
      <ChatHistory
        conversations={filtered}
        onSelect={handleSelect}
        onDelete={handleDelete}
        onNew={handleNew}
      />
    </div>
  );
}
```

### Collapsible Sidebar

```tsx
function CollapsibleHistory() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={collapsed ? "w-16" : "w-64"}>
      <button onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? "→" : "←"}
      </button>
      
      {!collapsed && (
        <ChatHistory
          conversations={conversations}
          onSelect={handleSelect}
          onDelete={handleDelete}
          onNew={handleNew}
        />
      )}
    </div>
  );
}
```

## Styling

```css
.chat-history {
  width: 260px;
  height: 100%;
  background: var(--chat-bg-secondary);
  border-right: 1px solid var(--chat-border-primary);
  display: flex;
  flex-direction: column;
}

.chat-history-header {
  padding: 16px;
  border-bottom: 1px solid var(--chat-border-secondary);
}

.chat-history-list {
  flex: 1;
  overflow-y: auto;
}

.chat-history-item {
  padding: 12px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-history-item:hover {
  background: var(--chat-bg-hover);
}

.chat-history-item.active {
  background: var(--chat-bg-tertiary);
  border-left: 3px solid var(--chat-accent-primary);
}
```

## Related

- [useChatHistory Hook](/api/use-chat-history)
- [Chat](/components/chat)
- [History Guide](/guide/history)
