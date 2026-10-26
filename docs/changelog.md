# Changelog

All notable changes to Chat UI will be documented here.

## [Unreleased]

## [0.13.0] - 2026-10-25

### Added

- File preview. A file under a message (the files an agent wrote and the person's attachments) gets a **Preview** button next to Download, and a picture's thumbnail opens the preview instead of a new tab. In `Chat` the preview is a pane on the right that slides in and pushes the conversation over (about half of the conversation area, 360 to 720 pixels, the conversation keeping 520): the page stays usable beside it, another file takes the same pane, and opening another conversation closes it. Where that does not fit (an area under 880 pixels), and for a `ChatMessage` or `ChatMessageList` on its own, it is a dialog: a panel on the right of a wide screen and the whole screen on a phone (inside the safe areas), which keeps Tab inside and stops the page behind it from scrolling. Both close on Escape or their close button and give focus back to the button the file was opened from. It shows pictures; SVG (drawn as a picture, so its scripts never run); PDF (pdf.js: each page drawn as it scrolls into view, the page number, zoom); Word `.docx` (docx-preview, laid out as pages in a shadow root so the document's styles stay inside the preview, scaled down to fit a phone); Excel `.xlsx` / `.xlsm` (up to 10 sheets as tabs, dates as `YYYY-MM-DD`, percents as percents); CSV and TSV (a `;` delimiter is found too); Markdown (rendered, or its source); HTML (in a sandboxed frame: its scripts run without access to the page); JSON (pretty-printed); text and code; audio and video. A spreadsheet or CSV shows its first 500 rows and 50 columns and says how many rows it has; text stops at 300,000 characters with a note. The type comes from the extension first, then the media type, so agent files sent as `application/octet-stream` preview too. A file larger than its kind's limit (`PREVIEW_MAX_BYTES`: 40 MB for PDF, 15 MB for Word and Excel, 5 MB for text, ...) is not read and offers its download instead. The bytes are read the way Download reads them: the copy still on this device, the file's own link, or `resolveFileUrl` (`ChatTransport.getFileUrl`, with the transport's credentials). `.doc`, `.xls`, `.pptx` and other types keep only their Download.
- Markdown as PDF or Word. The download menu of a Markdown file's preview saves it as Markdown, as a PDF document or as a Word document (`report.md` → `report.pdf` / `report.docx`): headings, paragraphs with bold, italic, code and links (http, https and mailto), nested and numbered lists, task lists, quotes, code blocks, tables with their column alignment, and rules; a picture becomes its alt text. The PDF uses Roboto, which covers Turkish and the other Latin, Greek and Cyrillic scripts (not emoji or CJK). `exportMarkdown(markdown, "pdf" | "docx", title)` returns the file as a `Blob`; `markdownExportName(name, format)` names it.
- `filePreview` on `Chat`, `ChatMessageList` and `ChatMessage` (default `true`; `false` leaves chips and thumbnails as they were). `FilePreview` (`file`, `resolveFileUrl`, `onClose`, `container`, `paneWidth`) shows a file from a list of the host's own, as a dialog or as a pane of the given width (`previewPaneWidth(areaWidth)`); `filePreviewKind(file)` says how a file would be shown, or `undefined` when it cannot be. Types `FilePreviewProps`, `FilePreviewKind`, `MarkdownExportFormat`.
- New dependencies `pdfjs-dist`, `docx-preview`, `jszip`, `docx`, `pdfmake`, `unified` and `remark-parse`. The PDF, Word, Excel and export code is loaded only when a preview or an export needs it.
- English and Turkish strings `chat.preview.*`.
- `onConversationChange(conversationId | null)` on `Chat`: called when the chat moves to another conversation - a new chat's id as soon as the server created it, a conversation opened from the history (or a search hit), and `null` when the person starts a new chat (the sidebar, an agent picked in the sidebar, `controllerRef.newChat()`) or deletes the conversation on screen. It is not called for the `conversationId` the chat opened with, nor twice for the same one. A host that keeps the id in its address and passes it back as `conversationId` brings a reload back to the same conversation, and a turn still running there is followed again. See [Keep the conversation in the address](/guide/history#keep-the-conversation-in-the-address).

### Fixed

- The notice above the composer while a turn that runs elsewhere is followed no longer says "in another window": after a reload it is the same window. It now reads "This conversation is still answering. You can stop it here." (`chat.input.followingNotice`, English and Turkish).
- `appearance="modern"`: the last block of a message (paragraph, list, code block, quote, table) no longer keeps its bottom margin, which showed as an empty line at the foot of the person's bubble and under answers.

## [0.12.1] - 2026-10-25

### Fixed

- Tool calls made after the agent had written some words were not shown while the turn ran. A model that announces its calls (Claude models: "Let me look that up.", then the call) writes the announcement in the same text stream as its answer; as soon as the first words arrived, the live view switched to the streaming message and drew no running tool, no "Running Web Search…" line and no progress dots for the rest of the turn, in both appearances. Now the words stay and what runs now shows under them; the next words the agent writes begin the shown text afresh, so the answer is no longer glued to the announcement ("…look that up.Found it."). The announcement is kept in the turn's activity ahead of the call it announced: new `ActivityEntry` `{ kind: 'text', text }`, drawn as a line of the "Worked for" timeline (`appearance="modern"`). `useChat` returns `workingAfterText`, and `ChatMessageList` takes it as a prop (default `false`: a host that does not pass it still gets the fresh text after a call). Following a turn that runs elsewhere (`FollowState.textClosed`) and the in-process adapters (`metadata.activity` of the stored answer) do the same.

## [0.12.0] - 2026-10-23

### Added

- The agent's plan. A server that reports `capabilities.plan` (new `AgentCapabilities.plan`) sends `stream.plan` frames, each with the whole plan (`PlanSnapshot`: `version?`, `steps: { id?, title, status }[]` with status `not-started` | `in-progress` | `completed` | `blocked`). While the turn runs the chat draws a plan card above the live answer ("Plan · 2 of 5", a thin progress bar, a collapse button with `aria-expanded`, a row per step with its status, the step in progress in bold); only titles and status are shown. When the turn is over a collapsed card ("Plan ✓ 5 of 5 done") sits above the answer, open by default while the plan is not complete. Nothing shows when no plan arrives. New `PlanCard` component, types `PlanStep`, `PlanStepStatus`, `PlanSnapshot`, `StreamPlanEvent`.
- Context condensing. `stream.compaction` frames (`phase`: `start`, `done`, `skipped`; a marker only, never the condensed content) show "Condensing earlier context…" while a pass has started and not ended. New type `StreamCompactionEvent`.
- Ordered activity (`appearance="modern"`). The "Worked for 24s" timeline lists, in the order they happened, the tool calls, "Plan created · 5 steps", "Plan updated · 2 of 5" and an "Earlier context condensed" divider for every pass. The order is stored with the answer: `metadata.plan` (the latest `PlanSnapshot` of the turn) and `metadata.activity` (`ActivityEntry[]`: `{ kind: 'tool', id?, name, label?, status? }`, `{ kind: 'plan', version?, done, total, created? }`, `{ kind: 'compaction', id? }`) next to the existing `toolCallDetails` / `toolCallDurationSeconds`; a server that keeps the history writes the same shape, so a reload shows the same timeline and plan. A message without `metadata.activity` lists its calls, then its reasoning, as before. The classic appearance shows the plan card only.
- `PlanSnapshot.operation` (`write` | `update`, new type `PlanOperation`; agent-server >= 0.9.0 sends it on `stream.plan` and `agent.plan`): it says whether the agent wrote the plan out or changed it, so the timeline reads "Plan created" or "Plan updated" as it happened. A server that does not send it gets its first plan of a turn marked created, as before.
- `StreamCallbacks.onPlan(plan)` and `onCompaction({ id?, phase })`; `useChat` returns `plan` and `isCondensing` and keeps the plan of a turn that paused for an answer when it carries on. The message of the leg that carries on keeps `metadata.plan` only when that leg wrote or changed the plan, so the card is drawn once. Following a turn that runs elsewhere (`applyFollowEvent`) folds the stored `agent.plan` and `agent.compaction` events into the same state (`FollowState.flow`); a followed run that carries a paused turn on (`session.status_running` with `trigger: "resume"` or `"timeout"`) starts from the plan the turn had, so the card stays (`newFollowState(carriedPlan?)`). In-process adapters report them with `emit.plan(plan)` and `emit.compaction({ id?, phase? })`.
- English and Turkish strings `chat.plan.*`, `chat.activity.planCreated` / `planUpdated` / `condensed`, `chat.live.condensing`.

## [0.11.0] - 2026-10-19

### Added

- Agent reminders (Console agents that set a one-shot reminder for themselves). Everything below stays hidden unless the agent reports `capabilities.reminders: true` (new `AgentCapabilities.reminders`); standalone `@cognipeer/agent-server` is unchanged.
  - The conversation (and its history item) may carry `reminders: { id, fireAt, message }[]` (new type `ConversationReminder`; the wire's `fire_at` is epoch seconds). While the open conversation is idle and has a reminder, `useChat` keeps a passive `followEvents(id, { types: ['session.status_running'] })` open; when the reminder fires, the turn it starts streams in like any followed turn (and raises the existing background alerts). A transport without `followEvents` falls back to refreshing every 30 s while the tab is visible and a reminder is due within 2 minutes or overdue.
  - A user message with `metadata.origin === 'reminder'` renders as a small gray card (clock icon, "Reminder · time", `metadata.reminder.message`) instead of a user bubble (`ReminderNote`; helpers `isReminderMessage`, `reminderMessageOf`).
  - A gray line above the composer, "Will check back at <time>" (`(+n)` for more), with a Cancel button (`ReminderStrip`) that calls the new optional `ChatTransport.cancelReminder(conversationId, reminderId)` (`AgentServerClient`: `DELETE /conversations/:id/reminders/:reminderId`). A small gray clock marks conversations with reminders in the sidebar.
  - `useChat` takes `remindersEnabled` and returns `reminders`, `canCancelReminder`, `cancelReminder`. English and Turkish strings `chat.reminder.*` and `chat.history.reminder`.

## [0.10.0] - 2026-10-15

### Added

- `appearance="modern"` (opt-in; the default `classic` is unchanged): the person's messages as bubbles on the right and answers as plain text (no avatars, no shaded bands); every turn's steps - reasoning, tool calls, answered approvals and questions - folded into one "Worked for 24s · Web Search ×4" line that opens a timeline, while an approval or question that still waits stays a card; a live line ("Running Web Search…") while a turn works; a slim header naming the agent; a sidebar grouped by date with the agents on top, an optional `brand` and the signed-in `account` with a sign-out menu; agent cards on the empty chat (with a search box from seven agents); a single rounded composer with one line of notes; the system UI font at 15px with smaller headings (`--chat-font-family`, `--chat-font-size`).
- `ChatAppearanceProvider` / `useAppearance`, `AgentBadge`, `TurnActivity`, `buildTurnBlocks`, `activityItems`; types `ChatAppearance`, `ChatBrand`, `ChatAccount`. `MessageActionCards` gains `openOnly` and `className`; `ChatMessage` gains `hideActivity`.
- Copy, feedback and the other answer buttons no longer wait for the conversation's generated title. `AgentServerClient.sendMessageStream` asks for the title as its own `stream.title` frame after `stream.done` (`titleFrame`, agent-server >= 0.8.0) when the callbacks take it (`StreamCallbacks.onTitle`), which `useChat` does: the turn ends at the done frame and the title lands in the header and the sidebar a moment later. An older server keeps the title in `stream.done`; a caller without `onTitle` is not affected. New type `StreamTitleEvent`.
- English and Turkish strings `chat.activity.*`, `chat.history.today` / `yesterday` / `previous7` / `previous30` / `older` / `pinned` / `agents` / `closeSidebar` / `selectMode`, `chat.account.*`, `chat.agents.*`, `chat.input.placeholderModern`.

## [0.9.0] - 2026-10-15

### Added

- Files a Console agent wrote for the user (its sandbox `/outputs/`) show as download chips under the assistant message, on the Responses (`output_files` or `file_path` annotations), Chat Completions (`output_files`, or `files` on the closing stream chunk) and A2A (file artifacts) transports. With credentials configured (`authorization`, `headers`, `getHeaders`, `fetch`) the file is fetched with them through `getFileUrl`; without, the chip is a plain link. Nothing changes for responses that carry no files. The stateless transports gain `getFileUrl` and `dispose`.

## [0.8.0] - 2026-10-14

### Added

- Search in the conversation history. With `enableMessageSearch` the sidebar box searches the whole history on the server (agent-server >= 0.7.0: titles and message text) instead of only the loaded titles. It waits 250 ms after the last key, cancels the request still in flight, needs 2+ characters, and shows loading, empty and failed states. Hits show the title and a snippet with the matched text marked (built from text nodes, never as markup). Escape clears the box.
- Opening a hit that matched a message scrolls that message into view inside the message list (never the page) and marks it for two seconds.
- `AgentServerClient.searchConversations(q, { agentId, userId, limit, offset, signal })` and `getSearchMode()` (reads `features.conversationSearch` of `GET /agents`: `full`, `title` or `false`). `ChatTransport` gains the optional `searchConversations` and `getSearchMode`; without them the box keeps filtering the loaded titles.
- `ChatHistory` prop `searchConversations`; `ChatMessageList` props `focusMessageId` / `onFocusHandled`; `useChatHistory` options `detectSearch` / `searchLimit` and results `searchConversations` / `searchMode`; types `ConversationSearchMatch`, `ConversationSearchMode`, `ConversationListItem.searchMatch`.
- English and Turkish strings `chat.history.searching`, `searchFailed`, `searchTitlesOnly`.

### Notes

- Includes the 0.7.1 fix (the message list scrolls only itself).

## [0.7.1] - 2026-10-14

### Fixed

- The page no longer jumps when an answer arrives. The message list followed the newest message with `scrollIntoView`, which also scrolls every scrollable ancestor, the document included, so a host page even slightly taller than the window slid up on each answer and left blank space below the composer. The list now scrolls only itself (`scrollTo` on the message container, `scrollTop` where `scrollTo` is missing). Keeping the reader in place when older messages load is unchanged.

## [0.7.0] - 2026-10-14

### Added

- Stop reaches the server on the Responses and A2A transports, not only the page's connection. `StatelessTransport` gains an optional `cancelRun` hook (and `RunInput.track`, which a transport uses to report the id of the turn that is running); `ChatTransport.cancel` is present only when the subclass implements it.
- `ResponsesTransport`: `POST <path>/<response id>/cancel`. The id is read from the first stream event (`response.created`), so the first turn of a conversation can be stopped as well as later ones.
- `A2ATransport`: JSON-RPC `tasks/cancel` (method name overridable with `methods.cancel`), with the task id named by the stream's events or, for the Console's one-piece `message/send`, derived as `task_<contextId>_<n>`. "Not running" answers are treated as nothing to stop.

### Notes

- `ChatCompletionsTransport` stays abort-only: the API has no way to end a run on the server. Documented in the transports guide.
- Subclasses that call `run()` themselves (tests, custom transports) must now pass `track`.

## [0.6.1] - 2026-10-14

### Changed

- Release build of the 0.6.0 reasoning features (Thinking block, `showReasoning`, `reasoningEffort`) for use with `@cognipeer/agent-server` 0.6.0. No API changes.

## [0.6.0] - 2026-10-13

### Added

- Reasoning ("Thinking"). `stream.thinking` is no longer folded into the answer text: `StreamCallbacks.onThinking` carries it, `useChat` returns `streamingReasoning` and keeps it per message (`Message.reasoning`, also read from `metadata.reasoning` / `metadata.thinking`). A collapsible, accessible `ThinkingBlock` renders above the answer (open while reasoning streams, folded after; theme tokens; plain text; strings `chat.reasoning.*` in English and Turkish).
- `Chat` / `ChatMessageList` prop `showReasoning` (default true); `AgentInfo.showReasoning === false` hides it for that agent.
- Optional `reasoningEffort` (`ReasoningEffort`: `none` | `minimal` | `low` | `medium` | `high`) in send options, regenerate and edit; `Chat` prop `reasoningEffort`, `useChat` option `getReasoningEffort`. No picker UI yet.

### Changed

- Reasoning text no longer appears inside the answer bubble or in the stored answer text.

## [0.5.0] - 2026-10-12

### Added

- Per-message model choice (agent-server 0.4.0+). `AgentInfo.models` (`AgentModelOption`) adds a `ModelPicker` pill left of the send button when an agent offers two or more models. The pick is kept per conversation, a new chat starts on the default, and `model` is sent with every message, regenerate and edit (`SendMessageOptions.model`, `EditMessageInput.model`, `ResolveActionOptions.model`, `useChat` option `getModel`).
- `Chat` prop `showAnsweredWith` (default true): "Answered with <model>" under answers that report their model (`metadata.model`, `agentModel` or `cognipeer.agent_model`), and a divider where the model changes. `ChatInput` prop `modelPicker`; `ChatMessageList` props `models` and `showAnsweredWith`; `modelOfMessage` / `modelLabel` helpers; strings `chat.model.*` (English, Turkish).

## [0.4.0] - 2026-10-10

### Added

- Approvals and questions. When the agent pauses (agent-server 0.3.0+), `ToolApprovalCard` and `QuestionCard` render under the assistant message and the answer is sent with `resolveAction`. See [Approvals and Questions](/guide/approvals)
- `Chat` props `enableToolApprovals`, `enableQuestions`, `renderToolApproval`, `renderQuestion`, `pendingActionComposerMode` and `onActionResolved`
- `useChat` returns `pendingActions`, `awaitingAction`, `isResolvingAction`, `canResolveActions`, `answerableQuestion` and `resolveAction`
- Types `PendingAction`, `ActionResolution`, `UserQuestion`, `MessageStatus`, `StreamActionRequiredEvent`, `StreamActionResolvedEvent`; `ChatTransport.resolveAction` (optional) and `AgentServerClient.resolveAction`
- Pending actions are restored when a conversation is loaded
- `ChatInput` `pendingMode` prop; English and Turkish strings for the new UI
- `fileTransport: "upload"` (`Chat`, `useChat`): files are uploaded with `POST /files` (`conversationId` set) when the message is sent and the message carries only their ids (`fileIds`); a failed upload or a refused message removes what was stored. Default `"inline"` (base64 in the message) is unchanged. `ChatTransport.uploadFile` / `deleteFile` (optional) and `SendMessageOptions.fileIds`
- An agent's `metadata` can narrow uploads for that agent: `enableFileUpload`, `maxFileSize`, `maxFiles`, `allowedFileTypes`
- An agent's `metadata.pendingActionComposerMode` (`"block"` | `"cancel"`) overrides the `pendingActionComposerMode` prop for that agent
- `chat.file.empty` string (English, Turkish)
- `useChat`: `sendMessage` resolves `true`/`false` (false = refused before the server took it) and `resolveAction` resolves `true`/`false` (false = the answer was not taken); `ChatInput.onSend` may return (or resolve to) `false` to get the typed text back
- Approval cards can edit a call's arguments: `Chat` `allowArgumentEdit` (or an agent's `capabilities.approvalArgsEdit`) turns "Details" into a JSON editor, checked as a JSON object and against the action's new `argsSchema` (a JSON Schema). Approve sends `approvedArgs` only when they differ from the proposal; a settled card says "Approved with edited arguments"
- Deadlines: a card with an `expiresAt` shows "Expires in ...", turns amber below `expiryWarningSeconds` (default 600) and turns Expired at the deadline, which frees the composer; `useChat` then fetches the conversation again (`actionExpiryRefreshMs`, default 1500)
- Reloaded conversations show how requests ended when the server says: `Message.actionStates`, `metadata.actionStates` or settled entries (`status`, `resolution`, `kind` or `type`) in `metadata.pendingActions`; the open list from the server still wins. Cards show "Remembered for this chat" and keep an Expired / Cancelled card from turning into "Answered" on a refresh. `ActionState.resolvedBy` / `resolvedAt`
- Error codes: a failed request with a known `code` shows a localized, friendly message (`chat.error.code.<code>`, en and tr), keeping `code`, `status` and the server's wording (`serverMessage`); `stream.error` events pass their `code` on. A send refused with `action_pending` / `pending_action` / `conversation_busy` fetches the conversation again so the waiting card or the running turn shows
- Every code the new routes answer with has a localized message (en, tr): `invalid_message_target`, `invalid_feedback`, `feedback_disabled`, `export_disabled`, `export_format_unsupported`, `action_disabled`, `conversation_busy`, `rate_limited`, the task and client-tool codes, and the portal's `terms_required`, `terms_changed`, `invalid_version`. The history list (rename, pin, bulk delete, loading) shows them too. A test reads agent-server's source (next to this checkout, or `AGENT_SERVER_SRC`) and fails for a code without a string. Unpinning no longer rolls back when the server's answer echoes the pin it just removed: `pinConversation` reads the conversation again and that answer decides
- `Chat` honours an enclosing `ChatI18nProvider` (its locale and `customMessages`), has its own `customMessages` prop, and works without any provider; `ChatI18nProvider` providers nest and inherit. Locale codes beyond `en` / `tr` work with `customMessages`, missing keys falling back to English per key (`SupportedLocale` is `"en" | "tr" | (string & {})`). `useI18n` works outside a provider (English) and has `has(key)`
- Files: drag and drop onto the composer, paste of screenshots and copied files, messages with only files (`attachmentsOnlyMessage`), the paperclip is off while the composer is blocked or files are uploading (`useChat` `isUploading`), image thumbnails in the composer (`FileAttachment.previewUrl`, an object URL released with the conversation) and in messages, image parts in message content (`image_url`, `input_image`, `image`) drawn as pictures from safe URLs only, `renderImage`, a warning when an agent says `acceptsImages: false` (metadata or capabilities)
- Accessibility: labelled composer and buttons, the message list is a live `log` (busy while streaming), new approval / question cards are announced and take focus (an approval lands on the card, never on a deciding button), focus returns to the composer once the last card is answered, error banner is an `alert`, `aria-expanded` on the agent picker, `prefers-reduced-motion` stops spinners and pulses
- Theme tokens `success`, `danger`, `warning`, `info` (and `...Bg` tints) as `--chat-*` variables, Tailwind colours and `ChatTheme["colors"]`; `Chat` `themeColors` takes every colour key. The error banner and the outcomes of cards use them
- `ImageIcon`, `ImageRenderProps`, `ChatMessages`, `BuiltInLocale`, `isImageFile`, `normalizeActions`, `isQuestionRequired`, `validateAgainstSchema`, `localizeError`, `safeImageSrc`, `safeFileHref` are exported
- Docs: a new [Internationalization](/guide/i18n) guide; file uploads, approvals, the API reference (client, types, `useChat`) and the component pages rewritten to match the code; README props table restored

- Runs that outlive the page (agent-server 0.3.0+). A conversation opened (or reloaded) while a turn is still running **follows it**: `ChatTransport.followEvents` reads the event log (`GET /conversations/:id/events/stream`) from `runtime.lastEventSeq`, the live text, tool calls and finished message appear, and when the turn ends the stored answer (or the cards of a pause) replaces them. A turn started in another window, a send refused as `conversation_busy` and a conversation this page started and left are picked up the same way. `useChat` returns `isFollowing`. `AgentServerClient.followEvents` reconnects from the last event seen, with backoff (`reconnect` option); the SSE reader returns frame `id`s. See [Running turns, Stop and reattach](/guide/runs)
- A connection that drops after the server took a message, an answer or a continuation is not an error any more on a transport that can follow: the page looks at the conversation again and follows or shows what finished; only an unreachable conversation shows the error
- **Stop** stops the run on the server: `ChatTransport.cancel` (`POST /conversations/:id/cancel`) is called, the stream is closed, the partial answer is kept as a message marked stopped and then replaced by what the server kept. While following, Stop asks the server to cancel. Without `cancel` it only closes the connection, as before. Stop also aborts the upload of a message's files and gives the composer its files and text back
- Why an answer ended: `Message.stopReason` / `stopDetail` (also read from `metadata.stopReason`), `StreamDoneEvent.stopReason` / `runId` / `seq` / `budget` / `spentUsd` / `warnings`, and a notice under the answer (`MessageStopNotice`: stopped, limit, steps used up, usage limit, error; whether the text is partial). `renderStopNotice`. A turn's `metadata.warnings` (`file_truncated`, `file_unreadable`, `images_not_supported`, `pause_state_too_large`) are listed under the answer (`MessageWarnings`)
- Usage limits: `Conversation.budget` / `spentUsd` / `runtime`, a meter and a notice (`BudgetBanner`, `renderBudgetBanner`, `showBudgetMeter`), the composer closes while the limit is used up, `allowBudgetContinue` / `allowBudgetEdit` (or an agent's `capabilities.budget`) offer Continue and raise-and-continue, `ChatTransport.updateBudget` / `continueConversation`, `useChat` `budget`, `spentUsd`, `budgetExhausted`, `canContinue`, `canUpdateBudget`, `continueConversation`, `updateBudget`, `onBudgetReached`. A `stop` limit never promises to carry on. See [Usage limits](/guide/budgets)
- History: status badges (Working, Waiting for you, Limit reached) from `ConversationListItem.runtime` (`showStatus`, `selectedStatus`), refreshed when a turn ends. Rows are real buttons in a labelled list: Tab, Enter and Space, arrow keys / Home / End, Escape closes the overlay, and the delete button shows for a keyboard user
- `ComposerState` (`open`, `blocked`, `cancel`, `answer`, `following`, `budget_paused`, `readonly`): `useChat` returns `composerState`, `ChatInput` takes `state` (`pendingMode` still works), one notice and placeholder per state; `readOnly` on `Chat` / `useChat`
- The agent drives the composer: `AgentInfo.capabilities.attachments` (`enabled`, `maxFiles`, `maxFileSize`, `allowedMimeTypes`, `acceptsImages`, `retentionDays`, `maxFilesScope`) wins over the older `metadata` keys, which keep working; `capabilities.budget`; `resolveAgentSettings`
- Files: `fileTransport: "upload-on-select"` stores each file as soon as it is picked, with a progress bar, ready / failed states, retry (`retryFile`) and removal (deleting the stored copy); `"upload"` now shows the message bubble at once with progress on its chips. `ChatTransport.uploadFile` takes the file as a `Blob` where `supportsRawUpload` (`AgentServerClient`: bytes as the request body with the file's own type, `?name=&conversationId=`, `onProgress` through `XMLHttpRequest`, `signal`); base64 `content` for transports that do not. `FileAttachment.status` / `progress` / `uploadError` / `expiresAt` / `expired` / `conversionStatus`
- Per-conversation file limits: `maxFilesScope`, `heldFiles` (the server's `listFiles`, else the loaded messages), "3 of 10 files in this chat", a refusal that names the limit and what is held; a file the browser could not type is judged by its name against extension entries and otherwise left to the server
- Files in the history: expired files are muted chips with no download, a file whose text could not be read says "No readable text", a deadline says "Kept until ...", pictures without a URL are fetched with the transport's credentials (`ChatTransport.getFileUrl`, `resolveFileUrl`; only raster pictures keep their type as blobs), documents download through the transport. "Files are kept for N days" under the composer
- `ChatTransport.followEvents`, `cancel`, `continueConversation`, `updateBudget`, `listFiles`, `getFileUrl` (all optional) and `AgentServerClient.dispose`; types `ConversationRuntime`, `ConversationBudget`, `ConversationEvent`, `StopReason`, `RuntimeStatus`, `TurnWarning`, `ComposerState`, `StopNoticeRenderProps`, `AgentCapabilities`, `AgentAttachmentsCapability`; errors carry the server's `details`
- Other transports can pause: the Responses transport turns a Console response with `status: "requires_action"` into cards and answers them (`actionUrl`, `resolveActions`), the A2A transport shows the actions of an `input-required` task and answers through `actionUrl`, the in-process agent-sdk transport pauses and resumes an agent that can. `StatelessTransport` takes `pendingActions` / `stopReason` from `run()` and `resolve()` / `canResolve()` to take answers. Stop reasons of Responses and A2A answers show as notices
- Question options may carry a `preview` (a collapsed panel); a request the server refused on its own after it lapsed (`resolvedBy: "system:timeout"`) reads Expired, not Denied
- Long conversations: agent-server sends the newest page of a long history (100 messages by default). `ChatTransport.getConversation(id, { before, limit })` and `AgentServerClient.getConversation` take a cursor and return `messagesPage` (`MessagesPage`); `useChat` returns `hasEarlierMessages`, `isLoadingEarlierMessages` and `loadEarlierMessages`, and `ChatMessageList` (`hasEarlier`, `isLoadingEarlier`, `onLoadEarlier`) shows "Show earlier messages" above the first message and keeps the reader's place when the older page arrives. Pages already loaded stay when the conversation is fetched again. Strings `chat.messages.loadEarlier`, `chat.messages.loadingEarlier`, `chat.error.loadEarlierFailed`
- Strings for all of the above in English and Turkish, and codes `budget_forbidden`, `invalid_budget`, `budget_unavailable`, `nothing_to_continue`, `run_interrupted`, `identity_required`, `payload_too_large`, `authorization_error`, `conversation_conflict`, `lease_lost`, `storage_limit_exceeded`
- Reattach snapshot: the first frame of `GET /conversations/:id/events/stream` while a run is active is `agent.message.snapshot` (`{ run_id, text, user_message }`, no `id:` line). The follower seeds its live bubble with the text written so far, adds the person's own message when the stored history lacks it, and appends the deltas that follow; a reconnect's fresh snapshot replaces the text instead of doubling it. `ConversationEvent` frames without a `seq` leave the cursor where it is. See [Running turns](/guide/runs#the-reattach-snapshot)
- A conversation that ends on the person's own message after a run that was cut off (`runtime.stopReason` `error`, also read from `interrupted`) shows "The reply was interrupted" with Retry (`InterruptedNotice`, `useChat` `interrupted` / `retryInterrupted()`, `ChatMessageList` `interrupted` / `onRetryInterrupted`, `StopNoticeRenderProps.onRetry`). Retry sends the text again with the files it carried (`sendMessage(text, { reuseFiles })`)
- A tool call that the turn paused on (an open question or approval) shows a clock, not the tick of a finished call (`ToolCalls` `waitingIds`, `waitingToolCallIds`)
- A turn the usage limit stopped midway stays `budget_paused` after the limit is raised, until it is continued or a new message abandons it. The answer to the change (`PATCH /conversations/:id`) and a loaded conversation carry `continuable` (`Conversation.continuable`; also read from beside the conversation or from its runtime). **Increase and continue** (`updateBudget(..., { continue: true })`) calls `POST /continue` exactly when the answer says `continuable: true`, then reads the conversation again so `spentUsd` and the meter are the server's. A turn that had finished its answer before the limit is not continuable: the raise only reopens the conversation. A server that does not say falls back to the status its answer reports (`budget_paused`). A paused conversation whose limit has room offers **Continue** next to the field to raise it. `canContinueAfterRaise` and `readContinuable` are exported
- Reattach: the `session.status_running` the log replays after the snapshot usually names no run, and it no longer wipes the text the snapshot seeded. The text is kept while the start names the snapshot's run or none; another run (named on a start or on a delta's `run_id`), or a start after the turn went idle, begins the view afresh. `FollowState.seeded`
- A question or approval that is open but has no tool call of its own (a conversation opened again after a reload keeps the cards, not the calls) shows its row with the waiting clock: `callsWithOpenActions`. The row goes away once the card has an outcome
- A message bubble's file chip shows "Uploading N%" and a progress bar while a file is going up (`fileTransport: "upload"`), and offers no Download until the file is stored
- `dist/styles.css` is checked for declarations a minifier cannot parse (`npm run verify:dist`), and `scripts/styles.test.mjs` builds the stylesheet from the sources and checks it

- Portal experience (all off until switched on; see [Portal Experience](/guide/portal-experience)): message actions (`messageActions`: copy, regenerate the newest answer, edit-and-resend your own messages), thumbs with reasons and a comment (`feedback`), history rename / pin / select-and-delete (`historyActions`), suggested first messages and a Markdown welcome (`starters`, `welcome`, an agent's `metadata.starters` / `metadata.welcome`), deep links (`initialAgentId`, `initialInput`, `autoSend`), an AI label and a row of legal links (`disclosure`, `footerText`), announcements (`AnnouncementBanner`), a generic terms-acceptance gate (`TermsGate`), an export menu (`exportMenu`: Markdown, JSON, PDF through the server or built in the browser) and background alerts (`notifications`: tab badge, chime, opt-in desktop notifications). An agent's `metadata.experience` can only narrow the props (a switch is on when the host turned it on and the agent has not taken it away; agent-server publishes every switch as allowed, which switches nothing on by itself), and the server's `html` export format is the menu's PDF item (the print view). `ChatTransport` gains optional `regenerateMessage`, `editMessage`, `sendFeedback`, `renameConversation`, `pinConversation` (sends `{ pinned }`; resolves with the pin the server stored, which the list checks), `deleteConversations` (reads agent-server's `{ results: [{ id, status }], deleted }`), `exportConversation` (a PDF request the server cannot render is repeated as its print view) (implemented by `AgentServerClient`); `useChat` returns `regenerate`, `editMessage`, `submitFeedback`, `canRegenerate`, `canEdit`, `canRate`; `useChatHistory` returns `renameConversation`, `pinConversation`, `deleteConversations`; `useBackgroundAlerts`; `Chat` `controllerRef` (`ChatController`)
- Embedding with an identity token the host page signs (`EmbedChat`; see [Embedding the Chat](/guide/embed)): a `postMessage` handshake (`cp:ready`, `cp:auth`, `cp:token_request`) with strict origin checks both ways, the token traded once for a short-lived in-memory session sent as a bearer token (no cookies, no token in a URL), renewal before the session ends without remounting the chat, events for the host (`ready`, `auth:error`, `conversation:started`, `message:sent`, `message:completed`, `action:required`, `action:resolved`, `limit:reached`, `error`), `cp:prefill` / `cp:context` / `cp:logout`, and tools of the host page (`client_tool` actions answered through `cp:tool_call` / `cp:tool_result`; no card is drawn). `EmbedBridge`, the protocol helpers and `exchangeToken` are exported; `Chat` gains `onClientToolCall`, `getMessageMetadata`, `onActionRequired` and `onFeedback`. `PendingAction` and `ActionResolution` gain a `client_tool` variant (a host-page tool has no card, is not "waiting for you" and does not close the composer)

### Changed

- `stop()` stops the run on a transport that can cancel (it only detached before); the partial answer it leaves is marked stopped
- `budget_reached` makes the page fetch the conversation again, like the other conflicts
- `fileTransport: "upload"` puts the message bubble on screen before the files have gone up (a failed upload takes it back and returns the files)
- Files are uploaded as the request body (not base64) where the transport supports it
- `ChatHistory` rows are buttons (they were clickable divs) in a list; the delete button is named after the conversation
- Question `required` now defaults to true, the agent SDK's rule (it refuses a missing answer to a required question): a question without `required` is marked with an asterisk, and Skip is offered only when every question says `required: false`. Servers that want an optional question send `required: false`. `isQuestionRequired` is exported
- Errors with a known code show a localized message instead of the server's text (the server's text is `error.serverMessage`); the message of a file over `maxFileSize` names the limit
- Text parts of a message's content array are joined with a line break instead of nothing
- Image attachments with a URL render as thumbnails; other files show their size
- The send button is also enabled for files without text
- Errors thrown for failed requests now carry `status` and `code` when the server sends them
- `allowedFileTypes` entries such as `image/*` now match by media-type prefix
- Files refused client-side (too many, too large, type not allowed, 0 bytes) are shown in the chat's error banner as well as passed to `onError`. A 0-byte file is refused with its own message
- An answer refused with `action_expired` or `action_cancelled` turns the card into Expired / Cancelled (as `action_not_pending` already did) and frees the composer; any other error still puts the card back to waiting
- Opening a conversation from the history (or through `conversationId`) selects that conversation's agent, so the header and the per-agent paperclip, limits and composer mode match it (`onAgentChange` is called when the agent changes)
- A refused upload or message no longer clears the composer: the typed text comes back, the optimistic message is removed and the attached files stay attached
- File links in messages accept `http:`, `https:`, `blob:` and relative addresses only (checked the way the browser's URL parser reads them); the address is no longer used as given, so a `data:` URL, such as the inline bytes of an A2A file, has no Download link (0.3.0 linked the URL as it was)
- Only PNG, JPEG, GIF and WebP attachments are drawn as thumbnails and get a local preview URL; an SVG or another image type is a file chip. A thumbnail that does not load falls back to the next copy and then to the chip
- A JSON file uploaded as itself goes up as `application/octet-stream` with `?mimeType=` in the query (the server reads a JSON `Content-Type` as its JSON upload form); a network failure during an upload is the localized `upload_failed` error
- The live turn is always drawn below the stored messages, so a continuation (Continue after a usage limit) no longer replaces the answer it carries on
- A refused answer to a card (403, 410, 5xx) leaves the card waiting and `resolveAction` resolves `false` on `StatelessTransport` backends too: `stream.start` and `stream.action_resolved` are sent once the backend has started on the answer, and `stream.start` alone no longer counts as the server having taken it
- A card past its deadline stays Expired when the server has not swept it yet, instead of the page fetching the conversation every 1.5 seconds
- A followed turn that ended is not followed again while the store still reads it as running; Stop on a followed turn the server has nothing to cancel in stops watching; Stop while a message's files are still going up no longer asks the server to cancel (the message was never sent)
- Previews of pictures waiting in the composer survive opening another conversation; the blob URLs of stored files are released when a conversation is left (and at most 200 are kept)
- The reasons Approve is off (an argument that does not fit the schema) show on the card without opening the editor
- "Increase and continue" looks at the server's answer to the change and asks to continue only when the conversation is still `budget_paused` (a turn that had finished its answer is idle after the change, and a continue would only be refused with a 409); after a continuation the conversation is fetched again, so `spentUsd` is the server's figure
- The message that refuses files over the conversation's limit counts the files accepted from the same batch ("This chat can hold 3 files; 3 already attached", not "0")
- `pendingActionFromWire` and `normalizeActions` keep the arguments' JSON Schema (`argsSchema`, also read from `args_schema`, `input_schema`, `inputSchema`), so the editor in an approval card checks an edit against it
- The pasted-screenshot name is built without a bracketed regex class that Tailwind's scanner turned into the invalid rule `.\[-\:T\]{-:T}` in `dist/styles.css` (a css-syntax warning in a consumer's Vite build); `tailwind.config.js` also blocklists it

## [0.3.0] - 2026-10-07

### Added

- `ChatTransport` interface and a `transport` prop on `Chat`, `useChat` and `useChatHistory`, so the chat can talk to backends other than `@cognipeer/agent-server`
- Transports for agent-sdk (`AgentSdkTransport`), OpenAI Chat Completions (`ChatCompletionsTransport`), the Responses API (`ResponsesTransport`) and A2A (`A2ATransport`). See [Transports](/guide/transports)
- `ThreadStore` with `MemoryThreadStore` and `LocalStorageThreadStore`, used by the transports whose backend keeps no conversations
- `getHeaders` (async, called before every request) and `fetch` options, so a token can be renewed between requests and cookie or proxy setups work

### Changed

- `baseUrl` is optional when `transport` is given
- The SSE reader accepts `event:` lines, CRLF line endings and multi-line `data:`

## [0.2.0] - 2026-08-27

### Changed

- Package publication is now validated through the CRM-managed npm Trusted Publishing workflow

## [0.1.5] - 2026-08-25

### Added

- Inline citation markers. `Message.citationMarks` carries `{ offset, citationId }` pairs pointing into the answer text, and `ChatMessage` renders a small numbered marker at each offset linking to the source it names. The number matches the source's position in the list below, so a marker can be traced back to its document
- `StreamDoneEvent.citationMarks`, so markers appear on a streamed answer without waiting for a refetch
- `insertCitationMarkers`, `parseCitationHref`, `safeExternalHref` and `citationUrlTransform` are exported for hosts that render answers through their own markdown pipeline. `citationUrlTransform` is required there: react-markdown blanks out URL schemes it does not know, which erases the marker before it can be rendered

### Changed

- The source list shows the document name as its title, with the innermost folders as a muted second line. Synced documents are titled with their full path, so several sources from one folder repeated the same lines and pushed the filename out of view
- The whole source row is the link target rather than only the title text
- Source links are restricted to absolute `http(s)` URLs before being placed in an `href`

### Note

- Markers are styled by `.chat-citation` in the shipped stylesheet. Applications that do not import `@cognipeer/chat-ui/styles.css` will see unstyled markers

## [0.1.4] - 2026-07-10

### Fixed

- File attachments from the `stream.done` event now appear immediately instead of requiring a refetch — `StreamDoneEvent` gained an optional `files` field, and `useChat` includes `event.files` on the assistant message it builds
- Long filenames no longer hide their extension when truncated — `ChatMessage` now splits the base name and extension before truncating, so e.g. a `.docx` and a `.pdf` export of the same document stay visually distinguishable

## [0.1.3] - 2026-03-06

### Changed

- Housekeeping release — version bump only, no functional changes beyond what shipped in 0.1.2

## [0.1.2] - 2026-02-16

### Added

- Full internationalization (i18n) support: `useI18n` hook and `ChatI18nProvider`, with English and Turkish locale files wired into `ChatHistory`, `ChatInput`, `ChatMessage`, `ChatMessageList`, `MessageActions`, and `ToolCall`
- Agent name display and conversation title handling in chat components

### Changed

- `useChatHistory` loading logic now guards against duplicate initial loads in React Strict Mode, adds options to control loading-indicator visibility, and supports a silent refresh

## [0.1.1] - 2026-02-13

### Added

- `ChatProvider` and context hooks for React-controlled chat state management
- Theme presets and an extended `Message` type (citations, optional `agentId`)
- Streaming support for "thinking" events, with improved message rendering
- Build verification script

### Changed

- Standardized chat header height and button styles for consistency
- `useChatHistory` now uses a stable client reference and improved conversation-loading logic

### Fixed

- Debounce helper now uses `ReturnType` for the timeout variable instead of a Node-specific type

## [0.1.0] - 2025-01-01

### Added

- Initial release
- `Chat` component with full features
- `ChatMinimal` component without history
- `ChatMessage`, `ChatMessageList` components
- `ChatInput` with file upload support
- `ChatHistory` sidebar component
- `ToolCall` and `ToolCalls` components
- `useChat` hook for custom implementations
- `useChatHistory` hook for history management
- `AgentServerClient` for direct API access
- Dark and light theme support
- Custom theme colors via props and CSS variables
- SSE streaming support
- File upload with drag-and-drop
- Tool call visualization
- Markdown rendering
- TypeScript types
- React 18+ support
