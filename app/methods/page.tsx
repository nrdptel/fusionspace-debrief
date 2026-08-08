import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import { METHOD_GROUPS, type MethodId } from '@/lib/methodIds';
import { METHOD_CONTENT } from '@/lib/methods/content';
import { SectionNav } from '@/components/ui';
import SiteFooter from '@/components/SiteFooter';
import { SITE_URL } from '@/lib/links';

export const metadata: Metadata = {
  title: 'Where the numbers come from — Debrief',
  description:
    'How Debrief works out every flight number — apogee, velocity, acceleration, thrust-to-weight, drag and parachute Cd, recovery drift and more — and exactly where each one can be wrong. A measurement instrument, not a simulator.',
  alternates: { canonical: `${SITE_URL}/methods/` },
};

/** A group's heading id, derived from its title so the two can never disagree — a hand-kept
 *  second list of anchors is the thing `lib/methodIds.ts` exists to avoid one level down. */
function groupId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The strip's items. Short labels, because the strip scrolls sideways on a phone and a
 *  full subject title turns it into the wall it is meant to open up. */
const NAV = METHOD_GROUPS.map((g) => ({
  id: groupId(g.title),
  label: g.title.length > 22 ? `${g.title.slice(0, 21).trimEnd()}\u2026` : g.title,
}));


export default function MethodsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-12">
      <SiteHeader brandAsHeading={false} />

      <section className="mt-12">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Where the numbers come from
        </h1>
        <p className="mt-3 max-w-3xl text-base text-zinc-600 dark:text-zinc-400">
          Every logger is different, so Debrief reads each file into one common shape — a time base
          plus named channels in SI units — and runs the same analysis on all of them. Here is how
          each number is worked out, and where it can be wrong. For how these reads are checked
          against real flights, see{' '}
          <Link
            href="/validation"
            className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            how Debrief is validated
          </Link>
          .
        </p>


        {/* The 51 blocks, under the eleven subjects `METHOD_GROUPS` places them in. Until
            2026-08-08 this was one flat `sm:grid-cols-2` grid of 51 sibling `<h2>`s with no
            level above them and no way in — owner note ON-1. The strip and the contents are
            the same two affordances the flight report has had since it reached nine screens
            on a phone; this page is longer and had neither. */}
        <SectionNav label="Jump to a subject on this page" items={NAV} className="mt-6" />

        <nav aria-label="Contents" className="mt-4 print:hidden">
          <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            {METHOD_GROUPS.map((g) => (
              <li key={g.title}>
                <a
                  href={`#${groupId(g.title)}`}
                  className="text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
                >
                  {g.title}
                </a>{' '}
                <span className="text-zinc-500 dark:text-zinc-400">({g.ids.length})</span>
              </li>
            ))}
          </ul>
        </nav>

        {METHOD_GROUPS.map((g) => (
          <section key={g.title} id={groupId(g.title)} className="mt-12 scroll-mt-12">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {g.title}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">{g.blurb}</p>
            <div className="mt-4 grid gap-x-8 gap-y-6 text-sm leading-relaxed text-zinc-600 sm:grid-cols-2 dark:text-zinc-400">
              {g.ids.map((id) => (
                <Method key={id} id={id} />
              ))}
            </div>
          </section>
        ))}

      </section>

      <p className="mt-12 border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <Link href="/" className="underline hover:text-zinc-700 dark:hover:text-zinc-300">
          ← Back to Debrief
        </Link>
      </p>

      <SiteFooter />
    </main>
  );
}

/** One definition, at its own address.
 *
 *  `id` is typed against the canonical list (`lib/methodIds.ts`), so a block cannot be renamed
 *  out from under a link that cites it — and since 2026-08-08 the TEXT comes from
 *  `lib/methods/content.tsx` rather than from this file, because the report's "?" renders the
 *  same explanation in a popover. One module, two surfaces (owner note ON-3).
 *
 *  The heading is an `h3`: the group `<section>` above owns the `h2`. Before the page was
 *  grouped it had 51 sibling `h2`s and no third level at all. */
function Method({ id }: { id: MethodId }) {
  const { title, body } = METHOD_CONTENT[id];
  return (
    <div>
      <h3 id={id} className="scroll-mt-12 text-base font-medium text-zinc-800 dark:text-zinc-200">
        {title}
      </h3>
      {/* A DIV, not a `<p>`. Until 2026-08-08 this wrapped each block's whole body in one
          paragraph, so **no block on this page could have a second one** — the wall owner note
          ON-1 describes was structural rather than editorial. The bodies carried 14 standalone
          `{' '}` lines sitting exactly where a break was intended, every one of them in front of
          a `<strong>` opening a new topic sentence, and JSX rendered each as a single space. */}
      <div className="mt-1 max-w-3xl space-y-3">{body}</div>
    </div>
  );
}
