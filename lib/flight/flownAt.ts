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
/** Just the calendar day a stamp states, in the same voice as `formatFlownAt` — for the
 *  places that name a launch day rather than an instant. */
export function formatFlownDay(stampOrDay: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(stampOrDay);
  if (!m) return stampOrDay;
  return `${Number(m[3])} ${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}`;
}

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

/** A time of day a logger writes as its own cell — "14:09:44", "9:05", "19:06:45.800".
 *  Returns the hour/minute/second, or null for anything that isn't a clock. */
export function clockFromText(text: string): { hour: number; minute: number; second?: number } | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const second = m[3] != null ? Number(m[3]) : undefined;
  return { hour, minute, ...(second != null && second >= 0 && second < 60 ? { second } : {}) };
}

/** Which clock a stated date is on, read from the text itself. A file that says UTC is
 *  taken at its word; anything else is the logger's own wall clock, because a mapped
 *  column carries no format Debrief knows and guessing a zone moves a flight's hour. */
function zoneOfText(text: string): FlownAt['zone'] {
  return /(\bUTC\b|\bGMT\b|\bZULU\b|Z$)/i.test(text.trim()) ? 'UTC' : 'logger';
}

/** Column indices a mapping can nominate as the flight's date — the shapes real loggers
 *  write, so a hand-mapped CSV can state a launch day the same way a named parser does. */
export interface DateColumns {
  /** One cell holding a whole date, optionally with a time: "2024-05-11 14:09:44". */
  date?: number;
  /** A clock beside a date-only column: "14:09:44". */
  timeOfDay?: number;
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
}

/**
 * When the flight flew, from whichever date columns a mapping nominated. Covers the two
 * shapes the corpus's loggers write and a hand-mapped CSV therefore also writes: one
 * stated stamp (a Featherweight GPS's `UTCTIME`), or separate calendar parts (AltOS's
 * `year,month,day,hour,minute,second`, a Blue Raven's `Year,Month,Day,Time`).
 *
 * Scans for the first row that states a real date, like `flownAtFromColumns` — a GPS
 * writes zeros until it locks. The zone is never guessed: only a cell that says UTC is
 * read as UTC, and separate numeric parts carry no zone at all, so they are the logger's
 * clock and labelled as such.
 */
export function flownAtFromMapping(rows: string[][], cols: DateColumns): FlownAt | null {
  const hasParts = cols.year != null && cols.month != null && cols.day != null;
  if (cols.date == null && !hasParts) return null;
  const at = (row: string[], i: number | undefined) => (i == null ? undefined : Number(row[i]));

  for (const row of rows) {
    let got: FlownAt | null = null;
    if (cols.date != null) {
      const cell = row[cols.date] ?? '';
      got = flownAtFromText(cell, zoneOfText(cell));
    }
    if (!got && hasParts) {
      got = flownAtFromParts(
        {
          year: at(row, cols.year) ?? NaN,
          month: at(row, cols.month) ?? NaN,
          day: at(row, cols.day) ?? NaN,
          hour: at(row, cols.hour),
          minute: at(row, cols.minute),
          second: at(row, cols.second),
        },
        'logger',
      );
    }
    if (!got) continue;
    // A date-only stamp with a clock column beside it: take the time from the same row,
    // so the two halves of one record can't come from different moments.
    if (!got.stamp.includes('T') && cols.timeOfDay != null) {
      const clock = clockFromText(row[cols.timeOfDay] ?? '');
      if (clock) {
        const [year, month, day] = got.stamp.split('-').map(Number);
        got = flownAtFromParts({ year, month, day, ...clock }, got.zone) ?? got;
      }
    }
    return got;
  }
  return null;
}
