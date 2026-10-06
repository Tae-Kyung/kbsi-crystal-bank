'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Moon, Sun, Globe, Menu, X, LayoutDashboard } from 'lucide-react';
import { type Locale, LOCALE_LABELS, getLocaleFromStorage } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/client';

const NAV_LINKS = [
  { href: '#data-story', label: 'Data Journey' },
  { href: '#features', label: 'Features' },
  { href: '#compare', label: 'Why KBSI' },
  { href: '/api-docs', label: 'API Docs' },
  { href: '/benchmark', label: 'Benchmark' },
];

export function LandingNav({ onLocaleChange }: { onLocaleChange?: (locale: Locale) => void }) {
  const [locale, setLocale] = useState<Locale>('ko');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setLocale(getLocaleFromStorage());
    // Check auth status
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setIsLoggedIn(!!data.user);
    });
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
    <nav className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur-md dark:bg-gray-950/90 dark:border-gray-800">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm font-bold">K</div>
          <span className="font-bold text-lg text-gray-900 dark:text-white">KBSI ProteinDB</span>
        </Link>

        {/* Desktop menu */}
        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={cycleLocale} title="Switch language" className="hidden sm:flex">
            <Globe className="h-4 w-4 mr-1" />
            <span className="text-xs">{LOCALE_LABELS[locale]}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleDark} title="Toggle dark mode">
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="h-4 w-4 hidden dark:block" />
          </Button>
          {isLoggedIn ? (
            <Link href="/dashboard">
              <Button size="sm" variant="outline" className="gap-1.5">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">Sign In</Button>
            </Link>
          )}
          <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-white dark:bg-gray-950 px-6 py-4 space-y-3">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href} className="block text-sm text-gray-700 dark:text-gray-300" onClick={() => setMobileOpen(false)}>
              {link.label}
            </Link>
          ))}
          {isLoggedIn && (
            <Link href="/dashboard" className="block text-sm font-medium text-blue-600" onClick={() => setMobileOpen(false)}>
              Dashboard
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
