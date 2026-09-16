import ru from '../../messages/ru.json';
import en from '../../messages/en.json';
import { useState, useEffect, useCallback } from 'react';

export type Locale = 'ru' | 'en';
type MessageSchema = typeof ru;

const LOCALE_STORAGE_KEY = 'freakcloud_locale';
const LOCALE_CHANGE_EVENT = 'freakcloud_locale_change';

const dictionaries: Record<Locale, MessageSchema> = {
  ru,
  en: en as unknown as MessageSchema,
};

export function getCurrentLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'en' || saved === 'ru') return saved;
  } catch {}
  return 'ru';
}

export function setLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: locale }));
  } catch (e) {
    console.warn('Failed to save locale:', e);
  }
}

export function getTranslation(path: string, locale = getCurrentLocale()): string {
  const parts = path.split('.');
  const dict = dictionaries[locale] || dictionaries.ru;
  let current: unknown = dict;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return path;
    }
  }
  return typeof current === 'string' ? current : path;
}

export function useTranslation() {
  const [locale, setLocalState] = useState<Locale>(getCurrentLocale);

  useEffect(() => {
    const handleLocaleChange = (e: Event) => {
      const customEvent = e as CustomEvent<Locale>;
      if (customEvent.detail) {
        setLocalState(customEvent.detail);
      }
    };
    window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
  }, []);

  const changeLocale = useCallback((newLocale: Locale) => {
    setLocale(newLocale);
    setLocalState(newLocale);
  }, []);

  const messages = dictionaries[locale] || dictionaries.ru;

  return {
    locale,
    setLocale: changeLocale,
    t: (path: string) => getTranslation(path, locale),
    messages,
  };
}

