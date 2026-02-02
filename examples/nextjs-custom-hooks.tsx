"use client";

import { 
  useChat, 
  useChatHistory,
  ChatThemeProvider,
  ChatMessageList, 
  ChatInput, 
  ChatHistory,
  MessageActions,
  ToolCalls,
} from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";
import { useState } from "react";

/**
 * Example: Custom Chat with Hooks
 * 
 * This example shows how to build a completely custom chat UI
 * using the hooks and individual components.
 */

const API_CONFIG = {
  baseUrl: "/api/agents",
  agentId: "my-agent",
  authorization: "Bearer your-token", // Optional
};

export default function CustomChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Use the chat hook for message management
  const chat = useChat({
    ...API_CONFIG,
    streaming: true,
    enableFileUpload: true,
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedFileTypes: ["image/*", ".pdf", ".txt", ".md"],
    onStreamText: (chunk, fullText) => {
      // You can do something with each streaming chunk
      console.log("Streaming chunk:", chunk);
    },
    onToolCall: (toolName, args) => {
      console.log(`Tool called: ${toolName}`, args);
    },
    onToolResult: (toolName, result) => {
      console.log(`Tool result: ${toolName}`, result);
    },
    onError: (error) => {
      console.error("Chat error:", error);
    },
  });

  // Use the history hook for conversation management
  const history = useChatHistory({
    ...API_CONFIG,
    autoLoad: true,
    pageSize: 20,
  });

  const handleNewChat = () => {
    chat.clearMessages();
    setSidebarOpen(false);
  };

  const handleSelectConversation = (conversation: { id: string }) => {
    chat.loadConversation(conversation.id);
    setSidebarOpen(false);
  };

  const handleDeleteConversation = async (id: string) => {
    await history.deleteConversation(id);
    if (chat.conversation?.id === id) {
      chat.clearMessages();
    }
  };

  return (
    <ChatThemeProvider
      defaultMode="dark"
      theme={{
        mode: "dark",
        colors: {
          // Custom brand colors
          accentPrimary: "#6366f1", // Indigo
          accentSecondary: "#4f46e5",
        },
      }}
    >
      <div className="flex h-screen bg-chat-bg-primary">
        {/* Custom Sidebar */}
        <ChatHistory
          conversations={history.conversations}
          selectedId={chat.conversation?.id}
          isLoading={history.isLoading}
          hasMore={history.hasMore}
          onSelect={handleSelectConversation}
          onDelete={handleDeleteConversation}
          onNewChat={handleNewChat}
          onLoadMore={history.loadMore}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          header={
            <div className="p-4 border-b border-chat-border-primary">
              <h2 className="text-lg font-semibold text-chat-text-primary">
                My Custom Chat
              </h2>
            </div>
          }
          footer={
            <div className="p-4 text-xs text-chat-text-tertiary text-center">
              Powered by Cognipeer
            </div>
          }
        />

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Custom Header */}
          <header className="flex items-center gap-4 px-4 py-3 border-b border-chat-border-primary">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 hover:bg-chat-bg-hover rounded-lg"
            >
              ☰
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-medium text-chat-text-primary">
                {chat.conversation?.title || "New Conversation"}
              </h1>
              {chat.isLoading && (
                <span className="text-sm text-chat-text-secondary">
                  AI is thinking...
                </span>
              )}
            </div>
            <button
              onClick={handleNewChat}
              className="px-3 py-1.5 bg-chat-accent-primary text-white rounded-lg text-sm"
            >
              New Chat
            </button>
          </header>

          {/* Messages */}
          <ChatMessageList
            messages={chat.messages}
            isStreaming={chat.isLoading}
            streamingText={chat.streamingText}
            autoScroll={true}
            showAvatars={true}
            showTimestamps={true}
            renderAvatar={(role) => (
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                role === "user" 
                  ? "bg-blue-500 text-white" 
                  : "bg-gradient-to-br from-purple-500 to-pink-500 text-white"
              }`}>
                {role === "user" ? "👤" : "🤖"}
              </div>
            )}
            renderActions={(props) => (
              <MessageActions
                {...props}
                showCopy={true}
                showFeedback={true}
                onFeedback={(messageId, type) => {
                  console.log(`Feedback: ${type} for ${messageId}`);
                  // Send to your feedback API
                }}
              />
            )}
            emptyState={
              <div className="text-center py-20">
                <div className="text-6xl mb-4">💬</div>
                <h2 className="text-xl font-semibold text-chat-text-primary mb-2">
                  Start a Conversation
                </h2>
                <p className="text-chat-text-secondary max-w-md mx-auto">
                  Ask me anything! I can help with coding, writing, analysis, and more.
                </p>
              </div>
            }
          />

          {/* Tool Calls Display */}
          {chat.activeToolCalls.size > 0 && (
            <div className="px-4 py-3 border-t border-chat-border-primary bg-chat-bg-secondary">
              <div className="max-w-3xl mx-auto">
                <ToolCalls
                  toolCalls={chat.activeToolCalls}
                  isExecuting={chat.isLoading}
                />
              </div>
            </div>
          )}

          {/* Error Display */}
          {chat.error && (
            <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
              <div className="max-w-3xl mx-auto flex items-center justify-between">
                <span className="text-red-400 text-sm">{chat.error.message}</span>
                <div className="flex gap-2">
                  <button
                    onClick={chat.retry}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => chat.setError(null)}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Input */}
          <ChatInput
            onSend={chat.sendMessage}
            onStop={chat.stop}
            onFilesAdd={chat.addFiles}
            onFileRemove={chat.removeFile}
            isLoading={chat.isLoading}
            pendingFiles={chat.pendingFiles}
            placeholder="Type your message... (Shift+Enter for new line)"
            enableFileUpload={true}
            maxFiles={5}
          />
        </div>
      </div>
    </ChatThemeProvider>
  );
}
