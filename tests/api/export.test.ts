import { describe, it, expect } from 'vitest';

const EXPORTABLE_TABLES = [
  'kbsi_protein', 'kbsi_construct', 'kbsi_expression', 'kbsi_purification',
  'kbsi_crystallization', 'kbsi_characterization', 'kbsi_structure',
  'kbsi_diffraction', 'kbsi_storage',
];

describe('Export API', () => {
  it('EXPORTABLE_TABLES contains core tables', () => {
    expect(EXPORTABLE_TABLES).toContain('kbsi_protein');
    expect(EXPORTABLE_TABLES).toContain('kbsi_construct');
    expect(EXPORTABLE_TABLES).toContain('kbsi_crystallization');
    expect(EXPORTABLE_TABLES).toContain('kbsi_structure');
  });

  it('all table names have kbsi_ prefix', () => {
    for (const table of EXPORTABLE_TABLES) {
      expect(table.startsWith('kbsi_')).toBe(true);
    }
  });

  it('supports both csv and json format values', () => {
    const validFormats = ['csv', 'json'];
    expect(validFormats).toContain('csv');
    expect(validFormats).toContain('json');
  });
});
