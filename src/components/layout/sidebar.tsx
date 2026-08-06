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

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/proteins', label: 'Proteins', icon: Dna },
  { href: '/constructs', label: 'Constructs', icon: FlaskConical },
  { href: '/experiments', label: 'Experiments', icon: TestTubes },
  { href: '/ligands', label: 'Ligands', icon: Pill },
  { href: '/staging', label: 'Staging Review', icon: ClipboardCheck },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r bg-sidebar">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="font-bold text-lg">
          KBSI ProteinDB
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-3" data-testid="sidebar-nav">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export { NAV_ITEMS };
