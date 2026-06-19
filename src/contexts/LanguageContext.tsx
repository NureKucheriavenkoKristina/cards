import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Locale, translations } from '@/src/locales/translations';

const STORAGE_KEY = '@cardly_locale';

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'en' || stored === 'uk') {
        setLocaleState(stored);
      }
    });
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    AsyncStorage.setItem(STORAGE_KEY, newLocale);
  }, []);

  const localeRef = useRef(locale);
  localeRef.current = locale;

  /** Stable reference — reads current locale via ref so effects keyed on `t` do not re-run on language change. */
  const t = useCallback((key: string): string => {
    const dict = translations[localeRef.current];
    return dict[key] ?? translations.en[key] ?? key;
  }, []);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (ctx === undefined) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}
