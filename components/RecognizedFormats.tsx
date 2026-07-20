// The loggers Debrief auto-detects, named where a first-time visitor sees them —
// at the drop zone, before uploading — so they know their altimeter is covered
// without digging into the methodology. The catch-all CSV mapper covers the rest.

const FORMATS = [
  'Altus Metrum (AltOS)',
  'PerfectFlite (StratoLogger / Pnut)',
  'Eggtimer',
  'Featherweight (Raven · Blue Raven · GPS)',
  'Entacore AIM',
];

export default function RecognizedFormats() {
  return (
    <section
      aria-labelledby="formats-heading"
      className="rounded-xl border border-zinc-200 bg-white px-4 py-3.5 dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      <h2 id="formats-heading" className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Recognized loggers
      </h2>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {FORMATS.map((f) => (
          <li
            key={f}
            className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {f}
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-xs text-zinc-500 dark:text-zinc-400">
        Auto-detected from the file. Anything else — any logger that exports a CSV or an Excel spreadsheet —
        works through a quick column mapper.
      </p>
    </section>
  );
}
