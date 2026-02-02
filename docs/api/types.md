# Types

TypeScript type definitions for Chat UI.

## Import

```tsx
import type {
  Message,
  Conversation,
  ContentPart,
  ToolCall,
  FileAttachment,
  ThemeColors,
  StreamEvent,
} from "@cognipeer/chat-ui";
```

## Core Types

### Message

```typescript
interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
  createdAt: string;
  toolCalls?: ToolCall[];
}
```

### ContentPart

```typescript
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: { url: string } }
  | { type: "file"; file: FileInfo };

interface FileInfo {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
}
```

### Conversation

```typescript
interface Conversation {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}
```

### ToolCall

```typescript
interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}
```

### FileAttachment

```typescript
interface FileAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
  file?: File;
}
```

## Theme Types

### ThemeColors

```typescript
interface ThemeColors {
  bgPrimary?: string;
  bgSecondary?: string;
  bgTertiary?: string;
  bgHover?: string;
  textPrimary?: string;
  textSecondary?: string;
  textTertiary?: string;
  textInverse?: string;
  borderPrimary?: string;
  borderSecondary?: string;
  accentPrimary?: string;
  accentSecondary?: string;
}
```

### ThemeMode

```typescript
type ThemeMode = "dark" | "light";
```

## Hook Types

### UseChatOptions

```typescript
interface UseChatOptions {
  baseUrl: string;
  agentId: string;
  authorization?: string;
  headers?: Record<string, string>;
  conversationId?: string;
  streaming?: boolean;
  enableFileUpload?: boolean;
  maxFileSize?: number;
  onMessageSent?: (message: Message) => void;
  onMessageReceived?: (message: Message) => void;
  onStreamText?: (chunk: string, fullText: string) => void;
  onToolCall?: (name: string, args: object) => void;
  onToolResult?: (name: string, result: any) => void;
  onConversationCreated?: (conversation: Conversation) => void;
  onError?: (error: Error) => void;
}
```

### UseChatReturn

```typescript
interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  streamingText: string;
  activeToolCalls: Map<string, ToolCallState>;
  error: Error | null;
  conversation: Conversation | null;
  pendingFiles: FileAttachment[];
  sendMessage: (content: string, files?: File[]) => Promise<void>;
  stop: () => void;
  retry: () => Promise<void>;
  createConversation: (title?: string) => Promise<Conversation>;
  loadConversation: (id: string) => Promise<void>;
  addFiles: (files: File[]) => Promise<void>;
  removeFile: (fileId: string) => void;
  clearFiles: () => void;
}
```

### UseChatHistoryOptions

```typescript
interface UseChatHistoryOptions {
  baseUrl: string;
  agentId: string;
  authorization?: string;
  headers?: Record<string, string>;
  limit?: number;
  autoLoad?: boolean;
  onError?: (error: Error) => void;
}
```

### UseChatHistoryReturn

```typescript
interface UseChatHistoryReturn {
  conversations: Conversation[];
  isLoading: boolean;
  hasMore: boolean;
  load: () => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
}
```

## Stream Types

### StreamEvent

```typescript
type StreamEvent =
  | { type: "stream.start" }
  | { type: "stream.text"; text: string }
  | { type: "stream.tool_call"; callId: string; name: string; arguments: string }
  | { type: "stream.tool_result"; callId: string; result: any }
  | { type: "stream.done"; message: Message }
  | { type: "stream.error"; error: string };
```

### ToolCallState

```typescript
interface ToolCallState {
  id: string;
  name: string;
  arguments: string;
  result?: any;
  isLoading: boolean;
}
```

## Component Props

### ChatProps

```typescript
interface ChatProps {
  baseUrl: string;
  agentId: string;
  theme?: ThemeMode;
  themeColors?: ThemeColors;
  authorization?: string;
  headers?: Record<string, string>;
  conversationId?: string;
  streaming?: boolean;
  showHistory?: boolean;
  enableFileUpload?: boolean;
  allowedFileTypes?: string[];
  maxFileSize?: number;
  maxFiles?: number;
  className?: string;
  
  // Callbacks
  onMessageSent?: (message: Message) => void;
  onMessageReceived?: (message: Message) => void;
  onStreamText?: (chunk: string, fullText: string) => void;
  onToolCall?: (name: string, args: object) => void;
  onToolResult?: (name: string, result: any) => void;
  onConversationCreated?: (conv: Conversation) => void;
  onConversationSelected?: (conv: Conversation) => void;
  onConversationDeleted?: (id: string) => void;
  onError?: (error: Error) => void;
  
  // Render props
  renderMessage?: (props: MessageRenderProps) => ReactNode;
  renderMessageActions?: (props: ActionRenderProps) => ReactNode;
  renderFilePreview?: (props: FileRenderProps) => ReactNode;
  renderToolCall?: (props: ToolCallRenderProps) => ReactNode;
  renderHistoryItem?: (props: HistoryItemRenderProps) => ReactNode;
  renderEmpty?: () => ReactNode;
}
```

### MessageRenderProps

```typescript
interface MessageRenderProps {
  message: Message;
  isStreaming: boolean;
  streamingText?: string;
  isLast: boolean;
}
```

### ActionRenderProps

```typescript
interface ActionRenderProps {
  message: Message;
  isStreaming: boolean;
  isLast: boolean;
}
```

### ToolCallRenderProps

```typescript
interface ToolCallRenderProps {
  toolCall: ToolCall;
  result?: any;
  isLoading: boolean;
}
```

## API Response Types

### ConversationListResponse

```typescript
interface ConversationListResponse {
  conversations: Conversation[];
  totalCount: number;
}
```

### MessageListResponse

```typescript
interface MessageListResponse {
  messages: Message[];
  totalCount: number;
}
```

### SendMessageResponse

```typescript
interface SendMessageResponse {
  message: Message;
}
```

### FileUploadResponse

```typescript
interface FileUploadResponse {
  file: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    url: string;
  };
}
```

## Related

- [useChat Hook](/api/use-chat)
- [useChatHistory Hook](/api/use-chat-history)
- [Client](/api/client)
