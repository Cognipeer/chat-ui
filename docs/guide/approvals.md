# Approvals and Questions

Some agents pause before running a tool, or stop to ask the user something. With `@cognipeer/agent-server` 0.3.0 or later, Chat UI 0.4.0 shows those requests as cards under the assistant message and sends the answer back, so the turn can continue.

Nothing changes for servers that never pause: no card appears and no new request is made.

## What the user sees

- **Tool approval**: the tool name (or the server's `title` / `summary`), a collapsible "Details" section with the arguments, and Approve / Deny. Deny can carry a reason, and Approve can be remembered for the rest of the chat.
- **Question**: one block per question. A single single-choice question submits as soon as an option is picked. Multi-select questions use checkboxes and a Send button. Free text is offered when the question has no options or the server allows it. Skip is offered unless a question is required.
- After an answer the card shows how it ended (Approved, Denied, Answered, Skipped...) and the assistant's continuation appears as a new message.
- Reloading the conversation brings back anything still waiting.

## Props

```tsx
<Chat
  baseUrl="https://agents.example.com"
  agentId="support"
  enableToolApprovals      // default true
  enableQuestions          // default true
  pendingActionComposerMode="block"   // or "cancel"
  onActionResolved={({ actionId, resolution }) => console.log(actionId, resolution)}
  renderToolApproval={({ action, resolve, readOnly }) => /* your card */}
  renderQuestion={({ action, resolve, readOnly }) => /* your card */}
/>
```

| Prop | Default | Effect |
| --- | --- | --- |
| `enableToolApprovals` | `true` | When `false`, approvals show "Waiting for approval in another app" instead of buttons |
| `enableQuestions` | `true` | Same for questions |
| `pendingActionComposerMode` | `"block"` | While something is waiting, `block` disables the input; `cancel` allows a message, which cancels the pending request. Must match the server's `pendingActionPolicy` |
| `renderToolApproval`, `renderQuestion` | built-in cards | Replace a card. `resolve(resolution)` sends the answer |
| `onActionResolved` | none | Called after the server accepted an answer |

If the only thing waiting is a single question without options, the composer answers it directly.

Transports other than `AgentServerClient` do not implement `resolveAction`; cards are read-only for them.

## Hook

`useChat` returns `pendingActions`, `awaitingAction`, `isResolvingAction`, `canResolveActions`, `answerableQuestion` and `resolveAction(actionId, resolution)`.

```ts
await resolveAction("act_1", { type: "tool_approval", decision: "allow", rememberForSession: true });
await resolveAction("act_2", { type: "user_question", answers: { "Which region?": "eu" } });
```

## Protocol

Stream events `stream.action_required` and `stream.action_resolved` are added, and `stream.done` may carry `status: "requires_action"` and `pendingActions`. Answers go to `POST /conversations/:conversationId/actions/:actionId` with `{ resolution, stream? }`. Pending actions are restored from `pendingActions` on `GET /conversations/:id` (or on the last assistant message).
