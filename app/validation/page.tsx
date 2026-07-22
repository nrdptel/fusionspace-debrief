import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { SITE_URL } from '@/lib/links';

export const metadata: Metadata = {
  title: 'How Debrief is validated — Debrief',
  description:
    "How Debrief's flight reads are checked: a regression corpus of real logs against independent ground truth, physical invariants, the logger's own reported figures shown beside each read, methods grounded in published sources — and an honest account of where it's known to be weak.",
  alternates: { canonical: `${SITE_URL}/validation/` },
};

export default function ValidationPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 md:py-10">
      <SiteHeader />

      <h1 className="mt-10 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        How Debrief is validated
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Debrief is a measurement instrument, so a number is only worth having if you can trust it.
        None of what follows makes the reads perfect — a barometric altitude is still a barometric
        altitude — but here is exactly how each one is checked, and where it is known to fall short.
        For how each number is <em>worked out</em>, see{' '}
        <Link href="/methods" className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100">
          where the numbers come from
        </Link>
        .
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Real flights, checked against real ground truth
          </h2>
          <p className="mt-2">
            The analysis is regression-tested against a private corpus of real flight logs — dozens
            of them, spanning ten logger families — not synthetic data. Each log is paired with
            independent ground truth: a <strong>second altimeter that flew the same flight</strong>,
            or the <strong>device&apos;s own reported summary</strong> written into the file. Debrief
            reads each log and its headline numbers — apogee, max velocity, max acceleration, descent
            rates — are compared against that ground truth within a tolerance. The whole corpus is
            re-run on every change; a read that drifts out of tolerance fails the build before it can
            ship. Logs Debrief is known to still mis-read are kept in the corpus and parsed without
            asserting the wrong number, so the gap is documented rather than quietly locked in as
            correct.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Physical and logical invariants
          </h2>
          <p className="mt-2">
            Some checks need no reference number at all — they just have to hold for any real flight,
            whatever the logger. A deceleration is never a positive number dressed up as one; the
            events fall in flight order and none sits above apogee; boost&nbsp;+&nbsp;coast adds up to
            the time to apogee, and ascent&nbsp;+&nbsp;descent to the flight time; descent rates point
            downward and the main is slower than the drogue; thrust-to-weight off the pad is a sane
            launch number; a battery&apos;s low never exceeds its resting start. A metric that
            contradicts itself trips these guards even when there is no ground truth to compare
            against — the kind of bug a single golden number can miss.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            The logger&apos;s own figures, in your own report
          </h2>
          <p className="mt-2">
            Validation you can see for yourself: when a file carries the device&apos;s own headline
            figures (as an AltimeterCloud export writes its apogee and velocities, or a PerfectFlite
            preamble states its apogee), Debrief shows them beside its independent read as a
            cross-check — two measurements to compare, with the agreement stated. Close agreement
            builds confidence; a gap is flagged for a look, never averaged together or hidden. And
            when you have several recordings of one flight — redundant altimeters, or a stage on its
            own device — the comparison view lines them up side by side the same way: independent
            measurements that can disagree, not a consensus dressed as certainty.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Grounded in published sources
          </h2>
          <p className="mt-2">
            The methods are implemented from published formulas and cited, not copied from another
            tool: barometric altitude and air density from the constant-lapse standard atmosphere (US
            Standard Atmosphere, 1976); drag coefficient from the coast deceleration and parachute
            C<sub>d</sub> from terminal velocity, both the textbook{' '}
            ½&nbsp;ρ&nbsp;v²&nbsp;C<sub>d</sub>&nbsp;A force balance; speed of sound from the ground
            temperature. Each parser reads a format from its published or observed layout and surfaces
            the numbers the file already carries — never a vendored engine.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Where it is known to be weak
          </h2>
          <p className="mt-2">
            Honesty is the point of a measurement instrument, so the limits are stated in the read
            itself, not buried here:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              A <strong>barometric altitude</strong> drifts with weather and the airframe&apos;s own
              airflow — good to a few metres, not centimetres — and above ~36,000&nbsp;ft (the top of
              the troposphere) the standard-atmosphere model behind it under-reads; a flight that high
              is flagged.
            </li>
            <li>
              A <strong>GPS</strong> altitude or track is good only to a few metres, and a velocity
              derived from it is rough; acceleration off it isn&apos;t meaningful and is withheld.
            </li>
            <li>
              A <strong>derived (barometric) velocity or acceleration</strong> is a smoothed estimate,
              softer at peak speed than a logged one, and labelled wherever it appears.
            </li>
            <li>
              A <strong>saturated accelerometer</strong> (a trace that flat-tops at its full-scale
              limit) is flagged as possibly clipped; a <strong>coarse sample rate</strong>
              undersamples fast events like a deployment shock, so those read as a floor, not a
              ceiling.
            </li>
            <li>
              A <strong>single-source flight</strong> has nothing to cross-check against, so its read
              stands on the invariants and the method alone.
            </li>
          </ul>
          <p className="mt-2">
            Accuracy is a range with its basis, never a single flattering number — and Debrief reads
            flights already flown; it does not predict, recommend a motor, or model a flight you
            haven&apos;t flown. For that margin-critical work, reach for a dedicated, well-validated
            simulator.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Try it</h2>
          <p className="mt-2">
            The quickest way to judge it is to drop in a flight you already know the numbers for — or
            open the{' '}
            <Link href="/" className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100">
              sample flight
            </Link>{' '}
            and read its cross-check against the logger&apos;s own figures. Everything runs in your
            browser; nothing is uploaded.
          </p>
        </section>
      </div>

      <p className="mt-10 border-t border-zinc-200 pt-5 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <Link href="/" className="underline hover:text-zinc-700 dark:hover:text-zinc-300">
          ← Back to Debrief
        </Link>
      </p>

      <SiteFooter />
    </main>
  );
}
