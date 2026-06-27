import ThemeToggle from './ThemeToggle';
import KofiButton from './KofiButton';
import FusionSpaceBadge from './FusionSpaceBadge';

export default function SiteHeader() {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800 print:hidden">
      <div>
        <FusionSpaceBadge className="mb-1.5" />
        <h1 className="text-2xl font-semibold tracking-tight">Debrief</h1>
        <p className="mt-2 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
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
