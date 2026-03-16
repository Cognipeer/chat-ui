# Architecture

Read this page when you need to decide which layer of `chat-ui` to use or customize.

## The Layered Model

`chat-ui` is intentionally layered so teams can stop at the highest abstraction level that already solves their problem.

| Layer | Main pieces | Use it when |
| --- | --- | --- |
| Surface components | `Chat`, `ChatMinimal`, `ChatMessageList`, `ChatInput`, `ChatHistory`, `ToolCall` | You want a ready-made UI or lightweight composition with minimal wiring |
| Hooks and providers | `useChat`, `useChatHistory`, `ChatProvider`, `ChatThemeProvider` | You need custom layout, shared state, or coordinated React composition |
| Client layer | `AgentServerClient` | You need direct control over backend requests or want to build around the same contract |
| Theme and styling primitives | `theme`, `themeColors`, CSS variables, theme provider | You need brand alignment without rewriting the interaction model |

## Typical Runtime Data Flow

Most integrations follow the same path:

1. A user submits text or files through the input surface.
2. `useChat` sends the request through the client layer and updates local UI state.
3. The backend starts streaming assistant output.
4. The active assistant turn is updated incrementally as text, progress, or tool events arrive.
5. Completed message state is rendered in the message list and conversation metadata is refreshed when history is enabled.

This is why `useChat` is the core orchestration layer even when you are not using the top-level `Chat` component.

## Customization Boundaries

The cleanest way to customize the library depends on what you are changing:

- Want a different visual tone? Use [Theming](/guide/theming) first.
- Want to change surrounding layout, headers, or side panels? Compose with `ChatMinimal`, `ChatHistory`, and the hooks.
- Want analytics, callbacks, or app-side reactions to tool events and messages? Use the callbacks exposed by `Chat` / `useChat`.
- Want fully custom surfaces that still reuse the contract and state model? Build from `useChat`, `useChatHistory`, and selected components.

Try not to jump straight to deep CSS overrides when a higher-level API already matches the job.

## Choosing The Right Abstraction Level

- Start with `Chat` if your goal is speed and a complete product shell.
- Use `ChatMinimal` if the chat belongs inside an existing app layout.
- Drop down to hooks when your product owns routing, shared state, or multi-panel workflows.

The general rule is simple: stay as high in the stack as you can until your product requirements force you lower.

## Related Docs

- [Getting Started](/guide/getting-started)
- [Core Concepts](/guide/core-concepts)
- [State Management](/guide/state-management)
- [API Reference](/api/)
- [Architecture Reference](/architecture/)
