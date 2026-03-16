# State Management

`@cognipeer/chat-ui` supports two state-management styles.

The right choice depends on your runtime profile. If you have not decided that yet, start with [Runtime Profiles](/guide/runtime-profiles).

## 1) API-first (default)

Use `Chat` or `ChatMinimal` when you want a complete chat experience with minimal setup.

```tsx
import { Chat } from "@cognipeer/chat-ui";

<Chat baseUrl="/api/agents" agentId="assistant" />;
```

Best for:

- fast delivery
- standard chat layouts
- minimal custom orchestration

This is still the recommended default when your product goal is to ship quickly rather than own every layout detail.

## 2) React-controlled (Context + Hooks)

Use `ChatProvider + useChatContext` when you want to control chat behavior directly from your React tree.

```tsx
import {
	ChatProvider,
	useChatContext,
	ChatMessageList,
	ChatInput,
} from "@cognipeer/chat-ui";

function ChatContent() {
	const chat = useChatContext();

	return (
		<>
			<ChatMessageList
				messages={chat.messages}
				isStreaming={chat.isStreaming}
				streamingText={chat.streamingText}
			/>
			<ChatInput
				onSend={chat.sendMessage}
				onStop={chat.stop}
				isLoading={chat.isStreaming}
			/>
		</>
	);
}

export default function Page() {
	return (
		<ChatProvider baseUrl="/api/agents" agentId="assistant">
			<ChatContent />
		</ChatProvider>
	);
}
```

Best for:

- custom page-level orchestration
- multi-panel/chat dashboards
- integrating chat state with local app state, analytics, feature flags

Use `ChatProvider` when many nested components need access to the same chat runtime. If the chat shell is still mostly local to one page component, `useChat` alone is usually enough.

## Direct state intervention

`useChat` and `useChatContext` expose direct setters for advanced control:

- `setMessages`
- `setConversation`
- `setIsStreaming`
- `setStreamingText`
- `setProgressMessage`
- `setPendingFiles`
- `setActiveToolCalls`
- `setError`

Use these for explicit override/sync flows. For standard message lifecycle, prefer `sendMessage`, `retry`, `stop`, `loadConversation`, `clearMessages`.

## Composition with history

`useChatHistory` remains independent and composes with both styles.

Recommended pattern:

- let `ChatProvider/useChat` own active conversation state
- let `useChatHistory` own list/pagination/delete concerns
- call `history.refresh()` after `onConversationCreated` / `onMessageReceived` when needed

This pattern becomes especially useful in route-driven or multi-panel workspaces.

## Which one should I choose?

- Start with API-first if you need a production chat quickly.
- Move to React-controlled mode when layout/control requirements grow.
- Keep both available in the same codebase: they are complementary, not mutually exclusive.

## Related Docs

- [Runtime Profiles](/guide/runtime-profiles)
- [Custom Layout Composition](/guide/custom-layout-composition)
- [Router Sync](/guide/router-sync)
