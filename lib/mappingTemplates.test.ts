import { describe, it, expect, beforeEach } from 'vitest';

// A minimal localStorage stub so the persistence logic is testable in the default
// (node) env; the real-browser round-trip is covered by the mapper e2e.
const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
};

import { signatureOf, loadTemplate, saveTemplate, forgetTemplate } from './mappingTemplates';
import type { AnalyzedTable } from './flight/columns';

const table = (headerRow: number, headers: string[]): AnalyzedTable => ({
  headerRow,
  headers,
  dataRows: [],
  columns: [],
});

beforeEach(() => store.clear());

describe('mapping templates', () => {
  it('keys headed files by their names and headerless files by column count', () => {
    expect(signatureOf(table(0, ['Time (s)', 'Altitude']))).toBe('cols:time s|altitude');
    expect(signatureOf(table(-1, ['Column 1', 'Column 2', 'Column 3']))).toBe('headerless:3');
  });

  it('saves and loads a mapping round-trip', () => {
    const sig = signatureOf(table(-1, ['a', 'b']));
    expect(loadTemplate(sig)).toBeNull();
    saveTemplate(sig, [
      { role: 'time', unit: 's' },
      { role: 'altitude', unit: 'ft' },
    ]);
    expect(loadTemplate(sig)).toEqual([
      { role: 'time', unit: 's' },
      { role: 'altitude', unit: 'ft' },
    ]);
  });

  it('forgets a saved mapping', () => {
    saveTemplate('headerless:2', [{ role: 'time', unit: 's' }]);
    forgetTemplate('headerless:2');
    expect(loadTemplate('headerless:2')).toBeNull();
  });

  it('survives corrupt storage without throwing', () => {
    store.set('debrief.mappings.v1', 'not json');
    expect(loadTemplate('headerless:2')).toBeNull();
  });
});
