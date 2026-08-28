# Core Concepts

This page gives you the mental model behind `chat-ui` so the rest of the guide and API reference make sense faster.

## What The Library Owns

`chat-ui` is responsible for presenting conversation state, handling user input, and updating the UI as assistant responses stream in.

Your backend is still responsible for:

- agent execution
- authorization and business rules
- persistence
- conversation listing and retrieval when history is enabled

## Core Entities

### Messages

Messages are the main rendering unit. In practice, a message can contain:

- plain text or markdown text
- structured content parts
- attached files
- citations
- tool-call traces and tool-result metadata

The most important roles are `user`, `assistant`, `system`, and `tool`.

### Conversations

A conversation is a single thread of messages. The built-in history sidebar works by loading and switching between conversations, not by storing multiple message arrays in memory with no server identity.

If your product needs persistent chat sessions, URLs, or session restoration, think in terms of conversations first.

### Stream Events

Streaming updates are not treated as isolated messages. They usually modify the current in-progress assistant turn.

That means a typical assistant response goes through a lifecycle instead of appearing all at once:

1. The user sends a message.
2. The UI adds or confirms the user message in local state.
3. An assistant placeholder starts receiving streamed text.
4. Tool calls and results can be attached while the turn is still running.
5. A final event completes the message and conversation metadata.

## Built-In Surface Versus Controlled Composition

There are three useful mental buckets:

| Level | Use it when | What you manage |
| --- | --- | --- |
| `Chat` | You want the fastest complete experience | Mostly backend config and visual customization |
| `ChatMinimal` | You want the core chat loop inside your own page layout | Page chrome, surrounding layout, session affordances |
| Hooks + providers | You need custom orchestration across multiple components | The full React composition model |

## State Ownership

The default components are designed for teams that want a good production baseline quickly. Once you move to hooks and providers, you start owning more decisions:

- where conversation state lives
- when history loads or refreshes
- how URL state maps to conversations
- how tool activity is surfaced outside the default message flow

That shift is useful, but it also means you should move up the abstraction ladder only when the default surface is no longer enough.

## How To Use This Mental Model

- If you are still trying to get the first screen running, go back to [Getting Started](/guide/getting-started).
- If you need to understand which layer to customize, continue to [Architecture](/guide/architecture).
- If your main concern is colors, tokens, and brand adaptation, jump to [Theming](/guide/theming).
- If you need the deeper domain model, read the full [Core Concepts Reference](/core-concepts/).
