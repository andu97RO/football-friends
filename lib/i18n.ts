import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { useCallback } from 'react';
import { create } from 'zustand';
import en from './locales/en';
import ro from './locales/ro';

export type Locale = 'en' | 'ro';
export type LocalePreference = Locale | 'system';
type Params = Record<string, string | number | null | undefined>;

const dictionaries: Record<Locale, Record<string, string>> = { en, ro };
const STORAGE_KEY = 'footy.locale';
export const TIMEZONE = process.env.EXPO_PUBLIC_TIMEZONE || 'Europe/Bucharest';

function systemLocale(): Locale {
  try {
    return Localization.getLocales()[0]?.languageCode === 'ro' ? 'ro' : 'en';
  } catch {
    return 'en';
  }
}

export const useLocaleStore = create<{
  preference: LocalePreference;
  locale: Locale;
  setPreference: (preference: LocalePreference) => void;
}>((set) => ({
  preference: 'system',
  locale: systemLocale(),
  setPreference: (preference) => {
    set({ preference, locale: preference === 'system' ? systemLocale() : preference });
    AsyncStorage.setItem(STORAGE_KEY, preference).catch(() => undefined);
  },
}));

/** Restores the saved language choice; call once at startup. */
export async function loadLocalePreference(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ro' || saved === 'system') {
      useLocaleStore.setState({ preference: saved, locale: saved === 'system' ? systemLocale() : saved });
    }
  } catch {
    // Storage can be unavailable (private browsing); the device language still applies.
  }
}

// Romanian has three plural forms: one (1), few (0, 2–19, x02–x19) and other ("20 de …").
function pluralSuffix(locale: Locale, count: number): string {
  if (locale === 'ro') {
    if (count === 1) return '_one';
    const rest = count % 100;
    if (count === 0 || (rest >= 2 && rest <= 19)) return '_few';
    return '_other';
  }
  return count === 1 ? '_one' : '_other';
}

export function translate(locale: Locale, key: string, params?: Params): string {
  const dict = dictionaries[locale];
  let template: string | undefined;
  if (params && typeof params.count === 'number') {
    const suffix = pluralSuffix(locale, params.count);
    template = dict[key + suffix] ?? dict[key + '_other'] ?? en[key + suffix] ?? en[key + '_other'];
  }
  template = template ?? dict[key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
}

export function t(key: string, params?: Params): string {
  return translate(useLocaleStore.getState().locale, key, params);
}

/** Re-renders when the language changes. */
export function useT() {
  const locale = useLocaleStore((s) => s.locale);
  return useCallback((key: string, params?: Params) => translate(locale, key, params), [locale]);
}

export function intlLocale(locale: Locale = useLocaleStore.getState().locale): string {
  return locale === 'ro' ? 'ro-RO' : 'en-GB';
}

function part(date: Date, options: Intl.DateTimeFormatOptions, locale?: Locale): string {
  return date.toLocaleString(intlLocale(locale), { timeZone: TIMEZONE, ...options });
}

export const formatDate = {
  /** "Thu 2 Oct" */
  day: (iso: string | Date, locale?: Locale) => {
    const d = new Date(iso);
    return `${part(d, { weekday: 'short' }, locale)} ${part(d, { day: 'numeric' }, locale)} ${part(d, { month: 'short' }, locale)}`.replace(/\./g, '');
  },
  /** "Thursday, 9 October 2026" */
  long: (iso: string | Date, locale?: Locale) => part(new Date(iso), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, locale),
  /** "Thursday 9 October" */
  weekdayDate: (iso: string | Date, locale?: Locale) => {
    const d = new Date(iso);
    return `${part(d, { weekday: 'long' }, locale)} ${part(d, { day: 'numeric' }, locale)} ${part(d, { month: 'long' }, locale)}`;
  },
  /** "Thu" */
  weekday: (iso: string | Date, locale?: Locale) => part(new Date(iso), { weekday: 'short' }, locale).replace('.', ''),
  /** "9" */
  dayNumber: (iso: string | Date, locale?: Locale) => part(new Date(iso), { day: 'numeric' }, locale),
  /** "20:00" */
  time: (iso: string | Date, locale?: Locale) => part(new Date(iso), { hour: '2-digit', minute: '2-digit', hour12: false }, locale),
};
