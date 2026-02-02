# Agent Server Integration

Integrate Chat UI with `@cognipeer/agent-server`.

## Overview

Chat UI is designed to work seamlessly with `@cognipeer/agent-server`. The API endpoints match exactly.

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
const { conversations } = await client.listConversations();

// Create conversation
const { conversation } = await client.createConversation({ title: "New Chat" });

// Send message
const { message } = await client.sendMessage(conversation.id, {
  message: "Hello!",
  streaming: true,
});

// Stream response
for await (const event of client.streamMessage(conversation.id, {
  message: "Hello!",
})) {
  console.log(event);
}
```

## Next Steps

- [Examples](/examples/)
- [useChat Hook](/api/use-chat)
- [API Client](/api/client)
