import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { LocaleProvider } from '@/lib/locale-context';
import { ChatPanel } from '@/components/chat/chat-panel';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LocaleProvider>
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
        <ChatPanel />
      </div>
    </LocaleProvider>
  );
}
