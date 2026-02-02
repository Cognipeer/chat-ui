# Tool Calls

Visualize AI tool calls in your chat UI.

## Overview

When AI agents use tools, Chat UI displays them with:

- Tool name and arguments
- Loading state during execution
- Results after completion
- Expandable/collapsible UI

## Default Tool Call Display

Tool calls are automatically displayed:

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
/>

// When agent calls a tool, it appears like:
// 🔧 get_weather({ location: "New York" })
// ✓ { temperature: 72, conditions: "Sunny" }
```

## Tool Call Callbacks

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

## Custom Tool Call Rendering

Customize how tool calls appear:

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  renderToolCall={({ toolCall, isLoading, result }) => (
    <div className="custom-tool-call">
      <div className="tool-header">
        {isLoading ? "⏳" : "✓"} {toolCall.name}
      </div>
      
      <div className="tool-args">
        <pre>{JSON.stringify(JSON.parse(toolCall.arguments), null, 2)}</pre>
      </div>
      
      {result && (
        <div className="tool-result">
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  )}
/>
```

## ToolCall Component

Use the built-in component directly:

```tsx
import { ToolCall, ToolCalls } from "@cognipeer/chat-ui";

// Single tool call
<ToolCall
  toolCall={{
    id: "call_123",
    name: "get_weather",
    arguments: '{"location": "NYC"}',
  }}
  result={{ temperature: 72 }}
  isLoading={false}
/>

// Multiple tool calls
<ToolCalls
  toolCalls={[
    { id: "1", name: "search", arguments: '{"query": "..."}' },
    { id: "2", name: "calculate", arguments: '{"expression": "..."}' },
  ]}
  results={{
    "1": { results: [...] },
    "2": { result: 42 },
  }}
/>
```

## Tool-Specific Icons

Show different icons for different tools:

```tsx
const toolIcons = {
  get_weather: "🌤️",
  search: "🔍",
  calculate: "🧮",
  send_email: "📧",
};

<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  renderToolCall={({ toolCall, isLoading, result }) => (
    <div className="tool-call">
      <span className="icon">
        {toolIcons[toolCall.name] || "🔧"}
      </span>
      <span className="name">{toolCall.name}</span>
      {isLoading && <span className="loading">...</span>}
    </div>
  )}
/>
```

## Expandable Tool Calls

The default UI supports expand/collapse:

```tsx
// Built-in behavior
// Click on a tool call to expand/collapse arguments and results
```

Custom expandable implementation:

```tsx
import { useState } from "react";

function ExpandableToolCall({ toolCall, result }) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="tool-call">
      <button onClick={() => setExpanded(!expanded)}>
        {expanded ? "▼" : "▶"} {toolCall.name}
      </button>
      
      {expanded && (
        <div className="tool-details">
          <div>Arguments: {toolCall.arguments}</div>
          {result && <div>Result: {JSON.stringify(result)}</div>}
        </div>
      )}
    </div>
  );
}
```

## Active Tool Calls

Track in-progress tool calls:

```tsx
import { useChat } from "@cognipeer/chat-ui";

function CustomChat() {
  const { activeToolCalls } = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  // activeToolCalls is a Map<string, { name, args, result? }>
  
  return (
    <div>
      {activeToolCalls.size > 0 && (
        <div className="active-tools">
          Running: {Array.from(activeToolCalls.values())
            .map(t => t.name)
            .join(", ")}
        </div>
      )}
    </div>
  );
}
```

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
- [Custom Actions](/guide/custom-actions)
- [ToolCall Component](/components/tool-call)
