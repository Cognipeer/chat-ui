# API Reference

Use this section when you are building a custom integration and need to understand the underlying React primitives, provider model, client utilities, and shared types.

If you just want the fastest path to a working UI, start with [Getting Started](/guide/getting-started) first and come back here after the basic surface is on screen.

## Start Here

| If you are trying to... | Read this first | Then continue with |
| --- | --- | --- |
| Ship a complete chat quickly | [Getting Started](/guide/getting-started) | [Chat](/components/chat), [Theming](/guide/theming), [History](/guide/history) |
| Build a custom chat shell | [Hooks](/api/hooks) | [useChat](/api/use-chat), [useChatHistory](/api/use-chat-history) |
| Share chat state across multiple React components | [ChatProvider + Context Hooks](/api/chat-provider) | [Architecture](/guide/architecture) |
| Work directly with the backend contract | [AgentServerClient](/api/client) | [Types](/api/types) |

## Common Tasks

- Need custom layout but still want the built-in networking and streaming logic? Start with [useChat](/api/use-chat).
- Need a standalone history panel or URL-driven conversation routing? Add [useChatHistory](/api/use-chat-history).
- Need shared chat state across headers, panels, and page sections? Use [ChatProvider + Context Hooks](/api/chat-provider).
- Need to inspect payload shapes before integrating with your own backend abstractions? Read [Types](/api/types) and [AgentServerClient](/api/client).

## Reference Index

- [Hooks](/api/hooks)
- [ChatProvider + Context Hooks](/api/chat-provider)
- [useChat](/api/use-chat)
- [useChatHistory](/api/use-chat-history)
- [AgentServerClient](/api/client)
- [Types](/api/types)
