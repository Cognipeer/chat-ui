# useChat Hook

The main hook for chat functionality.

## Import

```tsx
import { useChat } from "@cognipeer/chat-ui";
```

## Usage

```tsx
const {
  // State
  messages,
  isLoading,
  error,
  streamingText,
  activeToolCalls,
  conversation,
  pendingFiles,
  
  // Actions
  sendMessage,
  stop,
  retry,
  createConversation,
  loadConversation,
  addFiles,
  removeFile,
  clearFiles,
} = useChat({
  baseUrl: "/api/agents",
  agentId: "assistant",
});
```

## Options

```typescript
interface UseChatOptions {
  // Required
  baseUrl: string;
  agentId: string;
  
  // Optional
  authorization?: string;
  headers?: Record<string, string>;
  conversationId?: string;
  streaming?: boolean;
  enableFileUpload?: boolean;
  maxFileSize?: number;
  
  // Callbacks
  onMessageSent?: (message: Message) => void;
  onMessageReceived?: (message: Message) => void;
  onStreamText?: (chunk: string, fullText: string) => void;
  onToolCall?: (name: string, args: object) => void;
  onToolResult?: (name: string, result: any) => void;
  onConversationCreated?: (conversation: Conversation) => void;
  onError?: (error: Error) => void;
}
```

## Return Value

```typescript
interface UseChatReturn {
  // Messages
  messages: Message[];
  
  // Loading state
  isLoading: boolean;
  streamingText: string;
  activeToolCalls: Map<string, ToolCallState>;
  
  // Error handling
  error: Error | null;
  
  // Conversation
  conversation: Conversation | null;
  
  // Files
  pendingFiles: FileAttachment[];
  
  // Actions
  sendMessage: (content: string, files?: File[]) => Promise<void>;
  stop: () => void;
  retry: () => Promise<void>;
  createConversation: (title?: string) => Promise<Conversation>;
  loadConversation: (id: string) => Promise<void>;
  addFiles: (files: File[]) => Promise<void>;
  removeFile: (fileId: string) => void;
  clearFiles: () => void;
}
```

## Examples

### Basic Usage

```tsx
function Chat() {
  const { messages, sendMessage, isLoading } = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  return (
    <div>
      {messages.map(msg => (
        <div key={msg.id}>{msg.content}</div>
      ))}
      
      <form onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.message;
        sendMessage(input.value);
        input.value = "";
      }}>
        <input name="message" disabled={isLoading} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

### With Authentication

```tsx
const chat = useChat({
  baseUrl: "/api/agents",
  agentId: "assistant",
  authorization: `Bearer ${accessToken}`,
});
```

### With Streaming Callbacks

```tsx
const chat = useChat({
  baseUrl: "/api/agents",
  agentId: "assistant",
  onStreamText: (chunk, fullText) => {
    console.log("Received chunk:", chunk);
    console.log("Full text so far:", fullText);
  },
  onToolCall: (name, args) => {
    console.log("Tool called:", name, args);
  },
});
```

### With File Uploads

```tsx
function ChatWithFiles() {
  const { 
    sendMessage, 
    addFiles, 
    removeFile, 
    pendingFiles 
  } = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
    enableFileUpload: true,
    maxFileSize: 10 * 1024 * 1024,
  });

  return (
    <div>
      <input
        type="file"
        multiple
        onChange={(e) => addFiles(Array.from(e.target.files || []))}
      />
      
      {pendingFiles.map(file => (
        <div key={file.id}>
          {file.name}
          <button onClick={() => removeFile(file.id)}>×</button>
        </div>
      ))}
      
      <button onClick={() => sendMessage("Analyze these files")}>
        Send
      </button>
    </div>
  );
}
```

### Conversation Management

```tsx
function ConversationManager() {
  const {
    conversation,
    createConversation,
    loadConversation,
  } = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  const handleNew = async () => {
    const conv = await createConversation("New Chat");
    console.log("Created:", conv.id);
  };

  const handleLoad = async (id: string) => {
    await loadConversation(id);
  };

  return (
    <div>
      <p>Current: {conversation?.id}</p>
      <button onClick={handleNew}>New Chat</button>
    </div>
  );
}
```

### Error Handling

```tsx
function ChatWithErrors() {
  const { error, retry, sendMessage } = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
    onError: (err) => {
      console.error("Chat error:", err);
      showNotification({ type: "error", message: err.message });
    },
  });

  return (
    <div>
      {error && (
        <div className="error">
          <p>{error.message}</p>
          <button onClick={retry}>Retry</button>
        </div>
      )}
    </div>
  );
}
```

### Stop Generation

```tsx
function ChatWithStop() {
  const { isLoading, stop, streamingText } = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  return (
    <div>
      {isLoading && (
        <>
          <p>{streamingText}</p>
          <button onClick={stop}>Stop</button>
        </>
      )}
    </div>
  );
}
```

### Custom Message Handling

```tsx
function CustomChat() {
  const chat = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
    onMessageSent: (message) => {
      // Log, analytics, etc.
      analytics.track("message_sent");
    },
    onMessageReceived: (message) => {
      // Check for specific content
      if (message.content.includes("URGENT")) {
        showUrgentNotification();
      }
    },
  });

  return <div>{/* ... */}</div>;
}
```

## State Management

The hook manages:

1. **Messages** - Full conversation history
2. **Streaming** - Incremental text and tool calls
3. **Files** - Pending file attachments
4. **Error** - Last error state
5. **Loading** - Request in progress

## Related

- [useChatHistory](/api/use-chat-history)
- [Client](/api/client)
- [Types](/api/types)
