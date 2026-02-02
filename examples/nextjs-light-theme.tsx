"use client";

import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

/**
 * Example: Light Theme Chat
 * 
 * This example shows how to use the light theme with custom colors.
 */
export default function LightThemeChatPage() {
  return (
    <div className="h-screen">
      <Chat
        baseUrl="/api/agents"
        agentId="my-agent"
        theme="light"
        themeColors={{
          // Override specific colors if needed
          accentPrimary: "#2563eb", // Blue
          accentSecondary: "#1d4ed8",
        }}
        showHistory={true}
        enableFileUpload={true}
        inputPlaceholder="Ask me anything..."
        renderHeader={({ onMenuClick }) => (
          <header className="flex items-center gap-3 px-4 py-3 border-b border-chat-border-primary bg-white">
            {onMenuClick && (
              <button 
                onClick={onMenuClick}
                className="md:hidden p-2 hover:bg-gray-100 rounded-lg"
              >
                ☰
              </button>
            )}
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-gray-900">
                AI Assistant
              </h1>
              <p className="text-sm text-gray-500">
                Powered by Cognipeer
              </p>
            </div>
          </header>
        )}
        renderEmptyState={() => (
          <div className="text-center py-20 px-4">
            <div className="w-16 h-16 mx-auto mb-6 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Welcome to AI Assistant
            </h2>
            <p className="text-gray-600 max-w-md mx-auto mb-6">
              I'm here to help you with questions, tasks, and creative projects. 
              Start by typing a message below.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {["What can you help with?", "Tell me a joke", "Explain quantum computing"].map((prompt) => (
                <button
                  key={prompt}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition-colors"
                  onClick={() => {
                    // You would need to pass a ref to Chat or use a callback
                    console.log("Selected prompt:", prompt);
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
      />
    </div>
  );
}
