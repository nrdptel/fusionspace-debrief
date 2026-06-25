import ThemeToggle from './ThemeToggle';
import { GitHubIcon } from './icons';
import { HUB_URL, REPO_URL } from '@/lib/links';

export default function SiteHeader() {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800">
      <div>
        <a
          href={HUB_URL}
          aria-label="Fusion Space home"
          className="inline-flex items-center gap-2 rounded-md focus-visible:outline-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/fusion-space-mark.svg"
            alt=""
            aria-hidden="true"
            width={880}
            height={815}
            className="h-7 w-auto"
          />
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Fusion Space</span>
        </a>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Debrief</h1>
        <p className="mt-1 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
          Drop in a flight log from any altimeter and read the flight — parsed in your
          browser, never uploaded.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Source on GitHub"
          aria-label="Source on GitHub"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <GitHubIcon className="h-3.5 w-3.5 fill-current" />
          <span className="hidden sm:inline">GitHub</span>
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}
