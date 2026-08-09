import { WHY } from '@/lib/whyDebrief';
import { Card } from './ui';

/**
 * What Debrief does that the tools a flyer already owns do not, said on the surface where they
 * decide whether to bother rather than left to be discovered.
 *
 * The claims themselves live in `lib/whyDebrief.ts` — they are content tied to `COMPETITION.md`'s
 * evidence, and `lib/whyDebrief.test.ts` holds the two side by side so a claim that stops being
 * true in the ledger fails the build rather than sitting on the landing page for a year. This file
 * is only how they look.
 */
export default function WhyDebrief() {
  return (
    <Card as="section" aria-labelledby="why-heading">
      <h2 id="why-heading" className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        What you can do here that your altimeter&apos;s own software can&apos;t
      </h2>
      {/* §4's spacing scale and §3's sizes. A two-column grid below `sm:` would put four items at a
          measure well under §3's floor, which is the trap the methods page fell into. */}
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {WHY.map((w) => (
          <li key={w.title}>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{w.title}</p>
            <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{w.body}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
