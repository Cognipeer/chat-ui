# ChatInput Component

The message input with file attachments and submit button.

## Import

```tsx
import { ChatInput } from "@cognipeer/chat-ui";
```

## Usage

```tsx
<ChatInput
  onSubmit={(message, files) => {
    console.log("Send:", message, files);
  }}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSubmit` | `(message: string, files: File[]) => void` | - | Submit callback |
| `isLoading` | `boolean` | `false` | Disable input while loading |
| `onStop` | `() => void` | - | Stop streaming callback |
| `enableFileUpload` | `boolean` | `true` | Enable file uploads |
| `allowedFileTypes` | `string[]` | `["*"]` | Allowed MIME types |
| `maxFileSize` | `number` | `10MB` | Max file size in bytes |
| `maxFiles` | `number` | `10` | Max files per submission |
| `placeholder` | `string` | `"Send a message..."` | Input placeholder |
| `disabled` | `boolean` | `false` | Disable input |
| `autoFocus` | `boolean` | `true` | Auto-focus on mount |
| `className` | `string` | - | Container class name |

## Examples

### Basic

```tsx
<ChatInput
  onSubmit={(message) => {
    sendMessage(message);
  }}
/>
```

### With Loading State

```tsx
<ChatInput
  onSubmit={handleSubmit}
  isLoading={isLoading}
  onStop={() => abortController.abort()}
/>
```

### Controlled Input

```tsx
function ControlledInput() {
  const [value, setValue] = useState("");

  return (
    <ChatInput
      value={value}
      onChange={setValue}
      onSubmit={(message) => {
        sendMessage(message);
        setValue("");
      }}
    />
  );
}
```

### File Uploads Disabled

```tsx
<ChatInput
  onSubmit={handleSubmit}
  enableFileUpload={false}
/>
```

### Images Only

```tsx
<ChatInput
  onSubmit={handleSubmit}
  enableFileUpload={true}
  allowedFileTypes={["image/*"]}
  maxFiles={1}
/>
```

### Custom Placeholder

```tsx
<ChatInput
  onSubmit={handleSubmit}
  placeholder="Ask a question about your document..."
/>
```

### With Custom Submit Button

```tsx
<ChatInput
  onSubmit={handleSubmit}
  renderSubmitButton={({ isLoading, disabled, onClick }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="custom-submit"
    >
      {isLoading ? "Sending..." : "Send"}
    </button>
  )}
/>
```

## Keyboard Shortcuts

- **Enter** - Send message
- **Shift+Enter** - New line
- **Ctrl+V / Cmd+V** - Paste (including images)
- **Escape** - Cancel file selection

## File Handling

The input supports:

- File picker button
- Drag and drop
- Paste from clipboard
- Multiple file selection

```tsx
<ChatInput
  onSubmit={(message, files) => {
    console.log("Message:", message);
    console.log("Files:", files.map(f => f.name));
  }}
  allowedFileTypes={["image/*", ".pdf", ".txt"]}
  maxFileSize={5 * 1024 * 1024} // 5MB
  maxFiles={3}
/>
```

## Styling

```css
.chat-input {
  padding: 16px;
  border-top: 1px solid var(--chat-border-primary);
}

.chat-input textarea {
  width: 100%;
  resize: none;
  background: var(--chat-bg-tertiary);
  border: 1px solid var(--chat-border-primary);
  border-radius: 12px;
  padding: 12px 16px;
  color: var(--chat-text-primary);
}

.chat-input textarea:focus {
  outline: none;
  border-color: var(--chat-accent-primary);
}

.chat-input-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
}
```

## Accessibility

The input includes:

- Proper ARIA labels
- Keyboard navigation
- Focus management
- Screen reader support

## Related

- [Chat](/components/chat)
- [useChat Hook](/api/use-chat)
- [File Uploads Guide](/guide/file-uploads)
