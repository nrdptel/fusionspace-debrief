import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import Analyzer from '@/components/Analyzer';
import { MOTOR_URL } from '@/lib/links';

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <SiteHeader />

      <details className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
        <summary className="cursor-pointer select-none font-medium text-zinc-700 dark:text-zinc-300">
          How to read this
        </summary>
        <div className="mt-3 space-y-3 text-zinc-600 dark:text-zinc-400">
          <p>
            Drop in a flight log and Debrief reads it into one flight: the headline numbers and the
            curves that matter, with the events marked on them. It auto-detects the loggers it knows;
            for anything else it falls back to a column mapper, so{' '}
            <em>any</em> logger that can export a CSV works.
          </p>
          <ul className="space-y-2">
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">Apogee</strong> is the
              real peak — a short median filter removes the single-sample jump an ejection charge
              punches into a barometric trace, so a deployment pop can&apos;t fake a higher altitude.
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">
                Velocity and acceleration
              </strong>{' '}
              come straight from the device when it logged them; otherwise they&apos;re derived from
              altitude and clearly marked as such.
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">Events</strong> —
              liftoff, burnout, apogee, main deploy and landing — are detected and drawn on every
              chart. Each is tagged <em>measured</em> or <em>derived</em> so nothing looks more
              certain than it is.
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">Units</strong> toggle
              between feet and metres (top-right of the report); acceleration is always in g. Your
              choice is remembered and rides in the URL.
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">Privacy</strong> — the
              file is parsed in this browser and never leaves your device. There is no upload and no
              server.
            </li>
          </ul>
        </div>
      </details>

      <section className="mt-8">
        <Analyzer />
      </section>

      <section className="mt-16 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h2 className="text-lg font-semibold tracking-tight">Where the numbers come from</h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Every logger is different, so Debrief reads each file into one common shape — a time base
          plus named channels in SI units — and runs the same analysis on all of them. Here is how
          each number is worked out, and where it can be wrong.
        </p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          <Method title="Ground baseline & altitude">
            Altitude is taken from the logger&apos;s own altitude channel where it has one, or derived
            from barometric pressure with the standard atmosphere when it only logs pressure. Either
            way the pad level is set from the median of the opening samples, so altitude reads zero on
            the rail and everything after is height above the pad (AGL). Barometric altitude drifts
            with weather and is disturbed by a rocket&apos;s own airflow near the airframe — treat it
            as good to a few metres, not centimetres.
          </Method>
          <Method title="Apogee">
            The peak of a spike-cleaned altitude trace. A short median filter removes the one- or
            two-sample jumps that an ejection charge&apos;s pressure pulse punches into a baro trace,
            which is exactly what makes a naïve &ldquo;highest reading&rdquo; report an apogee that
            never happened. The filter is narrow enough to leave the true peak untouched.
          </Method>
          <Method title="Velocity & max velocity">
            If the device logged a velocity (an accelerometer-integrated speed is best through the
            high-speed boost), Debrief uses it. Otherwise velocity is the time-derivative of the
            cleaned altitude, smoothed to a window sized to the file&apos;s own sample rate so a noisy
            baro trace doesn&apos;t turn into a noisier velocity. Derived velocity is reliable through
            the slower parts of a flight and softer at peak speed; it&apos;s labelled wherever it
            appears.
          </Method>
          <Method title="Acceleration">
            Used directly from the accelerometer when present, otherwise derived from velocity. Max
            acceleration is read over the boost; max deceleration over the same ascent.
          </Method>
          <Method title="Liftoff & burnout">
            With an accelerometer, liftoff is the first sustained kick above about 2 g and burnout is
            where axial acceleration falls back through zero — the end of thrust. With baro only,
            liftoff is the first real climb off the pad and burnout is taken at peak velocity, which
            is where a coasting rocket&apos;s speed turns over.
          </Method>
          <Method title="Deployments & descent rates">
            After apogee, Debrief looks for a clear, sustained drop in descent speed — a fast drogue
            descent giving way to a slow main — and marks it as the main deployment. Descent rates are
            the average vertical speed over each phase. A single-deploy flight shows one descent rate
            and no separate main event. Marginal transitions are left unmarked rather than guessed.
          </Method>
          <Method title="Mach & temperature">
            The speed of sound is computed from the ground temperature where the logger records it,
            falling back to a 15&nbsp;°C standard day. Mach is max velocity over that speed of sound,
            so on a hot or cold day expect it to shift slightly.
          </Method>
          <Method title="Formats & privacy">
            Altus Metrum (AltOS) and PerfectFlite (StratoLogger) files are recognised and parsed
            automatically; more loggers are being added, and the generic-CSV mapper — which also reads
            header-less exports — covers the rest in the meantime. Files are read with the browser&apos;s
            own file API and never uploaded — the analysis you see ran entirely on your device. For live
            motor stock and pricing, see the{' '}
            <a
              href={MOTOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 underline hover:text-indigo-500 dark:text-indigo-400"
            >
              HPR Motor Finder
            </a>
            .
          </Method>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function Method({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-medium text-zinc-800 dark:text-zinc-200">{title}</h3>
      <p className="mt-1 max-w-3xl">{children}</p>
    </div>
  );
}
