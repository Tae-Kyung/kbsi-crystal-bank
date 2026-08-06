import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar, NAV_ITEMS } from '@/components/layout/sidebar';

describe('Sidebar', () => {
  it('renders all navigation links', () => {
    render(<Sidebar />);
    const nav = screen.getByTestId('sidebar-nav');
    const links = nav.querySelectorAll('a');
    expect(links.length).toBe(NAV_ITEMS.length);
  });

  it('each link has correct href', () => {
    render(<Sidebar />);
    for (const item of NAV_ITEMS) {
      const link = screen.getByText(item.label);
      expect(link.closest('a')).toHaveAttribute('href', item.href);
    }
  });

  it('renders the brand title', () => {
    render(<Sidebar />);
    expect(screen.getByText('KBSI ProteinDB')).toBeDefined();
  });
});
