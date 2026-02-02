# Custom Actions

Add custom action buttons to messages, like feedback buttons.

## Overview

Message actions appear on hover or after a message, allowing users to:

- Like/dislike responses
- Copy message content
- Regenerate responses
- Custom actions

## Render Message Actions

```tsx
import { Chat, ThumbsUpIcon, ThumbsDownIcon } from "@cognipeer/chat-ui";

function MessageActions({ message, isStreaming }) {
  // Don't show actions while streaming
  if (isStreaming) return null;
  
  // Only show for assistant messages
  if (message.role !== "assistant") return null;

  const handleFeedback = (type: "up" | "down") => {
    console.log(`Feedback ${type} for message:`, message.id);
    
    // Send to your API
    fetch("/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        messageId: message.id,
        feedback: type,
      }),
    });
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleFeedback("up")}
        className="p-1 hover:bg-gray-700 rounded"
        title="Good response"
      >
        <ThumbsUpIcon className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleFeedback("down")}
        className="p-1 hover:bg-gray-700 rounded"
        title="Bad response"
      >
        <ThumbsDownIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  renderMessageActions={(props) => <MessageActions {...props} />}
/>
```

## Available Icons

```tsx
import {
  ThumbsUpIcon,
  ThumbsDownIcon,
  CopyIcon,
  RefreshIcon,
  EditIcon,
  DeleteIcon,
} from "@cognipeer/chat-ui";
```

## Copy Button

```tsx
function MessageActions({ message, isStreaming }) {
  if (isStreaming) return null;

  const handleCopy = async () => {
    const text = typeof message.content === "string"
      ? message.content
      : message.content.map(p => p.type === "text" ? p.text : "").join("");
    
    await navigator.clipboard.writeText(text);
    // Show toast notification
  };

  return (
    <button onClick={handleCopy} title="Copy">
      <CopyIcon className="w-4 h-4" />
    </button>
  );
}
```

## Regenerate Button

```tsx
import { useChat } from "@cognipeer/chat-ui";

function RegenerateAction({ message }) {
  const { retry } = useChat({ /* ... */ });

  // Only show for the last assistant message
  // (requires additional logic to determine)

  return (
    <button onClick={retry} title="Regenerate">
      <RefreshIcon className="w-4 h-4" />
    </button>
  );
}
```

## Feedback with State

Track feedback state:

```tsx
import { useState } from "react";

function FeedbackActions({ message }) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const handleFeedback = async (type: "up" | "down") => {
    if (feedback === type) {
      // Remove feedback
      setFeedback(null);
      await removeFeedback(message.id);
    } else {
      // Set feedback
      setFeedback(type);
      await submitFeedback(message.id, type);
    }
  };

  return (
    <div className="flex gap-1">
      <button
        onClick={() => handleFeedback("up")}
        className={feedback === "up" ? "text-green-500" : "text-gray-400"}
      >
        <ThumbsUpIcon className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleFeedback("down")}
        className={feedback === "down" ? "text-red-500" : "text-gray-400"}
      >
        <ThumbsDownIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
```

## Detailed Feedback Modal

```tsx
import { useState } from "react";

function DetailedFeedback({ message, isStreaming }) {
  const [showModal, setShowModal] = useState(false);
  const [feedbackType, setFeedbackType] = useState<"up" | "down" | null>(null);

  if (isStreaming || message.role !== "assistant") return null;

  const handleSubmit = async (comment: string) => {
    await fetch("/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        messageId: message.id,
        type: feedbackType,
        comment,
      }),
    });
    setShowModal(false);
  };

  return (
    <>
      <button onClick={() => { setFeedbackType("up"); setShowModal(true); }}>
        👍
      </button>
      <button onClick={() => { setFeedbackType("down"); setShowModal(true); }}>
        👎
      </button>
      
      {showModal && (
        <FeedbackModal
          type={feedbackType}
          onSubmit={handleSubmit}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
```

## Action Props

The `renderMessageActions` function receives:

```typescript
interface MessageActionProps {
  message: Message;
  isStreaming: boolean;
  isLast: boolean;
}
```

## Styling Actions

```css
.message-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.message:hover .message-actions {
  opacity: 1;
}

.message-actions button {
  padding: 4px;
  border-radius: 4px;
  color: var(--chat-text-tertiary);
}

.message-actions button:hover {
  background: var(--chat-bg-hover);
  color: var(--chat-text-primary);
}
```

## Multiple Action Groups

```tsx
function MessageActions({ message, isStreaming }) {
  if (isStreaming) return null;

  return (
    <div className="flex justify-between">
      {/* Left actions */}
      <div className="flex gap-1">
        <CopyButton message={message} />
        {message.role === "assistant" && <RegenerateButton />}
      </div>
      
      {/* Right actions */}
      <div className="flex gap-1">
        {message.role === "assistant" && (
          <>
            <FeedbackButton type="up" message={message} />
            <FeedbackButton type="down" message={message} />
          </>
        )}
      </div>
    </div>
  );
}
```

## Next Steps

- [Next.js Integration](/guide/nextjs)
- [Components](/components/chat)
- [Examples](/examples/with-feedback)
