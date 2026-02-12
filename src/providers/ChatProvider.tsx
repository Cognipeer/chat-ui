"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useChat, type UseChatOptions, type UseChatReturn } from "../hooks";

const ChatContext = createContext<UseChatReturn | undefined>(undefined);

export interface ChatProviderProps extends UseChatOptions {
  children: ReactNode;
}

/**
 * Provides a shared chat controller to the React tree.
 * Use this when you want to orchestrate chat behavior from multiple components.
 */
export function ChatProvider({ children, ...options }: ChatProviderProps) {
  const chat = useChat(options);
  const value = useMemo(() => chat, [chat]);

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

/**
 * Access chat state/actions from the nearest ChatProvider.
 */
export function useChatContext(): UseChatReturn {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}

/**
 * Optional chat context accessor. Returns undefined when no provider exists.
 */
export function useChatContextOptional(): UseChatReturn | undefined {
  return useContext(ChatContext);
}
