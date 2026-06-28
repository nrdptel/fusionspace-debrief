import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import Analyzer from '@/components/Analyzer';

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <SiteHeader />

      <details className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40 print:hidden">
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
              between feet and meters (top-right of the report); acceleration is always in g. Your
              choice is remembered and rides in the URL.
            </li>
            <li>
              <strong className="font-medium text-zinc-800 dark:text-zinc-200">Share</strong> —{' '}
              <em>Share link</em> copies a link with the whole flight encoded inside it. The data rides
              in the link itself and is decoded in the recipient&apos;s browser — it never touches a
              server. A very large flight can be too big for a link; save the chart or summary instead.
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

      <section className="mt-16 border-t border-zinc-200 pt-8 dark:border-zinc-800 print:hidden">
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
            as good to a few meters, not centimeters.
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
            the slower parts of a flight and softer at peak speed; it&apos;s labeled wherever it
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
          <Method title="Rail-exit velocity">
            How fast the rocket was moving when it cleared the launch rail — the airspeed its fins
            had to keep it pointed straight at the most critical moment of the flight. Debrief reads
            the flown velocity at the height one rail-length above the pad (you pick the rail length),
            interpolating between samples. It&apos;s a measurement, not a prediction — nothing is
            modelled. On a logger that didn&apos;t record velocity it rides on the derived velocity and
            is labeled approximate, and a clearance speed on the low side is flagged as a gentle
            heads-up, not a rule.
          </Method>
          <Method title="Recovery (ground track)">
            When the logger recorded a GPS track, Debrief projects the latitude/longitude onto a
            north-up, equal-scale map of metres around the pad and reads off how far and which way the
            rocket landed, plus the furthest it drifted. The pad reference is the median of the opening
            fixes; positions are GPS, so they&apos;re good to a few metres. No map tiles are fetched —
            it&apos;s drawn from your own fixes, entirely in the browser.
          </Method>
          <Method title="Deployments & descent rates">
            After apogee, Debrief looks for a clear, sustained drop in descent speed — a fast drogue
            descent giving way to a slow main — and marks it as the main deployment. Descent rates are
            the average vertical speed over each phase. A single-deploy flight shows one descent rate
            and no separate main event. Marginal transitions are left unmarked rather than guessed.
          </Method>
          <Method title="Landing energy">
            How hard the rocket came in: ½&nbsp;·&nbsp;m&nbsp;·&nbsp;v², from the descent rate measured
            near touchdown and the descending mass you enter (the log can&apos;t know your rocket&apos;s
            mass). Reported in ft·lbf and joules — the figure a certification flight card and many club
            waivers ask for. It&apos;s a measurement of the flight you flew, not a prediction, and it&apos;s
            shown only when the log actually descended to a readable landing rate. Compare it against
            your own club or certification limit.
          </Method>
          <Method title="Mach & temperature">
            The speed of sound is computed from the ground temperature where the logger records it,
            falling back to a 15&nbsp;°C standard day. Mach is max velocity over that speed of sound,
            so on a hot or cold day expect it to shift slightly.
          </Method>
          <Method title="Mach & dynamic-pressure channels">
            The explorer offers two derived engineering channels. <em>Mach</em> is velocity over the
            speed of sound at each instant. <em>Dynamic pressure</em> is ½&nbsp;ρv², where the air
            density&nbsp;ρ comes from a standard-atmosphere lapse anchored to the pad&apos;s own
            temperature and pressure — so a high-elevation launch reads its real, thinner air. When
            the logger records no pressure, a standard sea-level pad is assumed, so dynamic pressure
            is an estimate that tracks the shape (and the max-Q point) more reliably than the absolute
            value. Both ride on the derived velocity, so they inherit its softness near peak speed.
          </Method>
          <Method title="Formats & privacy">
            Altus Metrum (AltOS), PerfectFlite (StratoLogger / Pnut), Eggtimer, Featherweight
            (Raven via the Interface Program, Blue Raven, and the GPS tracker) and Entacore AIM files
            are recognized and parsed automatically; more loggers are being added, and the generic-CSV
            mapper — which also reads header-less exports — covers the rest in the meantime. Files are
            read with the browser&apos;s own file API and never uploaded — the analysis you see ran
            entirely on your device.
          </Method>
          <Method title="What Debrief isn't">
            Debrief reads and analyzes flights you have already flown. It is <em>not</em> a simulator: it
            doesn&apos;t predict or estimate how a rocket will perform, recommend motors, or model
            anything you haven&apos;t flown. Every number on the page is read or derived from your
            logger&apos;s own recording — nothing more. It&apos;s a standalone tool and works entirely on
            its own. To plan or predict a flight <em>before</em> you fly it, reach for a dedicated,
            well-validated rocketry flight simulator — this is a hobby where that margin matters.
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
