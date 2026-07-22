import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import Analyzer from '@/components/Analyzer';

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-10">
      {/* Chrome and prose stay at the focused reading width; only the analysis and
          compare views (below) use the extra room, where the charts live. */}
      <div className="mx-auto w-full max-w-5xl">
        <SiteHeader />

      <details className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40 print:hidden">
        <summary className="cursor-pointer select-none font-medium text-zinc-700 dark:text-zinc-300">
          How to use this
        </summary>
        <div className="mt-3 space-y-3 text-zinc-600 dark:text-zinc-400">
          <p>
            Drop in a flight log — or several at once to compare — and Debrief reads each into one
            clean flight: the headline numbers and the curves that matter, with liftoff, burnout,
            apogee and the deployments marked on them. It auto-detects the loggers it knows and falls
            back to a column mapper for anything else, so <em>any</em> logger that exports a CSV works.
            Everything runs in your browser — files never leave your device.
          </p>
          <ul className="space-y-2">
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">Compare</strong> — drop
              several files at once, or tick flights in your logbook, to overlay their curves and line
              up the numbers side by side.
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">Explore</strong> — plot
              any channel the logger recorded, against time or one against another, alongside
              Debrief&apos;s own Mach and dynamic-pressure channels, then save the plot or its data.
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">Units</strong> — switch
              feet and meters on a report (top-right); acceleration is always in g. Your choice is
              remembered and rides in the URL.
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">Share &amp; keep</strong>{' '}
              — copy a link with the whole flight encoded inside it, or let the logbook remember recent
              flights on this device — both stay on your machine.
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">Offline</strong> —
              install it to your home screen; once opened it works with no signal, right at the field.
            </li>
          </ul>
        </div>
      </details>
      </div>

      <section className="mt-8">
        <Analyzer />
      </section>

      {/* The full method-by-method write-up lives on its own page, so the analyze view
          stays focused on the flight; this is the pointer to it. */}
      <section className="mx-auto mt-16 w-full max-w-5xl border-t border-zinc-200 pt-8 dark:border-zinc-800 print:hidden">
        <h2 className="text-lg font-semibold tracking-tight">Where the numbers come from</h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Debrief is a measurement instrument, not a simulator: every number is a reading of your own
          recording, worked out the same way for every logger and labelled wherever it&apos;s derived
          or approximate. See exactly how each one — apogee, velocity, thrust-to-weight, drag and
          parachute C<sub>d</sub>, recovery drift and the rest — is calculated, and where it can be
          wrong.
        </p>
        <p className="mt-3">
          <Link
            href="/methods"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Read the methods &rarr;
          </Link>
        </p>
      </section>

      <div className="mx-auto w-full max-w-5xl">
        <SiteFooter />
      </div>
    </main>
  );
}
