# Tool Calls

Visualize AI tool calls in your chat UI.

## Overview

When an agent uses tools, Chat UI can surface that activity as part of the assistant turn instead of hiding it behind raw text. The built-in display is useful for operator-facing products, multi-step workflows, and debugging assistant behavior in production.

Tool calls are typically shown with:

- tool identity
- loading or executing state
- compact grouping for multi-step workflows
- expandable details through the standalone tool-call components

## Default Inline Display

The top-level `Chat` surface renders tool activity inline with assistant messages automatically. In many products, this is enough and does not require any extra UI code.

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
/>
```

## Tool Call Lifecycle

A typical tool-assisted turn looks like this:

1. The assistant begins responding.
2. The backend emits one or more tool-call events.
3. The UI tracks those calls as active work.
4. Tool results arrive and the active entries are updated.
5. The assistant finishes the turn and the final message state is rendered.

This matters because tool activity is not a separate screen. It is part of the same conversational turn and often needs to stay understandable at a glance.

## Callbacks For Observability And Product Logic

Track tool calls programmatically:

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  onToolCall={(toolName, args) => {
    console.log("Tool called:", toolName);
    console.log("Arguments:", args);
    
    // Analytics, logging, etc.
    analytics.track("tool_call", { tool: toolName });
  }}
  onToolResult={(toolName, result) => {
    console.log("Tool result:", toolName);
    console.log("Result:", result);
  }}
/>
```

Use callbacks when you need analytics, audit trails, or app-side reactions. If you only need the default inline UI, you can skip them.

## When The Default UI Is Enough

Stick with the built-in display when:

- tool activity is only supportive context for the user
- you want a lightweight product timeline without building a separate operations panel
- you mainly need callbacks for logging rather than custom presentation

Consider a custom layout when:

- tool activity is a first-class operator workflow
- you need a separate side panel or inspection area
- you want to group tool status outside the assistant message thread

There is no top-level `renderToolCall` prop on `Chat` today. For custom layouts, compose from the hooks and standalone tool-call components.

## Standalone ToolCall Component

Use the built-in component directly when you are composing your own UI:

```tsx
import { ToolCall, ToolCalls } from "@cognipeer/chat-ui";

// Single tool call
<ToolCall
  toolName="get_weather"
  toolCallId="call_123"
  args={{ location: "NYC" }}
  result={{ temperature: 72 }}
  isExecuting={false}
/>

// Multiple tool calls
<ToolCalls
  toolCalls={new Map([
    ["1", { name: "search", args: { query: "pricing page" }, result: { hits: 3 } }],
    ["2", { name: "summarize", args: { source: "search" } }],
  ])}
  isExecuting={true}
/>
```

## Hook-Driven Custom Layouts

If tool activity needs a dedicated area, use `useChat` and read `activeToolCalls` directly:

```tsx
import { ToolCalls, useChat } from "@cognipeer/chat-ui";

function ChatWithToolPanel() {
  const chat = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  return (
    <div className="grid grid-cols-[1fr_320px] h-screen">
      <div>{/* your chat surface */}</div>
      <aside className="border-l p-4">
        <ToolCalls
          toolCalls={chat.activeToolCalls}
          isExecuting={chat.isLoading}
        />
      </aside>
    </div>
  );
}
```

## Safer Argument And Result Rendering

Tool arguments from callbacks already arrive as parsed objects. Prefer rendering them with `JSON.stringify` rather than assuming a custom schema:

```tsx
function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre>{JSON.stringify(value, null, 2)}</pre>
  );
}
```

If your product expects very large payloads, avoid dumping raw objects into the main chat column. Show summaries first and make deep inspection an explicit user action.

## Tool-Specific Signals

Show different icons for different tools:

```tsx
const labels = {
  search_docs: "Docs Search",
  lookup_customer: "Customer Lookup",
  create_ticket: "Create Ticket",
};
```

The principle is the same whether you are rendering inline or in a side panel: show concise labels first, then expose raw details only when the user actually needs them.

## Product Use Cases

Tool-call visibility is especially helpful when your product needs:

- customer-support traceability
- agent debugging in staging or production
- operator oversight for multi-step actions
- trust-building UI for actions that read or write external systems

## Where To Go Next

- Read [Structured Output](/guide/structured-output) if tool traces are only part of a richer result surface.
- Read [Guardrails](/guide/guardrails) if users need confirmation or clearer trust signals around tool behavior.
- Read [MCP Integration](/guide/mcp-integration) if your backend is exposing MCP-backed tool workflows.
- Read [Custom Layout Composition](/guide/custom-layout-composition) if tool activity belongs in a side panel or custom workspace shell.

## Styling Tool Calls

```css
.chat-tool-call {
  background: var(--chat-bg-tertiary);
  border-radius: 8px;
  padding: 8px 12px;
  margin: 4px 0;
  font-family: monospace;
}

.chat-tool-call.loading {
  opacity: 0.7;
}

.chat-tool-call .tool-name {
  font-weight: bold;
  color: var(--chat-accent-primary);
}

.chat-tool-call .tool-result {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--chat-border-secondary);
}
```

## Next Steps

- [History Sidebar](/guide/history)
- [Structured Output](/guide/structured-output)
- [Guardrails](/guide/guardrails)
- [MCP Integration](/guide/mcp-integration)
- [Custom Actions](/guide/custom-actions)
- [ToolCall Component](/components/tool-call)
