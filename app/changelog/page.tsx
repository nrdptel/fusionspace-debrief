import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { Card, Notice, Section, SectionNav } from '@/components/ui';
import { SITE_URL } from '@/lib/links';
import { RELEASES, releaseId, releasesThatMovedAReading } from '@/lib/changelog';

export const metadata: Metadata = {
  title: 'What changed — Debrief',
  description:
    'What changed in Debrief between builds, newest first — and which of those changes moved a reading, so a report you saved months ago can be checked against how the same log reads today.',
  alternates: { canonical: `${SITE_URL}/changelog/` },
};

/** The date as a reader wants it, from the ISO string the data carries. Fixed to UTC so the
 *  static export renders the same day the entry was written, whatever the build machine's
 *  timezone is — a release dated 2026-08-09 must not render as the 8th because a builder sat
 *  west of Greenwich. */
function readable(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ChangelogPage() {
  const moved = releasesThatMovedAReading();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 md:py-12">
      <SiteHeader brandAsHeading={false} />

      <h1 className="mt-12 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        What changed
      </h1>
      <p className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
        Debrief&apos;s methods change most weeks, and a change to a method is a change to what the
        tool says about a real flight. Every report Debrief writes names the build that produced
        it; this page says what each build did differently. Newest first.
      </p>

      {/* The one thing a flyer holding an older report actually needs, said before the list
          rather than left to be discovered by reading all of it. */}
      <Notice tone="warn" as="p" className="mt-6">
        <strong>If you saved a report before today,</strong> the entries headed{' '}
        <em>Readings that changed</em> are the ones that matter — they are the builds where a number
        moved, rather than a feature arriving. {moved.length} of {RELEASES.length} releases so far
        have moved one. Re-reading the original log always gives you today&apos;s answer; Debrief
        never rewrites a document you already saved.
      </Notice>

      <SectionNav
        label="Jump to a section of this changelog"
        items={RELEASES.map((r) => ({ id: releaseId(r), label: readable(r.date) }))}
      />

      <div className="mt-8 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
        {RELEASES.map((release) => (
          <Section
            key={release.date}
            id={releaseId(release)}
            title={readable(release.date)}
            description={release.headline}
          >
            {release.readings.length > 0 && (
              <Card tone="warn" as="section" className="mb-4">
                <h3 className="mb-2 text-base font-medium text-amber-900 dark:text-amber-100">
                  Readings that changed
                </h3>
                <ul className="list-disc space-y-2 pl-6">
                  {release.readings.map((entry, i) => (
                    <li key={i}>{entry}</li>
                  ))}
                </ul>
              </Card>
            )}

            {release.added.length > 0 && (
              <>
                <h3 className="mb-2 mt-4 text-base font-medium text-zinc-900 dark:text-zinc-100">
                  New
                </h3>
                <ul className="list-disc space-y-2 pl-6">
                  {release.added.map((entry, i) => (
                    <li key={i}>{entry}</li>
                  ))}
                </ul>
              </>
            )}

            {release.improved.length > 0 && (
              <>
                <h3 className="mb-2 mt-4 text-base font-medium text-zinc-900 dark:text-zinc-100">
                  Better
                </h3>
                <ul className="list-disc space-y-2 pl-6">
                  {release.improved.map((entry, i) => (
                    <li key={i}>{entry}</li>
                  ))}
                </ul>
              </>
            )}

            {release.readings.length === 0 && (
              // Stated rather than omitted: a heading that is simply absent leaves a reader
              // working out whether nothing moved or whether nobody checked.
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                No reading changed in this release — every number Debrief reported the day before
                it, it reported the day after.
              </p>
            )}
          </Section>
        ))}
      </div>

      <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
        Older than this list goes, Debrief was not yet public. For how each number is worked out see{' '}
        <Link
          href="/methods"
          className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          where the numbers come from
        </Link>
        , and for how the reads are checked,{' '}
        <Link
          href="/validation"
          className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          how Debrief is validated
        </Link>
        .
      </p>

      <SiteFooter />
    </main>
  );
}
