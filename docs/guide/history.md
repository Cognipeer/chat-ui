# History Sidebar

Manage conversation history with the built-in sidebar.

## Overview

The `Chat` component includes a history sidebar that shows:

- List of past conversations
- Create new conversation button
- Delete conversation option
- Conversation titles and dates

## Enable/Disable History

```tsx
// With history (default)
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  showHistory={true}
/>

// Without history
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  showHistory={false}
/>

// Or use ChatMinimal
import { ChatMinimal } from "@cognipeer/chat-ui";

<ChatMinimal
  baseUrl="/api/agents"
  agentId="assistant"
/>
```

## History Callbacks

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  onConversationCreated={(conversation) => {
    console.log("New conversation:", conversation.id);
  }}
  onConversationSelected={(conversation) => {
    console.log("Selected:", conversation.id);
    // Update URL, analytics, etc.
  }}
  onConversationDeleted={(conversationId) => {
    console.log("Deleted:", conversationId);
  }}
/>
```

## useChatHistory Hook

For custom implementations:

```tsx
import { useChatHistory } from "@cognipeer/chat-ui";

function CustomHistory() {
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
    authorization: "Bearer token",
  });

  return (
    <div>
      {conversations.map(conv => (
        <div key={conv.id}>
          <span>{conv.title || "Untitled"}</span>
          <button onClick={() => deleteConversation(conv.id)}>
            Delete
          </button>
        </div>
      ))}
      
      {hasMore && (
        <button onClick={loadMore}>Load More</button>
      )}
    </div>
  );
}
```

## ChatHistory Component

Use the standalone component:

```tsx
import { ChatHistory, useChat, useChatHistory } from "@cognipeer/chat-ui";

function CustomLayout() {
  const chat = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });
  
  const history = useChatHistory({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  return (
    <div className="flex">
      <ChatHistory
        conversations={history.conversations}
        currentConversationId={chat.conversation?.id}
        onSelect={(conv) => chat.loadConversation(conv.id)}
        onDelete={history.deleteConversation}
        onNew={() => chat.createConversation()}
      />
      
      <div className="flex-1">
        {/* Chat content */}
      </div>
    </div>
  );
}
```

## Custom History Rendering

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  renderHistoryItem={({ conversation, isActive, onSelect, onDelete }) => (
    <div
      className={`history-item ${isActive ? 'active' : ''}`}
      onClick={onSelect}
    >
      <div className="title">
        {conversation.title || "New Chat"}
      </div>
      <div className="date">
        {new Date(conversation.updatedAt).toLocaleDateString()}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        🗑️
      </button>
    </div>
  )}
/>
```

## Collapsible Sidebar

The sidebar can be collapsed on mobile:

```tsx
// Built-in behavior handles responsive collapse
// The Chat component manages this automatically
```

Custom collapse control:

```tsx
import { useState } from "react";

function ResponsiveChat() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex">
      <button onClick={() => setSidebarOpen(!sidebarOpen)}>
        {sidebarOpen ? "←" : "→"}
      </button>
      
      {sidebarOpen && (
        <div className="sidebar">
          <ChatHistory {...historyProps} />
        </div>
      )}
      
      <div className="flex-1">
        <ChatMinimal {...chatProps} />
      </div>
    </div>
  );
}
```

## Conversation Titles

Conversations can have titles:

```tsx
// Create with title
const conversation = await chat.createConversation("My Important Chat");

// Update title
await updateConversation(conversation.id, {
  title: "Updated Title",
});
```

## Search/Filter History

```tsx
import { useChatHistory } from "@cognipeer/chat-ui";
import { useState, useMemo } from "react";

function SearchableHistory() {
  const [search, setSearch] = useState("");
  const { conversations } = useChatHistory({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  const filtered = useMemo(() => {
    if (!search) return conversations;
    return conversations.filter(c =>
      c.title?.toLowerCase().includes(search.toLowerCase())
    );
  }, [conversations, search]);

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search conversations..."
      />
      
      {filtered.map(conv => (
        <div key={conv.id}>{conv.title}</div>
      ))}
    </div>
  );
}
```

## Styling

```css
.chat-history {
  width: 260px;
  background: var(--chat-bg-secondary);
  border-right: 1px solid var(--chat-border-primary);
}

.chat-history-item {
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--chat-border-secondary);
}

.chat-history-item:hover {
  background: var(--chat-bg-hover);
}

.chat-history-item.active {
  background: var(--chat-bg-tertiary);
  border-left: 3px solid var(--chat-accent-primary);
}
```

## Next Steps

- [Custom Actions](/guide/custom-actions)
- [ChatHistory Component](/components/chat-history)
- [useChatHistory Hook](/api/use-chat-history)
