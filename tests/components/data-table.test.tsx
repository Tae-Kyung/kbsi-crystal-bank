import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/tables/data-table';

interface TestRow {
  id: number;
  name: string;
}

const columns: ColumnDef<TestRow>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name' },
];

const testData: TestRow[] = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
  { id: 3, name: 'Gamma' },
];

describe('DataTable', () => {
  it('renders data rows', () => {
    render(<DataTable columns={columns} data={testData} />);
    const rows = screen.getAllByTestId('table-row');
    expect(rows.length).toBe(3);
  });

  it('shows empty message when no data', () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText('데이터가 없습니다.')).toBeDefined();
  });

  it('renders column headers', () => {
    render(<DataTable columns={columns} data={testData} />);
    expect(screen.getByText('ID')).toBeDefined();
    expect(screen.getByText('Name')).toBeDefined();
  });

  it('renders search input when searchKey provided', () => {
    render(<DataTable columns={columns} data={testData} searchKey="name" />);
    expect(screen.getByTestId('search-input')).toBeDefined();
  });

  it('does not render search input when searchKey not provided', () => {
    render(<DataTable columns={columns} data={testData} />);
    expect(screen.queryByTestId('search-input')).toBeNull();
  });
});
