"use client";

import { Chat, MessageActions } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

/**
 * Example: Basic Chat Page
 * 
 * This is a simple example showing how to integrate the Chat component
 * in a Next.js app.
 */
export default function ChatPage() {
  return (
    <div className="h-screen">
      <Chat
        baseUrl="/api/agents"
        agentId="my-agent"
        theme="dark"
        showHistory={true}
        enableFileUpload={true}
        streaming={true}
        renderMessageActions={(props) => (
          <MessageActions
            {...props}
            showCopy={true}
            showFeedback={true}
            showRegenerate={false}
            onFeedback={(messageId, type) => {
              console.log(`Feedback ${type} for message ${messageId}`);
              // You can send this to your analytics or feedback API
            }}
          />
        )}
        onMessageReceived={(message) => {
          console.log("Received message:", message);
        }}
        onError={(error) => {
          console.error("Chat error:", error);
        }}
      />
    </div>
  );
}
