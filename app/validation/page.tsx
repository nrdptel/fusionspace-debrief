import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { Section } from '@/components/ui';
import { SITE_URL } from '@/lib/links';
import { derivedPeakList } from '@/lib/derivedPeak';

export const metadata: Metadata = {
  title: 'How Debrief is validated — Debrief',
  description:
    "How Debrief's flight reads are checked: a regression corpus of real logs against independent ground truth, physical invariants, the logger's own reported figures shown beside each read, methods grounded in published sources — and an honest account of where it's known to be weak.",
  alternates: { canonical: `${SITE_URL}/validation/` },
};

export default function ValidationPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 md:py-12">
      <SiteHeader brandAsHeading={false} />

      <h1 className="mt-12 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        How Debrief is validated
      </h1>
      <p className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
        Debrief is a measurement instrument, so a number is only worth having if you can trust it.
        None of what follows makes the reads perfect — a barometric altitude is still a barometric
        altitude — but here is exactly how each one is checked, and where it is known to fall short.
        For how each number is <em>worked out</em>, see{' '}
        <Link href="/methods" className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100">
          where the numbers come from
        </Link>
        .
      </p>

      <div className="mt-8 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
        <Section title="Real flights, checked against real ground truth">
          <p>
            The analysis is regression-tested against a private corpus of real flight logs — dozens
            of them, spanning ten logger families — not synthetic data. Each log is paired with
            independent ground truth: a <strong>second altimeter that flew the same flight</strong>,
            or the <strong>device&apos;s own reported summary</strong> written into the file. Debrief
            reads each log and its headline numbers are compared against that ground truth within a
            tolerance. How much of each flight that pins is counted rather than described:{' '}
            <strong>54 assertions over 33 of the 61 logs</strong> — 33 apogees, 11 peak speeds and 10
            peak accelerations, with 13 logs pinning two quantities or more. That count is itself
            held by a test, and it counts only assertions the suite actually reaches: a log kept for
            a documented mis-read is parsed but never asserted on, so a golden value written on one
            would sit in the contract looking armed and check nothing. Writing one is refused. Descent rates are{' '}
            <em>not</em> yet pinned anywhere, and saying so is the point of counting: an apogee is one
            number out of a flight, and a suite that pins only apogees is checking the barometer
            rather than the analysis. The whole corpus is
            re-run on every change; a read that drifts out of tolerance fails the build before it can
            ship. Where a flight was recorded by more than one device, the two independent reads are
            also reconciled against <em>each other</em> — apogee has to agree to within a few percent,
            and no cross-check figure may be a physically impossible noise spike — so a drift shows up
            as recordings that stop agreeing. Logs Debrief is known to still mis-read are kept in the
            corpus and parsed without asserting the wrong number, so the gap is documented rather than
            quietly locked in as correct.
          </p>
          <p>
            A ground truth also has to be stated on the same basis as the reading it checks. A
            logger&apos;s summary usually gives its peak acceleration with gravity already taken out,
            while Debrief reports specific force — what the sensor actually measures, +1&nbsp;g
            standing still on the pad. The two differ by exactly one gravity on every flight, which
            is 1.2% of an 84&nbsp;g boost but 9.4% of a 10.7&nbsp;g one, so a percentage tolerance
            wide enough to swallow it on the small flight hides real error on the large one. Each
            acceleration ground truth here names its basis and is converted before comparison; the
            ten that carry one then agree to <strong>within 0.08%</strong>, and the tolerance went
            from 6% back to 2% where it measures precision instead of a definition. Eight of the ten
            agree exactly; the residue on the other two is the ground truth being stated in
            whole-number g, not spread in the read.
          </p>
        </Section>

        <Section title="Physical and logical invariants">
          <p>
            Some checks need no reference number at all — they just have to hold for any real flight,
            whatever the logger. A deceleration is never a positive number dressed up as one; the
            events fall in flight order and none sits above apogee; boost&nbsp;+&nbsp;coast adds up to
            the time to apogee, and ascent&nbsp;+&nbsp;descent to the flight time; descent rates point
            downward and the main is slower than the drogue; a coast never beats a vacuum (the height
            gained from burnout to apogee cannot exceed the v²/2g a drag-free body would gain, or the
            three figures aren&apos;t from one instant of one flight — the corpus&apos;s highest is
            82%); <strong>no descent rate beats a vacuum fall from apogee</strong> (√(2·g·h) — the
            guard that caught three real logs reporting a &ldquo;main descent&rdquo; of 16,495, 8,303
            and 749&nbsp;ft/s, which the older &ldquo;main is slower than the drogue&rdquo; check
            could not see because those flights had no drogue leg to compare against);
            a derived speed never implies a climb a hundred times the one that happened (the same
            energy argument pointed at the velocity: the corpus spans 6.3–81.7% of the drag-free
            coast, and the two refused sit at 0.1%); thrust-to-weight off the pad is a sane launch
            number; a battery&apos;s low never exceeds its resting start. A metric that
            contradicts itself trips these guards even when there is no ground truth to compare
            against — the kind of bug a single golden number can miss.
          </p>
        </Section>

        <Section title={<>The logger&apos;s own figures, in your own report</>}>
          <p>
            Validation you can see for yourself: when a file carries the device&apos;s own headline
            figures (as an AltimeterCloud export writes its apogee and velocities, or a PerfectFlite
            preamble states its apogee), Debrief shows them beside its independent read as a
            cross-check — two measurements to compare, with the agreement stated. Close agreement
            builds confidence; a gap is flagged for a look, never averaged together or hidden. And
            when you have several recordings of one flight — redundant altimeters, or a stage on its
            own device — the comparison view lines them up side by side the same way: independent
            measurements that can disagree, not a consensus dressed as certainty.
          </p>
        </Section>

        <Section
          title={
            <>Why Debrief&apos;s apogee is usually a little lower than the file&apos;s biggest number</>
          }
        >
          <p>
            An easy check anyone can run: open the altitude column in a spreadsheet, take the
            largest value, and compare. Across <strong>40 corpus flights</strong>, Debrief&apos;s
            apogee lands within <strong>1% of the file&apos;s own raw maximum on 31 of them</strong> —
            and where it differs it is nearly always <em>lower</em>, on purpose, for two reasons that
            apply to every logger. It measures from the <strong>pad</strong>, subtracting the ground
            baseline the log itself establishes before liftoff, so a barometer reading 9 ft on the
            rail doesn&apos;t add 9 ft to the flight. And it <strong>rejects single-sample spikes</strong>,
            because one sample standing well clear of both its neighbours is sensor noise, not a
            height the rocket reached and came back from.
          </p>
          <p className="mt-2">
            The clearest worked example is Jolly Logic&apos;s own published sample flight, which is
            about as authoritative as ground truth gets. Its Info tab states{' '}
            <strong>681 ft</strong>; Debrief reads <strong>666 ft</strong>, and all 15 ft of the
            difference is accounted for. Nine of it is pad baseline — that altitude column averages
            8.6 ft over its 100 pre-liftoff samples, so 681 was never measured from the ground. The
            other six are a spike: the 681 sample sits at t = 12.25 s between neighbours of 665 and
            670 ft, in a trace whose sample-to-sample scatter is about 5 ft. Debrief&apos;s flight
            time for that same file, 48.8 s, matches the device&apos;s stated 49 s. The corpus asserts
            666 ft, not 681 — the number the method can defend, with the difference explained rather
            than split.
          </p>
          <p className="mt-2">
            The point is not that the altimeter is wrong. It is that &ldquo;the biggest number in the
            column&rdquo; and &ldquo;how high it flew&rdquo; are two different questions, and Debrief
            answers the second one. Where the gap is bigger than this — the four largest in the
            corpus run to 4.6% — it is a real barometric artefact in the file, and the read says so
            on the report rather than here.
          </p>
        </Section>

        <Section title="What the readings cannot settle: whether two files are one flight">
          <p>
            Debrief tells a comparison of one flight from a comparison of several by the{' '}
            <strong>dates the files state</strong>, and by nothing else. It is fair to ask why the
            numbers don&apos;t decide it — two recordings of one flight ought to agree — so this was
            measured rather than assumed. Across the corpus, every pair of recordings of{' '}
            <em>genuinely different</em> flights was cross-checked against every other:{' '}
            <strong>8 of 154 different-flight pairs agree on apogee to within 8%</strong>, the
            closest to <strong>0.55%</strong> — tighter than 6 of the 17 pairs that really are one
            flight, and tighter on time-to-apogee than 4 of them. A flight to 3,000 ft looks like
            another flight to 3,000 ft, because that is what those numbers measure.
          </p>
          <p className="mt-2">
            So agreement cannot confirm one flight, and disagreement cannot refute it. What that
            leaves is honest but narrow: where the files date two recordings more than about a day
            and a half apart, they are read as different flights and the cross-check is introduced as
            a flight-to-flight difference instead. That reading inherits whatever the devices&apos;
            clocks say — one corpus TeleMetrum insists on 27 Apr 2013 for a flight flown in October
            2023 — so the comparison names which file states which day, and says plainly that a
            wrong clock is the one thing that would make it wrong. Debrief reports the day a file
            states and never quietly corrects it.
          </p>
        </Section>

        <Section title="What the readings cannot settle: a tilt angle off the board's own attitude">
          <p>
            A Blue Raven writes a 500&nbsp;Hz quaternion attitude solution beside its flight log, and
            it also writes its own <strong>Tilt_Angle</strong> column. That makes a rare thing
            possible: Debrief can compute a tilt from the quaternions and check it against the number
            the board itself computed, on the same flight. It does not publish one, and this is why.
          </p>
          <p className="mt-2">
            Measured over the ascent of all four corpus high-rate pairs, against each board&apos;s own
            tilt column — mean error, and worst:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>
              <strong>0.62°</strong> mean, 1.80° worst · <strong>1.81°</strong> mean, 3.84° worst —
              the two clean downloads
            </li>
            <li>
              <strong>1.76°</strong> mean, but <strong>10.80°</strong> worst — a third
            </li>
            <li>
              <strong>21.67°</strong> mean, 96.67° worst — a fourth, whose download{' '}
              <em>writes part of the flight twice</em>
            </li>
          </ul>
          <p className="mt-2">
            The fourth file&apos;s figure is mostly bookkeeping: read only up to the point where its
            replay begins, it settles to <strong>4.07°</strong> mean and 7.34° worst. Worth stating
            because it is the kind of thing that looks like a fix and is not:{' '}
            <strong>deleting the repeated samples makes it worse, not better</strong>{' '}
            (21.67°&nbsp;→&nbsp;24.05°). A download that repeats itself has lost the correspondence
            between its two halves from the first seam onward, and no amount of dropping rows
            restores it — only reading less of the file does.
          </p>
          <p className="mt-2">
            Even at 4.07° that file agrees two to six times less closely than the clean pair, and on
            the worst single sample the third file is further out than it is. So a refusal would have
            to tell those two apart, and nothing in the corpus does. A tilt right three times in four,
            with no way to say which time is the fourth, is exactly the plausible-but-wrong reading
            Debrief withholds by policy. The channels are named and drawn; no angle is computed off
            them.
          </p>
        </Section>

        <Section title="Grounded in published sources">
          <p>
            The methods are implemented from published formulas and cited, not copied from another
            tool: barometric altitude and air density from the constant-lapse standard atmosphere (US
            Standard Atmosphere, 1976); drag coefficient from the coast deceleration and parachute
            C<sub>d</sub> from terminal velocity, both the textbook{' '}
            ½&nbsp;ρ&nbsp;v²&nbsp;C<sub>d</sub>&nbsp;A force balance; speed of sound from the ground
            temperature. Each parser reads a format from its published or observed layout and surfaces
            the numbers the file already carries — never a vendored engine.
          </p>
        </Section>

        <Section title="Where it is known to be weak">
          <p>
            Honesty is the point of a measurement instrument, so the limits are stated in the read
            itself, not buried here:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-6">
            <li>
              A <strong>barometric altitude</strong> drifts with weather and the airframe&apos;s own
              airflow — good to a few metres, not centimetres — and above ~36,000&nbsp;ft (the top of
              the troposphere) the standard-atmosphere model behind it under-reads; a flight that high
              is flagged.
            </li>
            <li>
              A <strong>GPS</strong> altitude or track is good only to a few metres, and a velocity
              derived from it is rough; acceleration off it isn&apos;t meaningful and is withheld. The
              roughness has a measured direction: on the corpus GPS flight a second instrument also
              recorded, the GPS-derived peak lands <em>above</em> the measurement — 1,466&nbsp;ft/s
              against a Blue Raven&apos;s measured 1,401&nbsp;ft/s on the same flight (+5%), and above
              the tracker&apos;s own stated 1,340&nbsp;ft/s (+9%). Comparing the two Mach figures
              instead — 1.32 against 1.22 — gives +8%, because Mach also carries the air the peak was
              read in; both are quoted here as speed ratios unless said otherwise. So a GPS peak past
              Mach&nbsp;0.9 is flagged like a barometric one and never counted as proof of a supersonic
              flight. A second GPS log read +31% by the same speed comparison, but its peak was
              differentiated across four missing fixes and is withheld rather than reported — the
              figure it produced is not evidence of anything.
            </li>
            <li>
              A <strong>derived (barometric or GPS) velocity</strong> is worked out from the altitude
              rather than measured, and it is labelled wherever it appears.
              It <strong>usually reads high</strong> at the peak, sometimes by a lot — and it is{' '}
              <strong>not a bound in either direction</strong>. Every corpus flight recorded twice,
              where one recording measured the speed and the other derived it, gives{' '}
              <strong>{derivedPeakList('speed')}</strong> on the speeds ({derivedPeakList('mach')}{' '}
              comparing the Mach numbers, which is a different ratio and is quoted here under its own
              name). Most run high; <strong>one reads 14% low</strong>, which is why a derived peak
              cannot be treated as a ceiling any more than as a floor. The cleanest pair is one
              device&apos;s CSV export against its own binary download — same flight, same sensor —
              and it reads <strong>+4%</strong>; the widest is a different barometer through the
              transonic push, at <strong>+110%</strong>. From about Mach&nbsp;0.9 up a baro trace
              stops being a reading of the speed at all, so a peak there is flagged and never counted
              as proof of a supersonic flight. Only a speed the device itself measured settles that.
            </li>
            <li>
              A <strong>logged velocity column that is really the file&apos;s own altitude
              differenced</strong> — what a baro-only altimeter, having no speed sensor, writes there —
              is read as derived rather than measured: its raw peak is the barometer&apos;s
              quantization, not a speed (one corpus export of a Mach&nbsp;1.3 flight states
              4,880&nbsp;ft/s). Every genuine velocity channel in the corpus is far from that
              signature, so the two don&apos;t get confused.
            </li>
            <li>
              A <strong>saturated accelerometer</strong> (a trace that flat-tops at its full-scale
              limit) is flagged as possibly clipped; a <strong>coarse sample rate</strong>
              undersamples fast events like a deployment shock, so those read as a floor, not a
              ceiling. Where two recordings are compared, a clipped peak is marked and not crowned —
              which flight pulled the most g can&apos;t be settled from a floor.
            </li>
            <li>
              A <strong>physically impossible reading</strong> — a velocity faster than any rocket,
              the signature of a mis-scaled or misidentified column — is withheld rather than
              reported, along with the Mach and max-Q derived from it; the summary says why and where
              to check the mapping.
            </li>
            <li>
              A <strong>velocity trace that swings below zero on the way up</strong> is noise, not
              speed — a climbing, accelerating rocket has no negative vertical velocity — so max
              velocity and everything derived from it is withheld. It is the signature of a tumbling
              or venting airframe, where the pressure at the static port stops tracking altitude. Two
              altimeters that recorded one spent booster show it: apogee agrees to the foot
              (1,526&nbsp;ft each) while their velocity peaks read 1,500 and 540&nbsp;ft/s, so neither
              recording resolves the speed. Every corpus flight whose ascent trace is a real velocity
              never dips below zero at all, so an honest reading is never caught by this.
            </li>
            <li>
              A <strong>peak that lands on the moment of liftoff</strong> is not a speed. A rocket
              is at rest when it leaves the pad, so the fastest instant of its climb cannot be the
              one liftoff was detected at — where a record says both, a jump in the opening samples
              was fast enough to be read as the launch and is then reported as the top speed. One
              corpus file is exactly that: a raw RRC3 download whose log opens part-way in, stating{' '}
              <strong>7,876&nbsp;ft/s and Mach 7.06</strong> against the flight&apos;s own
              ~2,450&nbsp;ft/s (~Mach 2.2), with a max-Q beside it 10.9× the same flight&apos;s real
              load case. Its apogee, 13,749&nbsp;ft against a stated 13,304.6, was never the problem.
              The ratio test that catches a tumbling airframe cannot catch this one: it measures the
              negative swings against the peak, so the more absurd the spike the smaller its own
              ratio — that flight swings to &minus;182&nbsp;m/s against a &ldquo;peak&rdquo; of
              2,401, which is 7.6% and inside any sane tolerance, where the same swing against its
              real 679&nbsp;m/s is 27% and refused at once. Across all 50 corpus records that
              analyse, exactly one peaks at its liftoff sample. A second record peaked one sample
              later and stated <strong>Mach 1.19</strong> against the <strong>Mach 0.93</strong> a
              second altimeter measured on that same flight; rather than loosen this check into a
              window, the test that a climbing rocket has no negative vertical velocity was widened
              to read the whole climb instead of stopping at the peak, which refuses it on its own
              evidence.
            </li>
            <li>
              A <strong>logged velocity is only called measured where the device could measure
              one</strong>. A pressure sensor cannot measure a speed, so a baro-only
              altimeter&apos;s velocity column is a barometric derivative however its firmware
              filters it, and is labelled and caveated as one. Nine corpus flights read as measured
              without an accelerometer, a GPS fix or an inertial altitude anywhere in the file —
              including an Eggtimer stating 4,483&nbsp;ft/s on a 4,661&nbsp;ft apogee. Their figures
              are unchanged; what they claim about themselves is.
            </li>
            <li>
              An <strong>apogee cannot come after the descent started</strong>. A deployment charge
              vents the airframe, and a fast logger records that as a burst of swings rather than the
              one- or two-sample spike a median filter removes — so the highest sample can sit well
              past the summit. One corpus Blue&nbsp;Raven log read 12,060&nbsp;ft nearly 4&nbsp;s after
              its own velocity went negative; against the same file&apos;s inertial altitude and three
              other recordings of that flight it now reads 11,766&nbsp;ft, and the four recordings&apos;
              time-to-apogee agrees to 0.7&nbsp;s where it used to spread 4.6&nbsp;s. That agreement is
              asserted on every change.
            </li>
            <li>
              A <strong>descent rate needs the leg in the record</strong>: each phase is read only
              where the log shows it dropping more than a tenth of the height it began at. A corpus
              recording that loses power 1.3&nbsp;s after its main fires at 1,877&nbsp;ft averaged the
              handful of samples left to 2&nbsp;ft/s — against 57&nbsp;ft/s from the second altimeter
              on the same flight — so that leg now reads &ldquo;—&rdquo; while the long drogue descent
              above it still reads 69&nbsp;ft/s.
            </li>
            <li>
              A <strong>barometric speed the flight&apos;s own accelerometer cannot account for</strong>{' '}
              is withheld too. The accelerometer caps it from above — the measured g integrated from
              liftoff, with every g credited as vertical, which a leaning airframe never manages — and
              the unpowered coast to apogee floors it from below, so the two bracket the top speed.
              Integrating that same reading does <em>not</em> give a speed worth reporting, though: it
              closes back to zero at apogee — which is what apogee means — on only 7 of the 22 corpus
              flights that carry an accelerometer, and on none of the four below. Where it does close it
              lands within 6% of the device&apos;s own figure; where it doesn&apos;t, the drift is 44% to
              135% of the peak, so the bound is all this channel honestly supports. Four flights of one home-built
              altimeter read barometric peaks of Mach&nbsp;0.9–1.65 on ~2,450&nbsp;ft apogees against a
              bracket of roughly Mach&nbsp;0.3–0.4: the summary names the bracket instead of the peak. The
              bound is only used where the coast corroborates the accelerometer, so a channel read on the
              wrong convention accuses nothing.
            </li>
            <li>
              A file holding <strong>more than one flight</strong> is read as its first flight only,
              with a note saying how much of the file was used — merged, the record's highest point
              belongs to one flight and its liftoff to another. A corpus Blue Raven backup download
              holds one flight recorded twice, and read whole it put time-to-apogee at 39.6&nbsp;s
              where the GPS recording the same flight, aligned by its own UTC stamps, puts apogee
              19.3&nbsp;s after liftoff; read as one flight it now agrees.
            </li>
            <li>
              …and a file holding <strong>the same flight written twice</strong> is told apart from one
              holding two different flights, because the advice differs: telling the owner of a doubled
              download to &ldquo;split the file and read the others&rdquo; hands them the same flight
              again. The discriminator is the apogee measured against <strong>one datum</strong> — the
              file&apos;s own pad baseline, since it is one altitude column and the second copy has no
              business taking a baseline of its own from the trough between them. On that datum the two
              corpus Blue Ravens agree to <strong>0.21%</strong> and <strong>0.00%</strong> (the first
              reading 10,245&nbsp;ft then 10,267&nbsp;ft, against the device&apos;s own stated
              10,266&nbsp;ft), while an Eggtimer file whose second segment is a baro artefact documented
              in its ground truth is <strong>92%</strong> away. The bound is 1%: five times the widest
              genuine agreement and ninety times inside the pair that must be refused. A file with no
              quiet pad window has no datum to share and is refused before the peaks are compared.
            </li>
            <li>
              Where that first copy <strong>stops before the rocket lands</strong>, the descent clock is
              read from the second copy — the same flight, on the same datum — and every reading at or
              above apogee still comes from the copy that starts on the pad. The check is a different
              instrument: a Featherweight GPS recorded the corpus flight this applies to separately and
              times the descent at <strong>64.40&nbsp;s</strong> against the assembled{' '}
              <strong>64.76&nbsp;s</strong>. The <em>rates</em> are not carried across — a descent time
              needs two instants both copies agree on, while a rate needs the deployment structure
              between them, and on that flight an unresolved main would average a 50.7&nbsp;m/s drogue
              and a 6.2&nbsp;m/s main into one 48.2&nbsp;m/s figure under the label a flyer sizes a
              parachute against.
            </li>
            <li>
              A record that ends <strong>at rest but above the pad</strong> is not a landing. A rocket in
              the air is climbing or falling — it cannot hold an altitude — so a trace that has stopped
              changing has reached the ground, which is how a landing is read where a barometer&apos;s
              zero has wandered a few metres over a long descent. At rest is not enough on its own,
              though: a landing is a return to <em>the ground</em>, and the ground is where the record
              started. Four corpus records end at rest between <strong>2.02%</strong> and{' '}
              <strong>7.47%</strong> of their own apogee above the pad — one of them 307&nbsp;m up — and
              whether that is drift or a log simply stopping is not something the record settles, so no
              landing, flight time or descent time is read from them. The two that are read end 0.23%
              and 0.25% up.
            </li>
            <li>
              The <strong>altitude a reading happened at</strong> is withheld when the record
              contradicts it — below the pad, or well below a height already passed, neither of which a
              climbing rocket can do. It is the transonic barometric artefact, and it strikes exactly
              where burnout, the speed peak, the Mach-1 crossing and max-Q are read: one corpus trace
              reads 307&nbsp;ft below its pad there while the same device&apos;s inertial channel climbs
              past 1,700&nbsp;ft. Where the file carries that second recording and it agrees with what the
              barometer already established, the reading is taken from it rather than withheld — on
              that flight a burnout altitude of &minus;307&nbsp;ft becomes 1,583&nbsp;ft, which checks
              out against the flight&apos;s own burnout speed and time. Sound flights are nowhere near
              the bar (within 72&nbsp;ft), so a good reading is never touched.
            </li>
            <li>
              A log that <strong>stops at apogee</strong> reports no descent rate at all rather than
              averaging the few samples wobbling around the peak — that average is noise, and can even
              come out as a negative &ldquo;descent&rdquo;.
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
        </Section>

        <Section title="Try it">
          <p>
            The quickest way to judge it is to drop in a flight you already know the numbers for — or
            open the{' '}
            <Link href="/" className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100">
              sample flight
            </Link>{' '}
            and read its cross-check against the logger&apos;s own figures. Everything runs in your
            browser; nothing is uploaded.
          </p>
        </Section>
      </div>

      <p className="mt-12 border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <Link href="/" className="underline hover:text-zinc-700 dark:hover:text-zinc-300">
          ← Back to Debrief
        </Link>
      </p>

      <SiteFooter />
    </main>
  );
}
