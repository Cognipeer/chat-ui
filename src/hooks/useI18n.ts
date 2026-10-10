"use client";

import { useContext } from "react";
import { createIntl, IntlContext, type IntlShape } from "react-intl";
import { useI18nContextOptional, messagesFor, type SupportedLocale } from "../providers/I18nProvider";

export interface UseI18nReturn {
  /** Translate a message by key */
  t: (id: string, values?: Record<string, any>) => string;
  /** Whether a message exists for this key (in the current locale or the English fallback) */
  has: (id: string) => boolean;
  /** Current locale */
  locale: SupportedLocale;
  /** Change locale (updates URL query parameter) */
  setLocale: (locale: SupportedLocale) => void;
  /** Format a number */
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** Format a date */
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  /** Format a relative time (e.g., "2 hours ago") */
  formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) => string;
}

// What the components fall back to outside a `ChatI18nProvider`: the built-in English strings
let standaloneIntl: IntlShape | undefined;
function getStandaloneIntl(): IntlShape {
  standaloneIntl ??= createIntl({ locale: "en", messages: messagesFor("en") });
  return standaloneIntl;
}

/**
 * Hook to access i18n utilities.
 * 
 * Provides translation function, locale state, and formatting helpers. Outside a
 * `ChatI18nProvider` it answers in the built-in English strings, so the components
 * and hooks work without one.
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { t, locale, setLocale } = useI18n();
 *   
 *   return (
 *     <div>
 *       <p>{t('chat.input.placeholder')}</p>
 *       <button onClick={() => setLocale(locale === 'en' ? 'tr' : 'en')}>
 *         Switch Language
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useI18n(): UseI18nReturn {
  const intl = useContext(IntlContext) ?? getStandaloneIntl();
  const i18nContext = useI18nContextOptional();

  const locale = (i18nContext?.locale || intl.locale) as SupportedLocale;
  const setLocale = i18nContext?.setLocale || (() => {
    console.warn("setLocale called outside ChatI18nProvider - no effect");
  });

  return {
    t: (id: string, values?: Record<string, any>) => {
      try {
        return intl.formatMessage({ id }, values);
      } catch (error) {
        console.warn(`Missing translation for key: ${id}`);
        return id;
      }
    },
    has: (id: string) => Object.prototype.hasOwnProperty.call(intl.messages, id),
    locale,
    setLocale,
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) => 
      intl.formatNumber(value, options),
    formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => 
      intl.formatDate(value, options),
    formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) => 
      intl.formatRelativeTime(value, unit),
  };
}
