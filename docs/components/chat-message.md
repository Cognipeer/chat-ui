# ChatMessage Component

Renders a single message in the chat: markdown text, images, file attachments, tool calls, sources, and the approval / question cards of a paused turn.

## Import

```tsx
import { ChatMessage } from "@cognipeer/chat-ui";
```

## Usage

```tsx
<ChatMessage
  message={{
    id: "msg-1",
    conversationId: "c-1",
    role: "assistant",
    content: "Hello! How can I help you?",
    createdAt: new Date(),
    updatedAt: new Date(),
  }}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `message` | `Message` | required | The message to render |
| `isStreaming` | `boolean` | `false` | Whether this message is streaming |
| `streamingText` | `string` | - | Current streaming text (used while `isStreaming`) |
| `showAvatar` | `boolean` | `true` | Show the avatar |
| `showTimestamp` | `boolean` | `false` | Show the time |
| `enableCitations` | `boolean` | `true` | Sources and inline markers under assistant messages |
| `actions` | `ChatActionsConfig` | - | How approval / question cards behave under this message. Without `onResolve` they are read-only; see [Approvals and Questions](/guide/approvals#custom-layouts) |
| `renderActions` | `(props: MessageActionProps) => ReactNode` | - | Custom action buttons (shown on hover) |
| `renderAvatar` | `(role) => ReactNode` | - | Custom avatar |
| `renderImage` | `(props: ImageRenderProps) => ReactNode` | - | Draw an image yourself, e.g. fetch it with credentials and show a blob URL |
| `renderStopNotice` | `(props: StopNoticeRenderProps) => ReactNode` | - | Replace the notice under an answer that stopped early |
| `resolveFileUrl` | `(file, { disposition? }) => Promise<string \| undefined>` | - | How to get a URL for a stored file that has none of its own (`useChat` returns one, `ChatTransport.getFileUrl`) |
| `filePreview` | `boolean` | `true` | A **Preview** button on file chips, and thumbnails that open the preview (see [File preview](#file-preview)) |
| `className` | `string` | - | Additional class names |

## Message content

`content` is a string, or an array of parts:

```tsx
content: [
  { type: "text", text: "Here is the chart" },
  { type: "image_url", image_url: { url: "https://cdn.example.com/chart.png" } },
]
```

- **Text parts** are joined, one per line, and rendered as markdown.
- **Image parts** (`image_url`, `input_image`, `image`) are drawn as pictures below the text, lazily loaded, each opening full size in a new tab. Only a safe URL is drawn: `https:`, `blob:`, relative or same-origin URLs, `http:` when the page is itself served over http, and base64 PNG / JPEG / GIF / WebP. `javascript:` URLs, SVG data URLs and other schemes are dropped.
- Other parts are ignored.

## Attachments

`message.files` shows under the text:

- an **image** with a usable `url` (or a local `previewUrl`, for a file just sent from this page) as a thumbnail with its name and size; it opens in the [preview](#file-preview) (with `filePreview={false}`, full size in a new tab);
- an image **without** a URL of its own (a conversation loaded from the server) is fetched through `resolveFileUrl` and then shown as a thumbnail;
- any other file, or an image without a usable URL, as a chip with its name, extension and size, a **Preview** button when the file is of a type the preview shows, and a **Download** link when `url` is a safe link (http(s), `blob:` or relative) or, with `resolveFileUrl`, a **Download** button that fetches it;
- a file whose `expiresAt` has passed, or that is marked `expired`, is a muted, struck-through chip marked **Expired**, without a download; a file whose `conversionStatus` is `failed` / `skipped` is tinted "No readable text"; a file with a deadline in the future says "Kept until ..." on hover.

## File preview

In `Chat`, **Preview** opens the file in a pane on the right that slides in and pushes the conversation over: the page stays as it is, so the person can keep reading and writing beside the file, and another file's Preview replaces the one in the pane. The pane is about half of the conversation area (360 to 720 pixels) and leaves the conversation at least 520. When the area is narrower than 880 pixels (a phone, a narrow window) the preview is a dialog instead: a panel over the page on the right, the whole screen on a phone. A `ChatMessage` or `ChatMessageList` used on its own always opens the dialog. Either closes on Escape or its close button and gives focus back to the button the file was opened from; opening another conversation closes the pane.

| File | Shown as |
|------|----------|
| PNG, JPEG, GIF, WebP, AVIF, BMP | The picture |
| SVG | A picture (its scripts never run) |
| PDF | Its pages (pdf.js), with the page number and zoom |
| Word `.docx` | Its pages (docx-preview), scaled down to fit a phone |
| Excel `.xlsx`, `.xlsm` | A table per sheet (up to 10) |
| CSV, TSV | A table (`,`, `;` or tab) |
| Markdown | Rendered, or its source; saved as Markdown, PDF or Word |
| HTML | The page, in a sandboxed frame: its scripts run without access to yours |
| JSON | Pretty-printed |
| Text and code (`.txt`, `.log`, `.py`, `.ts`, `.sql`, `.yaml`, ...) | The text |
| Audio, video | A player |

The extension decides first and the media type after it, so files that arrive as `application/octet-stream` (as an agent's files often do) are still shown. Other types (`.doc`, `.xls`, `.pptx`, archives) have no Preview button. A spreadsheet or CSV shows its first 500 rows and 50 columns, text its first 300,000 characters, and each kind has a size above which the file is not read and the panel offers the download instead (`PREVIEW_MAX_BYTES`: 40 MB for PDF, 15 MB for Word and Excel, 10 MB for CSV and JSON, 5 MB for Markdown, HTML and text).

The bytes are read like Download reads them: the copy still on this device, the file's own `url`, or `resolveFileUrl` with the transport's credentials. A file the page cannot read (a link on another site that does not allow it, for one) shows a notice with the download.

PDFs are read on the page itself. To read them in a worker instead, set `GlobalWorkerOptions.workerSrc` of `pdfjs-dist/legacy/build/pdf.min.mjs` to the URL of its `pdf.worker.min.mjs` before the first preview.

A Markdown file's download menu also saves it as a **PDF document** or a **Word document**, made in the browser. `exportMarkdown` does the same for your own buttons:

```tsx
import { exportMarkdown, markdownExportName } from "@cognipeer/chat-ui";

const blob = await exportMarkdown(markdown, "docx", "Quarterly report");   // or "pdf"; a Blob
const name = markdownExportName("report.md", "docx");                       // "report.docx"
```

To show a file from a list of your own, use `FilePreview`:

```tsx
import { FilePreview, filePreviewKind } from "@cognipeer/chat-ui";

{filePreviewKind(file) && <button onClick={() => setOpen(file)}>Preview</button>}
{open && <FilePreview file={open} resolveFileUrl={chat.resolveFileUrl} onClose={() => setOpen(null)} />}
```

Pass `container` (an element inside the chat's theme) to keep the chat's colours when the preview is outside the chat; it is mounted in `document.body` otherwise. With `paneWidth` it is a pane of that width in your own layout instead of a dialog (`previewPaneWidth(areaWidth)` gives the width `Chat` uses, or `undefined` when a pane does not fit).

## Why an answer ended

An assistant message that was stopped (`stopReason` `cancelled`, `limit`, `max_turns`, `budget_reached` or `error`, or `status` `cancelled` / `incomplete`) shows a notice under its text (`MessageStopNotice`, a `role="status"` block) saying so, and whether the text above is a partial answer. A plain answer, and a pause, show none. `metadata.warnings` are listed under the answer (`MessageWarnings`). See [Running turns, Stop and reattach](/guide/runs#why-an-answer-ended).

## Status and actions

A paused assistant message (`status: "requires_action"`, `pendingActions`) shows an approval or question card per action; how a settled card looks comes from `message.actionStates`, which the app fills as cards settle and which a server may send for a reloaded history. See [Approvals and Questions](/guide/approvals#history).

## Examples

### With Tool Calls

Tool calls of a finished message are read from `metadata.toolCallDetails`:

```tsx
<ChatMessage
  message={{
    ...message,
    metadata: {
      toolCallDetails: [{ id: "call-1", name: "get_weather", args: { location: "New York" }, result: { temp: 22 } }],
      toolCallDurationSeconds: 2,
    },
  }}
/>
```

### Streaming

```tsx
<ChatMessage message={message} isStreaming streamingText="I'm currently writing..." />
```

### With an Image

```tsx
<ChatMessage
  message={{
    ...message,
    role: "user",
    content: [
      { type: "text", text: "Analyze this image" },
      { type: "image_url", image_url: { url: "data:image/png;base64,..." } },
    ],
  }}
/>
```

### Images behind authentication

An `<img>` cannot send an `Authorization` header, so draw the image yourself:

```tsx
<ChatMessage
  message={message}
  renderImage={({ src, alt }) => <AuthenticatedImage src={src} alt={alt} />}
/>
```

### With Actions

```tsx
<ChatMessage
  message={message}
  renderActions={() => (
    <div className="flex gap-2">
      <button>Like</button>
      <button>Copy</button>
    </div>
  )}
/>
```

## Styling

Colours come from the theme variables; markdown is styled by the `.chat-markdown` rules in `styles.css`. See [Theming](/guide/theming).

## Markdown Support

The component renders markdown content (GitHub-flavoured): bold and italic text, inline code, code blocks, lists, tables and links (links open in a new tab).

## Related

- [ChatMessageList](/components/chat-message-list)
- [Chat](/components/chat)
- [Types](/api/types)
