# Types

TypeScript type definitions for Chat UI. They are exported from the package root; the source of truth is `src/types.ts`.

## Import

```tsx
import type {
  Message,
  ContentPart,
  FileAttachment,
  Conversation,
  ConversationListItem,
  AgentInfo,
  PendingAction,
  ActionResolution,
  ActionState,
  StreamEvent,
  ChatTheme,
  ChatConfig,
  ChatCallbacks,
} from "@cognipeer/chat-ui";
```

## Messages

### Message

```typescript
interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentPart[];
  citations?: Citation[];
  citationMarks?: CitationMark[];
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  files?: FileAttachment[];
  metadata?: Record<string, unknown>;
  /** Approvals / questions the assistant is waiting on (status "requires_action") */
  pendingActions?: PendingAction[];
  /** How the turn ended. Absent means a normal, completed answer. */
  status?: "completed" | "requires_action" | "incomplete" | "cancelled";
  /** How each action in `pendingActions` ended or stands, by action id */
  actionStates?: Record<string, ActionState>;
  createdAt: Date;
  updatedAt: Date;
}
```

`actionStates` is kept by the app as cards settle. A server may also send it, or settled entries in `metadata.pendingActions` (each with a `status` and a `resolution`), so that a reloaded conversation shows what was decided. See [Approvals and Questions](/guide/approvals#history).

### ContentPart

```typescript
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
  | { type: "input_image"; image_url: string | { url: string } }   // Responses API
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string } }
  | { type: "file"; file: { id: string; name: string; mimeType: string; url?: string } }
  | { type: string; [key: string]: unknown };
```

Text parts are shown (one per line) and image parts are drawn as pictures. An image is only drawn from a safe URL: `https:`, `blob:`, a relative or same-origin URL, `http:` when the page itself is served over http, and base64 PNG / JPEG / GIF / WebP. `javascript:` URLs, SVG data URLs and other schemes are dropped.

### FileAttachment

```typescript
interface FileAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
  storageKey?: string;
  /** Object URL of a file still on this device (image preview); revoked when the conversation is left */
  previewUrl?: string;
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

## Approvals and questions

```typescript
interface UserQuestion {
  question: string;
  header?: string;
  multiSelect?: boolean;
  placeholder?: string;
  /** Default true: a question must be answered unless the server says `required: false` */
  required?: boolean;
  options?: { label: string; value?: string; description?: string }[];
}

type PendingAction =
  | {
      id: string;
      type: "tool_approval";
      toolName: string;
      toolCallId?: string;
      title?: string;
      summary?: string;
      args?: Record<string, unknown>;
      /** JSON Schema of `args`; an edited call is checked against it */
      argsSchema?: Record<string, unknown>;
      expiresAt?: string; // ISO date
    }
  | {
      id: string;
      type: "user_question";
      questions: UserQuestion[];
      allowFreeText?: boolean;
      expiresAt?: string;
    };

type ActionResolution =
  | { type: "tool_approval"; decision: "allow" | "deny"; comment?: string;
      approvedArgs?: Record<string, unknown>; rememberForSession?: boolean }
  | { type: "user_question"; answers: Record<string, string | string[]>; cancelled?: boolean };

type ActionStatus = "pending" | "resolving" | "resolved" | "cancelled" | "expired";

interface ActionState {
  status: ActionStatus;
  resolution?: ActionResolution; // absent when it was resolved somewhere else
  resolvedBy?: string;
  resolvedAt?: string;
}
```

## Conversations and agents

```typescript
interface Conversation {
  id: string;
  agentId: string;
  userId?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  state?: Record<string, unknown>;
  pendingActions?: PendingAction[];
  createdAt: Date;
  updatedAt: Date;
}

interface ConversationListItem {
  id: string;
  title?: string;
  agentName?: string;
  agentId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface AgentInfo {
  id: string;
  name: string;
  description?: string;
  version?: string;
  /** Read by Chat: enableFileUpload, maxFileSize, maxFiles, allowedFileTypes,
   *  pendingActionComposerMode ("block" | "cancel"), acceptsImages (false warns on images) */
  metadata?: Record<string, unknown>;
  capabilities?: {
    toolApproval?: boolean;
    askUser?: boolean;
    approvalArgsEdit?: boolean; // the approval card may edit arguments
    acceptsImages?: boolean;    // false: an attached image gets a warning
  };
}
```

## Theme

### ChatTheme

```typescript
interface ChatTheme {
  mode: "light" | "dark";
  colors?: {
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
    // Status colours: the text/icon colour and a tinted background for each
    success?: string;  successBg?: string;
    danger?: string;   dangerBg?: string;
    warning?: string;  warningBg?: string;
    info?: string;     infoBg?: string;
  };
  borderRadius?: { message?: string; input?: string; button?: string };
  spacing?: { messagePadding?: string; inputPadding?: string };
  fonts?: { primary?: string; mono?: string };
}
```

`Chat`'s `themeColors` prop takes `ChatTheme["colors"]`, every key.

## Configuration

### ChatConfig

Shared by `Chat` and `useChat`.

```typescript
interface ChatConfig {
  baseUrl?: string;                // not needed with `transport`
  transport?: ChatTransport;
  agentId?: string;
  authorization?: string;
  headers?: Record<string, string>;
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  fetch?: typeof fetch;
  streaming?: boolean;
  enableFileUpload?: boolean;
  allowedFileTypes?: string[];
  maxFileSize?: number;            // bytes
  maxFiles?: number;
  fileTransport?: "inline" | "upload";
  /** Text sent with files and no typed text; "" sends none */
  attachmentsOnlyMessage?: string;
}
```

### ChatCallbacks

```typescript
interface ChatCallbacks {
  onMessageSent?: (message: Message) => void;
  onMessageReceived?: (message: Message) => void;
  onStreamText?: (text: string, fullText: string) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
  onError?: (error: Error) => void;
  onConversationCreated?: (conversation: Conversation) => void;
  onConversationSelected?: (conversation: ConversationListItem) => void;
  onConversationTitleGenerated?: (conversationId: string, title: string) => void;
  onBackgroundStreamCompleted?: (conversationId: string) => void;
  onActionResolved?: (info: {
    conversationId: string;
    actionId: string;
    action?: PendingAction;
    resolution: ActionResolution;
  }) => void;
}
```

Errors passed to `onError` (and set as `error`) carry `status` and `code` when the server sent them. When the code has a localized message the error's `message` is that message and the server's own wording is on `serverMessage`.

## Hooks

See [useChat](/api/use-chat) and [useChatHistory](/api/use-chat-history) for `UseChatOptions`, `UseChatReturn`, `UseChatHistoryOptions` and `UseChatHistoryReturn`.

## Stream events

```typescript
type StreamEvent =
  | { type: "stream.start"; conversationId: string; messageId: string }
  | { type: "stream.text"; text: string; isFinal?: boolean }
  | { type: "stream.thinking"; thinking: string }
  | { type: "stream.tool_call"; toolName: string; toolCallId: string; args: Record<string, unknown> }
  | { type: "stream.tool_result"; toolName: string; toolCallId: string; result: unknown }
  | { type: "stream.progress"; stage?: string; message?: string; percent?: number }
  | { type: "stream.error"; error: string; code?: string }
  | { type: "stream.action_required"; conversationId: string; messageId: string; actions: PendingAction[] }
  | { type: "stream.action_resolved"; conversationId: string; actionId: string;
      resolution: { type: "tool_approval" | "user_question"; decision?: "allow" | "deny"; cancelled?: boolean } }
  | { type: "stream.done"; conversationId: string; messageId: string; content: string;
      citations?: Citation[]; citationMarks?: CitationMark[]; files?: FileAttachment[]; title?: string;
      usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
      status?: MessageStatus; pendingActions?: PendingAction[] };
```

Every event also has a `timestamp`.

## Component props

`ChatProps`, `ChatInputProps`, `ChatMessageProps`, `ChatMessageListProps`, `ToolApprovalCardProps` and `QuestionCardProps` are documented with their components: [Chat](/components/chat), [ChatInput](/components/chat-input), [ChatMessage](/components/chat-message), [ChatMessageList](/components/chat-message-list).

```typescript
// Handed to renderToolApproval / renderQuestion
interface ToolApprovalRenderProps {
  action: Extract<PendingAction, { type: "tool_approval" }>;
  state?: ActionState;
  readOnly: boolean;
  resolve: (resolution: Extract<ActionResolution, { type: "tool_approval" }>) => void;
}
interface QuestionRenderProps {
  action: Extract<PendingAction, { type: "user_question" }>;
  state?: ActionState;
  readOnly: boolean;
  resolve: (resolution: Extract<ActionResolution, { type: "user_question" }>) => void;
}

// Handed to renderImage
interface ImageRenderProps {
  src: string;                // already checked as safe
  alt: string;
  file?: FileAttachment;      // absent for an image that is part of the message content
}
```

## Related

- [useChat Hook](/api/use-chat)
- [useChatHistory Hook](/api/use-chat-history)
- [Client](/api/client)
