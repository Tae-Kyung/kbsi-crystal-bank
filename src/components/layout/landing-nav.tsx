'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Moon, Sun, Globe } from 'lucide-react';
import { type Locale, LOCALE_LABELS, getLocaleFromStorage } from '@/lib/i18n';

export function LandingNav({ onLocaleChange }: { onLocaleChange?: (locale: Locale) => void }) {
  const [locale, setLocale] = useState<Locale>('ko');

  useEffect(() => {
    setLocale(getLocaleFromStorage());
  }, []);

  function toggleDark() {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }

  function cycleLocale() {
    const locales: Locale[] = ['ko', 'en', 'zh'];
    const nextIdx = (locales.indexOf(locale) + 1) % locales.length;
    const next = locales[nextIdx];
    setLocale(next);
    localStorage.setItem('locale', next);
    onLocaleChange?.(next);
  }

  return (
    <nav className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur dark:bg-gray-950/80 dark:border-gray-800">
      <div className="mx-auto max-w-5xl flex items-center justify-between px-6 h-14">
        <Link href="/" className="font-bold text-lg text-gray-900 dark:text-white">
          KBSI ProteinDB
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={cycleLocale} title="Switch language">
            <Globe className="h-4 w-4 mr-1" />
            <span className="text-xs">{LOCALE_LABELS[locale]}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleDark} title="Toggle dark mode">
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="h-4 w-4 hidden dark:block" />
          </Button>
          <Link href="/login">
            <Button size="sm">Sign In</Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
