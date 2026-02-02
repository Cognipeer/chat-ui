# With Feedback

Add feedback buttons to messages.

## Full Example

```tsx
import { Chat, ThumbsUpIcon, ThumbsDownIcon } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";
import { useState } from "react";

export default function ChatWithFeedback() {
  const [feedbackMap, setFeedbackMap] = useState<Record<string, "up" | "down">>({});

  const handleFeedback = async (messageId: string, type: "up" | "down") => {
    // Toggle feedback
    const current = feedbackMap[messageId];
    if (current === type) {
      // Remove feedback
      setFeedbackMap(prev => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
      await removeFeedback(messageId);
    } else {
      // Set feedback
      setFeedbackMap(prev => ({ ...prev, [messageId]: type }));
      await submitFeedback(messageId, type);
    }
  };

  return (
    <div className="h-screen bg-gray-900">
      <Chat
        baseUrl="/api/agents"
        agentId="assistant"
        renderMessageActions={({ message, isStreaming }) => {
          if (isStreaming) return null;
          if (message.role !== "assistant") return null;

          const feedback = feedbackMap[message.id];

          return (
            <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleFeedback(message.id, "up")}
                className={`p-1 rounded hover:bg-gray-700 ${
                  feedback === "up" ? "text-green-500" : "text-gray-400"
                }`}
                title="Good response"
              >
                <ThumbsUpIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleFeedback(message.id, "down")}
                className={`p-1 rounded hover:bg-gray-700 ${
                  feedback === "down" ? "text-red-500" : "text-gray-400"
                }`}
                title="Bad response"
              >
                <ThumbsDownIcon className="w-4 h-4" />
              </button>
            </div>
          );
        }}
      />
    </div>
  );
}

async function submitFeedback(messageId: string, type: "up" | "down") {
  await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId, type }),
  });
}

async function removeFeedback(messageId: string) {
  await fetch(`/api/feedback/${messageId}`, { method: "DELETE" });
}
```

## With Detailed Feedback Modal

```tsx
import { useState } from "react";
import { Chat, ThumbsUpIcon, ThumbsDownIcon } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

function FeedbackModal({ 
  type, 
  onSubmit, 
  onClose 
}: { 
  type: "up" | "down";
  onSubmit: (comment: string) => void;
  onClose: () => void;
}) {
  const [comment, setComment] = useState("");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-gray-800 p-6 rounded-lg w-96">
        <h3 className="text-lg font-bold text-white mb-4">
          {type === "up" ? "What did you like?" : "What was wrong?"}
        </h3>
        
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full p-2 rounded bg-gray-700 text-white mb-4"
          placeholder="Optional feedback..."
          rows={3}
        />
        
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-600 text-white"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(comment)}
            className="px-4 py-2 rounded bg-green-600 text-white"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatWithDetailedFeedback() {
  const [modal, setModal] = useState<{
    messageId: string;
    type: "up" | "down";
  } | null>(null);

  const handleSubmit = async (comment: string) => {
    if (modal) {
      await submitFeedback(modal.messageId, modal.type, comment);
      setModal(null);
    }
  };

  return (
    <div className="h-screen bg-gray-900">
      <Chat
        baseUrl="/api/agents"
        agentId="assistant"
        renderMessageActions={({ message, isStreaming }) => {
          if (isStreaming || message.role !== "assistant") return null;

          return (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setModal({ messageId: message.id, type: "up" })}
                className="p-1 text-gray-400 hover:text-green-500"
              >
                <ThumbsUpIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setModal({ messageId: message.id, type: "down" })}
                className="p-1 text-gray-400 hover:text-red-500"
              >
                <ThumbsDownIcon className="w-4 h-4" />
              </button>
            </div>
          );
        }}
      />
      
      {modal && (
        <FeedbackModal
          type={modal.type}
          onSubmit={handleSubmit}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
```

## Simple Copy + Feedback

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  renderMessageActions={({ message, isStreaming }) => {
    if (isStreaming || message.role !== "assistant") return null;

    const handleCopy = async () => {
      const text = typeof message.content === "string"
        ? message.content
        : message.content.map(p => p.type === "text" ? p.text : "").join("");
      await navigator.clipboard.writeText(text);
    };

    return (
      <div className="flex gap-1 mt-2">
        <button onClick={handleCopy} title="Copy">📋</button>
        <button onClick={() => sendFeedback(message.id, "up")} title="Good">👍</button>
        <button onClick={() => sendFeedback(message.id, "down")} title="Bad">👎</button>
      </div>
    );
  }}
/>
```

## Related

- [Custom Actions Guide](/guide/custom-actions)
- [Basic Usage](/examples/basic)
- [Custom Hooks](/examples/custom-hooks)
