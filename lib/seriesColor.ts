// The colour a flight is drawn in, when the flyer has chosen one.
//
// D5's "set the series colours". Stored per FLIGHT id rather than per comparison: a flyer who
// makes their L3 flight red wants it red in every comparison it appears in, and a colour that
// changed depending on which other flights were on screen would be worse than no choice at all.
//
// Deliberately an override map and not a replacement palette — `COMPARE_PALETTE` still assigns
// every flight a distinct default, so a flyer who chooses nothing gets what they get today, and
// one who colours a single flight does not have to colour the rest. Same shape as the report
// profile's off-list for the same reason: what is stored is the DIFFERENCE from the default, so
// a new default reaches a flyer who never overrode it.

const KEY = 'debrief.compare.colors';
/** Bounded like the other stored maps, so a long logbook cannot grow this without limit. */
const MAX = 200;

/** `#rrggbb`, lowercased. Anything else is not a colour this app wrote. */
const HEX = /^#[0-9a-f]{6}$/;

export function loadSeriesColors(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      // Validated on the way IN, not just on the way out: this value is interpolated into an
      // SVG `stroke` and a style attribute, and a stored string that is not a colour has no
      // business reaching either.
      if (typeof v === 'string' && HEX.test(v.toLowerCase())) out[id] = v.toLowerCase();
      if (Object.keys(out).length >= MAX) break;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveSeriesColors(colors: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    const clean: Record<string, string> = {};
    for (const [id, v] of Object.entries(colors)) {
      if (typeof v === 'string' && HEX.test(v.toLowerCase())) clean[id] = v.toLowerCase();
      if (Object.keys(clean).length >= MAX) break;
    }
    if (Object.keys(clean).length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    /* storage blocked (a private window) — the choice still applies to this view */
  }
}

/** Apply the flyer's overrides to a built comparison's flights, leaving the default where they
 *  chose nothing. Applied ONCE, at the top of the surface, so the chart, the legend, the event
 *  markers, the SVG and the PNG cannot disagree about what colour a flight is. */
export function withSeriesColors<T extends { id: string; color: string }>(
  flights: T[],
  colors: Record<string, string>,
): T[] {
  if (Object.keys(colors).length === 0) return flights;
  return flights.map((f) => (colors[f.id] ? { ...f, color: colors[f.id] } : f));
}
