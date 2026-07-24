import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { SITE_URL } from '@/lib/links';

export const metadata: Metadata = {
  title: 'Where the numbers come from — Debrief',
  description:
    'How Debrief works out every flight number — apogee, velocity, acceleration, thrust-to-weight, drag and parachute Cd, recovery drift and more — and exactly where each one can be wrong. A measurement instrument, not a simulator.',
  alternates: { canonical: `${SITE_URL}/methods/` },
};

export default function MethodsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <SiteHeader />

      <section className="mt-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Where the numbers come from
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
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

        <div className="mt-6 grid gap-x-8 gap-y-5 text-sm leading-relaxed text-zinc-600 sm:grid-cols-2 dark:text-zinc-400">
          <Method title="Ground baseline & altitude">
            From the logger&apos;s own altitude channel, or from barometric pressure (with the standard
            atmosphere) when it only logs pressure. The pad level is the median of the opening samples,
            so everything reads as height above the pad (AGL). Baro altitude drifts with weather and
            the airframe&apos;s own airflow — good to a few metres, not centimetres. Above ~36,000&nbsp;ft
            (11&nbsp;km), the top of the troposphere, the constant-lapse standard-atmosphere model behind
            any barometric altitude stops holding and the reading under-reads; a flight that high is
            flagged, and a GPS or inertial altitude is more trustworthy up there.
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
            speed, and labelled wherever it appears. A peak beyond any rocket — the fastest amateur
            flights reach ~Mach&nbsp;6 — is not flight but a mis-scaled or misidentified velocity
            column (a raw sensor count read as a speed); such a reading is withheld, along with
            everything derived from it — Mach, max-Q, the burnout velocity and the coast efficiency —
            rather than reported as an impossible number.
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
            How fast the rocket was moving when it cleared the rail (you pick the rail length) — found by
            integrating the flown velocity from liftoff until the rocket has covered one rail-length of
            travel, and reading the velocity there. It&apos;s a measurement, not a prediction. Rail
            clearance happens in the first metre or two, where a barometric altitude is coarsest and a
            barometric velocity is far too soft to read — so this needs a logged (accelerometer) velocity,
            and is withheld on a baro-only or GPS log rather than shown as a number that low can&apos;t
            support.
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
            reached a steady rate. The same reading is offered for the <em>drogue</em> on a dual-deploy
            flight — the fast fall between apogee and the main, worked with the thinner air density up
            there — flagged approximate, since a small drogue may not be fully at terminal velocity.
          </Method>
          <Method title="Landing energy">
            How hard it came in: ½&nbsp;·&nbsp;m&nbsp;·&nbsp;v², from the descent rate measured near
            touchdown and the descending mass you enter. Reported in ft·lbf and joules — a measurement
            of the flight you flew, shown only when the log descended to a readable landing rate. The
            landing speed is also given as the free-fall <em>drop height</em> that reaches it
            (h&nbsp;=&nbsp;v²/2g) — exact and mass-free, the gut-feel &ldquo;it came in like a drop from
            here&rdquo; for judging whether a landing was too hard.
          </Method>
          <Method title="Deployment shock">
            When the logger recorded acceleration, the peak the airframe felt as the apogee charge
            and the main fired — the snatch force that breaks shock cords and zippers tubes — read
            straight from the accelerometer at each deployment. A gentle deployment shows none; a
            coarse sample rate undersamples the spike, so read it as a floor, not a ceiling.
          </Method>
          <Method title="Main deploy altitude">
            On a dual-deploy flight the altimeter fires the main at a set altitude. Debrief detects
            the main deployment and the AGL altitude it happened at, so it reads off where the main
            actually fired — and, given the altitude you set, how close the two were. It also shows
            how far the rocket fell under drogue first (apogee minus the main altitude). A reading of
            the flown flight and a safety check: a main that fires well below its setting lands hard.
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
            fell through — a measurement of the day&apos;s conditions, not a forecast. Binning that
            drift by altitude gives the wind <em>profile</em> — the speed and direction in each layer,
            so the shear with height shows; the slow, low layers (under the main) read cleanest, and a
            sparse fast layer is dropped rather than guessed. The apogee&apos;s
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
            The speed of sound comes from the air temperature, which falls with altitude on the
            standard-atmosphere lapse rate — anchored to the ground temperature the logger records
            (else a 15&nbsp;°C standard day, and likewise when a recorded pad temperature falls outside
            the range Earth&apos;s surface actually reaches, e.g. a mis-scaled sensor column) and
            levelling off at the tropopause (~11&nbsp;km). Mach
            is velocity over that <em>local</em> speed of sound, so a peak reached a few thousand feet
            up is read against the colder, slower air it was actually in, not the ground value (a
            touch higher than a ground-temperature divisor, and more so with height). Dynamic pressure
            (½&nbsp;ρv²) uses air density from the same lapse, anchored to the pad&apos;s own conditions
            — so a high-elevation launch reads its real, thinner air. Both ride on the velocity, so
            they soften near peak speed.
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
            Altus Metrum (AltOS), PerfectFlite, Eggtimer, Featherweight (Raven, Blue Raven and GPS),
            Entacore AIM and MissileWorks RRC3 (mDACS) files are recognized automatically; the
            generic-CSV mapper — which also reads header-less exports (guessing the time and altitude
            columns from the data&apos;s own shape, and reading any unit the values carry in-cell, such as
            a &deg;F temperature, to settle whether the altitude is in feet or metres) and UTF-16 files
            (decoding them from their byte-order mark, as a Windows RRC3 mDACS text export needs) — covers
            everything else. The RRC3 export names no units, so — like a metric-configured Eggtimer — its
            altitude is ambiguous between feet and metres; Debrief settles it from physics, reading the
            altitude in whichever unit matches the apogee its own barometric-pressure column implies.
            Files are read with the browser&apos;s own file API and never uploaded.
          </Method>
          <Method title="What Debrief isn't">
            Debrief reads flights you have already flown. It is <em>not</em> a simulator: it doesn&apos;t
            predict performance, recommend motors, or model anything you haven&apos;t flown. To plan a
            flight <em>before</em> you fly it, reach for a dedicated, well-validated rocketry simulator —
            this is a hobby where that margin matters.
          </Method>
        </div>
      </section>

      <p className="mt-10 border-t border-zinc-200 pt-5 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <Link href="/" className="underline hover:text-zinc-700 dark:hover:text-zinc-300">
          ← Back to Debrief
        </Link>
      </p>

      <SiteFooter />
    </main>
  );
}

function Method({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-medium text-zinc-800 dark:text-zinc-200">{title}</h2>
      <p className="mt-1 max-w-3xl">{children}</p>
    </div>
  );
}
