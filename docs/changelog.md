# Changelog

All notable changes to Chat UI will be documented here.

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
