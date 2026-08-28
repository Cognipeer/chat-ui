# Runtime Profiles

Choose the runtime profile that matches how much UI and state orchestration your product needs.

## The Four Useful Profiles

| Profile | Start here | Best for | Main trade-off |
| --- | --- | --- | --- |
| Full workspace chat | `Chat` | Product teams that want the quickest path to a complete surface | Less control over the surrounding shell |
| Embedded chat | `ChatMinimal` | Side panels, support widgets, compact assistant surfaces | No built-in history sidebar |
| Hook-driven layout | `useChat` + components | Custom page layouts and routed chat workspaces | More assembly work |
| Provider-driven layout | `ChatProvider` + context hooks | Multi-component orchestration across headers, panels, and feature controls | More React state ownership |

## Start With The Highest Level That Works

The default rule is simple:

1. Start with `Chat`.
2. Drop to `ChatMinimal` if you only need the core chat loop.
3. Move to hooks when the page layout or router owns the experience.
4. Move to `ChatProvider` when many child components need shared access to chat state.

This keeps implementation cost low and avoids rebuilding behavior the library already gives you.

## Profile 1: `Chat`

Use `Chat` when you want:

- built-in history and conversation switching
- streaming and tool-call rendering already wired together
- uploads and message actions with minimal setup
- a production-ready shell with configuration rather than composition

This is the fastest path for internal copilots, product assistants, and workspace chat surfaces.

## Profile 2: `ChatMinimal`

Use `ChatMinimal` when:

- your product already has its own navigation and layout shell
- the chat belongs inside an existing page, drawer, or split view
- you do not want the full workspace-style history UI

`ChatMinimal` keeps the chat loop but leaves session navigation and surrounding chrome to your app.

## Profile 3: Hooks + Components

Move to hook-driven composition when:

- the router controls the active conversation
- you want history in a custom sidebar
- you need dedicated panes for tool activity or structured results
- the app already has its own page-level shell

The usual building blocks are:

- `useChat`
- `useChatHistory`
- `ChatHistory`
- `ChatMessageList`
- `ChatInput`

Read [Custom Layout Composition](/guide/custom-layout-composition) when you get to this stage.

## Profile 4: `ChatProvider`

Use `ChatProvider` when chat state needs to be shared across multiple nested React components without prop drilling.

This is a good fit for:

- custom headers with chat-aware controls
- multiple panels that react to the same active conversation
- feature-flag or analytics wrappers that need direct chat access

Read [State Management](/guide/state-management) for the detailed model.

## How To Decide Quickly

- Need the fastest production path? Use `Chat`.
- Need the smallest embed? Use `ChatMinimal`.
- Need router-driven or multi-panel layout? Use hooks.
- Need broad React-tree access to chat state? Add `ChatProvider`.

## Related Docs

- [Getting Started](/guide/getting-started)
- [State Management](/guide/state-management)
- [Custom Layout Composition](/guide/custom-layout-composition)
- [Router Sync](/guide/router-sync)
