'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FlaskConical,
  TestTubes,
  Dna,
  LayoutDashboard,
  ClipboardCheck,
  Pill,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/locale-context';
import { t, type TranslationKey } from '@/lib/i18n';

const NAV_ITEMS = [
  { href: '/dashboard', labelKey: 'nav.dashboard' as TranslationKey, icon: LayoutDashboard },
  { href: '/proteins', labelKey: 'nav.proteins' as TranslationKey, icon: Dna },
  { href: '/constructs', labelKey: 'nav.constructs' as TranslationKey, icon: FlaskConical },
  { href: '/experiments', labelKey: 'nav.experiments' as TranslationKey, icon: TestTubes },
  { href: '/ligands', labelKey: 'nav.ligands' as TranslationKey, icon: Pill },
  { href: '/staging', labelKey: 'nav.staging' as TranslationKey, icon: ClipboardCheck },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { locale } = useLocale();

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r bg-sidebar">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="font-bold text-lg">
          KBSI ProteinDB
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-3" data-testid="sidebar-nav">
        {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <Icon className="h-4 w-4" />
              {t(labelKey, locale)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export { NAV_ITEMS };
