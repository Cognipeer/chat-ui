# Running Turns, Stop and Reattach

With `@cognipeer/agent-server` 0.3.0 or later a turn is a **run**: it goes on when the page that started it closes, reloads or loses its connection. `Chat` is built on that.

| | |
| --- | --- |
| **Reload in the middle of a turn** | The conversation opens, sees that a turn is still running and follows it: tool calls and text appear as they happen, then the stored answer replaces them. |
| **A turn running in another window** | A conversation opened or reloaded while that turn runs follows it the same way. The composer says the conversation is answering elsewhere, and offers Stop. |
| **A dropped connection** | Not an error. The turn goes on without the page, so the page looks again: it follows what is still running, or shows what finished. Only a conversation that cannot be reached shows a message. |
| **Stop** | Stops the run on the server, not just this page's connection: tools stop running and spending stops. What was written so far is kept as an answer marked "Stopped". |
| **Why an answer ended** | A notice under the answer says when it was stopped, hit a limit, used up the conversation's usage limit or failed. |
| **History** | Rows that are working, waiting for you or stopped on their usage limit carry a badge. |

All of it needs a transport with the run methods (`AgentServerClient` has them). Without them everything behaves as before.

## Reattach

```tsx
<Chat baseUrl="/api/agents" agentId="assistant" />   // nothing to switch on
```

`GET /conversations/:id` carries `conversation.runtime`:

```json
{ "status": "running", "stopReason": null, "lastEventSeq": 41, "pendingActionIds": [], "activeRunId": "run_x1" }
```

When `status` is `running`, `useChat` calls `transport.followEvents(conversationId, { after: runtime.lastEventSeq })`, which reads `GET /conversations/:id/events/stream` (Server-Sent Events). The events are folded into the same live view an own turn has: streamed text (`agent.message.delta`), tool calls (`agent.tool_use` / `agent.tool_result`), and the finished `agent.message`. Live text is not stored, so a page that joins a run in progress would see only the words that come after it joined; the server therefore starts the stream with a snapshot (below). When `session.status_idle` arrives the conversation is loaded again, and that is what stays: the stored answer, the cards of a pause (`requires_action`), the stop notice.

- If the stored answer is not there yet at the first look, the page looks once more after `followSettleRetryMs` (default 1500).
- Opening another conversation, starting a new chat or unmounting stops following (the run itself goes on).
- A send refused with `conversation_busy` loads the conversation again, which follows the turn that is running.
- Coming back to a conversation whose turn this page started and left picks that turn up again.

`useChat` returns `isFollowing`. While it is true `isStreaming` is true too, so the message list draws the live turn exactly as it draws an own one, and `composerState` is `"following"`.

### The follow stream

`AgentServerClient.followEvents` reconnects by itself. A closed stream is opened again from the last event seen (`?after=<seq>`), with backoff, and a refusal retrying cannot fix (404, 403) is thrown. Tune it:

```ts
new AgentServerClient({
  baseUrl: "/api/agents",
  reconnect: { retries: 6, delayMs: 500, maxDelayMs: 8000 },
});
```

Frames that carry no `seq` (`agent.message.delta`, live text that is not stored) are delivered too; a follower built only on the stored events loses nothing.

### The reattach snapshot

When a client connects to `GET /conversations/:id/events/stream` while a run is active, the server first sends **one frame that is not part of the log** (no `id:` line, so the cursor does not move), then the replay and the live frames:

```
event: agent.message.snapshot
data: {"type":"agent.message.snapshot","data":{"run_id":"run_x1","text":"<what the run has written so far>","user_message":{"id":"u7","content":"...","files":[]}}}
```

`user_message` is the message that started the run, or `null`. `Chat` seeds the live bubble with `text`, and adds the person's own message to the transcript when the stored history does not have it yet (the stored history of a conversation that is still answering may not include it); the live `agent.message.delta` frames that follow are appended. The same frame comes again after a reconnect and replaces the text (it holds everything written so far, so nothing is doubled), and the `session.status_running` of the run the snapshot belongs to, if the replay still reaches it, does not wipe the text. That start usually names no run (agent-server stamps neither the frame nor its data), so the text is kept while the start names the snapshot's run or none at all; only a different run (named on a start, or on the `run_id` of a delta) or a start after `session.status_idle` begins the view afresh. A server that sends no snapshot works as before.

## Stop

`stop()` (the Stop button) does three things when the transport has `cancel`:

1. closes this page's own stream,
2. calls `POST /conversations/:id/cancel`,
3. shows the partial answer at once as a message marked stopped, then replaces it with what the server kept.

While the page is following a turn that runs elsewhere, Stop asks the server to cancel it and the follower sees the run end.

A server without the cancel route (an older one) answers 404; that is ignored and Stop closes the connection, as in 0.3.0. Any other refusal is shown. A transport without `cancel` (Chat Completions, Responses, A2A, in-process agent-sdk) keeps the old behaviour: closing the connection is all there is.

Stop also works while the files of a message are still going up: the upload is aborted, the message is taken back and the files return to the composer.

## Why an answer ended

An assistant message carries `status` and, where the server says, `stopReason` (also read from `metadata.stopReason`):

| `stopReason` | Notice |
| --- | --- |
| `end_turn`, `requires_action` | none (a pause shows its cards) |
| `cancelled` | "Stopped before it finished." |
| `limit` | "The assistant reached a limit and stopped." |
| `max_turns` | "The assistant used up its allowed steps and stopped." |
| `budget_reached` | "This conversation reached its usage limit." (the [usage limit](/guide/budgets) banner explains the rest) |
| `error` | "Something went wrong and the assistant stopped." |

A conversation that **ends on the person's own message** while the runtime says it stopped on an `error` (the run that was answering was cut off, say by a restart, before it wrote anything) shows "The reply was interrupted" under that message, with **Retry**. Retry sends the same text again, with the files the message carried (they are stored in the conversation already; one that has expired is left out). It is the same notice, `InterruptedNotice`, and `renderStopNotice` receives it with `stopReason: "error"` and an `onRetry` to call. A transcript (`readOnly`) shows the sentence without the button. `useChat` returns `interrupted` and `retryInterrupted()`.

A message that is `incomplete` or `cancelled` without a reason still says so. Under a stopped answer the notice adds whether the text above is a partial answer or nothing was written. The runtime's own wording (`stopDetail`) is not shown to end users; it reaches `renderStopNotice`:

```tsx
<Chat
  renderStopNotice={({ stopReason, detail, hasText }) =>
    stopReason === "limit" ? <MyLimitNotice detail={detail} /> : null
  }
/>
```

Return `null` from the function to show nothing for a reason. The same notice is `MessageStopNotice`, for custom message lists.

**Warnings.** A turn that completed but is worth a remark (`file_truncated`, `file_unreadable`, `images_not_supported`, `pause_state_too_large`) lists it under the answer, from `metadata.warnings`, in the page's language. A code the page has no string for shows the server's own message.

## History badges

`ConversationListItem.runtime` comes with the list (`GET /conversations`). `ChatHistory` shows a badge on:

| `runtime.status` | Badge |
| --- | --- |
| `running` | Working |
| `requires_action` | Waiting for you |
| `budget_paused`, or a spent usage limit | Limit reached |

The selected conversation shows what this page knows (it may be ahead of the list), and the list is fetched again whenever a turn ends. `showStatus={false}` turns the badges off.

Every row is a real `<button>`: Tab, Enter and Space work, the arrow keys, Home and End move between rows, Escape closes the sidebar where it is an overlay, and the delete button is visible as soon as the row has keyboard focus.

## The composer

One value says what the composer is doing: `useChat` returns `composerState`, and `ChatInput` takes it as `state`.

| State | When | Textarea | Paperclip | Stop |
| --- | --- | --- | --- | --- |
| `open` | nothing is in the way | open | on | while a turn runs |
| `blocked` | a card waits and the agent wants it answered first | closed | off | |
| `cancel` | a card waits and a new message cancels it | open, with a warning | on | |
| `answer` | a lone free-text question: the composer answers it | open, with a notice | on | |
| `following` | a turn runs somewhere else | closed | off | yes |
| `budget_paused` | the usage limit is used up | closed | off | |
| `readonly` | the host set `readOnly` | closed | off | |

`pendingMode` on `ChatInput` still works for the first three.

## Reading the agent

`GET /agents` carries what each agent takes. `Chat` reads it with this precedence, per field: `capabilities.attachments`, then the older `metadata` keys, then the props.

```json
{
  "id": "vision",
  "capabilities": {
    "attachments": { "enabled": true, "maxFiles": 3, "maxFileSize": 10485760, "allowedMimeTypes": ["image/*"], "acceptsImages": true, "retentionDays": 30 },
    "approvalArgsEdit": true,
    "budget": { "allowContinue": true, "allowEdit": false }
  },
  "metadata": { "pendingActionComposerMode": "cancel" }
}
```

`resolveAgentSettings(agent, defaults)` is the function that does it, exported for custom layouts.

## Other transports

`useChat` degrades by transport. Without `followEvents` there is no reattach, without `cancel` Stop closes the connection, without `continueConversation` / `updateBudget` the usage-limit banner explains but cannot act, without `listFiles` the number of files a conversation holds is counted from the loaded messages, without `getFileUrl` images of a loaded conversation show only when the file has a `url`. See [Transports](/guide/transports) for what each backend supports.

## Next steps

- [Usage limits](/guide/budgets)
- [File uploads](/guide/file-uploads)
- [Approvals and questions](/guide/approvals)

## Reminders

A Console agent can set a one-shot reminder for itself; when it fires, the server starts a new turn in the same conversation. The agent reports `capabilities.reminders: true`, and the conversation (`GET /conversations/:id`, and list items) carries `reminders: [{ id, fire_at, message }]` (`fire_at` in epoch seconds; `Conversation.reminders[].fireAt` is in milliseconds). Without the capability none of this is shown.

- While the open conversation is idle and has a reminder, `useChat` follows `session.status_running` in the background (`followEvents` with `types: ['session.status_running']`). When it arrives, the turn streams in like any followed turn. A transport without `followEvents` refreshes the conversation every 30 seconds instead, only while the tab is visible and a reminder is due within two minutes or overdue.
- The wake-up message is stored with `metadata: { origin: 'reminder', reminder: { message } }`; it renders as a small gray card showing `metadata.reminder.message`, not as a user bubble.
- A gray line above the composer says when the agent will check back, with **Cancel** (`transport.cancelReminder(conversationId, reminderId)`; `DELETE /conversations/:id/reminders/:reminderId` answers 200 `{ reminder }`, 404 or 409 when it is gone or already fired). The sidebar marks conversations with reminders with a clock.
