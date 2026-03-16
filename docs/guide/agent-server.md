# Agent Server Integration

Integrate Chat UI with `@cognipeer/agent-server`.

## Overview

Chat UI is designed to work seamlessly with `@cognipeer/agent-server`. The API endpoints match exactly.

The clean boundary is:

- `agent-server` owns auth, persistence, conversation APIs, and tool execution
- `chat-ui` owns the frontend chat surface, streaming UI, and interaction flow

## Architecture

```
┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │
│   Chat UI       │ ──────▶ │  Agent Server   │
│   (React)       │   SSE   │  (Node.js)      │
│                 │ ◀────── │                 │
└─────────────────┘         └─────────────────┘
```

## Setup

### 1. Set Up Agent Server

```typescript
// server.ts
import express from "express";
import {
  createAgentServer,
  createPostgresProvider,
  createExpressMiddleware,
} from "@cognipeer/agent-server";
import { createSmartAgent, fromLangchainModel } from "@cognipeer/agent-sdk";
import { ChatOpenAI } from "@langchain/openai";

const storage = createPostgresProvider({
  connectionString: process.env.DATABASE_URL,
});

const agentServer = createAgentServer({
  basePath: "/api/agents",
  storage,
  swagger: { enabled: true },
  cors: {
    enabled: true,
    origins: ["http://localhost:5173"], // Your frontend URL
  },
});

// Register your agent
const model = fromLangchainModel(new ChatOpenAI());
const assistant = createSmartAgent({
  name: "Assistant",
  model,
});

agentServer.registerSDKAgent("assistant", assistant);

const app = express();
app.use(express.json());

await storage.connect();
app.use(createExpressMiddleware(agentServer));

app.listen(3000);
```

### 2. Set Up Chat UI

```tsx
// App.tsx
import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

function App() {
  return (
    <div className="h-screen">
      <Chat
        baseUrl="http://localhost:3000/api/agents"
        agentId="assistant"
      />
    </div>
  );
}
```

## With Authentication

### Server

```typescript
import { createTokenAuthProvider } from "@cognipeer/agent-server";

const authProvider = createTokenAuthProvider({
  tokens: {
    [process.env.API_KEY]: "user-1",
  },
});

const agentServer = createAgentServer({
  basePath: "/api/agents",
  storage,
  auth: {
    enabled: true,
    provider: authProvider,
  },
});
```

### Client

```tsx
<Chat
  baseUrl="http://localhost:3000/api/agents"
  agentId="assistant"
  authorization="Bearer your-api-key"
/>
```

For frontend request-shaping guidance beyond the basic example, continue with [Auth & Headers](/guide/auth-and-headers).

## With JWT Authentication

### Server

```typescript
import { createJWTAuthProvider } from "@cognipeer/agent-server";

const authProvider = createJWTAuthProvider({
  secret: process.env.JWT_SECRET,
  extractUserId: (payload) => payload.sub,
});

const agentServer = createAgentServer({
  basePath: "/api/agents",
  storage,
  auth: {
    enabled: true,
    provider: authProvider,
  },
});
```

### Client

```tsx
import { useAuth } from "./auth-context";

function ChatPage() {
  const { token } = useAuth();

  return (
    <Chat
      baseUrl="/api/agents"
      agentId="assistant"
      authorization={`Bearer ${token}`}
    />
  );
}
```

This is the common production path when your host app already resolves user identity and just needs to forward the effective access token into the chat layer.

## Next.js Full Stack

### API Route

```typescript
// app/api/agents/[...path]/route.ts
import {
  createAgentServer,
  createPostgresProvider,
  createNextRouteHandlers,
} from "@cognipeer/agent-server";

const storage = createPostgresProvider({
  connectionString: process.env.DATABASE_URL,
});

const agentServer = createAgentServer({
  basePath: "/api/agents",
  storage,
});

// Register agents...

await storage.connect();

export const { GET, POST, PATCH, DELETE, OPTIONS } = createNextRouteHandlers(agentServer);
```

### Client Page

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
      />
    </div>
  );
}
```

## Multiple Agents

Register multiple agents on the server:

```typescript
agentServer.registerSDKAgent("assistant", assistantAgent, {
  description: "General purpose assistant",
});

agentServer.registerSDKAgent("code-helper", codeAgent, {
  description: "Helps with coding tasks",
});

agentServer.registerCustomAgent("simple-bot", {
  processMessage: async ({ message }) => ({
    content: `You said: ${message}`,
  }),
});
```

Use different agents in the UI:

```tsx
function AgentSelector() {
  const [agentId, setAgentId] = useState("assistant");

  return (
    <div>
      <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
        <option value="assistant">Assistant</option>
        <option value="code-helper">Code Helper</option>
        <option value="simple-bot">Simple Bot</option>
      </select>
      
      <Chat
        key={agentId} // Reset on agent change
        baseUrl="/api/agents"
        agentId={agentId}
      />
    </div>
  );
}
```

Start with the built-in agent selection behavior first. Only move to a custom layout if agent choice affects routing or broader page structure.

## Custom Headers

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  headers={{
    "X-Custom-Header": "value",
    "X-Tenant-ID": "tenant-123",
  }}
/>
```

Custom headers are useful for multi-tenant products, request tracing, and workspace context. Read [Auth & Headers](/guide/auth-and-headers) for the integration model on the frontend side.

## Direct API Client Usage

For custom implementations:

```tsx
import { AgentServerClient } from "@cognipeer/chat-ui";

const client = new AgentServerClient({
  baseUrl: "/api/agents",
  agentId: "assistant",
  authorization: "Bearer token",
});

// List conversations
const { conversations } = await client.getConversations({ agentId: "assistant" });

// Create conversation
const conversation = await client.createConversation({
  agentId: "assistant",
  title: "New Chat",
});

// Send message
await client.sendMessageStream(
  conversation.id,
  { message: "Hello!" },
  {
    onText: (chunk, fullText) => console.log(chunk, fullText),
    onDone: (event) => console.log(event),
  }
);
```

## Next Steps

- [Auth & Headers](/guide/auth-and-headers)
- [MCP Integration](/guide/mcp-integration)
- [Tool Calls](/guide/tool-calls)
- [Examples](/examples/)
- [useChat Hook](/api/use-chat)
- [API Client](/api/client)
