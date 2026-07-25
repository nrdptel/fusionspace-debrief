// When the flight actually flew, read off the file itself.
//
// A logbook keyed on when you happened to open a file is a recents list; a logbook keyed on
// when the rocket left the pad is a logbook. Several loggers write the date and time into the
// log — a GPS fix carries UTC (Altus Metrum's `year,month,day,hour,minute,second` columns, a
// Featherweight GPS's `UTCTIME`), and a Blue Raven writes its own `Year,Month,Day,Time` —
// so where a file states it, Debrief reads it rather than guessing.
//
// Two rules keep this a measurement:
//  - Nothing is converted between time zones and nothing is localised. A GPS says UTC, so it
//    is shown as UTC; a Blue Raven states a wall clock with no zone, so it is shown as the
//    logger's own clock and labelled that way. Re-projecting either into the reader's browser
//    zone would silently move a flight to a different hour, and possibly a different day.
//  - A file that doesn't say gets no date. The file's modification time is when it was copied
//    off the altimeter, not when it flew, and is never used.

/** A flight date and time as the file states it, with whose clock it is. */
export interface FlownAt {
  /** `YYYY-MM-DDTHH:MM` or `YYYY-MM-DDTHH:MM:SS` — a plain stamp, not an instant. */
  stamp: string;
  /** 'UTC' where the file says so (a GPS fix); 'logger' for an altimeter's own wall clock. */
  zone: 'UTC' | 'logger';
}

/** Widest range of years a real amateur flight log can carry. Below it is a logger whose
 *  clock never got set (they power up at 1970, or 2000, or 2080 with a garbage GPS week);
 *  above it is the same. Rejecting those keeps a "flew in 1970" out of the logbook. */
const YEAR_MIN = 1990;
const YEAR_MAX = 2100;

const pad = (n: number, w = 2) => String(Math.trunc(n)).padStart(w, '0');

/**
 * A stamp from the calendar parts a file states, or null when they aren't a real date.
 * A GPS with no lock writes zeros or a placeholder year, and an altimeter with a dead
 * backup cell writes its epoch — none of those is a flight date, so they're dropped
 * rather than shown.
 */
export function flownAtFromParts(
  parts: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  zone: FlownAt['zone'],
): FlownAt | null {
  const { year, month, day } = parts;
  if (![year, month, day].every((v) => Number.isFinite(v))) return null;
  if (year < YEAR_MIN || year > YEAR_MAX) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // A real calendar date: rejects 31 February and the like, which a corrupt row can produce.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== Math.trunc(day)) return null;

  const h = parts.hour;
  const m = parts.minute;
  const s = parts.second;
  const timed =
    h != null && m != null && Number.isFinite(h) && Number.isFinite(m) && h >= 0 && h < 24 && m >= 0 && m < 60;
  if (!timed) return { stamp: `${pad(year, 4)}-${pad(month)}-${pad(day)}`, zone };
  const withSeconds = s != null && Number.isFinite(s) && s >= 0 && s < 60 ? `:${pad(s)}` : '';
  return { stamp: `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(h)}:${pad(m)}${withSeconds}`, zone };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * A stamp from a stated timestamp string. Handles the two shapes the corpus's loggers write:
 * `Apr 17 2021 19:06:45.800 UTC` (Featherweight GPS) and an ISO-like `2024-05-11 14:09:44`.
 * Returns null for anything else rather than guessing at an ambiguous order — 03/04/2024 is
 * two different days depending on who wrote it.
 */
export function flownAtFromText(text: string, zone: FlownAt['zone']): FlownAt | null {
  const s = text.trim();
  const named = /^([A-Za-z]{3})\w*\s+(\d{1,2})\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (named) {
    const month = MONTHS.indexOf(named[1].toLowerCase()) + 1;
    if (month > 0) {
      return flownAtFromParts(
        {
          year: Number(named[3]),
          month,
          day: Number(named[2]),
          hour: named[4] != null ? Number(named[4]) : undefined,
          minute: named[5] != null ? Number(named[5]) : undefined,
          second: named[6] != null ? Number(named[6]) : undefined,
        },
        zone,
      );
    }
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (iso) {
    return flownAtFromParts(
      {
        year: Number(iso[1]),
        month: Number(iso[2]),
        day: Number(iso[3]),
        hour: iso[4] != null ? Number(iso[4]) : undefined,
        minute: iso[5] != null ? Number(iso[5]) : undefined,
        second: iso[6] != null ? Number(iso[6]) : undefined,
      },
      zone,
    );
  }
  return null;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The stamp for reading: `30 Oct 2021, 20:07 UTC` or `11 May 2024, 14:09 (logger clock)`.
 *  Built by hand rather than through `toLocaleString`, which would shift the hour into the
 *  reader's own zone — the one thing this must never do. */
export function formatFlownAt(f: FlownAt | null | undefined): string {
  if (!f) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(f.stamp);
  if (!m) return '';
  const date = `${Number(m[3])} ${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}`;
  const time = m[4] ? `, ${m[4]}:${m[5]}` : '';
  const label = f.zone === 'UTC' ? ' UTC' : time ? ' (logger clock)' : '';
  return `${date}${time}${label}`;
}

/**
 * The first real date in a table of rows, read from separate calendar columns. Scans rather
 * than trusting row 0: AltOS writes zeros for `year/month/day` until the GPS locks, and a
 * logger powered up indoors can hold that for the whole pad wait. The first row that states
 * a plausible date is the flight's — the calendar day doesn't change mid-flight.
 */
export function flownAtFromColumns(
  rows: string[][],
  cols: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  zone: FlownAt['zone'],
): FlownAt | null {
  const at = (row: string[], i: number | undefined) =>
    i == null || i < 0 ? undefined : Number(row[i]);
  for (const row of rows) {
    const got = flownAtFromParts(
      {
        year: at(row, cols.year) ?? NaN,
        month: at(row, cols.month) ?? NaN,
        day: at(row, cols.day) ?? NaN,
        hour: at(row, cols.hour),
        minute: at(row, cols.minute),
        second: at(row, cols.second),
      },
      zone,
    );
    if (got) return got;
  }
  return null;
}
