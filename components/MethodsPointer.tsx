import Link from 'next/link';
import { TOUCH_TARGET } from '@/lib/ui-tokens';

/**
 * What Debrief is, and what it isn't, at the foot of every surface that shows numbers —
 * plus the way to the full write-up.
 *
 * This is not decoration. Debrief reads flights that have already been flown, and the line
 * between that and a simulator is the whole basis on which its numbers can be trusted: a
 * reading of your own recording, not a prediction. A surface that shows figures without
 * saying so is a surface where someone could mistake one for the other, so the statement
 * travels with the figures rather than living on the home page alone.
 */
export default function MethodsPointer() {
  return (
    <section className="mx-auto mt-12 w-full max-w-5xl border-t border-zinc-200 pt-8 dark:border-zinc-800 print:hidden">
      <h2 className="text-xl font-semibold tracking-tight">Where the numbers come from</h2>
      <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
        Debrief is a measurement instrument, not a simulator: every number is a reading of your own
        recording, worked out the same way for every logger and labelled wherever it&apos;s derived
        or approximate. See exactly how each one — apogee, velocity, thrust-to-weight, drag and
        parachute C<sub>d</sub>, recovery drift and the rest — is calculated, and where it can be
        wrong.
      </p>
      <p className="mt-3">
        {/* `inline-flex` as well as the token, because `min-h` does nothing to an inline box —
            the link measured 18 px at a 390 px touch viewport. §8's floor, on one of the three
            plain `<a>`s that `app/globals.css`'s `@media (pointer: coarse)` block does not reach;
            `TOUCH_TARGET` documents itself as being for exactly these. */}
        <Link
          href="/methods"
          className={`inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 ${TOUCH_TARGET}`}
        >
          Read the methods &rarr;
        </Link>
      </p>
    </section>
  );
}
