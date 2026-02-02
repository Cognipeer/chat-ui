# Hooks

Chat UI provides React hooks for building custom chat interfaces.

## Available Hooks

| Hook | Description |
|------|-------------|
| [useChat](/api/use-chat) | Main chat hook with message handling |
| [useChatHistory](/api/use-chat-history) | Conversation history management |

## useChat

The main hook for chat functionality:

```tsx
import { useChat } from "@cognipeer/chat-ui";

function CustomChat() {
  const {
    messages,
    isLoading,
    streamingText,
    error,
    sendMessage,
    stop,
    retry,
    conversation,
    createConversation,
    loadConversation,
  } = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
    authorization: "Bearer token",
  });

  return (
    <div>
      {messages.map(msg => (
        <div key={msg.id}>{msg.content}</div>
      ))}
      
      {isLoading && <div>{streamingText || "Loading..."}</div>}
      
      <input
        onKeyPress={(e) => {
          if (e.key === "Enter") {
            sendMessage(e.currentTarget.value);
            e.currentTarget.value = "";
          }
        }}
      />
    </div>
  );
}
```

[Full useChat documentation →](/api/use-chat)

## useChatHistory

Hook for managing conversation history:

```tsx
import { useChatHistory } from "@cognipeer/chat-ui";

function HistorySidebar() {
  const {
    conversations,
    isLoading,
    hasMore,
    load,
    loadMore,
    deleteConversation,
    refresh,
  } = useChatHistory({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  return (
    <div>
      {conversations.map(conv => (
        <div key={conv.id}>
          {conv.title}
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

[Full useChatHistory documentation →](/api/use-chat-history)

## Combining Hooks

Use both hooks together for a complete implementation:

```tsx
import { useChat, useChatHistory, ChatMessageList, ChatInput } from "@cognipeer/chat-ui";

function CustomChatApp() {
  const chat = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });
  
  const history = useChatHistory({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 border-r">
        <button onClick={() => chat.createConversation()}>
          New Chat
        </button>
        
        {history.conversations.map(conv => (
          <div
            key={conv.id}
            onClick={() => chat.loadConversation(conv.id)}
            className={conv.id === chat.conversation?.id ? "active" : ""}
          >
            {conv.title || "Untitled"}
          </div>
        ))}
      </div>
      
      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        <ChatMessageList
          messages={chat.messages}
          isLoading={chat.isLoading}
          streamingText={chat.streamingText}
        />
        
        <ChatInput
          onSubmit={chat.sendMessage}
          isLoading={chat.isLoading}
          onStop={chat.stop}
        />
      </div>
    </div>
  );
}
```

## Custom Hook Patterns

### With Local Storage

```tsx
import { useChat } from "@cognipeer/chat-ui";
import { useEffect } from "react";

function useChatWithPersistence(options) {
  const chat = useChat(options);

  // Persist last conversation ID
  useEffect(() => {
    if (chat.conversation?.id) {
      localStorage.setItem("lastConversationId", chat.conversation.id);
    }
  }, [chat.conversation?.id]);

  // Restore last conversation
  useEffect(() => {
    const lastId = localStorage.getItem("lastConversationId");
    if (lastId) {
      chat.loadConversation(lastId);
    }
  }, []);

  return chat;
}
```

### With Analytics

```tsx
import { useChat } from "@cognipeer/chat-ui";

function useChatWithAnalytics(options) {
  const chat = useChat({
    ...options,
    onMessageSent: (message) => {
      analytics.track("message_sent", { length: message.content.length });
      options.onMessageSent?.(message);
    },
    onMessageReceived: (message) => {
      analytics.track("message_received");
      options.onMessageReceived?.(message);
    },
    onError: (error) => {
      analytics.track("chat_error", { message: error.message });
      options.onError?.(error);
    },
  });

  return chat;
}
```

## Next Steps

- [useChat](/api/use-chat)
- [useChatHistory](/api/use-chat-history)
- [Client](/api/client)
