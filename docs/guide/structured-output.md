# Structured Output

Structured output matters when the assistant is returning something more useful than plain prose: summaries, extracted fields, search hits, status objects, or workflow results.

`chat-ui` does not enforce a schema system by itself. The main question is how you want to present structured backend output in the UI.

## When Plain Message Rendering Is Enough

Stick with the default message flow when:

- the structured result is small and readable as markdown or text
- the message is mainly explanatory
- users do not need to act on individual fields

Examples:

- short search summaries
- a compact list of recommendations
- a one-screen explanation of a tool result

## When To Build Dedicated UI

Move beyond plain messages when:

- the assistant output has stable fields that users care about
- the result is large enough to overwhelm the chat column
- users need to compare, review, or act on the data
- the same output shape appears repeatedly

Common patterns:

- inline summary in the message, with a richer card below it
- side panel for structured results while chat stays conversational
- custom message rendering in a hook-driven layout

## Practical Presentation Patterns

### Pattern 1: Summary In Chat, Details Elsewhere

Use the chat column for the human-readable takeaway and show the raw or structured payload in a secondary area.

This keeps the conversation readable without hiding the important result.

### Pattern 2: Custom Message Cards

If your backend attaches a stable structure to message metadata, a custom layout can render special cards for those messages:

```tsx
import { useChat } from "@cognipeer/chat-ui";

function StructuredMessages() {
  const chat = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
  });

  return (
    <div>
      {chat.messages.map((message) => {
        const summary = message.metadata?.summary;

        if (message.role === "assistant" && typeof summary === "string") {
          return (
            <section key={message.id} className="rounded-xl border p-4">
              <h3 className="font-medium">Structured Summary</h3>
              <p>{summary}</p>
            </section>
          );
        }

        return <div key={message.id}>{String(message.content)}</div>;
      })}
    </div>
  );
}
```

### Pattern 3: Pair With Tool Traces

If the structured output comes from a multi-step tool workflow, keep the summary near the assistant answer and link it mentally to the tool activity underneath or beside it.

That is often easier to understand than showing raw tool output alone.

## JSON-Like Results

When the result is effectively JSON:

- do not dump large raw objects into the main message column by default
- show the most important fields first
- let deeper inspection be opt-in
- keep labels human-readable

If the payload is mainly operational, consider rendering it in a side panel instead of as a chat message.

## Relationship To Tool Calls

Structured output and tool calls often show up together, but they solve different jobs:

- tool calls explain what the assistant did
- structured output explains what the assistant produced

Treat them as complementary surfaces, not interchangeable ones.

## Related Docs

- [Tool Calls](/guide/tool-calls)
- [Custom Layout Composition](/guide/custom-layout-composition)
- [Guardrails](/guide/guardrails)
