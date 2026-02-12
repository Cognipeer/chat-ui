---
title: Debugging
---

# Debugging

This guide covers the most common issues when integrating `@cognipeer/chat-ui`.

## 1) Empty screen or collapsed layout

The chat component fills its parent container. Ensure parent has explicit height.

```tsx
<div style={{ height: 600 }}>
  <Chat baseUrl="/api/agents" agentId="assistant" />
</div>
```

## 2) Messages do not stream

Check:

- backend endpoint supports streaming responses
- proxy/CDN does not buffer chunked responses
- browser devtools network panel shows incremental chunks

## 3) Unauthorized requests

If backend requires auth, pass `authorization` prop and verify token freshness.

## 4) History sidebar not updating

Validate session identifiers and backend persistence endpoints. History depends on stable conversation IDs.

## 5) Tool call cards not appearing

Ensure backend emits tool call payloads in the expected response shape and that tool rendering is enabled in your flow.

## 6) Theme values not applied

Confirm:

- stylesheet imported once (`@cognipeer/chat-ui/styles.css`)
- no host styles override CSS variables unintentionally
- `themeColors` keys match documented token names

## Runtime diagnostics checklist

- inspect network payloads and response status codes
- log `onError`, `onMessageSent`, `onMessageReceived`
- isolate issue with `ChatMinimal` to reduce surface area

## Related docs

- [Streaming](/guide/streaming)
- [History Sidebar](/guide/history)
- [Agent Server Integration](/guide/agent-server)
