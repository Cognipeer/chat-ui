---
title: FAQ
---

# FAQ

## Is this only for `@cognipeer/agent-server`?

No. It works with any backend exposing a compatible chat/session API contract.

## Which component should I start with?

Use `Chat` for full product experience. Use `ChatMinimal` for embedded or compact experiences.

## Can I fully rebrand the UI?

Yes. Start with `theme="dark" | "light"` and then override tokens using `themeColors`.

## Is markdown supported in assistant messages?

Yes. Markdown rendering is built-in, including common formatting patterns.

## Does it support file uploads?

Yes, if the backend endpoint handles uploaded files and your integration enables uploads.

## Can I show tool execution traces?

Yes. Tool call visualization is supported through dedicated UI components.

## Is server-side rendering supported?

Yes, when integrated correctly in frameworks like Next.js. Follow [Next.js Integration](/guide/nextjs) guidance for client/server boundaries.
