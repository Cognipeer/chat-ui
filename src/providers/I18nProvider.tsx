"use client";

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { IntlProvider as ReactIntlProvider, useIntl } from "react-intl";
import enMessages from "../locales/en.json";
import trMessages from "../locales/tr.json";
import { setGlobalI18n } from "../utils/helpers";

/** Locales whose strings ship with the library. */
export type BuiltInLocale = "en" | "tr";

/**
 * A locale code. `en` and `tr` are built in; any other code works once
 * `customMessages` supplies its strings (keys it leaves out fall back to English).
 */
export type SupportedLocale = BuiltInLocale | (string & {});

/** Strings per locale code, keyed by message id. */
export type ChatMessages = Partial<Record<SupportedLocale, Record<string, string>>>;

interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  /** Custom strings in effect here (this provider's own merged over the ones it inherited) */
  customMessages?: ChatMessages;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const builtInMessages: Record<BuiltInLocale, Record<string, string>> = {
  en: enMessages,
  tr: trMessages,
};

function hasLocale(table: object, code: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, code);
}

/** The strings of one locale: English first, so a key a locale lacks falls back per key. */
export function messagesFor(locale: string, custom?: ChatMessages): Record<string, string> {
  const base = { ...builtInMessages.en, ...custom?.en };
  if (locale === "en") return base;
  return {
    ...base,
    ...(hasLocale(builtInMessages, locale) ? builtInMessages[locale as BuiltInLocale] : undefined),
    ...(custom && hasLocale(custom, locale) ? custom[locale] : undefined),
  };
}

function mergeMessages(parent: ChatMessages | undefined, own: ChatMessages | undefined): ChatMessages | undefined {
  if (!parent) return own;
  if (!own) return parent;
  const merged: ChatMessages = { ...parent };
  for (const [code, strings] of Object.entries(own)) {
    merged[code] = { ...merged[code], ...strings };
  }
  return merged;
}

/** `Intl` throws for a malformed tag, so number and date formatting get a locale it accepts. */
function formatLocaleOf(locale: string): string {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(locale).length > 0 ? locale : "en";
  } catch {
    return "en";
  }
}

export interface ChatI18nProviderProps {
  children: React.ReactNode;
  /** Default locale when no query parameter is found */
  defaultLocale?: SupportedLocale;
  /** Override locale (disables query string detection) */
  locale?: SupportedLocale;
  /**
   * Custom messages to merge with the built-in ones, per locale code. Merged over
   * the custom messages of an outer `ChatI18nProvider`, if any. A locale other
   * than `en` / `tr` only needs the keys it translates; the rest fall back to English.
   */
  customMessages?: ChatMessages;
  /** Callback when locale changes */
  onLocaleChange?: (locale: SupportedLocale) => void;
}

/**
 * I18n provider for the chat UI.
 *
 * Automatically detects locale from URL query parameter (?lang=en or ?lang=tr).
 * Falls back to defaultLocale if no query parameter is found.
 *
 * Providers nest: inside another `ChatI18nProvider` this one inherits its locale
 * (unless `locale` is given) and its custom messages, so `<Chat>` can sit inside a
 * host's provider. `<Chat>` also works without any.
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
  const parent = useContext(I18nContext);

  const mergedCustom = useMemo(
    () => mergeMessages(parent?.customMessages, customMessages),
    [parent?.customMessages, customMessages]
  );

  // A locale chosen through `setLocale` here. Without one, the outer provider's locale applies.
  const [chosen, setChosen] = useState<SupportedLocale | undefined>(() => {
    if (controlledLocale || parent) return undefined;

    // Client-side only: detect from URL query parameter
    if (typeof window !== "undefined") {
      const langParam = new URLSearchParams(window.location.search).get("lang");
      if (langParam && (hasLocale(builtInMessages, langParam) || (customMessages && hasLocale(customMessages, langParam)))) {
        return langParam;
      }
    }

    return defaultLocale;
  });

  const locale: SupportedLocale = controlledLocale ?? chosen ?? parent?.locale ?? defaultLocale;

  const parentSetLocale = parent?.setLocale;
  const setLocale = useCallback(
    (newLocale: SupportedLocale) => {
      if (controlledLocale) {
        console.warn("ChatI18nProvider: Cannot change locale when controlled via props");
        return;
      }

      if (parentSetLocale && chosen === undefined) {
        // The outer provider owns the locale
        parentSetLocale(newLocale);
        onLocaleChange?.(newLocale);
        return;
      }

      setChosen(newLocale);
      onLocaleChange?.(newLocale);

      // Update URL query parameter if in browser
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("lang", newLocale);
        window.history.replaceState({}, "", url.toString());
      }
    },
    [controlledLocale, parentSetLocale, chosen, onLocaleChange]
  );

  const localeMessages = useMemo(() => messagesFor(locale, mergedCustom), [locale, mergedCustom]);

  const contextValue = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, customMessages: mergedCustom }),
    [locale, setLocale, mergedCustom]
  );

  return (
    <I18nContext.Provider value={contextValue}>
      <ReactIntlProvider
        locale={formatLocaleOf(locale)}
        messages={localeMessages}
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
