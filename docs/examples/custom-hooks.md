# Custom Hooks

Build a custom chat interface using hooks.

## Full Example

```tsx
import {
  useChat,
  useChatHistory,
  ChatMessageList,
  ChatInput,
  ChatHistory,
} from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

export default function CustomChat() {
  const chat = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
    onError: (error) => {
      console.error("Chat error:", error);
    },
  });

  const history = useChatHistory({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  const handleNewChat = async () => {
    await chat.createConversation();
    history.refresh();
  };

  const handleSelectConversation = (conv) => {
    chat.loadConversation(conv.id);
  };

  const handleDeleteConversation = async (id) => {
    await history.deleteConversation(id);
    if (chat.conversation?.id === id) {
      handleNewChat();
    }
  };

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-700 flex flex-col">
        <div className="p-4">
          <button
            onClick={handleNewChat}
            className="w-full px-4 py-2 bg-green-600 text-white rounded"
          >
            + New Chat
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {history.conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => handleSelectConversation(conv)}
              className={`p-3 cursor-pointer flex justify-between ${
                conv.id === chat.conversation?.id
                  ? "bg-gray-700"
                  : "hover:bg-gray-800"
              }`}
            >
              <span className="text-white truncate">
                {conv.title || "Untitled"}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteConversation(conv.id);
                }}
                className="text-gray-400 hover:text-red-500"
              >
                🗑️
              </button>
            </div>
          ))}
          
          {history.hasMore && (
            <button
              onClick={history.loadMore}
              className="w-full p-2 text-gray-400 hover:text-white"
            >
              Load more...
            </button>
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col">
        <header className="p-4 border-b border-gray-700">
          <h1 className="text-white text-lg">
            {chat.conversation?.title || "New Conversation"}
          </h1>
        </header>
        
        <ChatMessageList
          messages={chat.messages}
          isLoading={chat.isLoading}
          streamingText={chat.streamingText}
          activeToolCalls={chat.activeToolCalls}
          renderActions={({ message, isStreaming }) => {
            if (isStreaming || message.role !== "assistant") return null;
            return (
              <div className="flex gap-2 opacity-50 hover:opacity-100">
                <button>👍</button>
                <button>👎</button>
              </div>
            );
          }}
        />
        
        <ChatInput
          onSubmit={(message, files) => chat.sendMessage(message, files)}
          isLoading={chat.isLoading}
          onStop={chat.stop}
          enableFileUpload={true}
        />
        
        {chat.error && (
          <div className="p-4 bg-red-900/50 text-red-200">
            Error: {chat.error.message}
            <button onClick={chat.retry} className="ml-2 underline">
              Retry
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
```

## Minimal Custom Chat

```tsx
import { useChat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

export default function MinimalCustomChat() {
  const { messages, isLoading, streamingText, sendMessage } = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const input = e.target.elements.message;
    if (input.value.trim()) {
      sendMessage(input.value);
      input.value = "";
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-3 rounded ${
              msg.role === "user" ? "bg-blue-900 ml-12" : "bg-gray-800 mr-12"
            }`}
          >
            {msg.content}
          </div>
        ))}
        
        {isLoading && streamingText && (
          <div className="p-3 rounded bg-gray-800 mr-12">
            {streamingText}
            <span className="animate-pulse">▊</span>
          </div>
        )}
      </div>
      
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            name="message"
            placeholder="Type a message..."
            className="flex-1 p-2 rounded bg-gray-800 text-white"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-green-600 rounded disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
```

## With Analytics

```tsx
import { useChat } from "@cognipeer/chat-ui";

function useChatWithAnalytics() {
  return useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
    onMessageSent: (message) => {
      analytics.track("chat_message_sent", {
        length: message.content.length,
      });
    },
    onMessageReceived: (message) => {
      analytics.track("chat_message_received", {
        toolCalls: message.toolCalls?.length || 0,
      });
    },
    onToolCall: (name) => {
      analytics.track("tool_called", { name });
    },
    onError: (error) => {
      analytics.track("chat_error", { message: error.message });
    },
  });
}
```

## Related

- [useChat Hook](/api/use-chat)
- [useChatHistory Hook](/api/use-chat-history)
- [With Feedback](/examples/with-feedback)
