import Link from 'next/link';
import ThemeToggle from './ThemeToggle';
import KofiButton from './KofiButton';
import FusionSpaceBadge from './FusionSpaceBadge';

/**
 * The surfaces a flyer moves between. Reading one flight and lining several up are different
 * jobs on different pages, so the header names both on every page — including the docs pages,
 * which pass no `current` and so mark neither. A surface reachable only by already knowing it
 * exists isn't shipped.
 */
const SURFACES = [
  { href: '/', key: 'analyze', label: 'Analyze', hint: 'Read one flight log' },
  { href: '/compare', key: 'compare', label: 'Compare', hint: 'Line up several side by side' },
  { href: '/stitch', key: 'stitch', label: 'Assemble', hint: 'Stages of one launch, in order' },
] as const;

/** What this surface is for, in its own words — two pages doing different jobs shouldn't
 *  introduce themselves with the same sentence. */
const TAGLINE: Record<string, string> = {
  analyze:
    'Drop in a flight log from any altimeter and read the flight — parsed in your browser, never uploaded.',
  compare:
    'Line up a launch day, a season, or several altimeters that flew the same rocket — read side by side in your browser, never uploaded.',
  stitch:
    'Put the stages of one launch in order on the clock they share — every mark naming the recording it came from, nothing merged into a single reading.',
};
const TAGLINE_DEFAULT =
  'Read the flight logs you have already flown — parsed in your browser, never uploaded.';

export default function SiteHeader({
  current,
  brandAsHeading = true,
  unitsSlot,
}: {
  /** Which surface this page is, if it is one. Docs pages leave it unset. */
  current?: (typeof SURFACES)[number]['key'];
  /**
   * False on pages that carry their own <h1>: the brand is then the site's name, not the
   * page's heading, so it must not compete with it in the document outline.
   */
  brandAsHeading?: boolean;
  /**
   * The unit control, on the surfaces that show numbers.
   *
   * Passed in rather than imported so this header stays a server component: the docs pages
   * render it too, and they have no numbers on them, so shipping the unit machinery (and the
   * client boundary it needs) to `/methods`, `/validation` and `/privacy` would be JS that
   * can never do anything. It also mattered concretely — with everything wrapped in the
   * provider, /methods went 107 kB → 111 kB and the extra chunk requests pushed the e2e
   * static server over its file-descriptor limit mid-run (EMFILE), taking the last five
   * tests with it.
   */
  unitsSlot?: React.ReactNode;
}) {
  const Brand = brandAsHeading ? 'h1' : 'p';
  return (
    <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800 print:hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <FusionSpaceBadge className="mb-1.5" />
          <Brand className="text-2xl font-semibold tracking-tight">Debrief</Brand>
          <p className="mt-2 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
            {(current && TAGLINE[current]) || TAGLINE_DEFAULT}
          </p>
        </div>
        {/* Top-right, which is where the page has always TOLD the flyer the unit switch is —
            it just wasn't there. It sits above a flight rather than inside one, so the logbook's
            apogee and speed columns can be read in metres before any file is dropped. */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          {unitsSlot}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <KofiButton />
          </div>
        </div>
      </div>

      <nav aria-label="Surfaces" className="mt-4 flex flex-wrap gap-1.5">
        {SURFACES.map((s) => {
          const active = s.key === current;
          return (
            <Link
              key={s.key}
              href={s.href}
              prefetch
              title={s.hint}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white pointer-coarse:min-h-11 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 pointer-coarse:min-h-11 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
              }
            >
              {s.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
