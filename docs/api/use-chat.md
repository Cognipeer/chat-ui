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
  isStreaming,
  isLoadingConversation,
  error,
  streamingText,
  progressMessage,
  activeToolCalls,
  conversation,
  pendingFiles,
  isUploading,

  // Approvals and questions
  pendingActions,
  awaitingAction,
  isResolvingAction,
  canResolveActions,
  answerableQuestion,
  resolveAction,

  // Actions
  sendMessage,
  stop,
  retry,
  createConversation,
  loadConversation,
  addFiles,
  removeFile,
  clearMessages,

  // What the composer is doing: "open" | "blocked" | "cancel" | "answer" | "following" | "budget_paused" | "readonly"
  composerState: ComposerState;

  // Usage limit
  budget: ConversationBudget | null;
  spentUsd: number | undefined;
  budgetExhausted: boolean;
  canContinue: boolean;               // the transport can carry on a turn the limit stopped
  canUpdateBudget: boolean;
  continueConversation: () => Promise<boolean>;
  // continue: true calls /continue exactly when the server's answer says continuable (older servers: status budget_paused)
  updateBudget: (budget: ConversationBudget | null, options?: { continue?: boolean }) => Promise<boolean>;

  // Direct state control
  setMessages,
  setConversation,
  setIsStreaming,
  setStreamingText,
  setProgressMessage,
  setPendingFiles,
  setActiveToolCalls,
} = useChat({
  baseUrl: "/api/agents",
  agentId: "assistant",
});
```

## Options

`UseChatOptions` is `ChatConfig` (see [Types](/api/types#chatconfig)) and `ChatCallbacks`, plus:

```typescript
interface UseChatOptions extends ChatConfig, ChatCallbacks {
  baseUrl?: string;        // or `transport`
  agentId?: string;
  conversationId?: string; // opened on mount
  initialMessages?: Message[];

  streaming?: boolean;                 // default true
  enableFileUpload?: boolean;          // default true
  allowedFileTypes?: string[];
  maxFileSize?: number;                // bytes, default 10 MB
  maxFiles?: number;                   // default 10
  /** What maxFiles counts: files per message (default) or per conversation */
  maxFilesScope?: "message" | "conversation";
  fileTransport?: "inline" | "upload" | "upload-on-select"; // default "inline"
  /** Text sent when a message carries files and no typed text; "" sends none */
  attachmentsOnlyMessage?: string;     // default: localized "review the attached files"

  /** What a new message does while an approval or question waits */
  pendingActionComposerMode?: "block" | "cancel"; // default "block"
  /** How long after a card's deadline the conversation is fetched again (ms) */
  actionExpiryRefreshMs?: number;      // default 1500
  /** How long to wait before looking once more for the answer of a followed turn (ms) */
  followSettleRetryMs?: number;        // default 1500
  /** A lone free-text question is answered from the composer */
  enableQuestions?: boolean;           // default true
  /** The chat is a transcript: composerState is "readonly" */
  readOnly?: boolean;                  // default false
}
```

## Return Value

```typescript
interface UseChatReturn {
  // Messages
  messages: Message[];
  
  // Loading state
  isLoading: boolean;                 // isStreaming || isLoadingConversation
  isStreaming: boolean;               // also true while following a turn that runs elsewhere
  isFollowing: boolean;               // only watching a turn another window started (or this page before a reload)
  isLoadingConversation: boolean;
  streamingText: string;
  progressMessage: string;
  activeToolCalls: Map<string, ToolCallState>;
  plan: PlanSnapshot | undefined;     // the agent's plan for the running turn (stream.plan), if it published one
  isCondensing: boolean;              // the agent is condensing its earlier context right now
  
  // Error handling: a localized, friendly message for well-known server codes
  error: Error | null;
  
  // Conversation
  conversation: Conversation | null;
  
  // Long conversations: the server sends the newest page of the history
  hasEarlierMessages: boolean;        // older messages exist than the ones loaded
  isLoadingEarlierMessages: boolean;
  loadEarlierMessages: () => Promise<boolean>;   // puts the page just older than the oldest shown in front; false when there is none, one is on its way, or it failed

  // Files
  pendingFiles: FileAttachment[];     // images carry a local `previewUrl`; files stored on their own carry status / progress
  isUploading: boolean;               // files are going up (for the message being sent, or stored as they were picked)
  heldFiles: number;                  // files the conversation holds: the server's count, else those of the loaded messages
  heldFilesMax: number | undefined;   // the server's limit, when it says
  retryFile: (fileId: string) => Promise<void>;   // upload a file again after it failed
  resolveFileUrl?: (file: FileAttachment, options?: { disposition?: "inline" | "attachment" }) => Promise<string | undefined>;

  // Approvals and questions
  pendingActions: PendingActionEntry[]; // waiting for an answer, oldest first
  awaitingAction: boolean;
  isResolvingAction: boolean;
  canResolveActions: boolean;           // false when the transport cannot answer
  answerableQuestion: { actionId: string; question: UserQuestion } | null; // a lone free-text question
  // Resolves false when the answer was not taken (the card is back to waiting,
  // or shows that the request expired / was cancelled / was answered elsewhere)
  resolveAction: (actionId: string, resolution: ActionResolution) => Promise<boolean>;
  
  // Actions
  // Resolves false when the message was refused before the server took it: the
  // transcript is unchanged, the files are still in pendingFiles, `error` says why.
  // Empty text is fine while files are attached.
  // `options.reuseFiles`: files already stored in the conversation that go with this message (used by
  // `retryInterrupted`); they are named in the request and left alone if it fails.
  sendMessage: (content: string, options?: { reuseFiles?: FileAttachment[] }) => Promise<boolean>;
  // The conversation ends on a message of the person's that never got its answer: the run was cut off
  // (the runtime stopped on an error). `Chat` shows "The reply was interrupted" with a retry.
  interrupted: boolean;
  // Send that message again, with the stored files it carried. false: nothing to retry / it was refused.
  retryInterrupted: () => Promise<boolean>;
  // Stops the run on the server (transport.cancel) and closes the stream; the partial answer stays, marked stopped.
  // Without cancel it only closes the connection.
  stop: () => void;
  retry: () => Promise<void>;
  createConversation: (title?: string) => Promise<Conversation>;
  loadConversation: (id: string) => Promise<void>;
  addFiles: (files: File[]) => Promise<void>;
  removeFile: (fileId: string) => void;
  clearMessages: () => void;

  // What the composer is doing: "open" | "blocked" | "cancel" | "answer" | "following" | "budget_paused" | "readonly"
  composerState: ComposerState;

  // Usage limit
  budget: ConversationBudget | null;
  spentUsd: number | undefined;
  budgetExhausted: boolean;
  canContinue: boolean;               // the transport can carry on a turn the limit stopped
  canUpdateBudget: boolean;
  continueConversation: () => Promise<boolean>;
  // continue: true calls /continue exactly when the server's answer says continuable (older servers: status budget_paused)
  updateBudget: (budget: ConversationBudget | null, options?: { continue?: boolean }) => Promise<boolean>;

  // Direct state control
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setConversation: React.Dispatch<React.SetStateAction<Conversation | null>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingText: React.Dispatch<React.SetStateAction<string>>;
  setProgressMessage: React.Dispatch<React.SetStateAction<string>>;
  setPendingFiles: React.Dispatch<React.SetStateAction<FileAttachment[]>>;
  setActiveToolCalls: React.Dispatch<React.SetStateAction<Map<string, ToolCallState>>>;
  setError: (error: Error | null) => void;
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

### Files without text, previews

```tsx
const chat = useChat({ baseUrl: "/api/agents", agentId: "assistant" });

await chat.addFiles(Array.from(input.files));   // refusals (size, count, type, empty) go to `error` and `onError`
chat.pendingFiles.map((f) => f.previewUrl);      // object URL of an image, shown before anything is uploaded
await chat.sendMessage("");                      // files alone: sends `attachmentsOnlyMessage`
```

Preview URLs are revoked when a file is removed, the conversation is left or the hook unmounts.

### Approvals and questions

```tsx
function Cards() {
  const { pendingActions, resolveAction, canResolveActions } = useChat({ baseUrl: "/api/agents", agentId: "ops" });

  return pendingActions.map(({ action }) =>
    action.type === "tool_approval" ? (
      <div key={action.id}>
        {action.toolName}
        <button disabled={!canResolveActions} onClick={() => resolveAction(action.id, { type: "tool_approval", decision: "allow" })}>
          Approve
        </button>
      </div>
    ) : null
  );
}
```

A card past its `expiresAt` turns Expired on its own (which frees the composer) and the conversation is fetched again shortly after. See [Approvals and Questions](/guide/approvals).

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

A server error with a known `code` (`conversation_busy`, `rate_limited`, `file_too_large`, ...) becomes a localized, friendly `error.message`; `error.code`, `error.status` and `error.serverMessage` (the server's wording) stay on it. When a send is refused because a card is waiting or a turn is running (`action_pending`, `pending_action`, `conversation_busy`), the conversation is fetched again so the card or the latest answer shows.

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

`stop()` stops the run: with a transport that has `cancel` (agent-server 0.3.0+) it calls `POST /conversations/:id/cancel`, closes the stream, keeps the text received so far as a message marked stopped and then shows what the server kept. Without `cancel` it only closes the connection. While the hook is following a turn that runs elsewhere, `stop()` asks the server to cancel it. See [Running turns](/guide/runs).

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
3. **Files** - Pending file attachments, with image previews
4. **Approvals and questions** - Cards waiting for an answer, their deadlines and how they ended
5. **Runs** - A turn still running when a conversation opens is followed from the event log; a dropped connection is picked up again; `stop()` cancels on the server
6. **Usage limit** - `budget`, `spentUsd`, `continueConversation`, `updateBudget`
7. **Error** - Last error state, localized
8. **Loading** - Request in progress

## React-controlled mode

If you want to share this controller across many components, use:

- [ChatProvider + useChatContext](/api/chat-provider)

This gives the same API as `useChat`, but through React context.

## Related

- [useChatHistory](/api/use-chat-history)
- [Client](/api/client)
- [Types](/api/types)
