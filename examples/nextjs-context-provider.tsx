"use client";

import {
  ChatProvider,
  useChatContext,
  useChatHistory,
  ChatMessageList,
  ChatInput,
  ChatThemeProvider,
} from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

const API_CONFIG = {
  baseUrl: "/api/agents",
  agentId: "assistant",
};

function ChatHeader() {
  const chat = useChatContext();

  return (
    <header className="px-4 py-3 border-b border-chat-border-primary flex items-center justify-between">
      <h1 className="text-chat-text-primary font-medium">
        {chat.conversation?.title || "New Conversation"}
      </h1>
      <button
        onClick={() => {
          chat.clearMessages();
          chat.setStreamingText("");
          chat.setProgressMessage("");
        }}
        className="px-3 py-1.5 rounded-md bg-chat-bg-tertiary text-chat-text-primary text-sm"
      >
        Reset
      </button>
    </header>
  );
}

function ChatBody() {
  const chat = useChatContext();

  return (
    <ChatMessageList
      messages={chat.messages}
      isStreaming={chat.isStreaming}
      streamingText={chat.streamingText}
      progressMessage={chat.progressMessage}
      activeToolCalls={chat.activeToolCalls}
      showAvatars
    />
  );
}

function ChatComposer() {
  const chat = useChatContext();

  return (
    <ChatInput
      onSend={chat.sendMessage}
      onStop={chat.stop}
      onFilesAdd={chat.addFiles}
      onFileRemove={chat.removeFile}
      isLoading={chat.isStreaming}
      pendingFiles={chat.pendingFiles}
      enableFileUpload
    />
  );
}

function HistoryActions() {
  const chat = useChatContext();
  const history = useChatHistory({ ...API_CONFIG, autoLoad: true });

  return (
    <aside className="w-72 border-r border-chat-border-primary p-3 space-y-2 overflow-y-auto">
      <button
        onClick={() => {
          chat.clearMessages();
          history.refresh();
        }}
        className="w-full px-3 py-2 rounded-md bg-chat-accent-primary text-white text-sm"
      >
        New Chat
      </button>

      {history.conversations.map((conversation) => (
        <button
          key={conversation.id}
          onClick={() => chat.loadConversation(conversation.id)}
          className="w-full text-left px-3 py-2 rounded-md hover:bg-chat-bg-hover text-chat-text-primary"
        >
          {conversation.title || "Untitled"}
        </button>
      ))}
    </aside>
  );
}

export default function ContextProviderExamplePage() {
  return (
    <ChatThemeProvider defaultMode="dark">
      <div className="h-screen">
        <ChatProvider {...API_CONFIG} streaming>
          <div className="h-full flex bg-chat-bg-primary">
            <HistoryActions />
            <main className="flex-1 min-w-0 flex flex-col">
              <ChatHeader />
              <ChatBody />
              <ChatComposer />
            </main>
          </div>
        </ChatProvider>
      </div>
    </ChatThemeProvider>
  );
}
