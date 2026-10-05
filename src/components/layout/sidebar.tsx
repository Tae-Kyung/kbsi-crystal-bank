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
  DatabaseZap,
  FileCode,
  BarChart3,
  PenLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/locale-context';
import { t, type TranslationKey } from '@/lib/i18n';

const NAV_GROUPS = [
  {
    label: 'Research',
    items: [
      { href: '/dashboard', labelKey: 'nav.dashboard' as TranslationKey, icon: LayoutDashboard },
      { href: '/quick-entry', labelKey: 'nav.quick-entry' as TranslationKey, icon: PenLine },
      { href: '/proteins', labelKey: 'nav.proteins' as TranslationKey, icon: Dna },
      { href: '/constructs', labelKey: 'nav.constructs' as TranslationKey, icon: FlaskConical },
      { href: '/experiments', labelKey: 'nav.experiments' as TranslationKey, icon: TestTubes },
      { href: '/ligands', labelKey: 'nav.ligands' as TranslationKey, icon: Pill },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/staging', labelKey: 'nav.staging' as TranslationKey, icon: ClipboardCheck },
      { href: '/pdb-import', labelKey: 'nav.data-management' as TranslationKey, icon: DatabaseZap },
      { href: '/benchmark', labelKey: 'nav.benchmark' as TranslationKey, icon: BarChart3 },
    ],
  },
  {
    label: 'Docs',
    items: [
      { href: '/api-docs', labelKey: 'nav.api-docs' as TranslationKey, icon: FileCode },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

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
      <nav className="flex-1 p-3" data-testid="sidebar-nav">
        {NAV_GROUPS.map((group, groupIdx) => (
          <div key={group.label}>
            {groupIdx > 0 && <div className="border-t my-2 mx-3" />}
            <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50 px-3 pt-2">
              {group.label}
            </div>
            <div className="space-y-1 mt-1">
              {group.items.map(({ href, labelKey, icon: Icon }) => {
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
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export { NAV_ITEMS };
