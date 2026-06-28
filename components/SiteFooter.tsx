import Link from 'next/link';
import { GitHubIcon } from './icons';
import { HUB_URL, REPO_URL } from '@/lib/links';
import { observancesForDate } from '@/lib/observances';

export default function SiteFooter() {
  // Monthly flourishes (Pride, Men's Mental Health Month, …) shown as warm
  // footer lines, matching the accent rules at the top of the page.
  const observances = observancesForDate();

  return (
    <footer className="mt-20 border-t border-zinc-200 pt-6 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 md:mt-28 print:hidden">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
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
          <Link href="/privacy" className="hover:text-zinc-800 dark:hover:text-zinc-200">
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
      <p className="mt-5 max-w-2xl text-zinc-500 dark:text-zinc-400">
        Personal, non-commercial project — not affiliated with any altimeter or rocketry
        manufacturer. Built for the hobby rocketry community.
      </p>

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
