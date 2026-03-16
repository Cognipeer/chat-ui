# History Sidebar

Manage conversation history with the built-in sidebar.

## Overview

The `Chat` component includes a built-in history sidebar for products that want a workspace-style chat experience without building session management UI from scratch.

It can show:

- List of past conversations
- Create new conversation button
- Delete conversation option
- Conversation titles and dates

## When Built-In History Is Enough

Use the default history behavior when:

- one sidebar is enough for your product
- conversations come from a single backend contract
- you want creation, selection, and deletion built in
- your product does not need router-driven history UI yet

Reach for custom history composition when:

- the conversation list must sync with the URL or another app router
- history lives in a custom workspace layout
- you need to mix chat sessions with other product entities in one navigation surface
- you want search, filters, or access rules beyond the built-in sidebar behavior

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

## Conversation Lifecycle Callbacks

Use callbacks when the host app needs to react to session changes:

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
  onConversationTitleGenerated={(conversationId, title) => {
    console.log("Title updated:", conversationId, title);
  }}
  onBackgroundStreamCompleted={(conversationId) => {
    console.log("Refresh after background stream:", conversationId);
  }}
/>
```

These hooks are useful for analytics, routing, or keeping other parts of your app synchronized with the active conversation.

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

`useChatHistory` is the right abstraction when you want to keep server-backed conversation state but render your own layout.

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
        selectedId={chat.conversation?.id}
        isLoading={history.isLoading}
        hasMore={history.hasMore}
        onSelect={(conversation) => chat.loadConversation(conversation.id)}
        onDelete={history.deleteConversation}
        onNewChat={() => chat.createConversation()}
        onLoadMore={history.loadMore}
        enableSearch
      />
      
      <div className="flex-1">
        {/* Chat content */}
      </div>
    </div>
  );
}
```

## URL Sync And Conversation Identity

If your app uses router state, keep the conversation ID as the source of truth and treat the sidebar as a selector for that ID. The common pattern is:

1. Read a conversation ID from the URL.
2. Call `loadConversation(id)` when it changes.
3. Update the URL when `onConversationSelected` fires.
4. Refresh history when background streams complete or titles change.

That keeps deep linking and browser navigation consistent with the conversation list.

## Pagination And Longer Histories

`useChatHistory` supports pagination through `hasMore` and `loadMore`. Keep that behavior in mind if your users can accumulate many threads.

For long-lived workspaces:

- avoid assuming the first page contains every conversation
- refresh silently after message activity instead of forcing full loading spinners
- make deletion and creation flows explicit so users do not lose track of the active thread

## Operational Notes

- The built-in `Chat` sidebar already handles responsive open/close behavior on smaller screens.
- Auto-generated conversation titles can arrive after the first message, so the history list should be treated as live metadata.
- Deleting a conversation is a server-side action when you use the built-in hook and client model. Make sure the UX reflects that permanence.

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
