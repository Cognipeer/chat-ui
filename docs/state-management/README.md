---
title: State Management
---

# State Management

State management is centered on the hooks layer.

## Primary hooks

- [`useChat`](/api/use-chat): handles messages, sending, streaming, and callbacks.
- [`useChatHistory`](/api/use-chat-history): handles conversation list, selection, and history operations.

## Typical ownership split

- Component-local state: message draft, temporary UI controls.
- Hook state: conversations, active session, stream status.
- Backend state: persisted sessions and message history.

## Best practices

- Keep one source of truth for active session ID.
- Avoid duplicating message arrays in multiple parent components.
- Delegate persistence and reconciliation to backend APIs.
