# Custom Layout Composition

Use custom composition when the default `Chat` shell is close, but not close enough for your product.

This is the point where you keep the library's chat logic and low-level components, but fully own the page layout.

## Typical Building Blocks

The usual custom shell uses:

- `useChat`
- `useChatHistory`
- `ChatHistory`
- `ChatMessageList`
- `ChatInput`

Optionally:

- `ChatProvider`
- `ToolCalls`

## Example Workspace Layout

```tsx
import {
  ChatHistory,
  ChatInput,
  ChatMessageList,
  useChat,
  useChatHistory,
} from "@cognipeer/chat-ui";

export default function WorkspaceChat() {
  const chat = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  const history = useChatHistory({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  return (
    <div className="grid h-screen grid-cols-[280px_1fr]">
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

      <div className="flex min-h-0 flex-col">
        <header className="border-b px-4 py-3">
          {chat.conversation?.title || "New chat"}
        </header>

        <ChatMessageList
          messages={chat.messages}
          isStreaming={chat.isStreaming}
          streamingText={chat.streamingText}
          progressMessage={chat.progressMessage}
          activeToolCalls={chat.activeToolCalls}
        />

        <ChatInput
          onSend={chat.sendMessage}
          onStop={chat.stop}
          onFilesAdd={chat.addFiles}
          onFileRemove={chat.removeFile}
          pendingFiles={chat.pendingFiles}
          isLoading={chat.isStreaming}
        />
      </div>
    </div>
  );
}
```

## When To Add `ChatProvider`

Add `ChatProvider` when many child components need chat access and prop threading becomes noisy.

That is useful for:

- shared headers and command bars
- side panels that react to tool activity
- feature-gated controls
- analytics or admin wrappers

If the chat shell is still mostly local to one page component, `useChat` alone is usually enough.

## Recommended Composition Rules

- Let `useChat` own the active conversation and streaming lifecycle.
- Let `useChatHistory` own list loading, pagination, and deletion.
- Keep the router as the source of truth if your app has route-driven conversations.
- Use `ChatMessageList` and `ChatInput` unless you have a strong reason to replace them.

## Good Reasons To Go Custom

- your layout already has a product-specific header and sidebar
- you need route-driven conversations
- you want tool activity or structured results in a separate panel
- you need tighter orchestration with app state

## Related Docs

- [Runtime Profiles](/guide/runtime-profiles)
- [State Management](/guide/state-management)
- [Router Sync](/guide/router-sync)
- [Tool Calls](/guide/tool-calls)
