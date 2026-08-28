# Guardrails

In `chat-ui`, guardrails are mostly a product and interface concern: how much the user can trust the assistant, when risky behavior becomes visible, and where the app should ask for confirmation.

## What UI Guardrails Mean Here

For a chat surface, good guardrails usually mean:

- making important system actions visible
- requiring confirmation for risky actions
- avoiding silent side effects
- exposing enough detail for trust without overwhelming the user

This is different from model-policy or backend safety rules. Those still belong on the server side.

## When To Add Stronger Guardrails

You should add stronger UI guardrails when the assistant can:

- trigger side effects outside the chat
- modify customer or business records
- call tools that have real operational impact
- present results that users may act on without reading closely

## Practical Guardrail Patterns

### Confirmation Before Risky Steps

If an assistant action could delete, submit, or alter something important, put a host-app confirmation step in front of the final action.

The UI should make it obvious:

- what will happen
- which object or record is affected
- whether the action is reversible

### Visible Tool Activity

If the assistant is using tools to reach a decision, keep enough tool visibility to support user trust.

In many products, the right default is:

- concise inline tool traces for normal users
- richer operator or support views for debugging

### Separate Summary From Raw Detail

Good guardrails often come from separating the human explanation from the raw system output.

Show:

- a short, plain-language summary first
- the detailed payload only when the user needs to inspect it

## Where `chat-ui` Fits

The library helps with guardrail-oriented UI by giving you:

- built-in tool-call visibility
- hooks and callbacks for custom orchestration
- layout composition tools when the default chat surface is not enough

The final confirmation logic, risk model, and business rules still belong to your product code and backend.

## Recommended Approach

1. Start with clear tool visibility.
2. Add confirmation to destructive or high-impact actions.
3. Use custom layouts when trust depends on a separate review area.
4. Keep backend enforcement independent from what the UI chooses to show.

## Related Docs

- [Tool Calls](/guide/tool-calls)
- [Structured Output](/guide/structured-output)
- [MCP Integration](/guide/mcp-integration)
