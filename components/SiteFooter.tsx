import Link from 'next/link';
import { GitHubIcon } from './icons';
import { BUG_REPORT_URL, FORMAT_REQUEST_URL, HUB_URL, REPO_URL } from '@/lib/links';
import { BUILD_SHA, buildLine } from '@/lib/buildInfo';
import { observancesForDate } from '@/lib/observances';

export default function SiteFooter() {
  // Monthly flourishes (Pride, Men's Mental Health Month, …) shown as warm
  // footer lines, matching the accent rules at the top of the page.
  const observances = observancesForDate();

  return (
    <footer className="mt-8 border-t border-zinc-200 pt-6 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 md:mt-12 print:hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            <GitHubIcon className="h-4 w-4 fill-current" />
            Source on GitHub
          </a>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
            ·
          </span>
          {/* A way to say something is wrong, on every route. The forms have existed in
              `.github/ISSUE_TEMPLATE/` for a long time and the only link to either was one
              sentence on the PRIVACY page — a feature reachable only by knowing it is there,
              which is a named tell. `?template=` lands on the form with its questions rather
              than an empty box. */}
          <a
            href={BUG_REPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            Report a problem
          </a>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
            ·
          </span>
          {/* Prefetched on render, not when the footer scrolls into view. The offline
              promise is "open it once with signal, then use it at the field", and that must
              not depend on whether the flyer happened to scroll far enough to bring these
              links into the viewport — the route's own JavaScript has to reach the cache
              during that one online visit or the page can't hydrate without a network. */}
          <Link href="/methods" prefetch className="hover:text-zinc-800 dark:hover:text-zinc-200">
            Methods
          </Link>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
            ·
          </span>
          <Link href="/validation" prefetch className="hover:text-zinc-800 dark:hover:text-zinc-200">
            Validation
          </Link>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
            ·
          </span>
          <Link href="/privacy" prefetch className="hover:text-zinc-800 dark:hover:text-zinc-200">
            Privacy
          </Link>
        </nav>
        <a
          href={HUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Fusion Space — free, polished tools for high-power rocketry"
          className="group inline-flex items-center gap-1.5 transition hover:opacity-80"
        >
          <span>A</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/fusion-space-wordmark.svg"
            alt="Fusion Space"
            width={1598}
            height={281}
            className="h-5 w-auto"
          />
          <span>
            project{' '}
            <span aria-hidden="true" className="opacity-0 transition group-hover:opacity-100">
              ↗
            </span>
          </span>
        </a>
      </div>
      <p className="mt-4 max-w-2xl text-zinc-500 dark:text-zinc-400">
        Personal, non-commercial project — not affiliated with any altimeter or rocketry
        manufacturer. Built for the hobby rocketry community.
      </p>

      {/* Which build a flyer is actually looking at (P5).
          `lib/buildInfo.ts` has stamped every document a flyer KEEPS since D11 slice 4, and the
          screen said nothing — so a flyer who noticed a reading change between two visits could
          answer "which version produced this number?" about a saved report and not about the page
          in front of them. Same module, same wording, so the two cannot drift.

          It links to the commit, which is what makes it checkable rather than decorative: the
          methods change most weeks, and `Debrief a1b2c3d` is only useful if a1b2c3d can be read.
          A navigation and nothing else — no fetch, so the offline promise is untouched.

          Absent outside a production build rather than printed as `dev`: a version line that says
          `dev` on a real visit would be worse than none, and `BUILD_SHA` is exactly `dev` there. */}
      {BUILD_SHA !== 'dev' && (
        <p className="mt-4 text-zinc-500 dark:text-zinc-400">
          <a
            href={`${REPO_URL}/commit/${BUILD_SHA}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-zinc-800 dark:hover:text-zinc-200"
            title="The exact code this page was built from — Debrief's methods change often, and a saved report names its build the same way"
          >
            {buildLine()}
          </a>
        </p>
      )}

      {observances.length > 0 && (
        <div className="mt-4 space-y-1">
          {observances.map((o) => (
            <p key={o.id} className="text-zinc-500 dark:text-zinc-400">
              <span aria-hidden="true">{o.emoji}</span> {o.message}
              {o.href && (
                <>
                  {' '}
                  <a
                    href={o.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-zinc-800 dark:hover:text-zinc-200"
                  >
                    {o.hrefLabel} &rarr;
                  </a>
                </>
              )}
            </p>
          ))}
        </div>
      )}
    </footer>
  );
}
