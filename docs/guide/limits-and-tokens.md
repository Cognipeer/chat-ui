# Limits & Tokens

Most token and model limits live on the backend, but they still affect the frontend experience.

This page focuses on the UI implications that matter when you ship `chat-ui` in a real product.

## What The Frontend Actually Cares About

From the UI point of view, the practical limits are usually:

- very long assistant messages
- long conversation histories
- large tool payloads
- large file attachments
- slow or truncated responses

Even if the root cause is a backend or model limit, users experience it through the chat surface.

## Long Messages

Long assistant turns can make the chat feel heavy, especially when they include code blocks, verbose markdown, or copied payloads.

Recommendations:

- prefer summaries over raw dumps
- move large structured results into dedicated UI blocks
- keep the main chat column readable

## Long Histories

Long-running workspaces should not assume every conversation stays loaded in memory forever.

Practical guidance:

- rely on `useChatHistory` pagination for the sidebar
- treat the current conversation as active working state
- refresh selectively instead of reloading everything constantly

## Large Tool Payloads

Large tool results are one of the easiest ways to destroy scanability.

Prefer:

- concise labels in the conversation flow
- opt-in expansion for details
- separate inspection panels for operational payloads

## File Size And Upload Expectations

File upload behavior is ultimately constrained by your backend, storage path, and request handling.

Frontend guidance:

- set a realistic `maxFileSize`
- communicate accepted file types clearly
- keep pending-file UI understandable when multiple uploads are attached

## Token Limits And Truncated Responses

When the backend hits model or context limits, the UI can show symptoms such as:

- shorter-than-expected answers
- dropped context between turns
- incomplete tool-driven workflows
- responses that stop earlier than users expect

The fix is usually not in `chat-ui` itself. The frontend job is to make the failure mode understandable and not misleading.

## Practical Design Recommendations

- Treat giant payloads as product-design problems, not just backend problems.
- Keep the chat column optimized for human reading.
- Use pagination and selective refresh for history-heavy apps.
- Log truncation and backend errors clearly during debugging.

## Related Docs

- [History Sidebar](/guide/history)
- [Tool Calls](/guide/tool-calls)
- [Structured Output](/guide/structured-output)
- [Debugging & Tracing](/guide/debugging-tracing)
