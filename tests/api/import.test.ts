import { describe, it, expect } from 'vitest';

describe('Import CSV Parser', () => {
  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const char of lines[i]) {
        if (char === '"') { inQuotes = !inQuotes; }
        else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
        else { current += char; }
      }
      values.push(current.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
      rows.push(row);
    }
    return rows;
  }

  function coerceValue(val: string): any {
    if (val === '' || val === 'null' || val === 'NULL') return null;
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (/^\d+$/.test(val)) return parseInt(val);
    if (/^\d+\.\d+$/.test(val)) return parseFloat(val);
    return val;
  }

  it('parses simple CSV correctly', () => {
    const csv = 'name,organism\nKRAS,Homo sapiens\nEGFR,Homo sapiens';
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('KRAS');
    expect(rows[1].organism).toBe('Homo sapiens');
  });

  it('handles quoted fields with commas', () => {
    const csv = 'name,notes\nKRAS,"Note with, comma"';
    const rows = parseCSV(csv);
    expect(rows[0].notes).toBe('Note with, comma');
  });

  it('returns empty for header-only CSV', () => {
    const csv = 'name,organism';
    expect(parseCSV(csv)).toHaveLength(0);
  });

  it('coerces values correctly', () => {
    expect(coerceValue('')).toBeNull();
    expect(coerceValue('null')).toBeNull();
    expect(coerceValue('true')).toBe(true);
    expect(coerceValue('false')).toBe(false);
    expect(coerceValue('42')).toBe(42);
    expect(coerceValue('3.14')).toBe(3.14);
    expect(coerceValue('hello')).toBe('hello');
  });
});
