// Which readings a flyer wants in the report — and, because it is the same decision,
// which ones go into every report they export.
//
// A flight report is written for a purpose. A Level 3 certification package wants apogee,
// top speed, descent rates and flight time; a drag study wants coast efficiency, max Q and
// the parachute Cd; a club write-up wants three numbers and a chart. Debrief works out
// everything the file can support — that's the point of it — but printing all of it every
// time makes the flyer's own layout the tool's, not theirs. So the readings are theirs to
// pick, once, and the choice follows into the text, Markdown and HTML reports and the
// bundle rather than having to be redone per format.
//
// Stored as what is turned OFF, not what is on: a flight with a roll-rate channel gains a
// tile the flyer has never seen, and a new reading should appear rather than be silently
// excluded by a list written before it existed. Kept on this device, like the units and
// the explorer's saved views — nothing about it leaves the browser.
//
// Deliberately NOT applied to the data exports (the analyzed-series CSV and the structured
// JSON): those are the machine-readable record, where a consumer reading
// `debrief.flight/1` expects every key it knows to be present. Trimming a report is a
// presentation choice; trimming a data contract is a broken file.

const KEY = 'debrief.report.hidden';
/** A guard on the stored list, not on what a flight can show: no report has this many. */
export const MAX_HIDDEN = 64;

/** The labels this flyer has turned off, as stored on this device. */
export function loadHidden(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX_HIDDEN);
  } catch {
    return [];
  }
}

export function saveHidden(labels: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const unique = [...new Set(labels.filter((l) => typeof l === 'string' && l))].slice(0, MAX_HIDDEN);
    if (unique.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(unique));
  } catch {
    /* storage blocked (a private window) — the choice still applies to this view */
  }
}

// Which readings come first is the other half of "this report is mine". Debrief has a
// default order, and it is a good one — apogee and top speed lead because that is what a
// flyer is asked at the pad — but a cert package leads with what the certification asks for
// and a drag study leads with the coast. The comparison already lets a flyer move a column
// into an order no metric gives; this is the same idea for the readings.
//
// Stored as a partial order: only what has been moved. A reading that hasn't been touched
// keeps its place relative to the rest, and a reading a flight gains later appears in its
// natural position instead of being pushed to the end by a list written before it existed.

const ORDER_KEY = 'debrief.report.order';

export function loadOrder(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX_HIDDEN);
  } catch {
    return [];
  }
}

export function saveOrder(labels: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const unique = [...new Set(labels.filter((l) => typeof l === 'string' && l))].slice(0, MAX_HIDDEN);
    if (unique.length === 0) window.localStorage.removeItem(ORDER_KEY);
    else window.localStorage.setItem(ORDER_KEY, JSON.stringify(unique));
  } catch {
    /* storage blocked — the order still applies to this view */
  }
}

/**
 * Apply a stored order to the rows this comparison actually has: what the order names comes
 * first, in that order, and anything it doesn't name keeps Debrief's own order behind it. A
 * stored label this comparison doesn't have is skipped rather than leaving a gap.
 *
 * Deliberately scoped to the comparison table, where one builder feeds the screen, the
 * clipboard, the CSV, the Markdown, the HTML and the bundle — so "third from the top" means
 * one thing everywhere. The single-flight report is a grid of tiles beside an export table
 * that carries readings the tiles don't (time to apogee, the landing energy, an ejection
 * delay), and an order made against one of those lists has no exact meaning in the other:
 * see BACKLOG.md. The report keeps the show/hide half of the profile.
 */
export function orderRows<T>(rows: T[], label: (row: T) => string, order?: string[]): T[] {
  if (!order || order.length === 0) return rows;
  const rank = new Map(order.map((l, i) => [l, i]));
  return rows
    .map((row, i) => ({ row, i, r: rank.get(label(row)) }))
    .sort((a, b) => {
      if (a.r != null && b.r != null) return a.r - b.r;
      if (a.r != null) return -1;
      if (b.r != null) return 1;
      return a.i - b.i;
    })
    .map((x) => x.row);
}

/** Move one label one place earlier or later, returning the new stored order. */
export function moveReading(order: string[], all: string[], label: string, delta: -1 | 1): string[] {
  // Start from the order as it currently reads, so a first move on an untouched list means
  // what it looks like rather than jumping the label to the front.
  const current = orderRows(all, (l) => l, order);
  const from = current.indexOf(label);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= current.length) return order;
  const next = current.slice();
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

/**
 * Filter a report's rows by the flyer's choice, whatever shape the rows are in — the
 * on-screen tiles and every exporter's rows all key on the same visible label, so one
 * rule covers them and they cannot drift apart.
 *
 * Apogee is never removable. It is the one number every flight has and every report is
 * about; a "flight report" with no apogee in it is a different document, and a chooser
 * that lets you make one is a trap rather than a freedom.
 */
export const ALWAYS_SHOWN = ['Apogee'];

export function visibleRows<T>(rows: T[], label: (row: T) => string, hidden?: string[]): T[] {
  if (!hidden || hidden.length === 0) return rows;
  const off = new Set(hidden);
  return rows.filter((r) => {
    const l = label(r);
    return ALWAYS_SHOWN.includes(l) || !off.has(l);
  });
}

/** Turn one label on or off, returning the new stored list. */
export function toggleHidden(hidden: string[], label: string): string[] {
  if (ALWAYS_SHOWN.includes(label)) return hidden;
  return hidden.includes(label) ? hidden.filter((l) => l !== label) : [...hidden, label];
}
