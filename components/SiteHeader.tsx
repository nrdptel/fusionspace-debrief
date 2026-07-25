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
] as const;

/** What this surface is for, in its own words — two pages doing different jobs shouldn't
 *  introduce themselves with the same sentence. */
const TAGLINE: Record<string, string> = {
  analyze:
    'Drop in a flight log from any altimeter and read the flight — parsed in your browser, never uploaded.',
  compare:
    'Line up a launch day, a season, or several altimeters that flew the same rocket — read side by side in your browser, never uploaded.',
};
const TAGLINE_DEFAULT =
  'Read the flight logs you have already flown — parsed in your browser, never uploaded.';

export default function SiteHeader({
  current,
  brandAsHeading = true,
}: {
  /** Which surface this page is, if it is one. Docs pages leave it unset. */
  current?: (typeof SURFACES)[number]['key'];
  /**
   * False on pages that carry their own <h1>: the brand is then the site's name, not the
   * page's heading, so it must not compete with it in the document outline.
   */
  brandAsHeading?: boolean;
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
        <div className="flex shrink-0 flex-col items-end gap-2">
          <ThemeToggle />
          <KofiButton />
        </div>
      </div>

      <nav aria-label="Surfaces" className="mt-5 flex flex-wrap gap-1.5">
        {SURFACES.map((s) => {
          const active = s.key === current;
          return (
            <Link
              key={s.key}
              href={s.href}
              title={s.hint}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white sm:min-h-0 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'inline-flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 sm:min-h-0 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
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
