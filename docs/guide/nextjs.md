# Next.js Integration

Integrate Chat UI with Next.js applications.

## App Router (Recommended)

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

## SSR Considerations

Chat UI is a client component. Always use `"use client"` directive:

```tsx
"use client"; // Required!

import { Chat } from "@cognipeer/chat-ui";
```

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

- [Vite Integration](/guide/vite)
- [Agent Server Integration](/guide/agent-server)
- [Examples](/examples/)
