# useChatHistory Hook

Hook for managing conversation history.

## Import

```tsx
import { useChatHistory } from "@cognipeer/chat-ui";
```

## Usage

```tsx
const {
  conversations,
  isLoading,
  hasMore,
  load,
  loadMore,
  refresh,
  deleteConversation,
} = useChatHistory({
  baseUrl: "/api/agents",
  agentId: "assistant",
});
```

## Options

```typescript
interface UseChatHistoryOptions {
  // Required
  baseUrl: string;
  agentId: string;
  
  // Optional
  authorization?: string;
  headers?: Record<string, string>;
  limit?: number;       // Items per page (default: 20)
  autoLoad?: boolean;   // Load on mount (default: true)
  
  // Callbacks
  onError?: (error: Error) => void;
}
```

## Return Value

```typescript
interface UseChatHistoryReturn {
  // Data
  conversations: Conversation[];
  
  // Loading states
  isLoading: boolean;
  hasMore: boolean;
  
  // Actions
  load: () => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
}
```

## Examples

### Basic Usage

```tsx
function HistoryList() {
  const { conversations, isLoading } = useChatHistory({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <ul>
      {conversations.map(conv => (
        <li key={conv.id}>{conv.title || "Untitled"}</li>
      ))}
    </ul>
  );
}
```

### With Authentication

```tsx
const history = useChatHistory({
  baseUrl: "/api/agents",
  agentId: "assistant",
  authorization: `Bearer ${token}`,
});
```

### Infinite Scroll

```tsx
function InfiniteHistory() {
  const { conversations, hasMore, loadMore, isLoading } = useChatHistory({
    baseUrl: "/api/agents",
    agentId: "assistant",
    limit: 20,
  });

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop === clientHeight && hasMore && !isLoading) {
      loadMore();
    }
  };

  return (
    <div onScroll={handleScroll} className="h-full overflow-y-auto">
      {conversations.map(conv => (
        <div key={conv.id}>{conv.title}</div>
      ))}
      
      {isLoading && <div>Loading more...</div>}
    </div>
  );
}
```

### With Delete

```tsx
function ManageableHistory() {
  const { conversations, deleteConversation } = useChatHistory({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  const handleDelete = async (id: string) => {
    if (confirm("Delete this conversation?")) {
      await deleteConversation(id);
    }
  };

  return (
    <ul>
      {conversations.map(conv => (
        <li key={conv.id}>
          {conv.title}
          <button onClick={() => handleDelete(conv.id)}>🗑️</button>
        </li>
      ))}
    </ul>
  );
}
```

### With Search

```tsx
function SearchableHistory() {
  const { conversations } = useChatHistory({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });
  
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return conversations;
    return conversations.filter(c =>
      c.title?.toLowerCase().includes(search.toLowerCase())
    );
  }, [conversations, search]);

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search..."
      />
      
      <ul>
        {filtered.map(conv => (
          <li key={conv.id}>{conv.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Manual Load

```tsx
function ManualLoadHistory() {
  const { conversations, load, isLoading } = useChatHistory({
    baseUrl: "/api/agents",
    agentId: "assistant",
    autoLoad: false,
  });

  return (
    <div>
      <button onClick={load} disabled={isLoading}>
        {isLoading ? "Loading..." : "Load History"}
      </button>
      
      {conversations.map(conv => (
        <div key={conv.id}>{conv.title}</div>
      ))}
    </div>
  );
}
```

### Refresh History

```tsx
function RefreshableHistory() {
  const { conversations, refresh, isLoading } = useChatHistory({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  return (
    <div>
      <button onClick={refresh} disabled={isLoading}>
        🔄 Refresh
      </button>
      
      {conversations.map(conv => (
        <div key={conv.id}>{conv.title}</div>
      ))}
    </div>
  );
}
```

### With useChat Integration

```tsx
function IntegratedChat() {
  const chat = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });
  
  const history = useChatHistory({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  const handleSelect = (conv: Conversation) => {
    chat.loadConversation(conv.id);
  };

  const handleNew = async () => {
    await chat.createConversation();
    history.refresh();
  };

  return (
    <div className="flex">
      <aside>
        <button onClick={handleNew}>New Chat</button>
        
        {history.conversations.map(conv => (
          <div
            key={conv.id}
            onClick={() => handleSelect(conv)}
            className={conv.id === chat.conversation?.id ? "active" : ""}
          >
            {conv.title}
          </div>
        ))}
      </aside>
      
      <main>
        {/* Chat content */}
      </main>
    </div>
  );
}
```

## Conversation Type

```typescript
interface Conversation {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}
```

## Error Handling

```tsx
const history = useChatHistory({
  baseUrl: "/api/agents",
  agentId: "assistant",
  onError: (error) => {
    console.error("Failed to load history:", error);
    showNotification({ type: "error", message: "Failed to load history" });
  },
});
```

## Related

- [useChat](/api/use-chat)
- [ChatHistory Component](/components/chat-history)
- [Types](/api/types)
