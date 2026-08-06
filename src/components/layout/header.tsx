'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu, LogOut, Moon, Sun, Globe } from 'lucide-react';
import { Sidebar } from './sidebar';
import { createClient } from '@/lib/supabase/client';
import { useLocale } from '@/lib/locale-context';
import { t, LOCALE_LABELS, type Locale } from '@/lib/i18n';

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const title = pathname.split('/').filter(Boolean)[0] ?? 'Dashboard';
  const [loggingOut, setLoggingOut] = useState(false);

  function toggleDark() {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }

  function cycleLocale() {
    const locales: Locale[] = ['ko', 'en', 'zh'];
    const nextIdx = (locales.indexOf(locale) + 1) % locales.length;
    setLocale(locales[nextIdx]);
  }

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-4 md:px-6">
      <Sheet>
        <SheetTrigger className="md:hidden p-2 rounded-md hover:bg-accent">
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-60 p-0">
          <Sidebar />
        </SheetContent>
      </Sheet>

      <h1 className="text-lg font-semibold capitalize flex-1">{title}</h1>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={cycleLocale} title="Switch language">
          <Globe className="h-4 w-4 mr-1" />
          <span className="text-xs hidden sm:inline">{LOCALE_LABELS[locale]}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={toggleDark} title="Toggle dark mode">
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="h-4 w-4 hidden dark:block" />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleLogout} disabled={loggingOut}>
          <LogOut className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">{loggingOut ? '...' : t('common.logout', locale)}</span>
        </Button>
      </div>
    </header>
  );
}
