import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import Analyzer from '@/components/Analyzer';

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
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

        <div className="mt-6 grid gap-x-8 gap-y-5 text-sm leading-relaxed text-zinc-600 sm:grid-cols-2 dark:text-zinc-400">
          <Method title="Ground baseline & altitude">
            From the logger&apos;s own altitude channel, or from barometric pressure (with the standard
            atmosphere) when it only logs pressure. The pad level is the median of the opening samples,
            so everything reads as height above the pad (AGL). Baro altitude drifts with weather and
            the airframe&apos;s own airflow — good to a few metres, not centimetres.
          </Method>
          <Method title="Apogee">
            The peak of a spike-cleaned altitude trace. A short median filter removes the one- or
            two-sample jump an ejection charge punches into a baro trace — what makes a naïve
            &ldquo;highest reading&rdquo; report an apogee that never happened — while leaving the true
            peak untouched.
          </Method>
          <Method title="Velocity & max velocity">
            Used straight from the device when it logged a velocity (an accelerometer-integrated speed
            is best through the fast boost); otherwise it&apos;s the time-derivative of the cleaned
            altitude, smoothed to the file&apos;s own sample rate. Derived velocity is softer at peak
            speed, and labelled wherever it appears.
          </Method>
          <Method title="Acceleration">
            Used directly from the accelerometer when present, otherwise derived from velocity. Max
            acceleration is read over the boost, the average over the same boost (ignition to
            burnout), and max deceleration over the ascent. If the trace
            flat-tops at its peak — how a sensor reads once it hits its full-scale limit and
            saturates — the maximum is flagged as <em>may be clipped</em>, since the real peak could
            be higher.
          </Method>
          <Method title="Thrust-to-weight (off the pad)">
            The accelerometer&apos;s reading in g right at liftoff is the thrust-to-weight ratio —
            at low speed drag is negligible, so the specific force it senses is just thrust over
            weight. It&apos;s the &ldquo;5:1 rule&rdquo; number, the rail-departure safety check,
            measured rather than predicted. Only from a real accelerometer (averaged over a moment
            off the pad), and withheld when the trace was saturated at liftoff — a railed sensor
            would read a floor, not the true thrust.
          </Method>
          <Method title="Liftoff & burnout">
            With an accelerometer, liftoff is the first sustained kick above about 2 g and burnout is
            where axial acceleration falls back through zero. With baro only, liftoff is the first real
            climb off the pad and burnout is taken at peak velocity, where a coasting rocket&apos;s
            speed turns over.
          </Method>
          <Method title="Rail-exit velocity">
            How fast the rocket was moving when it cleared the rail, read from the flown velocity at
            the height one rail-length above the pad (you pick the rail length). It&apos;s a
            measurement, not a prediction; on a logger without its own velocity it rides on the derived
            velocity and is labelled approximate.
          </Method>
          <Method title="Coast efficiency">
            After burnout the rocket coasts on the energy it has; with no drag it would trade all of
            its burnout speed for height — a vacuum coast of v²/2g above burnout. Comparing that to
            the height actually gained reads off how much of the coast drag ate: the efficiency, and
            the altitude drag cost. Pure energy conservation on the flown numbers, no aerodynamic
            model. It assumes a near-vertical flight (a tilted one reads lower, since some coast went
            sideways) and rides on the burnout velocity, so it&apos;s withheld when that&apos;s too
            soft to trust.
          </Method>
          <Method title="Ejection delay">
            For a motor-ejection flight, the ideal motor delay is the coast time — the interval
            from burnout to apogee, where the rocket has slowed to a stop and a charge deploys most
            gently. Debrief measures that coast directly, so it frames it as the delay to load and,
            given the printed delay you flew, reads off how far before or after apogee that charge
            actually fired (delay − coast time). A reading of the flown flight, not a prediction; the
            offset is only as sharp as the burnout and apogee it sits between.
          </Method>
          <Method title="Drag coefficient">
            Back-calculated from the coast: after burnout and before apogee the only forces are
            gravity and drag, so the deceleration is a direct reading of the drag the airframe had
            on this flight. From the coast deceleration, the air density, and the coast mass and body
            diameter you supply: C<sub>d</sub> = 2&nbsp;·&nbsp;m&nbsp;·&nbsp;(drag deceleration) ÷
            (ρ&nbsp;·&nbsp;v²&nbsp;·&nbsp;A). It&apos;s a measurement of the flown flight, not a
            prediction — the figure to check your simulation&apos;s assumed C<sub>d</sub> against.
            C<sub>d</sub> rises through the transonic region, so the value is the median over the
            faster part of the coast, with the Mach window shown; a derived (baro) velocity makes it
            softer and it&apos;s flagged approximate.
          </Method>
          <Method title="Parachute Cd">
            How the main actually performed: under a steady canopy the rocket is at terminal
            velocity, where drag balances weight, so C<sub>d</sub> = 2&nbsp;·&nbsp;m&nbsp;·&nbsp;g ÷
            (ρ&nbsp;·&nbsp;v²&nbsp;·&nbsp;A) falls straight out of the measured main descent rate, with
            the descending mass and canopy diameter you supply (A is the canopy area, ρ the low-air
            density). A measurement of the flown descent, not a prediction — check it against the
            rule of thumb (~0.75 for a flat sheet, ~1.5 for a domed chute). It assumes the main
            reached a steady rate.
          </Method>
          <Method title="Landing energy">
            How hard it came in: ½&nbsp;·&nbsp;m&nbsp;·&nbsp;v², from the descent rate measured near
            touchdown and the descending mass you enter. Reported in ft·lbf and joules — a measurement
            of the flight you flew, shown only when the log descended to a readable landing rate.
          </Method>
          <Method title="Deployment shock">
            When the logger recorded acceleration, the peak the airframe felt as the apogee charge
            and the main fired — the snatch force that breaks shock cords and zippers tubes — read
            straight from the accelerometer at each deployment. A gentle deployment shows none; a
            coarse sample rate undersamples the spike, so read it as a floor, not a ceiling.
          </Method>
          <Method title="Deployments & descent rates">
            After apogee, Debrief looks for a clear, sustained drop in descent speed — a fast drogue
            giving way to a slow main — and marks it as the main deployment. Descent rates are the
            average vertical speed over each phase; a marginal transition is left unmarked rather than
            guessed.
          </Method>
          <Method title="Recovery (ground track)">
            When the logger recorded a GPS track, Debrief projects the latitude/longitude onto a
            north-up, equal-scale map and reads off how far and which way the rocket landed, and the
            furthest it drifted. Positions are GPS, good to a few metres; no map tiles are fetched —
            it&apos;s drawn from your own fixes. Under canopy the rocket drifts with the air, so the
            mean drift velocity over the descent is read off as the <em>wind aloft</em> it actually
            fell through — a measurement of the day&apos;s conditions, not a forecast. The apogee&apos;s
            horizontal offset from the pad gives how far <em>off vertical</em> the ascent flew
            (weathercocking into the wind, plus the drift during the slow coast) — a lean that costs
            altitude to the cosine and carries the rocket further downrange.
          </Method>
          <Method title="Roll &amp; spin">
            When the logger recorded a roll-rate channel (angular rate about the long axis), Debrief
            reports the peak rate and the total revolutions the airframe turned through — the
            integral of the rate over the flight, so a spin either way counts. Fins induce roll, and
            too much of it bleeds energy and can drive coning, so it&apos;s worth a look. It reads a
            roll column you map (or one a logger labels &ldquo;roll&rdquo;); a bare three-axis gyro
            is left alone, since which axis is roll is logger-specific.
          </Method>
          <Method title="Battery">
            When the logger recorded its battery voltage, the resting voltage at the start and the
            lowest it sagged to. A pack that droops under the current a deployment charge draws can
            fail to fire it, so the drop is worth a look — though what counts as low depends on your
            battery, so it&apos;s reported plainly, not judged.
          </Method>
          <Method title="Mach & dynamic pressure">
            The speed of sound comes from the ground temperature where the logger records it, else a
            15&nbsp;°C standard day; Mach is velocity over that. The explorer also derives a
            dynamic-pressure channel (½&nbsp;ρv²), with air density anchored to the pad&apos;s own
            conditions — so a high-elevation launch reads its real, thinner air. Both ride on the
            derived velocity, so they soften near peak speed.
          </Method>
          <Method title="Logbook & backup">
            Flights you open are remembered in this browser (IndexedDB) for quick re-opening,
            and a note keeps one as a permanent logbook entry. Because that lives only on this
            device, <em>Export</em> bundles the whole logbook — flights and notes — into a JSON
            file you keep, and <em>Import</em> merges it back, so a new machine or a cleared
            browser doesn&apos;t lose it. The file never leaves your device; it&apos;s yours to
            store wherever you like.
          </Method>
          <Method title="Formats & privacy">
            Altus Metrum (AltOS), PerfectFlite, Eggtimer, Featherweight (Raven, Blue Raven and GPS)
            and Entacore AIM files are recognized automatically; the generic-CSV mapper — which also
            reads header-less exports — covers everything else. Files are read with the browser&apos;s
            own file API and never uploaded.
          </Method>
          <Method title="What Debrief isn't">
            Debrief reads flights you have already flown. It is <em>not</em> a simulator: it doesn&apos;t
            predict performance, recommend motors, or model anything you haven&apos;t flown. To plan a
            flight <em>before</em> you fly it, reach for a dedicated, well-validated rocketry simulator —
            this is a hobby where that margin matters.
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
