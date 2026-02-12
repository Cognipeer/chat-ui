---
title: Tool Calls
---

# Tool Calls

Tool call visualization helps users understand what the assistant executed and why.

## What is rendered

- tool name
- arguments payload
- status / progress
- result payload (if available)

## UX considerations

- Keep tool output collapsible for long payloads.
- Show assistant summary alongside raw tool output.
- Avoid exposing sensitive fields in tool result payloads.

## Related docs

- [Guide: Tool Calls](/guide/tool-calls)
- [Component: ToolCall](/components/tool-call)
