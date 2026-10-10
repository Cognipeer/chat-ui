# File Uploads

Enable file attachments in your chat.

## Enable File Uploads

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  enableFileUpload={true}  // Default is true
/>
```

## Configuration

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  enableFileUpload={true}
  allowedFileTypes={["image/*", ".pdf", ".txt", ".doc", ".docx"]}
  maxFileSize={10 * 1024 * 1024}  // 10MB
  maxFiles={5}
/>
```

### Options

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `enableFileUpload` | `boolean` | `true` | Enable file uploads |
| `allowedFileTypes` | `string[]` | any | Allowed MIME types and extensions |
| `maxFileSize` | `number` | `10MB` | Max file size in bytes |
| `maxFiles` | `number` | `10` | Max files per message |
| `fileTransport` | `"inline" \| "upload"` | `"inline"` | Files in the message body, or uploaded first (see below) |
| `attachmentsOnlyMessage` | `string` | localized | Text sent when a message has files and no typed text |

## Refused files

Files are checked before they are attached: too many for `maxFiles`, over `maxFileSize` (the message names the limit), not in `allowedFileTypes`, or empty (0 bytes). A refused file is not attached; the reason is shown in the chat's error banner (one line per refusal) and still passed to `onError`. With `useChat`, the same message is in `error`.

If an upload or the message itself is refused by the server, nothing is added to the conversation, the attached files stay attached and the typed text stays in the composer, so the person can fix it and send again. The refusal is shown as a localized message when the server gives a known `code` (`file_too_large`, `too_many_files`, `unsupported_file_type`, `attachments_disabled`, ...); see [Approvals and Questions](/guide/approvals#errors).

## Allowed File Types

Use MIME types or extensions:

```tsx
// Images only
allowedFileTypes={["image/*"]}

// Specific image types
allowedFileTypes={["image/png", "image/jpeg", "image/gif"]}

// Documents
allowedFileTypes={[".pdf", ".doc", ".docx", ".txt"]}

// Mixed
allowedFileTypes={["image/*", ".pdf", "application/json"]}
```

## UI Features

When file uploads are enabled:

1. **Attachment button** - Click to select files. It is off while the composer is waiting for an answer to a card, while files are uploading, and at the file limit
2. **Drag and drop** - Drop files onto the composer; a hint shows while a drag is over it
3. **Paste** - Paste a screenshot or a copied file into the text box. Pasted text stays text, also when the clipboard carries an image next to it (a copied spreadsheet cell)
4. **Preview** - Attached files show as chips with name and size; an image shows a thumbnail straight away, before anything is uploaded
5. **Remove** - X button on each chip
6. **Files without text** - A message may carry only files. The text sent with them is `attachmentsOnlyMessage` (default: a localized "Please review the attached files."; set `""` to send none and let the server decide)

```tsx
<Chat baseUrl="/api/agents" attachmentsOnlyMessage="Summarize these files" />
```

## Handling Files with Hooks

```tsx
import { useChat } from "@cognipeer/chat-ui";

function CustomChat() {
  const {
    pendingFiles,
    isUploading,
    addFiles,
    removeFile,
    sendMessage,
  } = useChat({
    baseUrl: "/api/agents",
    agentId: "assistant",
    enableFileUpload: true,
    maxFileSize: 10 * 1024 * 1024,
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    await addFiles(files);
  };

  return (
    <div>
      <input type="file" onChange={handleFileSelect} multiple disabled={isUploading} />
      
      {pendingFiles.map(file => (
        <div key={file.id}>
          {file.previewUrl && <img src={file.previewUrl} alt="" width={32} />}
          {file.name}
          <button onClick={() => removeFile(file.id)}>Remove</button>
        </div>
      ))}
      
      <button onClick={() => sendMessage("Analyze these files")} disabled={isUploading}>
        Send
      </button>
    </div>
  );
}
```

Or use [`ChatInput`](/components/chat-input), which does the picking, dropping and pasting for you.

`previewUrl` is an object URL; the hook revokes it when the file is removed, the conversation is left or the hook unmounts.

## File Display in Messages

Files and images are displayed in messages with:

- **Image thumbnail** - An image attachment with a usable URL (the server's `url`, or the local preview of a file you just sent) is drawn as a picture that opens full size in a new tab
- **File chip** - Other files, and images without a usable URL, as a chip with a file icon, name, extension and size
- **Download** - A link on the chip when the file has a safe `url` (http(s), `blob:` or relative)
- **Images in the content** - A message whose `content` has `image_url` / `input_image` / `image` parts shows those images below its text

Only safe image URLs are drawn: `https:`, `blob:`, relative or same-origin, `http:` on a page served over http, and base64 PNG / JPEG / GIF / WebP. `javascript:` URLs, SVG data URLs and other schemes are dropped. An `<img>` cannot send an `Authorization` header; if your image URLs need one, draw the image yourself with `renderImage` (a fetched blob URL, say):

```tsx
<Chat
  baseUrl="/api/agents"
  renderImage={({ src, alt, file }) => <AuthenticatedImage src={src} alt={alt} />}
/>
```

## Agents that do not read images

If the agent lists `acceptsImages: false` in its `metadata` (or `capabilities`), an attached image gets a warning chip ("This assistant can't see images. An attached image will be sent but may be ignored."). The image is still sent.

```json
{ "id": "support", "name": "Support", "metadata": { "acceptsImages": false } }
```

## Callbacks

Refused files go to `onError`, like every other error. The messages the user sends, with their files, go to `onMessageSent`:

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  enableFileUpload={true}
  onMessageSent={(message) => {
    console.log("Sent with", message.files?.map((f) => f.name));
  }}
  onError={(error) => {
    console.error("Chat error:", error.message, error.code);
  }}
/>
```

## Agent-Generated Files

When an AI agent returns files in its response (`stream.done` with `files`, or `Message.files`), they are displayed in the message, as thumbnails for images and chips with a download link otherwise.

## Disable File Uploads

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  enableFileUpload={false}
/>
```

## Image-Only Chat

For image-focused use cases:

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="vision-assistant"
  enableFileUpload={true}
  allowedFileTypes={["image/*"]}
  maxFiles={1}
/>
```

## Large Files

The built-in implementation reads a file into memory and sends it base64 (inline) or in an upload request (`fileTransport="upload"`); it does not report progress. For very large files, compress images before `addFiles`, or upload from your own code and attach by id. While a message's files are being read or uploaded, `isUploading` is true: the composer shows a spinner on each chip and attaching and sending wait.

## Uploading ahead of the message

By default files travel base64 inside the message body. With `fileTransport="upload"` each file is first stored with `POST /files` (with the conversation id) and the message carries only the ids:

```tsx
<Chat baseUrl="/api/agents" fileTransport="upload" />
```

The server decides what it accepts (size, type, count) and answers the upload itself, so a refusal is shown before the message is sent. A file stored for a message that then fails is removed again. The transport needs `uploadFile` (`AgentServerClient` has it); without it files go inline.

An agent can narrow the limits for itself through its `metadata` (`enableFileUpload`, `maxFileSize`, `maxFiles`, `allowedFileTypes`). Opening a conversation from the history selects its agent, so the paperclip and the limits are those of the conversation's agent.

## Next Steps

- [Tool Calls](/guide/tool-calls)
- [Custom Actions](/guide/custom-actions)
- [ChatInput Component](/components/chat-input)
