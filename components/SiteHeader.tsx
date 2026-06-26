import ThemeToggle from './ThemeToggle';
import KofiButton from './KofiButton';
import { HUB_URL } from '@/lib/links';

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
      <div className="flex shrink-0 flex-col items-end gap-2">
        <ThemeToggle />
        <KofiButton />
      </div>
    </header>
  );
}
