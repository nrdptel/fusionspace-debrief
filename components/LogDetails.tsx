import type { RawFlight } from '@/lib/flight/types';
import { describeLog } from '@/lib/logInfo';
import { Chip, Disclosure } from './ui';

function fmtDuration(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return '—';
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${String(rem).padStart(2, '0')}s`;
}

/** A collapsible "what am I looking at" panel: the logger's reported identity,
 *  how fast/long it sampled, and which channels it recorded. Read straight from
 *  the parsed file — purely informational, so it stays tucked away by default. */
export default function LogDetails({ flight }: { flight: RawFlight }) {
  const info = describeLog(flight);

  const rows: { label: string; value: string }[] = [];
  rows.push({
    label: 'Sample rate',
    value: info.sampleHz != null ? `~${info.sampleHz.toFixed(info.sampleHz >= 50 ? 0 : 1)} Hz${info.uniform ? '' : ' (varies)'}` : '—',
  });
  rows.push({ label: 'Samples', value: info.sampleCount.toLocaleString('en-US') });
  rows.push({ label: 'Duration', value: fmtDuration(info.durationSec) });
  for (const m of info.meta) rows.push({ label: m.key, value: m.value });

  return (
    // §5's `Disclosure`. The class string here was BYTE-IDENTICAL to the primitive's own, down to
    // the `<summary>`'s — and this file already imported from `./ui` for `Chip`, so the primitive
    // was one word away in the same import statement. `mt-0` because the primitive carries `mt-3`
    // and this instance is positioned by its parent.
    <Disclosure summary="Log details" className="mt-0 print:hidden">
      <div className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {rows.map((r) => (
            <div key={r.label}>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {r.label}
              </dt>
              <dd className="font-mono text-zinc-800 dark:text-zinc-200">{r.value}</dd>
            </div>
          ))}
        </dl>
        {info.channels.length > 0 && (
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Channels recorded
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {info.channels.map((c, i) => (
                // §5's `Chip`, for the geometry: this hand-rolled the same token at `px-2 py-0.5`.
                // **The unit goes in `value`, not in `label`.** `Chip`'s `label` slot renders
                // BEFORE the value as a dim leading key — `StitchSurface.tsx:397` reads
                // "from · accelerometer" — so `label={c.unit}` would print "ft Altitude", with the
                // unit both first and bolder than the channel it qualifies. A unit trails.
                <Chip
                  key={`${c.label}-${i}`}
                  mono={false}
                  value={
                    <>
                      {c.label}
                      {c.unit && <span className="ml-1 text-zinc-500 dark:text-zinc-400">{c.unit}</span>}
                    </>
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Disclosure>
  );
}
