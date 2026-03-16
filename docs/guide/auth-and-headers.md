# Auth & Headers

Most production integrations need more than `baseUrl` and `agentId`. This page covers the request-level data you pass from the host app into `chat-ui`.

## The Two Main Inputs

`chat-ui` exposes two direct request inputs:

- `authorization`
- `headers`

Use `authorization` for the primary auth credential and `headers` for tenant context, tracing headers, or other integration-specific request metadata.

## Bearer Tokens

The common case is a bearer token:

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  authorization={`Bearer ${token}`}
/>
```

This keeps the top-level auth path explicit and easy to audit.

## Custom Headers

Use `headers` for app-specific context:

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  authorization={`Bearer ${token}`}
  headers={{
    "X-Tenant-ID": tenantId,
    "X-Request-Source": "chat-ui",
  }}
/>
```

Typical examples:

- tenant or workspace identifiers
- internal trace correlation IDs
- deployment or product-surface markers

## Next.js Token Forwarding Pattern

In frameworks like Next.js, a common pattern is:

1. authenticate the user in your app
2. resolve the access token in your client shell or route boundary
3. pass it into `Chat` or `useChat` through `authorization`

```tsx
"use client";

import { Chat } from "@cognipeer/chat-ui";
import { useSession } from "next-auth/react";

export default function ChatPage() {
  const { data: session } = useSession();

  return (
    <Chat
      baseUrl="/api/agents"
      agentId="assistant"
      authorization={session?.accessToken ? `Bearer ${session.accessToken}` : undefined}
    />
  );
}
```

## Hooks Use The Same Inputs

If you are building a custom layout, the same request inputs apply:

```tsx
const chat = useChat({
  baseUrl: "/api/agents",
  agentId: "assistant",
  authorization: `Bearer ${token}`,
  headers: {
    "X-Tenant-ID": tenantId,
  },
});
```

## Practical Cautions

- Do not put long-lived secrets into public environment variables.
- Treat browser-accessible tokens as part of your normal frontend security model.
- Keep auth refresh and token lifetime logic in the host app, not in the chat surface.
- If the backend needs more context than auth alone, prefer explicit headers over hidden coupling.

## Related Docs

- [Next.js](/guide/nextjs)
- [Vite](/guide/vite)
- [Agent Server](/guide/agent-server)
- [Router Sync](/guide/router-sync)
