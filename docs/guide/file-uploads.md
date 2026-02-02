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
| `allowedFileTypes` | `string[]` | `["*"]` | Allowed file types |
| `maxFileSize` | `number` | `10MB` | Max file size in bytes |
| `maxFiles` | `number` | `10` | Max files per message |

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

1. **Attachment button** - Click to select files
2. **Drag and drop** - Drop files onto the input
3. **Preview** - Shows attached files before sending
4. **Remove** - X button to remove files

## Handling Files with Hooks

```tsx
import { useChat } from "@cognipeer/chat-ui";

function CustomChat() {
  const {
    pendingFiles,
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
      <input type="file" onChange={handleFileSelect} multiple />
      
      {pendingFiles.map(file => (
        <div key={file.id}>
          {file.name}
          <button onClick={() => removeFile(file.id)}>Remove</button>
        </div>
      ))}
      
      <button onClick={() => sendMessage("Analyze these files")}>
        Send
      </button>
    </div>
  );
}
```

## File Display in Messages

Files are displayed in messages with:

- **Image preview** - For image files
- **File icon** - For documents
- **File name** - Clickable to download
- **File size** - Formatted size

## Callbacks

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  enableFileUpload={true}
  onFileUploaded={(file) => {
    console.log("Uploaded:", file.name, file.id);
  }}
  onFileError={(error, file) => {
    console.error("Upload failed:", file?.name, error);
  }}
/>
```

## Agent-Generated Files

When an AI agent returns files in its response:

```tsx
// Files in agent response are displayed automatically
// with download links
```

## Custom File Preview

Customize how files are displayed:

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  renderFilePreview={({ file, onRemove }) => (
    <div className="custom-file-preview">
      {file.mimeType.startsWith("image/") ? (
        <img src={file.url} alt={file.name} />
      ) : (
        <div>{file.name}</div>
      )}
      <button onClick={onRemove}>×</button>
    </div>
  )}
/>
```

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

## Large File Handling

For large files, consider:

1. **Client-side compression** - For images
2. **Chunked uploads** - For very large files
3. **Progress indicators** - Show upload progress

```tsx
// The built-in implementation handles progress automatically
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  maxFileSize={50 * 1024 * 1024}  // 50MB
/>
```

## Next Steps

- [Tool Calls](/guide/tool-calls)
- [Custom Actions](/guide/custom-actions)
- [ChatInput Component](/components/chat-input)
