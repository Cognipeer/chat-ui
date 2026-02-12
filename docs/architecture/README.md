---
title: Architecture
---

# Architecture

`@cognipeer/chat-ui` is structured as a layered UI library:

1. **Components**: visual building blocks (`Chat`, `ChatMinimal`, `ChatMessage`, `ChatInput`, etc.).
2. **Hooks**: state and side-effect orchestration (`useChat`, `useChatHistory`).
3. **API Client**: network abstraction for session, streaming, and message operations.
4. **Theme System**: CSS variables + theme tokens for dark/light/custom mode.

## Data flow

1. User submits message via `ChatInput`.
2. `useChat` updates optimistic local state.
3. API client starts stream request to backend.
4. Incoming chunks update assistant message incrementally.
5. Optional tool call payloads are rendered by `ToolCall` component.
6. `useChatHistory` syncs conversation metadata for sidebar history.

## Composition strategy

- Use `Chat` for complete UX (history + full controls).
- Use `ChatMinimal` for embedded chat surfaces.
- Use lower-level components + hooks only if custom layout is required.

## Rendering model

- Message rendering is componentized to keep customization isolated.
- Markdown rendering is encapsulated in message components.
- Tool call rendering is opt-in and remains visually separate from assistant text.

## Performance notes

- The library is optimized for typical chat session sizes.
- For long-running sessions, prefer history pagination or backend truncation.
- Keep parent container dimensions explicit to avoid layout thrashing.

## Related docs

- [Core Concepts](/guide/core-concepts)
- [State Management](/guide/state-management)
- [Streaming](/guide/streaming)
