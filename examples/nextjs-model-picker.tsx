"use client";

import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

/**
 * Example: choosing the model per message
 *
 * When the agent advertises two or more `models` (agent-server >= 0.4.0, or a Console agent with
 * additional models), `Chat` shows a model picker next to the send button on its own and sends the
 * pick as `model` with each message. `showAnsweredWith` (default true) adds a subtle
 * "Answered with <model>" under each answer.
 */
export default function ChatWithModels() {
  return (
    <div className="h-screen">
      <Chat baseUrl="/api/agents" agentId="support" showAnsweredWith />
    </div>
  );
}
