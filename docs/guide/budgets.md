# Usage Limits

A conversation on `@cognipeer/agent-server` 0.3.0 or later can have a **usage limit** (a budget): a cap on what its turns cost. When the limit is used up the turn stops, and the conversation waits for a higher limit or ends. `Chat` shows where the conversation stands, closes the composer when nothing more can be sent, and - where the host allows it - lets a person raise the limit and carry on.

Nothing changes for a conversation that has no limit.

## What the page shows

The server sends `conversation.budget` (`{ maxCostUsd, onReach }`), `conversation.spentUsd` and `conversation.runtime.status`. `Chat` draws a thin **meter** while there is room and a **notice** once the limit is used up:

```
Conversation usage                    $1.25 of $5.00 used
[██████░░░░░░░░░░░░░░░░░░░░░░░░░░]
```

| `onReach` | When the limit is used up |
| --- | --- |
| `pause` | The conversation is paused and carries on from where it stopped once the limit is raised. `runtime.status` is `budget_paused`. |
| `stop` | The conversation has ended. Raising the limit reopens it, but nothing is carried on. The notice does not promise to. |

In both cases the composer is closed (`composerState` is `budget_paused`) and the last answer carries the "usage limit" notice. A send the server refuses with `budget_reached` (402) makes the page fetch the conversation again, which shows the notice.

```tsx
<Chat
  showBudgetMeter={false}          // hide the meter (default true); the notice still shows
/>
```

The meter shows amounts in USD (`formatUsd`). The server only sends a limit for conversations that have one. Turn the meter off where people should not see amounts.

## Who may do what about it

What a person can do once the limit is used up is the host's call, because the server may refuse a change (`budget_forbidden`, unless the host set `authorizeBudget`).

| Prop (or `capabilities.budget.*` of the agent) | The banner offers |
| --- | --- |
| nothing (default) | "Ask an administrator to raise the limit." |
| `allowBudgetContinue` / `allowContinue` | **Continue**, for a paused conversation whose limit was raised somewhere else. While the limit is still used up the server answers `402 budget_reached`, and that is shown. |
| `allowBudgetEdit` / `allowEdit` | A field for a new limit with **Increase and continue** (paused) or **Increase limit** (ended), and **Remove limit**. The new limit has to be above what was spent. |

```tsx
<Chat allowBudgetEdit />                       // for operators
```

An agent can say it for itself: a host that lists its agents puts `capabilities: { budget: { allowContinue: true } }` in the agent's info (`GET /agents`). It overrides the props, in both directions, so a portal can allow it for one agent only.

## From code

```tsx
const chat = useChat({ baseUrl, agentId });

chat.budget;            // { maxCostUsd, onReach } | null
chat.spentUsd;
chat.budgetExhausted;   // used up
chat.composerState;     // "budget_paused" when it is

await chat.updateBudget({ maxCostUsd: 20, onReach: "pause" }, { continue: true });
await chat.updateBudget(null);                     // remove the limit
await chat.continueConversation();                 // carry on a paused turn
```

`updateBudget` resolves `false` when the server refused the change and `error` says why. With `continue: true` a conversation that was paused on its limit carries on afterwards, as a new assistant message; a "nothing to continue" answer (someone else already did, or the agent cannot be continued) is not an error. It resolves `true` once the limit is changed, whatever the continuation then does. `canUpdateBudget` and `canContinue` say whether the transport can do it at all.

`onBudgetReached({ conversationId, budget, spentUsd })` is called when a turn ends on the limit.

`BudgetBanner` is the component, and `renderBudgetBanner` replaces it:

```tsx
<Chat renderBudgetBanner={(props) => <MyBanner {...props} />} />
```

## Transport

```ts
interface ChatTransport {
  updateBudget?(conversationId: string, budget: ConversationBudget | null): Promise<Conversation>;   // PATCH /conversations/:id
  continueConversation?(conversationId: string, options?: ContinueOptions): Promise<SendMessageResponse | undefined>;   // POST /conversations/:id/continue
}
```

`AgentServerClient` implements both. A refusal arrives as an error with the server's `code` (`budget_forbidden`, `invalid_budget`, `budget_reached`, `nothing_to_continue`) and `details` (`spentUsd`, `maxCostUsd`, `onReach`).

## Next steps

- [Running turns, Stop and reattach](/guide/runs)
- [Approvals and questions](/guide/approvals)
