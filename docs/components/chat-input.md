# ChatInput Component

The composer: a text area, file attachments (pick, drop, paste), and the send / stop button. `Chat` uses it; use it directly with [`useChat`](/api/use-chat) for your own layout.

## Import

```tsx
import { ChatInput } from "@cognipeer/chat-ui";
```

## Usage

```tsx
const chat = useChat({ baseUrl: "/api/agents", agentId: "assistant" });

<ChatInput
  onSend={chat.sendMessage}
  onStop={chat.stop}
  isLoading={chat.isStreaming}
  isUploading={chat.isUploading}
  pendingFiles={chat.pendingFiles}
  onFilesAdd={chat.addFiles}
  onFileRemove={chat.removeFile}
  onFileRetry={chat.retryFile}
  state={chat.composerState}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSend` | `(message: string) => void \| boolean \| Promise<void \| boolean>` | required | Called with the trimmed text. The composer clears at once; if this returns (or resolves to) `false` the message was refused and the typed text comes back unless something new was typed meanwhile. The text is empty when only files are attached |
| `onStop` | `() => void` | - | Stop callback; shows a stop button while `isLoading` |
| `onFilesAdd` | `(files: File[]) => void` | - | Files were picked, dropped or pasted. Without it there is no paperclip and no drop zone |
| `onFileRemove` | `(fileId: string) => void` | - | A pending file was removed (while it is going up, that stops the upload) |
| `onFileRetry` | `(fileId: string) => void` | - | A file that failed to upload is tried again; its chip then has a retry button |
| `pendingFiles` | `FileAttachment[]` | `[]` | Files attached to the next message |
| `isLoading` | `boolean` | `false` | A reply is streaming: sending waits, attaching does not |
| `isUploading` | `boolean` | `false` | The files of a message are being read or uploaded: the paperclip, drop and sending wait, and the chips show a spinner. Files that carry their own `status` (stored as they were picked) show a progress bar instead, and only hold the send back |
| `enableFileUpload` | `boolean` | `true` | Show the paperclip and take drops and pastes |
| `allowedFileTypes` | `string[]` | any | Passed to the file picker's `accept` |
| `maxFiles` | `number` | `10` | The paperclip is off once this many files are attached (plus `filesHeld`) |
| `filesHeld` | `number` | `0` | Files the conversation already holds; they count against `maxFiles` |
| `fileCounter` | `boolean` | `false` | Show "3 of 10 files in this chat" next to the chips |
| `retentionDays` | `number` | - | Show "Files are kept for 30 days" in the helper line |
| `imagesIgnored` | `boolean` | `false` | The agent does not read images: an attached image gets a warning chip and message |
| `state` | `ComposerState` | `"open"` | What the composer is doing; see below. `useChat` returns it as `composerState` |
| `pendingMode` | `"blocked" \| "cancel" \| "answer"` | - | The older form of `state` for the first three values; `state` wins |
| `placeholder` | `string` | localized | Input placeholder |
| `disabled` | `boolean` | `false` | Disable input |
| `autoFocus` | `boolean` | `false` | Focus on mount |
| `className` | `string` | - | Container class name |
| `renderSendButton` | `({ onClick, disabled }) => ReactNode` | - | Custom send button |
| `renderStopButton` | `({ onClick }) => ReactNode` | - | Custom stop button |

The component also takes a `ref` with `focus()`.

## States

| `state` | Textarea | Paperclip | Send | Notice above the box |
| --- | --- | --- | --- | --- |
| `open` | open | on | on | |
| `blocked` | closed | off | off | "The assistant is waiting for your response above" |
| `cancel` | open | on | on | sending cancels the request |
| `answer` | open | on | the text answers the question (files alone are not an answer) | "Your reply will answer the question above" |
| `following` | closed | off | off (Stop stays) | "This conversation is answering in another window. You can stop it here." |
| `budget_paused` | closed | off | off | none: the [usage limit](/guide/budgets) banner explains |
| `readonly` | closed | off | off | "This conversation is read-only" |

The placeholder says the same. In every state, the stop button shows while `isLoading` and `onStop` is set.

## Files

- **Paperclip**: opens the file picker. It is off while the composer is blocked, while files are uploading, and at the file limit.
- **Drag and drop**: dropping files on the composer attaches them; a hint shows while a drag is over it. A drop the composer cannot take (blocked, uploading) is refused without letting the browser open the file.
- **Paste**: a pasted screenshot or copied file is attached; pasted text stays text, also when the clipboard carries an image next to it (a copied spreadsheet cell). A browser's generic `image.png` gets its own name.
- **Files without text**: a message with only files can be sent. `Chat` / `useChat` then send `attachmentsOnlyMessage`.
- **Chips**: name and size, a thumbnail for an image (from `FileAttachment.previewUrl`) and a remove button labelled with the file name. A chip whose file has a `status` shows it: `uploading` a progress bar (`role="progressbar"`) and a percentage, `ready` a check mark, `failed` a red border with the reason on hover, a retry and a remove button. A file whose `conversionStatus` is `failed` / `skipped` is tinted "no readable text".
- **Send is held back** while any chip is queued or uploading, and while any failed: the notice "Some files could not be uploaded. Try again or remove them to send." says so.

Limits and refusals (size, count, type, empty) are checked by `useChat.addFiles`; see [File Uploads](/guide/file-uploads).

## Keyboard

- **Enter** - Send message
- **Shift+Enter** - New line

## Styling

Colours come from the theme variables (`--chat-bg-tertiary`, `--chat-border-primary`, `--chat-accent-primary`, ...) and the status colours (`--chat-warning` for the image warning). See [Theming](/guide/theming).

## Accessibility

- The text area is labelled "Message" (`chat.input.label`); send, stop, attach and remove buttons have accessible names (the remove button names its file).
- The notice for the composer's state, the image warning, the failed-files notice and a chip's upload spinner are `role="status"`; the progress of an upload is a `progressbar` with a name and a value.
- The pending files are a labelled list.

## Related

- [Chat](/components/chat)
- [useChat Hook](/api/use-chat)
- [File Uploads Guide](/guide/file-uploads)
