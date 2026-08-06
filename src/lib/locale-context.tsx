'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { type Locale, getLocaleFromStorage } from './i18n';

const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
}>({ locale: 'ko', setLocale: () => {} });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('ko');

  useEffect(() => {
    setLocaleState(getLocaleFromStorage());
  }, []);

  function setLocale(l: Locale) {
    setLocaleState(l);
    localStorage.setItem('locale', l);
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
