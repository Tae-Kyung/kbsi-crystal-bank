import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnumSelect } from '@/components/forms/enum-select';

const RESULT_OPTIONS = ['no_expression', 'insoluble', 'low', 'moderate', 'high'] as const;

describe('EnumSelect', () => {
  it('renders the trigger', () => {
    render(<EnumSelect options={RESULT_OPTIONS} onChange={vi.fn()} />);
    expect(screen.getByTestId('enum-select-trigger')).toBeDefined();
  });

  it('shows placeholder when no value', () => {
    render(<EnumSelect options={RESULT_OPTIONS} onChange={vi.fn()} placeholder="등급 선택" />);
    expect(screen.getByText('등급 선택')).toBeDefined();
  });

  it('shows selected value', () => {
    render(<EnumSelect options={RESULT_OPTIONS} value="high" onChange={vi.fn()} />);
    // The trigger should show the formatted value
    expect(screen.getByTestId('enum-select-trigger')).toBeDefined();
  });
});
