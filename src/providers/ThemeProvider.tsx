"use client";

import React, { createContext, useContext, useMemo, ReactNode } from "react";
import type { ChatTheme } from "../types";

interface ThemeContextValue {
  theme: ChatTheme;
  setTheme: (theme: Partial<ChatTheme>) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export interface ChatThemeProviderProps {
  children: ReactNode;
  theme?: Partial<ChatTheme>;
  defaultMode?: "light" | "dark";
}

/**
 * Theme provider for chat components.
 * Provides CSS variables for theming and a way to update the theme.
 */
export function ChatThemeProvider({
  children,
  theme: customTheme,
  defaultMode = "dark",
}: ChatThemeProviderProps) {
  const [theme, setThemeState] = React.useState<ChatTheme>(() => ({
    mode: defaultMode,
    ...customTheme,
  }));

  const setTheme = React.useCallback((updates: Partial<ChatTheme>) => {
    setThemeState((prev) => ({
      ...prev,
      ...updates,
      colors: { ...prev.colors, ...updates.colors },
    }));
  }, []);

  // Generate CSS variables from theme
  const cssVariables = useMemo(() => {
    const vars: Record<string, string> = {};

    if (theme.colors) {
      if (theme.colors.bgPrimary) vars["--chat-bg-primary"] = theme.colors.bgPrimary;
      if (theme.colors.bgSecondary) vars["--chat-bg-secondary"] = theme.colors.bgSecondary;
      if (theme.colors.bgTertiary) vars["--chat-bg-tertiary"] = theme.colors.bgTertiary;
      if (theme.colors.bgHover) vars["--chat-bg-hover"] = theme.colors.bgHover;
      if (theme.colors.textPrimary) vars["--chat-text-primary"] = theme.colors.textPrimary;
      if (theme.colors.textSecondary) vars["--chat-text-secondary"] = theme.colors.textSecondary;
      if (theme.colors.textTertiary) vars["--chat-text-tertiary"] = theme.colors.textTertiary;
      if (theme.colors.textInverse) vars["--chat-text-inverse"] = theme.colors.textInverse;
      if (theme.colors.borderPrimary) vars["--chat-border-primary"] = theme.colors.borderPrimary;
      if (theme.colors.borderSecondary) vars["--chat-border-secondary"] = theme.colors.borderSecondary;
      if (theme.colors.accentPrimary) vars["--chat-accent-primary"] = theme.colors.accentPrimary;
      if (theme.colors.accentSecondary) vars["--chat-accent-secondary"] = theme.colors.accentSecondary;
    }

    return vars;
  }, [theme]);

  const contextValue = useMemo(
    () => ({ theme, setTheme }),
    [theme, setTheme]
  );

  const rootStyle = useMemo(
    () => ({
      ...cssVariables,
      height: "100%",
      width: "100%",
    }),
    [cssVariables]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      <div
        className={`chat-theme-root h-full w-full ${theme.mode === "light" ? "chat-theme-light" : ""}`}
        style={rootStyle as React.CSSProperties}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access theme context
 */
export function useChatTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useChatTheme must be used within a ChatThemeProvider");
  }
  return context;
}

/**
 * Hook to check if within theme provider (returns undefined if not)
 */
export function useChatThemeOptional(): ThemeContextValue | undefined {
  return useContext(ThemeContext);
}
