# ChatMinimal Component

A minimal chat component without history sidebar.

## Import

```tsx
import { ChatMinimal } from "@cognipeer/chat-ui";
```

## Usage

```tsx
<ChatMinimal
  baseUrl="/api/agents"
  agentId="assistant"
/>
```

## Props

Same as [Chat](/components/chat) except:

- No `showHistory` prop (always hidden)
- No history-related callbacks

### Required Props

| Prop | Type | Description |
|------|------|-------------|
| `baseUrl` | `string` | Base URL for the agent server API |
| `agentId` | `string` | ID of the agent to chat with |

### Optional Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `theme` | `"dark" \| "light"` | `"dark"` | Theme mode |
| `themeColors` | `ThemeColors` | - | Custom theme colors |
| `authorization` | `string` | - | Authorization header |
| `headers` | `Record<string, string>` | - | Custom headers |
| `conversationId` | `string` | - | Conversation ID |
| `streaming` | `boolean` | `true` | Enable streaming |
| `enableFileUpload` | `boolean` | `true` | Enable file uploads |
| `className` | `string` | - | Container class name |

## Examples

### Basic

```tsx
<ChatMinimal
  baseUrl="/api/agents"
  agentId="assistant"
  theme="dark"
/>
```

### Embedded in Page

```tsx
function ProductPage() {
  return (
    <div className="flex">
      <main className="flex-1">
        {/* Product content */}
      </main>
      
      <aside className="w-96 h-screen border-l">
        <ChatMinimal
          baseUrl="/api/agents"
          agentId="product-helper"
          theme="light"
        />
      </aside>
    </div>
  );
}
```

### With Fixed Conversation

```tsx
<ChatMinimal
  baseUrl="/api/agents"
  agentId="assistant"
  conversationId="conv-123"
/>
```

### Custom Styling

```tsx
<ChatMinimal
  baseUrl="/api/agents"
  agentId="assistant"
  className="rounded-lg border"
  themeColors={{
    bgPrimary: "#1a1a2e",
    accentPrimary: "#e94560",
  }}
/>
```

## When to Use

Use `ChatMinimal` when you:

- Don't need conversation history
- Are embedding chat in a larger UI
- Want a simpler interface
- Are building a widget

Use `Chat` when you:

- Need conversation history
- Want full-featured chat
- Are building a standalone chat page

## Related

- [Chat](/components/chat)
- [useChat Hook](/api/use-chat)
