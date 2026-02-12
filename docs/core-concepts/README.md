---
title: Core Concepts
---

# Core Concepts

This page explains the domain model behind `@cognipeer/chat-ui`.

## Chat session

A session represents one conversational thread between user and assistant. Session metadata is used by the history sidebar and backend APIs.

## Message model

Each message has a role and content. Common roles:

- `user`
- `assistant`
- `system` (optional, backend-oriented)
- tool-related metadata for visualization

Messages can include:

- plain text content
- markdown-formatted content
- optional attachments
- optional tool call traces

## Streaming lifecycle

For streamed responses, one assistant message is usually created and continuously appended as chunks arrive.

- Initial placeholder message is inserted.
- Stream chunks append to existing assistant content.
- Completion event finalizes message state.
- Error event updates UI with retry-safe state.

## UI variants

- `Chat`: full-featured UI with history and richer controls.
- `ChatMinimal`: compact embedding with core chat loop only.

Choose based on your product surface and available screen space.

## Theming model

The library uses preset theme modes (`dark`, `light`) plus token overrides via `themeColors`.

- Prefer token overrides for brand adaptation.
- Avoid per-component ad-hoc styling unless doing advanced customization.

## Integration boundary

The UI library expects a compatible backend contract (typically `@cognipeer/agent-server`).

UI responsibilities:

- display conversation state
- collect user input
- render streaming/tool updates

Backend responsibilities:

- persistence
- model execution
- authorization and business logic
