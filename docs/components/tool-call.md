# ToolCall Component

Displays AI tool calls with arguments and results.

## Import

```tsx
import { ToolCall, ToolCalls } from "@cognipeer/chat-ui";
```

## Usage

```tsx
<ToolCall
  toolCall={{
    id: "call_123",
    name: "get_weather",
    arguments: '{"location": "NYC"}',
  }}
  result={{ temperature: 72, conditions: "Sunny" }}
/>
```

## Props

### ToolCall

| Prop | Type | Description |
|------|------|-------------|
| `toolCall` | `ToolCallData` | Tool call data |
| `result` | `any` | Tool result (if available) |
| `isLoading` | `boolean` | Whether tool is executing |
| `defaultExpanded` | `boolean` | Start expanded |
| `className` | `string` | Container class name |

### ToolCalls (Multiple)

| Prop | Type | Description |
|------|------|-------------|
| `toolCalls` | `ToolCallData[]` | Array of tool calls |
| `results` | `Record<string, any>` | Results by call ID |
| `loadingIds` | `string[]` | IDs of loading calls |

## ToolCall Data

```typescript
interface ToolCallData {
  id: string;
  name: string;
  arguments: string; // JSON string
}
```

## Examples

### Basic

```tsx
<ToolCall
  toolCall={{
    id: "1",
    name: "search",
    arguments: '{"query": "weather in NYC"}',
  }}
/>
```

### With Result

```tsx
<ToolCall
  toolCall={{
    id: "1",
    name: "get_weather",
    arguments: '{"location": "New York"}',
  }}
  result={{
    temperature: 72,
    conditions: "Sunny",
    humidity: 45,
  }}
/>
```

### Loading State

```tsx
<ToolCall
  toolCall={{
    id: "1",
    name: "fetch_data",
    arguments: '{"url": "..."}',
  }}
  isLoading={true}
/>
```

### Multiple Tool Calls

```tsx
<ToolCalls
  toolCalls={[
    { id: "1", name: "search", arguments: '{"q": "..."}' },
    { id: "2", name: "calculate", arguments: '{"expr": "..."}' },
    { id: "3", name: "get_time", arguments: '{}' },
  ]}
  results={{
    "1": { results: [...] },
    "3": { time: "14:30" },
  }}
  loadingIds={["2"]}
/>
```

### Expanded by Default

```tsx
<ToolCall
  toolCall={toolCall}
  result={result}
  defaultExpanded={true}
/>
```

### Custom Rendering

```tsx
import { useChat } from "@cognipeer/chat-ui";

function CustomToolCall({ toolCall, result, isLoading }) {
  const [expanded, setExpanded] = useState(false);
  
  const icon = {
    get_weather: "🌤️",
    search: "🔍",
    calculate: "🧮",
  }[toolCall.name] || "🔧";

  return (
    <div className="custom-tool-call">
      <button onClick={() => setExpanded(!expanded)}>
        {icon} {toolCall.name}
        {isLoading && <Spinner />}
        {result && <span className="check">✓</span>}
      </button>
      
      {expanded && (
        <div className="details">
          <div className="args">
            <strong>Arguments:</strong>
            <pre>{JSON.stringify(JSON.parse(toolCall.arguments), null, 2)}</pre>
          </div>
          
          {result && (
            <div className="result">
              <strong>Result:</strong>
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

## In Messages

Tool calls appear within messages:

```tsx
<ChatMessage
  message={{
    id: "1",
    role: "assistant",
    content: "Let me check that for you.",
    toolCalls: [
      { id: "call_1", name: "get_weather", arguments: '{"location": "NYC"}' },
    ],
  }}
  renderToolCall={({ toolCall, result, isLoading }) => (
    <ToolCall
      toolCall={toolCall}
      result={result}
      isLoading={isLoading}
    />
  )}
/>
```

## Styling

```css
.tool-call {
  background: var(--chat-bg-tertiary);
  border-radius: 8px;
  padding: 8px 12px;
  margin: 8px 0;
  font-family: monospace;
  font-size: 0.9em;
}

.tool-call-header {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.tool-call-header:hover {
  color: var(--chat-accent-primary);
}

.tool-call-name {
  font-weight: 600;
}

.tool-call-loading {
  animation: pulse 1.5s infinite;
}

.tool-call-details {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--chat-border-secondary);
}

.tool-call-details pre {
  margin: 4px 0;
  padding: 8px;
  background: var(--chat-bg-secondary);
  border-radius: 4px;
  overflow-x: auto;
}
```

## Related

- [Tool Calls Guide](/guide/tool-calls)
- [ChatMessage](/components/chat-message)
- [Streaming](/guide/streaming)
