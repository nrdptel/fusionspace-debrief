'use client';

import { useMemo, useState } from 'react';
import type { AnalyzedTable } from '@/lib/flight/columns';
import { hasMappableColumns, isDateRole, type ColumnRole } from '@/lib/flight/columns';
import { flownAtFromMapping, formatFlownAt, type DateColumns } from '@/lib/flight/flownAt';
import type { ColumnMapping } from '@/lib/flight/build';
import { ROLE_GROUPS, ROLE_OPTIONS, prefillUnit, unitOptionsFor } from '@/lib/flight/mappingOptions';
import { signatureOf, loadTemplate, saveTemplate, type SavedColumn } from '@/lib/mappingTemplates';
import { Button, Card, Disclosure, Frame } from './ui';

interface Row {
  role: ColumnRole;
  unit: string;
}

export default function ColumnMapper({
  table,
  suggested,
  fileName,
  onCancel,
  onSubmit,
}: {
  table: AnalyzedTable;
  suggested: ColumnMapping[];
  fileName: string;
  onCancel: () => void;
  onSubmit: (mappings: ColumnMapping[]) => void;
}) {
  const signature = useMemo(() => signatureOf(table), [table]);
  const saved = useMemo(() => loadTemplate(signature), [signature]);
  const appliedSaved = !!(saved && saved.length === table.headers.length);

  // See `hasMappableColumns`: a file with no columns of numbers isn't a table to map, and
  // gets an account of what happened instead of a mapping screen it can't answer.
  const mappable = hasMappableColumns(table);

  const initial = useMemo<Row[]>(() => {
    const validRole = (r: string): r is ColumnRole => ROLE_OPTIONS.some((o) => o.value === r);
    // `prefillUnit` rather than a membership test: the unit read off the file is canonical
    // (`'f'`) and the options are spelled for a reader (`'F'`), so comparing them raw silently
    // fell through to the first option. See its doc comment for the wrong number that caused.
    const rowFor = (role: ColumnRole, wantUnit: string | null | undefined): Row => ({
      role,
      unit: prefillUnit(role, wantUnit),
    });
    // A remembered mapping for this exact layout wins over the fresh guess.
    if (appliedSaved) {
      return table.headers.map((_, i) => {
        const s = saved![i];
        return rowFor(s && validRole(s.role) ? s.role : 'ignore', s?.unit);
      });
    }
    const byIndex = new Map(suggested.map((m) => [m.index, m]));
    return table.headers.map((_, i) => {
      const s = byIndex.get(i);
      return rowFor(s?.role ?? 'ignore', s?.unit);
    });
  }, [table.headers, suggested, saved, appliedSaved]);

  const [rows, setRows] = useState<Row[]>(initial);
  const [remembered, setRemembered] = useState(false);

  const setRole = (i: number, role: ColumnRole) => {
    setRemembered(false);
    setRows((prev) => {
      const next = prev.slice();
      // Prefilled from what THIS column's cells or header actually said, where the file said
      // anything the new role can use — so a flyer correcting a role does not have to correct the
      // unit behind it too. Falls back to the first option, which is what it always did.
      next[i] = { role, unit: prefillUnit(role, table.columns[i]?.unit) };
      return next;
    });
  };
  const setUnit = (i: number, unit: string) => {
    setRemembered(false);
    setRows((prev) => {
      const next = prev.slice();
      next[i] = { ...next[i], unit };
      return next;
    });
  };

  // Remember this mapping so the next file with the same layout comes back mapped.
  const remember = () => {
    const cols: SavedColumn[] = rows.map((r) => ({ role: r.role, unit: r.unit }));
    saveTemplate(signature, cols);
    setRemembered(true);
  };

  // What the date columns say, right now. A launch day is the one mapped value that never
  // shows up in the report's numbers, so without this a flyer only finds out whether Debrief
  // read it by finishing the analysis and looking at the logbook. Costs nothing until a date
  // role is actually mapped — with none, the scan returns immediately.
  const flownAt = useMemo(() => {
    const cols: DateColumns = {};
    rows.forEach((r, i) => {
      if (isDateRole(r.role) && cols[r.role] === undefined) cols[r.role] = i;
    });
    return flownAtFromMapping(table.dataRows, cols);
  }, [rows, table.dataRows]);
  const mappedDate = rows.some((r) => isDateRole(r.role));

  const hasTime = rows.some((r) => r.role === 'time');
  const hasAltitudeSource = rows.some((r) => r.role === 'altitude' || r.role === 'pressure');
  const ready = hasTime && hasAltitudeSource;

  // If the same role is mapped to more than one column, only the first is used —
  // say so rather than silently dropping the rest.
  const roleCounts = new Map<ColumnRole, number>();
  for (const r of rows) if (r.role !== 'ignore') roleCounts.set(r.role, (roleCounts.get(r.role) ?? 0) + 1);
  const duplicated = ROLE_OPTIONS.filter((o) => (roleCounts.get(o.value) ?? 0) > 1).map((o) => o.label);

  const submit = () => {
    const mappings: ColumnMapping[] = rows
      .map((r, i) => ({ index: i, role: r.role, unit: r.unit || null }))
      .filter((m) => m.role !== 'ignore');
    onSubmit(mappings);
  };

  const preview = table.dataRows.slice(0, 5);

  if (!mappable) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">There&apos;s no flight data in this file</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Debrief read <span className="font-mono">{fileName}</span> but found no columns of numbers in
            it — so there are no channels to map and no flight to analyze.
          </p>
        </div>
        <Card tone="warn" className="text-sm">
          <p>
            Debrief reads a logger&apos;s <strong className="font-medium">text export</strong> — CSV, TSV or
            plain text — an <strong className="font-medium">Excel spreadsheet</strong>, and two{' '}
            <strong className="font-medium">raw downloads straight off the card</strong>: an Altus Metrum{' '}
            <span className="font-mono">.eeprom</span> and a MissileWorks RRC3{' '}
            <span className="font-mono">.rff</span>. An Entacore{' '}
            <span className="font-mono">.bin</span> or <span className="font-mono">.xtra</span> is not read
            yet, and neither is a screenshot or a PDF of a flight summary.
          </p>
          <p className="mt-2">
            Open the file in your altimeter&apos;s own software and export or save-as CSV, then drop that
            here. Everything still stays on your device.
          </p>
        </Card>
        {preview.length > 0 && (
          <Disclosure summary="What Debrief did read">
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {preview.map((r) => r.join(', ').slice(0, 200)).join('\n')}
            </pre>
          </Disclosure>
        )}
        <Button variant="primary" onClick={onCancel}>
          Choose a different file
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Map the columns</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Debrief didn&apos;t recognize <span className="font-mono">{fileName}</span> as a known
          format, so tell it which column is which. It&apos;s pre-filled with a best guess — set the
          time column, an altitude or pressure column, and the units, then analyze. If the file
          also says when it flew, point the date columns at it and that becomes the flight&apos;s
          launch day.
        </p>
        {appliedSaved && (
          <p className="mt-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
            Applied your saved column mapping for this layout — adjust any row if this file differs.
          </p>
        )}
      </div>

      {/* Below sm: each column is a card — its name, the values it actually holds, then the
          two controls — because the sample values are how a flyer tells one column from
          another, and in a four-column table on a phone they are the part that goes off the
          edge. The same markup is a table from sm: up, so nothing is duplicated in the DOM
          and every control keeps one accessible name. */}
      <Frame className="overflow-x-auto">
        <table className="block w-full border-collapse text-sm sm:table">
          <thead className="hidden sm:table-header-group">
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-800 dark:bg-zinc-900/50">
              <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Column</th>
              <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Role</th>
              <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Unit</th>
              <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Sample</th>
            </tr>
          </thead>
          <tbody className="block sm:table-row-group">
            {table.headers.map((header, i) => {
              const units = unitOptionsFor(rows[i].role);
              const colName = header || `col ${i + 1}`;
              return (
                <tr
                  key={i}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-zinc-100 px-3 py-3 last:border-0 sm:table-row sm:px-0 sm:py-0 dark:border-zinc-800/60"
                >
                  <td className="order-1 w-full px-0 py-0 font-mono text-xs text-zinc-700 sm:table-cell sm:w-auto sm:px-3 sm:py-2 dark:text-zinc-300">
                    {colName}
                  </td>
                  <td className="order-3 px-0 py-0 sm:table-cell sm:px-3 sm:py-2">
                    <select
                      value={rows[i].role}
                      onChange={(e) => setRole(i, e.target.value as ColumnRole)}
                      aria-label={`Role for the ${colName} column`}
                      className="min-h-11 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs sm:min-h-0 dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <option value="ignore">Ignore</option>
                      {ROLE_GROUPS.map((g) => (
                        <optgroup key={g.label} label={g.label}>
                          {g.options.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td className="order-4 px-0 py-0 sm:table-cell sm:px-3 sm:py-2">
                    {units.length > 0 ? (
                      <select
                        value={rows[i].unit}
                        onChange={(e) => setUnit(i, e.target.value)}
                        aria-label={`Unit for the ${colName} column`}
                        className="min-h-11 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs sm:min-h-0 dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        {units.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="order-2 w-full px-0 py-0 font-mono text-xs text-zinc-500 sm:table-cell sm:w-auto sm:px-3 sm:py-2 dark:text-zinc-400">
                    <span aria-hidden="true" className="sm:hidden">
                      e.g.{' '}
                    </span>
                    {preview.map((r) => r[i]).filter(Boolean).slice(0, 3).join(', ') || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Frame>

      {mappedDate && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-zinc-600 dark:text-zinc-400"
          data-testid="mapper-flown-at"
        >
          {flownAt ? (
            <>
              Launch date read as <strong className="font-medium">{formatFlownAt(flownAt)}</strong> — it
              names the flight in your logbook and rides along in every export.
            </>
          ) : (
            <>
              Those columns don&apos;t state a date Debrief can read — a whole date needs a year, a
              month and a day, or one column holding a stamp like{' '}
              <span className="font-mono">2024-05-11 14:09:44</span>. The flight still analyzes
              without one.
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={submit} disabled={!ready}>
          Analyze flight
        </Button>
        {/* One primary and two secondaries. Both of these were hand-rolled text buttons — the
            first in the accent colour, which is the fill weight's colour worn as text and reads as
            a second primary on the one surface a flyer has to get right.

            Neither is `ghost`, and that is §5 rather than taste: ghost is "toolbar and in-table
            actions only", and "choose a different file" is neither — it is the way OUT of a screen
            a flyer can be stuck on, which is the last control that should be the faintest thing on
            the page. §5 caps primaries at one; it does not cap secondaries. */}
        <Button
          onClick={remember}
          disabled={!ready}
          title="Remember these columns for future files with the same layout — kept on this device"
        >
          {remembered ? 'Columns remembered ✓' : 'Remember these columns'}
        </Button>
        <Button onClick={onCancel}>Choose a different file</Button>
        {/* A persistent live region: announces when the file becomes analysable
            (or a role is doubled up) as the user changes the selects above. */}
        <span role="status" aria-live="polite" className="text-sm text-amber-700 dark:text-amber-400">
          {!ready
            ? 'Set a time column and an altitude or pressure column to continue.'
            : duplicated.length > 0
              ? `${duplicated.join(' and ')} ${duplicated.length > 1 ? 'are' : 'is'} mapped to more than one column — only the first of each is used.`
              : ''}
        </span>
      </div>
    </div>
  );
}
