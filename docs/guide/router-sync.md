# Router Sync

If your product treats conversations as addressable app state, you should synchronize the active conversation with the URL.

This matters for:

- deep links
- browser back/forward navigation
- reload-safe workspaces
- support or operator tools that share conversation URLs

## The Simplest Pattern

If you are using the top-level `Chat` component, pass a route-driven `conversationId`:

```tsx
"use client";

import { Chat } from "@cognipeer/chat-ui";
import { useParams } from "next/navigation";

export default function ConversationPage() {
  const params = useParams();

  return (
    <Chat
      baseUrl="/api/agents"
      agentId="assistant"
      conversationId={params.conversationId as string}
    />
  );
}
```

This is the fastest route when the page URL already encodes the active conversation.

## Syncing Selection Back To The Router

If the user can switch conversations in the UI, update the router when selection changes:

```tsx
"use client";

import { Chat } from "@cognipeer/chat-ui";
import { useRouter } from "next/navigation";

export default function ChatPage() {
  const router = useRouter();

  return (
    <Chat
      baseUrl="/api/agents"
      agentId="assistant"
      onConversationSelected={(conversation) => {
        router.push(`/chat/${conversation.id}`);
      }}
    />
  );
}
```

## When Built-In `Chat` Is Enough

Use the built-in component when:

- the route owns the conversation identity
- you do not need custom sidebar behavior
- the default history UI is still acceptable

## When To Move To Custom Composition

Use hooks and custom layout when:

- the route and the history UI need tighter coordination
- the active conversation affects multiple panels
- selection rules depend on host-app state
- you want custom empty, loading, or guardrail behavior around route changes

At that point, let the router own the ID and call `loadConversation(id)` explicitly from `useChat`.

## Browser History And Deep Links

Good router sync means:

- loading the correct conversation on first render
- pushing or replacing the URL when the active conversation changes
- not losing the selected thread on reload

If your product uses deep linking heavily, this is usually the point where a custom layout pays off.

## Related Docs

- [History Sidebar](/guide/history)
- [Custom Layout Composition](/guide/custom-layout-composition)
- [Next.js](/guide/nextjs)
- [Vite](/guide/vite)
