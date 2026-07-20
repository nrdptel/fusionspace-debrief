// Remembered column mappings. When a flyer maps an unrecognized export's columns
// to roles, that work should be reusable: the next file from the same logger — the
// same header layout, or the same shape of headerless export — comes back with the
// mapping already applied. Stored on this device only (localStorage), like the unit
// choice and the logbook; nothing is uploaded.

import type { AnalyzedTable, ColumnRole } from './flight/columns';

export interface SavedColumn {
  role: ColumnRole;
  unit: string;
}

const KEY = 'debrief.mappings.v1';

/** A stable key for "files like this one": the normalized header names for a headed
 *  file, or just the column count for a headerless export (which has no names to key
 *  on). Two files from the same logger export share a signature; a different layout
 *  gets its own. */
export function signatureOf(table: AnalyzedTable): string {
  if (table.headerRow === -1) return `headerless:${table.headers.length}`;
  const names = table.headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  return `cols:${names.join('|')}`;
}

function readAll(): Record<string, SavedColumn[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    return raw && typeof raw === 'object' ? (raw as Record<string, SavedColumn[]>) : {};
  } catch {
    return {};
  }
}

/** The saved mapping for a signature, or null when none is stored. */
export function loadTemplate(signature: string): SavedColumn[] | null {
  const t = readAll()[signature];
  return Array.isArray(t) && t.length > 0 ? t : null;
}

/** Remember this mapping for future files with the same signature. */
export function saveTemplate(signature: string, columns: SavedColumn[]): void {
  if (typeof window === 'undefined') return;
  const all = readAll();
  all[signature] = columns;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* quota or disabled storage — the mapping just isn't remembered */
  }
}

/** Forget the saved mapping for a signature. */
export function forgetTemplate(signature: string): void {
  if (typeof window === 'undefined') return;
  const all = readAll();
  if (!(signature in all)) return;
  delete all[signature];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
