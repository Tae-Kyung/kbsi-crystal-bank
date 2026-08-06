'use client';

import { usePathname } from 'next/navigation';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import { Sidebar } from './sidebar';

export function Header() {
  const pathname = usePathname();
  const title = pathname.split('/').filter(Boolean)[0] ?? 'Dashboard';

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

      <h1 className="text-lg font-semibold capitalize">{title}</h1>
    </header>
  );
}
