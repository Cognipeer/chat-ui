"use client";

import { useIntl } from "react-intl";
import { useI18nContextOptional, type SupportedLocale } from "../providers/I18nProvider";

export interface UseI18nReturn {
  /** Translate a message by key */
  t: (id: string, values?: Record<string, any>) => string;
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

/**
 * Hook to access i18n utilities.
 * 
 * Provides translation function, locale state, and formatting helpers.
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
  const intl = useIntl();
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
