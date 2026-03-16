# MCP Integration

MCP integration is mostly a backend capability, but it has clear frontend consequences for `chat-ui`.

If your agent can call MCP-backed tools, the UI needs to answer a few practical questions:

- should users see the tool activity?
- how much detail belongs in the chat column?
- when does tool work need a dedicated panel or workflow view?

## The Core Boundary

`chat-ui` does not connect to MCP directly. It renders whatever your backend surfaces through the chat and streaming contract.

That means:

- MCP server setup lives outside this library
- tool invocation semantics live outside this library
- the UI still needs to present the resulting tool activity clearly

## When The Built-In Tool UI Is Enough

The default inline tool rendering is usually enough when:

- MCP tools are supportive context for the conversation
- the result is small enough to stay in the chat thread
- users mainly need confidence that the assistant performed a lookup or action

Examples:

- knowledge lookups
- CRM/customer fetches
- internal search

## When To Move Beyond Inline Tool Rendering

Use a custom layout when:

- MCP tools produce large or operationally important payloads
- users need to inspect previous steps in detail
- tool activity is effectively a workflow log
- the product has a dedicated operator or debugging surface

At that point, build with `useChat` and render `activeToolCalls` in a separate panel.

## Long-Running MCP Tools

Long-running tools need special care in the UI:

- keep visible progress if the backend exposes it
- avoid making the chat feel frozen
- make it clear whether the assistant is still working or waiting on a tool

This is often where a custom operator panel becomes more useful than an inline-only experience.

## MCP And Structured Output

MCP-heavy workflows often produce both:

- tool traces
- structured results

Do not force both into the same raw block. A good pattern is:

- short summary in the assistant response
- tool visibility for traceability
- a dedicated structured-result surface for large payloads

## Related Docs

- [Tool Calls](/guide/tool-calls)
- [Structured Output](/guide/structured-output)
- [Custom Layout Composition](/guide/custom-layout-composition)
- [Agent Server](/guide/agent-server)
