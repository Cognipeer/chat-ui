# ChatProvider + Context Hooks

`ChatProvider` is the React-controlled alternative to the API-first `Chat` component.

Use this mode when you want to orchestrate chat behavior from multiple React components (header, panels, custom actions, analytics layer) without prop drilling.

## Import

```tsx
import {
  ChatProvider,
  useChatContext,
  useChatContextOptional,
} from "@cognipeer/chat-ui";
```

## Why this alternative exists

Default path (`Chat`) is API-first and batteries-included: you pass config and get a full UI.

Context mode is React-first:

- You own the layout completely.
- Any child component can read/update chat state.
- You can compose your own orchestration flows with regular React patterns.

## Provider usage

`ChatProvider` accepts the same options as `useChat`.

```tsx
function AppChatShell() {
  return (
    <ChatProvider
      baseUrl="/api/agents"
      agentId="assistant"
      streaming
      onError={(error) => console.error(error)}
    >
      <MyHeader />
      <MyMessages />
      <MyInput />
    </ChatProvider>
  );
}
```

## Reading and controlling state

```tsx
function MyMessages() {
  const chat = useChatContext();

  return (
    <div>
      {chat.messages.map((message) => (
        <div key={message.id}>{String(message.content)}</div>
      ))}
      {chat.isStreaming && <p>{chat.streamingText}</p>}
    </div>
  );
}
```

## Direct state intervention

`useChatContext()` (and `useChat`) now exposes direct state setters for advanced control:

- `setMessages`
- `setConversation`
- `setIsStreaming`
- `setStreamingText`
- `setProgressMessage`
- `setPendingFiles`
- `setActiveToolCalls`
- `setError`

Example:

```tsx
function AdminControls() {
  const chat = useChatContext();

  return (
    <button
      onClick={() => {
        chat.setMessages([]);
        chat.setStreamingText("");
        chat.setProgressMessage("");
      }}
    >
      Force Reset
    </button>
  );
}
```

## Optional access

Use `useChatContextOptional()` when a component may render both inside and outside a provider.

```tsx
function MaybeChatBadge() {
  const chat = useChatContextOptional();
  if (!chat) return null;

  return <span>{chat.messages.length} messages</span>;
}
```

## Recommended architecture

- Keep `ChatProvider` close to the screen/page boundary.
- Keep presentational components stateless where possible.
- Use context actions (`sendMessage`, `retry`, `stop`, `loadConversation`) in leaf components.
- Reserve direct setters for admin/override flows and synchronization scenarios.

## Related

- [Hooks](/api/hooks)
- [useChat](/api/use-chat)
- [State Management](/guide/state-management)
