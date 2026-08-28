# Next.js Integration

Integrate Chat UI with Next.js applications.

Next.js is a strong fit when your product wants route-driven conversations, session-aware requests, and a client chat surface inside a broader server-rendered application shell.

## App Router (Recommended)

For most new apps, App Router should be your default path.

### Basic Setup

```tsx
// app/chat/page.tsx
"use client";

import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

export default function ChatPage() {
  return (
    <div className="h-screen">
      <Chat
        baseUrl="/api/agents"
        agentId="assistant"
        theme="dark"
      />
    </div>
  );
}
```

### With Layout

```tsx
// app/chat/layout.tsx
import "@cognipeer/chat-ui/styles.css";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen bg-gray-900">
      {children}
    </div>
  );
}
```

### With Authentication

```tsx
// app/chat/page.tsx
"use client";

import { Chat } from "@cognipeer/chat-ui";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";

export default function ChatPage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div>Loading...</div>;
  }

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="h-screen">
      <Chat
        baseUrl="/api/agents"
        agentId="assistant"
        authorization={`Bearer ${session.accessToken}`}
      />
    </div>
  );
}
```

If the app already owns the session, keep auth resolution in the host application and pass the final request credential into `Chat`. For the broader model, read [Auth & Headers](/guide/auth-and-headers).

### With Server-Side Data

```tsx
// app/chat/page.tsx
import ChatClient from "./ChatClient";

async function getAgentInfo() {
  const res = await fetch(`${process.env.API_URL}/agents/assistant`, {
    cache: "no-store",
  });
  return res.json();
}

export default async function ChatPage() {
  const agent = await getAgentInfo();

  return <ChatClient agent={agent} />;
}

// app/chat/ChatClient.tsx
"use client";

import { Chat } from "@cognipeer/chat-ui";

export default function ChatClient({ agent }) {
  return (
    <div className="h-screen">
      <h1>{agent.name}</h1>
      <Chat
        baseUrl="/api/agents"
        agentId={agent.id}
      />
    </div>
  );
}
```

This split works well when server components fetch page context and a client component owns the interactive chat runtime.

## Pages Router

```tsx
// pages/chat.tsx
import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

export default function ChatPage() {
  return (
    <div style={{ height: "100vh" }}>
      <Chat
        baseUrl="/api/agents"
        agentId="assistant"
        theme="dark"
      />
    </div>
  );
}
```

## With Agent Server

Set up your API route to use agent-server:

```tsx
// app/api/agents/[...path]/route.ts
import { createAgentServer, createNextRouteHandlers } from "@cognipeer/agent-server";

const storage = createMemoryProvider();
const agentServer = createAgentServer({
  basePath: "/api/agents",
  storage,
});

// Register your agents...

await storage.connect();

export const { GET, POST, PATCH, DELETE, OPTIONS } = createNextRouteHandlers(agentServer);
```

Then use Chat UI:

```tsx
"use client";

import { Chat } from "@cognipeer/chat-ui";

export default function ChatPage() {
  return (
    <Chat
      baseUrl="/api/agents"
      agentId="assistant"
    />
  );
}
```

## Route-Based Conversations

```tsx
// app/chat/[conversationId]/page.tsx
"use client";

import { Chat } from "@cognipeer/chat-ui";
import { useParams } from "next/navigation";

export default function ConversationPage() {
  const { conversationId } = useParams();

  return (
    <Chat
      baseUrl="/api/agents"
      agentId="assistant"
      conversationId={conversationId as string}
    />
  );
}
```

This is the simplest deep-link pattern. If users should also push conversation changes back into the URL from the chat surface, continue with [Router Sync](/guide/router-sync).

## SSR Considerations

Chat UI is a client component. Always use `"use client"` directive:

```tsx
"use client"; // Required!

import { Chat } from "@cognipeer/chat-ui";
```

In practice:

- keep auth gates, page data fetching, and layout decisions in the host app
- keep the chat runtime inside a client boundary

## Environment Variables

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3000/api/agents
```

```tsx
<Chat
  baseUrl={process.env.NEXT_PUBLIC_API_URL || "/api/agents"}
  agentId="assistant"
/>
```

## Error Boundary

```tsx
"use client";

import { ErrorBoundary } from "react-error-boundary";
import { Chat } from "@cognipeer/chat-ui";

function ChatError({ error, resetErrorBoundary }) {
  return (
    <div>
      <p>Something went wrong: {error.message}</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

export default function ChatPage() {
  return (
    <ErrorBoundary FallbackComponent={ChatError}>
      <Chat
        baseUrl="/api/agents"
        agentId="assistant"
      />
    </ErrorBoundary>
  );
}
```

## Recommended Reading Order For Next.js Teams

1. Set up the basic client shell here.
2. Add [Auth & Headers](/guide/auth-and-headers) if requests need credentials or tenant context.
3. Add [Router Sync](/guide/router-sync) if the URL should represent the active conversation.
4. Move to [Custom Layout Composition](/guide/custom-layout-composition) if the built-in shell no longer matches your app.

## Tailwind Configuration

```javascript
// tailwind.config.js
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@cognipeer/chat-ui/**/*.{js,mjs}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

## Next Steps

- [Auth & Headers](/guide/auth-and-headers)
- [Router Sync](/guide/router-sync)
- [Custom Layout Composition](/guide/custom-layout-composition)
- [Vite Integration](/guide/vite)
- [Agent Server Integration](/guide/agent-server)
- [Examples](/examples/)
