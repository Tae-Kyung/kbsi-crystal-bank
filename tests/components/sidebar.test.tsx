import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar, NAV_ITEMS } from '@/components/layout/sidebar';
import { LocaleProvider } from '@/lib/locale-context';

function renderWithLocale(ui: React.ReactElement) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

describe('Sidebar', () => {
  it('renders all navigation links', () => {
    renderWithLocale(<Sidebar />);
    const nav = screen.getByTestId('sidebar-nav');
    const links = nav.querySelectorAll('a');
    expect(links.length).toBe(NAV_ITEMS.length);
  });

  it('each link has correct href', () => {
    renderWithLocale(<Sidebar />);
    const nav = screen.getByTestId('sidebar-nav');
    const links = nav.querySelectorAll('a');
    const hrefs = Array.from(links).map((l) => l.getAttribute('href'));
    for (const item of NAV_ITEMS) {
      expect(hrefs).toContain(item.href);
    }
  });

  it('renders the brand title', () => {
    renderWithLocale(<Sidebar />);
    expect(screen.getByText('KBSI ProteinDB')).toBeDefined();
  });
});
