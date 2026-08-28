# Debugging & Tracing

Use this page when the chat UI renders, but something about the integration still behaves incorrectly.

## Start With The Symptom

The most common frontend-facing failures are:

- the chat renders with no height
- requests fail or return unauthorized
- streaming starts but looks stuck
- history does not refresh or select correctly
- tool activity does not appear as expected

## Layout And Container Issues

If the chat appears collapsed or invisible, verify the parent container has an explicit height.

Good:

```tsx
<div className="h-screen">
  <Chat baseUrl="/api/agents" agentId="assistant" />
</div>
```

Common issue:

```tsx
<div>
  <Chat baseUrl="/api/agents" agentId="assistant" />
</div>
```

Without a defined height, the top-level chat shell has nothing to fill.

## Auth Failures

If the backend requires auth:

- confirm the `authorization` prop is actually populated
- confirm the token is fresh
- confirm any required tenant or custom headers are included
- verify the backend expects the same auth format you are sending

## Streaming Problems

If requests succeed but streaming feels broken:

- verify the backend is really sending streamed updates
- check whether text is delayed versus absent
- inspect whether tool calls are active and the assistant is still working
- use `onError`, `onToolCall`, and `onToolResult` logging during integration

## History Desynchronization

If history does not match the active conversation:

- confirm your backend persists and lists conversations
- verify route-driven `conversationId` logic if the app uses router sync
- refresh history after message activity if your custom layout depends on it
- treat the router as the source of truth in deep-linked apps

## Tool-Call Diagnostics

If tool activity is missing or confusing:

- check whether the backend emits tool-call and tool-result events
- confirm the assistant is not collapsing the result into plain text only
- inspect `activeToolCalls` through `useChat` in custom layouts
- keep tool visibility simple before building richer operator UI

## Minimal Logging Pattern

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  onMessageSent={(message) => console.log("sent", message.id)}
  onMessageReceived={(message) => console.log("received", message.id)}
  onToolCall={(name, args) => console.log("tool", name, args)}
  onToolResult={(name, result) => console.log("tool-result", name, result)}
  onError={(error) => console.error("chat-error", error)}
/>
```

This is usually enough to separate transport problems from rendering problems.

## What To Trace In The Host App

Useful host-app logs include:

- auth state at the moment the chat mounts
- resolved `baseUrl`
- route params used for `conversationId`
- conversation selection events
- tool-call and tool-result events

## Related Docs

- [Auth & Headers](/guide/auth-and-headers)
- [Router Sync](/guide/router-sync)
- [Tool Calls](/guide/tool-calls)
- [Agent Server](/guide/agent-server)
