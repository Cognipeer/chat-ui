# Changelog

All notable changes to Chat UI will be documented here.

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
