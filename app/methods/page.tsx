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
      <SiteHeader brandAsHeading={false} />

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
          <Method title="The GPS recording, where the file has one">
            Some loggers write the receiver&apos;s own altitude beside the barometer&apos;s — a
            different sensor, indifferent to the weather and to the shock over a static port. Debrief
            keeps it as a <em>second recording</em> and states its apogee beside its own, never
            averaging the two: where they agree that is real corroboration, and where they don&apos;t
            the gap is the finding. Across the corpus the two differ by &minus;2.7% to +6.5%. The
            analysis itself stays on the barometric channel, which doesn&apos;t jump metres between
            fixes. Two things have to hold before a GPS figure is a reading. It needs <em>four</em> satellites. Three
            give a 2D fix — latitude and longitude solved on an assumed height — because a receiver
            solves for x, y, z and its own clock bias, four unknowns needing four satellites; and a
            receiver with none doesn&apos;t report nothing, it repeats its last position and altitude
            (one corpus flight loses lock through the whole boost and writes its pad altitude all the
            way to 2,400&nbsp;m). So a height beside a 2D fix is an assumption the receiver made,
            not something it measured, and it is dropped — while the position beside it is kept,
            because a 2D fix still walks you to the rocket. And the
            record has to have come back down from its peak, because a rocket returns to the ground:
            a GPS record whose highest sample is roughly where it stops never saw an apogee, it just
            stopped climbing. Two corpus flights are exactly that, and would otherwise have stated a
            0&nbsp;ft and a 20&nbsp;ft &ldquo;GPS apogee&rdquo; against 3,253&nbsp;ft and
            3,547&nbsp;ft flights. And the cross-check is judged on <em>when</em> as well as how
            high: apogee is one instant, so two recordings that put it seconds apart did not see the
            same one, and a close pair of heights is then a coincidence rather than corroboration.
            A corpus flight shows exactly that — a receiver whose altitude solution lags so far
            behind that it sits at pad level through the whole climb and peaks 34&nbsp;s later,
            under drogue, within 3% of the barometric apogee. Read as an agreement that would be a
            wrong number with a green badge; it reads &ldquo;not the same peak&rdquo;. The
            receiver&apos;s altitude and its satellite count are both in
            the explorer, so you can plot either against the barometric line.
          </Method>
          <Method title="Ground baseline & altitude">
            From the logger&apos;s own altitude channel, or from barometric pressure (with the standard
            atmosphere) when it only logs pressure. The pad level is the median of the opening samples,
            so everything reads as height above the pad (AGL). Baro altitude drifts with weather and
            the airframe&apos;s own airflow — good to a few metres, not centimetres. Above ~36,000&nbsp;ft
            (11&nbsp;km), the top of the troposphere, the constant-lapse standard-atmosphere model behind
            any barometric altitude stops holding and the reading under-reads; a flight that high is
            flagged, and a GPS or inertial altitude is more trustworthy up there.
          </Method>
          <Method title="Whether several recordings are one flight">
            A comparison&apos;s cross-check asks a specific question — if these are recordings of
            the same flight, how closely do they agree? — and that question has a premise the
            files can refute. Where two of them state a launch date and those dates are days
            apart, no reading of them is a redundant-altimeter agreement, and reporting a 139%
            apogee gap as an &ldquo;agreement to within 139%&rdquo; would dress a comparison of
            different flights as a failed reconciliation. So Debrief checks the dates the files
            themselves carry, and where they refute it, says plainly that these are different
            flights and that the figures are how far apart they are. A day of slack is allowed
            either way, because one recording can stamp UTC while another stamps a logger&apos;s
            own wall clock and an evening launch straddles midnight between them; and where
            fewer than two files state a date the question stays open, which is the honest
            answer. Nothing else about the comparison changes — the numbers are the same
            numbers, correctly introduced.
          </Method>
          <Method title="More than one flight in a file">
            A logger downloaded twice, or a whole launch day dumped at once, puts several flights in
            one file — and read as a single flight the record is nonsense: the highest point belongs
            to a later flight while liftoff belongs to the first, so time-to-apogee spans both. The
            test is something a rocket cannot do: return to the ground and climb again. Where that
            happens, Debrief reads the first flight, says how much of the file it used, and leaves the
            rest — split the file, or export the flights separately, to read the others. A dropout that
            reads zero <em>before</em> the rocket ever climbed (a GPS losing lock through the boost) is
            not a landing and never splits a file.
          </Method>
          <Method title="Apogee">
            The peak of a spike-cleaned altitude trace. A short median filter removes the one- or
            two-sample jump an ejection charge punches into a baro trace — what makes a naïve
            &ldquo;highest reading&rdquo; report an apogee that never happened — while leaving the true
            peak untouched. A fast logger sees a wider version of the same artefact: the charge vents
            the airframe and the trace swings for most of a second, too long for a median filter to
            remove, so the highest single sample can land well after the rocket started down. The peak
            is therefore looked for only up to the moment a sustained descent begins — a rocket
            cannot be descending before it has peaked. On one corpus Blue&nbsp;Raven log recorded at
            50&nbsp;Hz that moves apogee from 12,060&nbsp;ft to 11,766&nbsp;ft and 3.9&nbsp;s earlier,
            where the same file&apos;s inertial altitude and the flight&apos;s three other recordings
            (11,731, 11,734 and 12,001&nbsp;ft) all put it; time-to-apogee across the four went from
            a 4.6&nbsp;s spread to 0.7&nbsp;s. The transient itself is never edited out — it stays in
            the raw trace you can plot — it just isn&apos;t read as the summit. Two things keep this
            from touching a sound flight: the search for the descent starts only once the climb has
            passed half the height it reached, so a velocity wobbling either side of zero on the pad
            can&apos;t look like one, and a trace whose ascent velocity swings well negative is
            carrying noise rather than speed, so its sign is not used at all.
          </Method>
          <Method title="Velocity & max velocity">
            Used straight from the device when it logged a velocity (an accelerometer-integrated speed
            is best through the fast boost); otherwise it&apos;s the time-derivative of the cleaned
            altitude, smoothed to the file&apos;s own sample rate. Derived velocity is softer at peak
            speed, and labelled wherever it appears. A logged velocity column that turns out to be the
            file&apos;s <em>own altitude differenced sample to sample</em> is not a second reading at
            all — a baro-only altimeter has no speed sensor, so what it writes there carries the
            barometer&apos;s quantization as speed, and its peak is that noise (one real export of a
            Mach&nbsp;1.3 flight states 4,880&nbsp;ft/s). Debrief detects that case, re-derives the
            velocity from the same altitude with proper smoothing, and labels it derived. The weaker
            version of the same problem is a <em>filtered</em> barometric derivative, which no longer
            matches the raw difference and slips past that test — caught instead by asking what the
            device had to measure a speed <em>with</em>. A baro-only altimeter has one sensor, so its
            velocity column is worked out from its own pressure readings however the firmware smooths
            them, and it is labelled derived. A column counts as measured only where the file carries
            an accelerometer, a GPS fix (a Doppler speed is a real measurement), or the device&apos;s
            own inertial altitude — which can only come from an inertial sensor even when the export
            leaves the accelerometer out, as a Blue Raven&apos;s low-rate file does. Nine corpus
            flights used to read as measured with none of the three, among them 4,483&nbsp;ft/s on a
            4,661&nbsp;ft apogee and 2,671&nbsp;ft/s on 958&nbsp;ft; the numbers the device wrote are
            still shown, but they now carry every derived-velocity caveat. A peak beyond
            any rocket — the fastest amateur flights reach ~Mach&nbsp;6 — is not flight but a mis-scaled
            or misidentified velocity column (a raw sensor count read as a speed); such a reading is
            withheld, along with everything derived from it — Mach, max-Q, the burnout velocity and the
            coast efficiency — rather than reported as an impossible number. The same figures are
            withheld when the trace <em>swings below zero on the way up</em>: a climbing, accelerating
            rocket has no negative vertical velocity, so a trace that dips well under it there is
            carrying more noise than speed, and the peak beside those dips is that same noise. It is
            what a barometer records on an airframe that is tumbling or venting — a spent booster after
            separation — where the pressure at the port stops tracking altitude. Two altimeters that
            recorded one such booster agree on its apogee to the foot and read peaks of 1,500 and
            540&nbsp;ft/s, so the honest answer is that neither recording resolves the speed. Apogee,
            the timings and the descent still read normally from the altitude. A derived speed that peaks
            at or past the transonic region (about Mach&nbsp;0.9 up) carries a further caveat:
            approaching Mach&nbsp;1 the airflow over a barometric pressure port goes locally supersonic
            and a shock sits on it, distorting the sensed pressure and the speed read from it — and the
            error runs both ways. Two flights recorded on two devices each bracket it: one baro trace
            read Mach&nbsp;1.19 where its partner measured 0.93, another Mach&nbsp;2.64 where its
            partner measured 1.22. So no baro peak from Mach&nbsp;0.9 up can confirm the rocket went
            supersonic, nor bound how fast it really went. It&apos;s flagged, not withheld; an
            accelerometer, an inertial solution or GPS settles it.
          </Method>
          <Method title="When the accelerometer settles it">
            On a log that carries both channels, the accelerometer bounds a barometric speed from{' '}
            <em>above</em>: integrate the measured specific force less gravity from liftoff, crediting
            every measured g as vertical, and the result is a ceiling the rocket cannot have passed —
            an accelerometer reads the force along the airframe&apos;s axis, so a rocket leaning at all
            puts only a&nbsp;cos(lean) of it into the climb while this sum takes all of it. Drag needs
            no allowance here: it is already in the reading, which is why the same sum falls back again
            through the coast. The unpowered coast bounds it from <em>below</em>: climbing Δh from the end of
            thrust to apogee with the motor out needs at least √(2gΔh). Where those two bracket a real
            speed and the barometric peak reads outside the bracket, the barometer is wrong rather than
            merely soft, and the speed figures are withheld with the bracket named. Four flights of one
            home-built altimeter show it: barometric peaks of Mach&nbsp;0.9–1.65 on ~2,450&nbsp;ft
            apogees, where each flight&apos;s own accelerometer allows about Mach&nbsp;0.4 and its coast
            demands at least about Mach&nbsp;0.3. The bound is only used where the coast corroborates it
            — a channel read on a different convention, or sampled too coarsely to integrate, produces a
            ceiling below the speed the climb demonstrably required (one consumer altimeter&apos;s sample
            flight caps at 2&nbsp;ft/s against a 666&nbsp;ft apogee), and that is a broken bound, not a
            broken barometer. A margin of half again over the ceiling is allowed before the barometer is
            called wrong, because a discrete integral can under-read a thrust spike between samples: on
            the corpus flights where a device velocity settles the truth, the barometric trace still runs
            up to 38% over the ceiling while being right.
          </Method>
          <Method title="The altitude a reading happened at">
            Burnout, the speed peak, the Mach-1 crossing and max-Q are each reported with the altitude
            they occurred at — and every one of them lands in the stretch where a barometric port is
            least trustworthy. Through the transonic push the shock over the port drives the sensed
            pressure up, which reads as the rocket <em>descending</em>: one corpus flight&apos;s trace
            drops to 307&nbsp;ft below its pad while the same device&apos;s inertial channel climbs past
            1,700&nbsp;ft, and another reads 1,095&nbsp;ft below a height it had already recorded. A
            climbing rocket can do neither. The same shock runs the other way on other airframes,
            driving the sensed pressure <em>down</em> so the trace climbs faster than the rocket did —
            and a running maximum cannot see that, because the altitude never goes backwards. What
            catches it is a bound rather than a tolerance: over any stretch a rocket&apos;s mean climb
            rate cannot exceed the fastest it was going during that stretch, and where the flight has a
            measured speed the fastest it was going is in the file. So the height gained since liftoff
            is capped by (peak speed so far)&nbsp;×&nbsp;(time since liftoff). One corpus flight reports
            a burnout altitude of 2,495&nbsp;ft where its own inertial speed record allows under
            900&nbsp;ft. The cap applies only where the speed is <em>measured</em> — a barometric
            velocity is worked out from this very altitude trace, so it would be testing the trace
            against itself — and reading an axial speed as vertical only makes the cap more generous,
            which is the right direction for a guard. Across the whole corpus it changes exactly that
            one figure. Where the record contradicts itself either way — below the
            pad, well below a height already passed, or above what its own speed record allows —
            Debrief looks for a second altitude recording
            in the same file: where the logger solved for an inertial altitude (a Blue Raven does) and
            that solution satisfies the bound the barometer just failed, the reading is taken
            from it instead. On the flight above that turns 2,495&nbsp;ft into 564&nbsp;ft. On that flight it turns a burnout altitude of &minus;307&nbsp;ft into
            1,583&nbsp;ft, which checks out against the flight&apos;s own burnout speed and time
            (v&nbsp;·&nbsp;t&nbsp;÷&nbsp;2&nbsp;&asymp;&nbsp;1,366&nbsp;ft, a lower bound since thrust
            tapers). With no second recording to turn to, the altitude for that reading is withheld and
            shown as &ldquo;—&rdquo;, because the file cannot say how high the rocket was there. The
            time and the speed of the reading are unaffected, so are apogee and the descent, and the
            altitude chart still shows the trace exactly as recorded. Ordinary barometric wander is far
            below the bar: across the corpus every sound flight&apos;s read-offs sit within 72&nbsp;ft
            of the record, and the three that trip it are 557 to 1,125&nbsp;ft out. Where the logger
            solved for an <strong>inertial altitude</strong> of its own (a Blue Raven does), Debrief
            carries it as a second altitude recording you can plot against the barometric line — on
            that same flight it reads 1,710&nbsp;ft at the instant the barometer reads 493&nbsp;ft
            below the pad, and only one of those can be a height. The analysis stays on the barometric
            channel, which is the one that doesn&apos;t drift over a whole flight; the two are shown
            side by side rather than merged.
          </Method>
          <Method title="Acceleration">
            Read from the accelerometer when the logger recorded one: max acceleration over the boost,
            the average over the same boost (ignition to burnout), and max deceleration over the ascent.
            If the trace flat-tops at its peak — how a sensor reads once it hits its full-scale limit
            and saturates — the maximum is flagged as <em>may be clipped</em>, since the real peak could
            be higher. With no accelerometer, acceleration is a second derivative of the barometric
            altitude, and the coarse, quantised baro trace makes its <em>peak</em> (and even its boost
            average) noise, not a measurement — a real flight can read hundreds of g off a single
            altitude step — so those numbers are withheld, and the acceleration trace isn&apos;t charted,
            offered in the explorer or comparison, or written into the data export either (its shape is the
            same noise). The velocity — a first derivative, and usable — still is, labelled as derived.
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
            guessed. Each phase also has to be <em>in</em> the record to be read: a rate is reported
            only where the log shows that leg dropping more than a tenth of the height it started
            from, so a log that stops in mid-air moments after a deployment reports nothing for the
            leg it barely caught. One corpus recording loses power 1.3&nbsp;s after its main fires at
            1,877&nbsp;ft; the samples left average to 2&nbsp;ft/s where the second altimeter on the
            same flight reads 57. Two feet per second is the end of the record, not a descent.
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
          <Method title="The device's own summary, dropped alongside">
            Some altimeter apps write a summary file next to the log — the device&apos;s own
            headline figures, with no time series in it. Drop the pair together and Debrief reads
            the flight from the log and puts those figures beside its own read as a cross-check,
            matched up by the rocket name the summary itself states. They are never merged into the
            read: two measurements that agree build confidence, and a gap is worth a look. The unit
            is taken from the value the file states (&ldquo;4034.98 feet&rdquo;) rather than assumed,
            since the same app can be set to metric, and a figure whose unit doesn&apos;t resolve is
            left out rather than guessed at. Only figures that line up against something Debrief
            measures are read — a GPS summary&apos;s &ldquo;distance at apogee&rdquo; is downrange,
            not altitude, and mapping it would invent a disagreement out of a sound read.
          </Method>
          <Method title="When the flight flew">
            Where the file says, Debrief reads the flight&apos;s own date and time and shows it beside
            the read — on the report, in every export, and as the launch day in your logbook, which
            you can sort and search by. Three of the loggers here state it: Altus Metrum and a
            Featherweight GPS write a GPS&apos;s <strong>UTC</strong>, and a Blue Raven writes its own
            wall clock with no zone at all. A file Debrief doesn&apos;t recognize can state it too:
            the column mapper takes a whole stamp in one cell
            (<span className="font-mono">2024-05-11 14:09:44</span>) or the calendar parts in columns
            of their own (<span className="font-mono">Year, Month, Day</span>, with an hour/minute/second
            or a clock cell beside them), and reads it back to you before you analyze. Those columns
            carry no format Debrief knows, so a mapped date is the <em>logger&apos;s</em> clock unless
            the cell itself says UTC — guessing a zone would move the flight an hour, and sometimes a
            day. Whose clock it is is kept and labelled, and nothing is ever
            converted between zones — one corpus flight recorded on both devices reads 14:55 on the
            Blue Raven and 22:55 UTC on the GPS, and re-projecting either into your browser&apos;s zone
            would land it on the wrong hour and sometimes the wrong day. A file that states no date
            gets none: the file&apos;s modification time is when it was copied off the altimeter, not
            when it flew. A clock that was never set is dropped rather than shown (a GPS with no lock
            writes zeros), but a clock that was set <em>wrongly</em> is reported as the file states it —
            one corpus TeleMetrum insists on 27 Apr 2013 for a flight flown in October 2023, and that
            is the device&apos;s own record, not something to quietly correct.
          </Method>
          <Method title="What the charts show, and what they leave out">
            The three plots open on <strong>the flight</strong> — from just before liftoff to just
            after touchdown — not on the whole file. A logger armed early records the pad wait, and
            one corpus TeleMega holds 308 seconds of it in front of a 76-second flight: opened on the
            record, four fifths of that chart is a rocket standing still and the boost is a sliver.
            Nothing is dropped or trimmed from the data. <em>Full record</em> shows the file end to
            end, the zoom row says which view you are looking at, and dragging across any chart zooms
            all three together. The saved figures and the shareable card are framed the same way as
            the screen, so a document says what the page said.
          </Method>
          <Method title="What goes in the report">
            A report is written for a purpose, so what it carries is yours to set. The chooser
            under the tiles picks the <strong>readings</strong>; the row under the charts picks the{' '}
            <strong>figures</strong> — a certification package often wants the altitude trace and
            nothing else, a drag study wants all three. Both choices are stored on this device and
            followed by every written format: the .txt, the Markdown, the self-contained HTML and the
            bundle. Neither touches what Debrief draws or computes on screen, and neither touches the
            data exports: the analyzed-series CSV and the structured JSON stay complete, because a
            consumer reading <span className="font-mono">debrief.flight/1</span> expects every key it
            knows to be there. Trimming a report is a presentation choice; trimming a data contract
            is a broken file.
          </Method>
          <Method title="The samples themselves">
            Under the explorer&apos;s plot is every sample in the window, exact and in your units —
            nothing decimated away, because a sample you can&apos;t see is a sample you can&apos;t
            check. <em>Jump to</em> scrolls straight to a liftoff, burnout, apogee or deployment and
            highlights the row it landed on, and <strong>any column sorts</strong> (click once for
            highest first, again for lowest, a third time back to the order the flight was recorded
            in). Sorting a time series is not idle: sorting altitude descending is how you tell a
            real apogee from a one-sample spike — the top of the list either steps down gently or
            starts with an outlier, and the second reading is the honest one.
          </Method>
          <Method title="Named views">
            The explorer remembers how you last set it up, and you can also keep several plots under
            names you choose — the boost, the deployments, the airframe&apos;s health — and switch
            between them on any flight. A view names its channels rather than their column numbers,
            since column 3 means something different in every logger&apos;s export, so a saved view
            follows you across loggers and restores only the channels the flight in front of you
            actually has. Kept on this device, like the rest of Debrief&apos;s state.
          </Method>
          <Method title="A file Debrief doesn&apos;t recognize">
            An unrecognized export goes to the column mapper, where you say which column is
            which — and Debrief <strong>keeps that answer</strong> with the flight. Reopening it
            from the logbook comes straight back to the flight rather than asking again, and it can
            join a comparison named by id like any auto-detected file; before, the mapping lived
            only in the moment you made it, and both of those paths quietly lost the flight. A
            logbook backup carries the mapping too. Drop a launch day&apos;s folder at once and the
            files that need mapping aren&apos;t left out either: the comparison offers each one by
            name, and mapping it puts it back with the flights it arrived with. A file with no
            columns of numbers in it — a binary download off the device, a screenshot — is not
            offered, because there is nothing there to map, and it says so instead.
          </Method>
          <Method title="Logbook & backup">
            Flights you open are remembered in this browser (IndexedDB) for quick re-opening,
            and a note keeps one as a permanent logbook entry. Because that lives only on this
            device, <em>Export</em> bundles the whole logbook — flights and notes — into a JSON
            file you keep, and <em>Import</em> merges it back, so a new machine or a cleared
            browser doesn&apos;t lose it. The file never leaves your device; it&apos;s yours to
            store wherever you like.
          </Method>
          <Method title="Units">
            Every number is stored in SI internally and converted once for display, so the unit you
            read a flight in never changes the analysis. The unit is chosen <em>per quantity</em>, not
            as one of two systems: altitude in feet or metres, speed in ft/s, mph, m/s, km/h or knots,
            acceleration in g, m/s&sup2; or ft/s&sup2;, temperature in &deg;F or &deg;C, dynamic
            pressure in psi or kPa. A US club quotes feet and mph, a certification document may want
            metres and m/s, a drag write-up wants m/s&sup2; — none of those is one system. One click
            still switches the whole set between feet and metres. The choice reaches every number,
            chart axis and export together, is remembered on this device, and rides in the URL, so a
            shared link opens reading the way it was sent. Thrust-to-weight stays a ratio and Mach
            stays a number, since neither has a unit to pick; the mass and diameter you type for the
            drag, parachute and landing-energy readings follow whichever system your altitude is in.
          </Method>
          <Method title="Offline">
            One visit with a signal is enough: as soon as the service worker takes control, the page
            hands it the list of what it just loaded, so the shell, the app&apos;s code and the
            sample flight are all cached — Debrief used to need a second visit before an offline one
            worked. These documentation pages are cached on install too, <em>with the code each one
            needs to come up</em> — a cached document alone is not a page, and a route whose scripts
            are missing shows an error instead of itself — so the methods and the limitations are
            readable at the field with no bars, as themselves rather than as the home page. Only
            Debrief&apos;s own static files are stored, locally; no flight log is ever cached,
            uploaded, or sent anywhere.
          </Method>
          <Method title="Formats & privacy">
            Altus Metrum (AltOS), PerfectFlite, Eggtimer, Featherweight (Raven, Blue Raven and GPS),
            Entacore AIM and MissileWorks RRC3 (mDACS) files are recognized automatically; the
            generic-CSV mapper — which also reads header-less exports (guessing the time and altitude
            columns from the data&apos;s own shape, and reading any unit the values carry in-cell, such as
            a &deg;F temperature, to settle whether the altitude is in feet or metres), UTF-16 files
            (decoding them from their byte-order mark, as a Windows RRC3 mDACS text export needs) and a
            header line a logger forgot to end (where its first record arrives fused onto the column
            names — the record is recovered and the names split back out, instead of showing you dozens
            of columns named after numbers) — covers everything else. A logger&apos;s <em>summary</em>
            export (the key-and-value file Featherweight&apos;s app saves beside a Blue Raven or GPS log)
            holds headline figures and no flight record, so Debrief names it, reads its figures back to
            you, and points you at the log file that has the flight — where those same figures become
            the device&apos;s side of the cross-check. The RRC3 export names no units, so — like a metric-configured Eggtimer — its
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
