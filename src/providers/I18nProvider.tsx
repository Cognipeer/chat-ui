"use client";

import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { IntlProvider as ReactIntlProvider, useIntl } from "react-intl";
import enMessages from "../locales/en.json";
import trMessages from "../locales/tr.json";
import { setGlobalI18n } from "../utils/helpers";

export type SupportedLocale = "en" | "tr";

interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const messages: Record<SupportedLocale, Record<string, string>> = {
  en: enMessages,
  tr: trMessages,
};

export interface ChatI18nProviderProps {
  children: React.ReactNode;
  /** Default locale when no query parameter is found */
  defaultLocale?: SupportedLocale;
  /** Override locale (disables query string detection) */
  locale?: SupportedLocale;
  /** Custom messages to merge with built-in messages */
  customMessages?: Partial<Record<SupportedLocale, Record<string, string>>>;
  /** Callback when locale changes */
  onLocaleChange?: (locale: SupportedLocale) => void;
}

/**
 * I18n provider for the chat UI.
 * 
 * Automatically detects locale from URL query parameter (?lang=en or ?lang=tr).
 * Falls back to defaultLocale if no query parameter is found.
 * 
 * @example
 * ```tsx
 * <ChatI18nProvider defaultLocale="en">
 *   <Chat baseUrl="..." agentId="..." />
 * </ChatI18nProvider>
 * ```
 */
export function ChatI18nProvider({
  children,
  defaultLocale = "en",
  locale: controlledLocale,
  customMessages,
  onLocaleChange,
}: ChatI18nProviderProps) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    // If locale is controlled, use it
    if (controlledLocale) return controlledLocale;

    // Client-side only: detect from URL query parameter
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const langParam = params.get("lang");
      
      if (langParam === "en" || langParam === "tr") {
        return langParam;
      }
    }

    return defaultLocale;
  });

  // Sync with controlled locale
  useEffect(() => {
    if (controlledLocale && controlledLocale !== locale) {
      setLocaleState(controlledLocale);
    }
  }, [controlledLocale, locale]);

  // Update URL when locale changes (only if not controlled)
  const setLocale = (newLocale: SupportedLocale) => {
    if (controlledLocale) {
      console.warn("ChatI18nProvider: Cannot change locale when controlled via props");
      return;
    }

    setLocaleState(newLocale);
    onLocaleChange?.(newLocale);

    // Update URL query parameter if in browser
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", newLocale);
      window.history.replaceState({}, "", url.toString());
    }
  };

  // Merge custom messages with built-in messages
  const mergedMessages = useMemo(() => {
    if (!customMessages) return messages;

    return {
      en: { ...messages.en, ...customMessages.en },
      tr: { ...messages.tr, ...customMessages.tr },
    } as Record<SupportedLocale, Record<string, string>>;
  }, [customMessages]);

  const contextValue: I18nContextValue = {
    locale,
    setLocale,
  };

  return (
    <I18nContext.Provider value={contextValue}>
      <ReactIntlProvider
        locale={locale}
        messages={mergedMessages[locale]}
        defaultLocale="en"
      >
        <I18nInitializer />
        {children}
      </ReactIntlProvider>
    </I18nContext.Provider>
  );
}

/**
 * Internal component to initialize global i18n function.
 * Must be inside ReactIntlProvider to use useIntl hook.
 */
function I18nInitializer() {
  const intl = useIntl();
  
  useEffect(() => {
    // Set global i18n function for utility functions
    setGlobalI18n((key: string, values?: Record<string, string | number>) => {
      return intl.formatMessage({ id: key }, values);
    });
  }, [intl]);

  return null;
}

/**
 * Hook to access i18n context.
 * Must be used within ChatI18nProvider.
 */
export function useI18nContext(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18nContext must be used within ChatI18nProvider");
  }
  return context;
}

/**
 * Optional version that returns undefined if not within provider.
 * Useful for components that work both with and without i18n.
 */
export function useI18nContextOptional(): I18nContextValue | undefined {
  return useContext(I18nContext);
}
