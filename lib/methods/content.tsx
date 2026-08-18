import type { ReactNode } from 'react';
import type { MethodId } from '../methodIds';
import type { ReferenceId } from './references';
import { derivedPeakList } from '../derivedPeak';

/**
 * The text of every method block, keyed by id — the ONE place each explanation lives.
 *
 * It used to live only as JSX children inside `app/methods/page.tsx`, which meant the only way
 * to read an explanation was to go to that page. That is owner note `ON-3`: a flyer meeting
 * "Coast efficiency" or "Max Q" on their report clicked a "?" and lost their place, in a second
 * tab, on a 12,700-word document.
 *
 * **Two surfaces render this, so it is a module rather than a resemblance.** The architecture
 * invariant is explicit — "where two surfaces do the same job, they share a module rather than a
 * resemblance" — and the alternative here is the specific failure it names: a short summary
 * written beside the long page, which drifts the first time either is edited and leaves a flyer
 * reading two different accounts of one number.
 *
 * Moved verbatim on 2026-08-08. Not one word changed in the move; the built page's rendered text
 * was compared character for character before and after.
 */
/**
 * `cites` names the published sources a block's method is implemented FROM — typed against
 * `lib/methods/references.ts`, so a block cannot cite a reference that does not exist.
 *
 * **Optional, and that is the honest shape rather than a shortcut.** Most of what Debrief reports
 * is its own: the transonic threshold, the max-Q window, every bound measured off the corpus. A
 * required field would push 46 blocks to `cites: []` — noise that reads as an omission — or, worse,
 * invite a plausible citation to fill it. An uncited block is a block that rests on no published
 * method, which is a true statement about most of this page. The direction that IS enforced is the
 * other one: `lib/methodIds.test.ts` fails on a reference nobody cites, because a bibliography
 * drifting from its text is the exact failure OpenRocket's frozen v13.05 document shows.
 */
export const METHOD_CONTENT: Record<MethodId, { title: string; body: ReactNode; cites?: readonly ReferenceId[] }> = {
  "not-a-flight": {
    title: "When a record isn't a flight at all",
    body: (
      <>
        <p>
          Every reading on the page rests on the altitude channel, so Debrief checks that the
          channel actually holds a flight before trusting it. The test is the climb against
          gravity: a throw that just reaches height <em>h</em> passes it{' '}
          <span className="font-mono">&radic;(2h/g)</span> seconds in, and a real rocket does most
          of its climbing under thrust and gets there sooner still. If a record takes more than
          four times that long to reach its highest point, it is not a climb — the altitude
          column is a stuck sensor, a disconnected barometer, or a column that is not a height.
        </p>
        <p>
          Debrief says so rather than silently correcting anything, because it cannot know the
          true height from a channel that did not record it. One log in our test corpus does this:
          it reports a peak of 9 m reached 30.9 s after liftoff, an ascent 22 times slower than
          gravity allows, while a second altimeter in the same airframe recorded 2,115 m. The
          limit is four rather than something tighter because real flights do sometimes climb
          slowly — the slowest in the corpus, a 75 km flight with a long burn in thin air, takes
          1.5 times the throw — so the check discriminates on a fourteen-fold gap rather than a
          fine judgement.
        </p>
      </>
    ),
  },
  "several-flights-in-a-file": {
    title: "More than one flight in a file",
    body: (
      <>
        <p>
          A logger downloaded twice, or a whole launch day dumped at once, puts several flights in
          one file — and read as a single flight the record is nonsense: the highest point belongs
          to a later flight while liftoff belongs to the first, so time-to-apogee spans both. The
          test is something a rocket cannot do: return to the ground and climb again. Where that
          happens the report lists <strong>every flight in the file</strong> — where each one starts
          and how high it went — reads the first, and lets you open any of the others without going
          back to your altimeter&apos;s software. Each apogee in that list is measured against the{' '}
          <em>file&apos;s</em> own pad baseline, so the rows are comparable with each other: a later
          flight starts in the trough after the one before and has no quiet pad window of its own.
        </p>
        <p>
          Debrief&apos;s segmentation is a reading of the trace, and you can overrule it: pick
          any flight from the list, or frame a stretch on the chart and say that is yours. The
          analysis then reads exactly what you chose — measured against the{' '}
          <em>file&apos;s</em> own pad baseline, not against wherever the selection starts,
          because a stretch out of the middle of a flight has no pad in it. Every document says
          which stretch it is of.
        </p>
        <p>
          Every part of that test is measured against <strong>the flight in hand</strong>, never
          against the highest flight in the file. That distinction is the whole of it: asking
          instead whether the trace had reached half the <em>file&apos;s</em> best worked only while
          a download&apos;s flights were within 2x of each other, so a day holding a 300&nbsp;m
          sport flight and a 3,000&nbsp;m certification flight tripped nothing and the two were read
          as one, with a flight time spanning both. Four things a record does that are <em>not</em>{' '}
          a landing are named rather than guessed at: a dip that reaches the ground band faster
          than the rocket could have fallen from its own peak (the transonic push on a barometric
          port does this); a climb back <em>above</em> the height the record had already reached, or
          back to it within a couple of seconds, which is a dropout in the middle of one ascent
          rather than a second launch; and, after touchdown, a baseline drifting through the weather
          or a single-sample spike — neither climbs at a rate an airframe makes. &ldquo;Back on the
          deck&rdquo; is measured from where the record&apos;s ground actually is, so a rocket that
          came to rest on a rise still reads as landed.
        </p>
        <p>
          A climb under 100&nbsp;m is not treated as a flight at all, which is what keeps ground
          noise from splitting a file: the largest non-flight excursion across the 46 corpus records
          that analyse is 76&nbsp;m. On a record whose own best is small that floor comes down to a
          quarter of it — never below 30&nbsp;m — so a club session of 60&nbsp;m and 95&nbsp;m
          flights on one AltimeterThree is still several flights, while 13&nbsp;m of barometric
          wobble on a fragment is not. The cost is stated rather than hidden: where the{' '}
          <em>first</em> flight in a download is under that floor, the file is read as one, and the
          readings then span it and whatever follows. A dropout that reads zero <em>before</em> the
          rocket ever climbed (a GPS losing lock through the boost) is not a landing and never
          splits a file.
        </p>
        <p>
          <strong>And where Debrief reads a record as one flight that does not look like one,
          it says so.</strong> That is the other half of this: every refusal above is silent on
          its own, and a record it declined to cut comes back as an ordinary report over all of
          it — with a liftoff from one flight and an apogee from another under one set of
          headline numbers. So the trace is counted separately: how many times it leaves the
          ground and comes back, measured against the record&apos;s own pad noise with no floor
          at all, and with climbs less than ten seconds apart treated as one (nobody launches
          again in ten seconds, and the pressure transient a rocket leaves clearing the pad
          reads as a 49&nbsp;m climb 3.8&nbsp;s before the real one on two corpus records).
          Where that count disagrees with the segmentation, the report says which and invites
          you to choose the stretch that is yours. Across the 46 corpus records that analyse it
          says it about none of them.
        </p>
        <p>
          Debrief reads the <strong>first</strong> flight in the file, and the climb always comes
          from it, because it is the copy that starts on the pad. Reading a later copy
          <em>instead</em> was tried and measured on a Blue Raven that holds the same flight twice,
          and it moved the apogee from 10,245&nbsp;ft to 10,723 against the device&apos;s own stated
          10,266 — the second copy begins at the trough with no quiet pad window of its own, and
          measuring it against that trough is what put it 456&nbsp;ft out.
        </p>
      </>
    ),
  },
  "same-flight-written-twice": {
    title: "The same flight written twice",
    body: (
      <>
        <p>
          A doubled download is not two flights, and saying so matters: telling its owner to
          &ldquo;split the file and read the others&rdquo; hands them the same flight again. The
          test is the apogee measured against <strong>one datum</strong> — the file&apos;s own pad
          baseline, because it is one altitude column and the second copy has no business taking a
          reference from the trough between the copies. On that datum the two corpus Blue Ravens
          agree to <strong>0.21%</strong> and <strong>0.00%</strong>, while a file whose second
          segment is a documented barometric artefact is <strong>92%</strong> away. Where the copy
          that starts on the pad <em>stops before the rocket lands</em>, the descent clock is read
          from the other copy on that shared datum — the same segment that read 10,723&nbsp;ft
          against itself reads <strong>10,267</strong> against the file, one foot from the
          device&apos;s own figure. A separate Featherweight GPS recording of that flight times the
          descent at 64.40&nbsp;s against the assembled 64.76&nbsp;s. Descent <em>rates</em> are not
          carried across: a time needs two instants both copies agree on, a rate needs the
          deployment structure between them.
        </p>
      </>
    ),
  },
  "unrecognized-file": {
    title: "A file Debrief doesn't recognize",
    body: (
      <>
        <p>
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
        </p>
      </>
    ),
  },
  "raw-downloads": {
    title: "Reading the file the card actually holds",
    body: (
      <>
        <p>
          Two loggers are read from their <em>raw download</em> — the file their own software saves
          when it pulls a flight off the board, with no CSV export in between. An Altus Metrum{' '}
          <code>.eeprom</code> is the board&apos;s configuration as JSON followed by the log exactly as
          it sat in flash; Debrief reads the records directly, converting the raw MS5607 conversions
          with the factory calibration coefficients the file&apos;s own header carries (and the older
          TeleMetrum&apos;s 12-bit MP3H6115A readings with that sensor&apos;s transfer function). A
          MissileWorks RRC3 <code>.rff</code> is a serialized list of 16-bit words: barometer readings
          in tenths of a millibar, with two auxiliary words written once a second. In both, the
          altitude you see is derived from the barometer&apos;s own pressure readings rather than from
          a height the board had already computed.
          <span className="mt-3 block">
            Two rules keep this a measurement rather than a plausible decode. Every one of these files
            in the test corpus has the vendor&apos;s own export of the <em>same bytes</em> sitting
            beside it, and every reading Debrief takes is checked against that export — identically,
            where both sides do the arithmetic in whole numbers (the newer Altus Metrum boards and the
            RRC3, 10,361 readings), and to within four thousandths of a pascal on the one older board
            where both sides convert in floating point. And a file whose shape Debrief has not been
            shown is refused by name: an AltOS log format it does not know, a record layout whose
            pressures disagree with the ground pressure the file states about itself, an RRC3 log
            whose once-a-second markers and whose readings disagree about how long the flight was.
            Misreading a binary record layout does not fail loudly — it produces a perfectly plausible
            flight out of misaligned bytes — so the only safe answer to a file that does not check out
            is to say so.
          </span>
          <span className="mt-3 block">
            An Entacore AIM <code>.bin</code> or <code>.xtra</code> is <em>not</em> read yet. Both are
            containers Debrief can identify but has no verified reading of, and there is no
            sample-for-sample ground truth to check a guess against — so a file like that is named for
            what it is and pointed at the AIM XTRA software&apos;s CSV export, instead of being reported
            as though it were not a flight log at all.
          </span>
        </p>
      </>
    ),
  },
  "ground-baseline-altitude": {
    cites: ['ussa-1976', 'bosch-bmp180'],
    title: "Ground baseline & altitude",
    body: (
      <>
        <p>
          From the logger&apos;s own altitude channel, or from barometric pressure (with the standard
          atmosphere) when it only logs pressure. The pad level is the median of the opening samples,
          so everything reads as height above the pad (AGL). Baro altitude drifts with weather and
          the airframe&apos;s own airflow — good to a few metres, not centimetres. Above ~36,000&nbsp;ft
          (11&nbsp;km), the top of the troposphere, the constant-lapse standard-atmosphere model behind
          any barometric altitude stops holding and the reading under-reads; a flight that high is
          flagged, and a GPS or inertial altitude is more trustworthy up there.
        </p>
      </>
    ),
  },
  "gps-recording": {
    title: "The GPS recording, where the file has one",
    body: (
      <>
        <p>
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
          because a 2D fix still walks you to the rocket.
        </p>
        <p>
          <strong>And the recovery view says what the receiver solved, where a flyer reads the
          coordinate.</strong> It used to say the same thing on every flight — <em>&ldquo;positions
          are GPS, good to a few metres&rdquo;</em> — which was Debrief&apos;s only statement about
          horizontal accuracy and rested on nothing: not the satellite count, not the fix column,
          not whether the fix was two-dimensional. It now states what the file states, with the
          count, and says nothing at all where the file says nothing. It still names no distance in
          metres, deliberately: what a fix is good to depends on satellite geometry and signal
          strength, and no vendor publishes a function from what these logs carry — so a grade a
          flyer can act on is offered instead of a number nobody can ground.
        </p>
        <p>
          <strong>That is one rule, and it now applies whatever wrote the file.</strong> Loggers
          state the quality of a fix in one of two ways: a count of satellites, or the
          receiver&apos;s own fix-type column (0 no fix, 2 two-dimensional, 3 three-dimensional).
          Debrief read those two statements in two different places and reached two different
          answers — a three-satellite position survived on an Altus Metrum log and was erased from
          a Featherweight one — and nothing downstream said which had happened. Both now go through
          the same judgement, so the same degraded fix means the same thing in every format. One
          corpus flight spends real time on three satellites, and it does so in{' '}
          <strong>13</strong> two-dimensional solutions: each is kept as a position and none of
          them carries a GPS height. A file that states nothing about its fix is graded as though
          it were solved in three dimensions, because the absence of a quality statement is not a
          statement of poor quality.
        </p>
        <p>
          <strong>Thirteen, and the way that number was first got wrong is the paragraph
          below arriving early.</strong> Counted as rows, the same flight reads{' '}
          <strong>371</strong> two-dimensional fixes in the CSV its board exported and{' '}
          <strong>13</strong> in the raw download the CSV was made from — two numbers for one
          flight, because the CSV repeats each position until the receiver solves the next one.
          Counted as distinct solutions the two exports agree exactly, at 13 apiece. A count of
          rows is a count of how often a logger wrote a value down; only a count of solutions says
          how much the receiver actually saw.
        </p>
        <p>
          <strong>The count of fixes is a count of SOLUTIONS, not of rows</strong>, and that
          distinction is the whole value of the number. A receiver runs at a few hertz and a log
          can run at two hundred; between solutions the receiver repeats its last position rather
          than writing nothing. Counting rows counts the repeats, and it did: one corpus flight
          reported <strong>4,010</strong> ascent fixes behind an apogee that rests on{' '}
          <strong>40</strong>, and one board&apos;s two export formats of a single launch
          reported 2,259 and 24 for the same 24 fixes. That figure exists to say how much
          independent evidence is behind the GPS apogee, so inflating it inflated exactly the
          claim it is there to qualify. And the
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
        </p>
        <p>
          <strong>How good the satellite geometry was, where the file says.</strong> Altus Metrum
          logs carry three dilution-of-precision columns — horizontal, vertical and the two together
          — and Debrief now reads all three and states the horizontal spread beside the track you
          walk to. Dilution is unitless: it says how much the arrangement of satellites in the sky
          multiplied whatever ranging error the receiver already had. Lower is a better spread, and
          about 1 is as good as it gets. <strong>It is not a distance</strong>, and Debrief will not
          turn it into one — that conversion needs the receiver&apos;s own ranging error, which none
          of these files carries and no vendor publishes. A range is stated rather than one number,
          because a single flight can run from 0.80 to 1.90.
        </p>
        <p>
          <strong>Two things in those columns are not readings, and both had to be measured to
          find.</strong> The first is documented: AltOS writes <strong>2,147,483,647</strong> —
          the largest value a signed 32-bit field holds — for a column it never had a value for, so
          reading it naively publishes a dilution of precision of two billion. It is a{' '}
          <em>per-column</em> statement, not a per-file one: one corpus recording supplies the
          position dilution at 1.60–1.70 while marking the other two never-supplied on all 346 of
          its rows. The second is in no manual. One recording writes <strong>23.10 into all three
          columns on every one of its 112 rows that report zero satellites</strong> — a single
          repeated value, ten times worse than anything real in the file, sitting beside positions
          that are held-over rather than measured. Left in, it would have been quoted as that
          flight&apos;s worst geometry. It is dropped with the position it belonged to, on the same
          rule that already drops the latitude and longitude there.
        </p>
        <p>
          The check that the three columns are what they claim is their own arithmetic: the position
          dilution is the horizontal and vertical ones combined in quadrature. Across every corpus
          row that states all three, that holds on <strong>every single one</strong> — 22,199 of
          22,199, worst case 8%, which is what rounding to two decimals costs. It held on 108 fewer
          before the no-fix placeholder was removed, and those 108 rows were the placeholder:
          taking out something that was never a reading closed the check rather than loosening it.
          Nothing here filters on quality. A dilution of 12.10 is published exactly as the receiver
          wrote it.
        </p>
      </>
    ),
  },
  "several-recordings-one-flight": {
    title: "Whether several recordings are one flight",
    body: (
      <>
        <p>
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
          numbers, correctly introduced.{' '}
          A cross-check can also compare two readings that were never quite the same
          measurement, and it marks those rather than averaging over the difference: a speed one
          device measured against one differentiated out of an altitude, an accelerometer that
          railed at its full-scale limit, and — where one recording landed and another stopped
          recording under canopy — a main descent leg that covers a shorter span of the descent
          than the leg it is being compared with. Each carries its own footnote saying which way
          it bends the spread. Both corpus groups whose recordings cross-check a main leg are in
          that last state, so it is the ordinary case for that row rather than an edge one.
        </p>
        <p>
          The apogee row is marked the same way, and it is the one that took longest to fix: where
          a recording&apos;s log ends at its own highest sample the number is a <em>lower bound</em>
          {' '}rather than a summit, and where Debrief has disowned an altitude channel outright it
          is not a reading of the apogee at all. The table already tagged both cases and already
          declined to crown a &ldquo;highest&rdquo; over them, while this panel read the same
          numbers as plain measurements — so two lower bounds 996&nbsp;m and 1,082&nbsp;m apart on
          one corpus pair were reported as an 8.2% disagreement, and a disowned 9&nbsp;m beside a
          measured 465&nbsp;m as 192%. Both spreads are still shown, because a gap that wide is
          exactly the signal that one instrument is broken; what they now carry is that one side of
          the comparison is a number Debrief does not stand behind.
        </p>
      </>
    ),
  },
  "one-flight-several-recordings": {
    title: "One flight, several recordings",
    body: (
      <>
        <p>
          A rocket flown with a primary and a backup altimeter comes home with two files of{' '}
          <em>one</em> flight. Tick both in the logbook and say <em>these are one flight</em>:
          they become one entry, counted once — including by the ★ that marks your best, which
          otherwise reads one launch as two, or crowns nothing at all when two instruments agree
          to the digit.
          <p className="mt-2">
            Debrief never decides this for you, and it never blends the readings. Each recording
            keeps its own reading and its own caveats, and you choose which one the flight is{' '}
            <em>reported by</em> — the one whose figures a certification document would quote.
            The report says which recording you are reading and reaches the others in a click,
            and the text, Markdown, HTML and JSON exports carry that line too, so a write-up
            quoting an apogee can state which instrument measured it.
          </p>
          <p className="mt-2">
            Two altimeters that measured one flight are two independent measurements that can
            disagree, and both halves of that matter: on the four-altimeter flight in the
            validation corpus the apogees agree to 0.03% while the top speeds spread
            6.7%. An average would hide the agreement and the disagreement together. To see them
            side by side on one timeline, tick them and <em>Compare</em> — that surface exists
            for exactly this and reports the spread on every reading.
          </p>
        </p>
      </>
    ),
  },
  "device-summary": {
    title: "The device's own summary, dropped alongside",
    body: (
      <>
        <p>
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
        </p>
        <p>
          That includes the <strong>deployment shocks</strong> a Featherweight summary states for
          its apogee and main channels. Debrief measures the same quantity — the acceleration peak
          at each of those events — on 19 of the 36 corpus flights that analyse, so on those the
          two are a real cross-check. On the rest the row still appears and says the reading is not
          comparable rather than going blank, because on a barometric recording the board&apos;s
          figure is the only one there is: nothing in a pressure trace recovers what a charge did.
          The shocks are judged against the wider agreement band, like the descent rates and for
          the same reason — a shock is a millisecond transient, and the board reading its own
          charge channel and Debrief reading the airframe&apos;s accelerometer over a window are
          not sampling the same instant of it. The summary&apos;s <em>landing</em> figure is
          deliberately left out: that is the ground impact, not a flight load, and Debrief has no
          event to hold it against.
        </p>
        <p>
          One difference there is worth naming, because it looks like a disagreement and isn&apos;t:
          an accelerometer at rest on the pad reads <strong>1&nbsp;g</strong>. Debrief reports that
          specific force — the g the airframe felt, which is the number a structures check wants —
          while some devices report acceleration net of gravity, what the rocket was accelerated{' '}
          <em>by</em>. Every AltimeterCloud file in the corpus shows it exactly: 316.76 m/s² against
          the device&apos;s 306.95, 314.07 against 304.26, +1.00&nbsp;g every time. Two independent
          reads landing precisely one gravity apart is not what noise does, so the cross-check says
          so rather than printing a 3.2% gap and leaving you to wonder. Neither figure is adjusted
          into the other: both are shown as each instrument states them.
        </p>
      </>
    ),
  },
  "predicted-versus-flown": {
    title: "A prediction, dropped beside the flight",
    body: (
      <>
        <p>
          Drop an <strong>OpenRocket design</strong> (<span className="font-mono">.ork</span>) in
          with your log and Debrief reads the figures its simulator stated — apogee, top speed,
          peak acceleration, Mach, time to apogee, flight time and four more — and puts them
          beside its own read of what actually flew. Debrief does not simulate, fit, or correct a
          prediction; it reports the gap.
        </p>
        <p>
          <strong>A prediction is not a second measurement, and the wording keeps them apart.</strong>{' '}
          Two altimeters that recorded the same flight are two instruments, so they{' '}
          <em>agree</em>, are <em>consistent</em>, or <em>differ</em> — and a gap between them is
          worth chasing because one of them is wrong. A simulation is a statement about a flight
          that had not happened yet. When the flight does not match it, nothing is wrong: the
          flight is the measurement and the prediction is the thing that missed. So a predicted
          row reads <em>flew higher · +8%</em> or <em>as predicted · 2%</em>, never{' '}
          <em>differ</em>, and it is never given the amber of a discrepancy. The direction word
          belongs to the reading: a time <em>took longer</em>, a speed <em>flew faster</em>, an
          acceleration <em>pulled more g</em>. Only a height flew higher.
        </p>
        <p>
          <strong>Max acceleration is the one row to read carefully.</strong> Debrief reports the
          specific force the airframe felt, which is 1&nbsp;g on the pad; a logger that reports
          acceleration net of gravity instead is named as such, because the corpus shows that
          convention holding to two decimals on every file. The{' '}
          <span className="font-mono">.ork</span> format states no convention at all, so Debrief
          claims neither for a design and says so beside the figures: a gap of about a gravity on
          that row may be the two conventions rather than the flight.
        </p>
        <p>
          <strong>The sign is the flight&apos;s, and it is worth knowing that the field is split
          on this.</strong> Debrief states the difference as{' '}
          <span className="font-mono">(flown − predicted) / |predicted|</span>, so positive means
          the rocket beat its simulation. RASAero II&apos;s published comparison table — 43
          flights, average error 3.47% — states the same quantity as{' '}
          <span className="font-mono">(sim − flown) / flown</span>, which is the opposite sign
          <em>and</em> a different denominator: a flight RASAero prints as{' '}
          <strong>&minus;4.30%</strong> Debrief prints as <strong>+4.5%</strong>. Neither is
          wrong; they are answering &ldquo;how far off was the simulator&rdquo; and &ldquo;what
          did the rocket do against its prediction&rdquo;. Debrief takes the flight as the
          reference because the flight is the thing it measured.
        </p>
        <p>
          <strong>Where a design states several simulations, Debrief will not pick one.</strong> A{' '}
          <span className="font-mono">.ork</span> accumulates a simulation per motor — the
          reference design shipped with OpenRocket holds five, whose apogees run from 51&nbsp;m to
          320&nbsp;m — and nothing in a flight log says which motor flew. Choosing one would be
          Debrief inventing the very claim the comparison exists to test, so it names the
          simulations it found and asks for the design saved with the one you flew. A prediction
          also lasts the session rather than being kept with the flight: the design file is
          roughly a megabyte of XML and the logbook is a shared browser quota.
        </p>
      </>
    ),
  },
  "apogee": {
    cites: ['pearson-2015'],
    title: "Apogee",
    body: (
      <>
        <p>
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
          the raw trace you can plot — it just isn&apos;t read as the summit. Where a trace does
          top the apogee, the channel explorer says so beside the figure, so a maximum lifted out
          of that table into a document isn&apos;t mistaken for the apogee; on most flights the two
          are the same number and it says nothing. Two things keep this
          from touching a sound flight: the search for the descent starts only once the climb has
          passed half the height it reached, so a velocity wobbling either side of zero on the pad
          can&apos;t look like one, and a trace whose ascent velocity swings well negative is
          carrying noise rather than speed, so its sign is not used at all.
        </p>
      </>
    ),
  },
  "altitude-of-a-reading": {
    cites: ['ussa-1976'],
    title: "The altitude a reading happened at",
    body: (
      <>
        <p>
          Burnout, the speed peak, the Mach-1 crossing and max-Q are each reported with the altitude
          they occurred at — and every one of them lands in the stretch where a barometric port is
          least trustworthy. Through the transonic push the shock over the port drives the sensed
          pressure up, which reads as the rocket <em>descending</em>: one corpus flight&apos;s trace
          drops to 307&nbsp;ft below its pad while the same device&apos;s inertial channel climbs past
          1,700&nbsp;ft, and another reads 1,095&nbsp;ft below a height it had already recorded. A
          climbing rocket can do neither. The same shock runs the other way on other airframes,
          driving the sensed pressure <em>down</em> so the trace climbs faster than the rocket did —
          and a running maximum cannot see that, because the altitude never goes backwards.
        </p>
        <p>
          What catches it is a bound rather than a tolerance: over any stretch a rocket&apos;s mean climb
          rate cannot exceed the fastest it was going during that stretch, and where the flight has a
          measured speed the fastest it was going is in the file. So the height gained since liftoff
          is capped by (peak speed so far)&nbsp;×&nbsp;(time since liftoff). One corpus flight reports
          a burnout altitude of 2,495&nbsp;ft where its own inertial speed record allows under
          900&nbsp;ft. The cap applies only where the speed is <em>measured</em> — a barometric
          velocity is worked out from this very altitude trace, so it would be testing the trace
          against itself — and reading an axial speed as vertical only makes the cap more generous,
          which is the right direction for a guard. Across the whole corpus it changes exactly that
          one figure.
        </p>
        <p>
          Where the record contradicts itself either way — below the
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
          of the record, and the three that trip it are 557 to 1,125&nbsp;ft out.
        </p>
        <p>
          Where the logger solved for an <strong>inertial altitude</strong> of its own (a Blue Raven does), Debrief
          carries it as a second altitude recording you can plot against the barometric line — on
          that same flight it reads 1,710&nbsp;ft at the instant the barometer reads 493&nbsp;ft
          below the pad, and only one of those can be a height. The analysis stays on the barometric
          channel, which is the one that doesn&apos;t drift over a whole flight; the two are shown
          side by side rather than merged.{' '}
        </p>
        <p>
          <strong>That second recording is carried only for as long as it is still a recording.</strong>{' '}
          It is an integration, written into a field that cannot hold a large flight, so it ends at
          whichever comes first of a single-sample step of about 2<sup>16</sup>&nbsp;ft — a counter
          wrapping, not a rocket moving — or the two recordings differing by more than the whole
          flight was high, which means one of them has stopped reading. Past that point it is
          withheld rather than plotted, and the flight says when and what both instruments read
          there. Neither bound is a tuned number: one is the field&apos;s own span and the other is
          the flight&apos;s own height. Across the corpus one Blue Raven keeps every sample, two
          keep their whole ascent and are still readable at apogee, and one — a 121&nbsp;km flight
          in a field that tops out near 32,767&nbsp;ft — is over its ceiling before apogee, which is
          the honest answer for that flight rather than a convenient one.
        </p>
      </>
    ),
  },
  "velocity-max-velocity": {
    cites: ['gracey-1980', 'pearson-2015'],
    title: "Velocity & max velocity",
    body: (
      <>
        <p>
          Used straight from the device when it logged a velocity (an accelerometer-integrated speed
          is best through the fast boost); otherwise it&apos;s the time-derivative of the cleaned
          altitude, smoothed to the file&apos;s own sample rate. A derived velocity usually reads{' '}
          <strong>high</strong> at the peak rather than soft — smoothing does soften a peak, but
          what differentiation adds is generally larger. Across the corpus pairs that carry both
          reads it runs {derivedPeakList('speed')} on the speeds: mostly high, once 14% low, so it
          bounds the speed in neither direction. It is labelled wherever it appears.
        </p>
        <p>
          A logged velocity column that turns out to be the
          file&apos;s <em>own altitude differenced sample to sample</em> is not a second reading at
          all — a baro-only altimeter has no speed sensor, so what it writes there carries the
          barometer&apos;s quantization as speed, and its peak is that noise (one real export of a
          Mach&nbsp;1.3 flight states 4,880&nbsp;ft/s). Debrief detects that case, re-derives the
          velocity from the same altitude with proper smoothing, and labels it derived.
        </p>
        <p>
          The weaker version of the same problem is a <em>filtered</em> barometric derivative, which no longer
          matches the raw difference and slips past that test — caught instead by asking what the
          device had to measure a speed <em>with</em>. A baro-only altimeter has one sensor, so its
          velocity column is worked out from its own pressure readings however the firmware smooths
          them, and it is labelled derived. A column counts as measured only where the file carries
          an accelerometer, a GPS fix (a Doppler speed is a real measurement), or the device&apos;s
          own inertial altitude — which can only come from an inertial sensor even when the export
          leaves the accelerometer out, as a Blue Raven&apos;s low-rate file does. Nine corpus
          flights used to read as measured with none of the three, among them 4,483&nbsp;ft/s on a
          4,661&nbsp;ft apogee and 2,671&nbsp;ft/s on 958&nbsp;ft; the numbers the device wrote are
          still shown, but they now carry every derived-velocity caveat.
        </p>
        <p>
          A peak beyond any rocket — the fastest amateur flights reach ~Mach&nbsp;6 — is not flight but a mis-scaled
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
          the timings and the descent still read normally from the altitude.
        </p>
        <p>
          A derived speed that peaks at or past the transonic region (about Mach&nbsp;0.9 up) carries a further caveat:
          approaching Mach&nbsp;1 the airflow over a barometric pressure port goes locally supersonic
          and a shock sits on it, distorting the sensed pressure and the speed read from it — and
          the error runs both ways. It is usually high, and the corpus pairs span{' '}
          {derivedPeakList('speed')}: the widest is a baro trace reading Mach&nbsp;2.64 where its
          partner measured 1.22, and one reads 14% <em>below</em> its partner. So no baro peak from
          Mach&nbsp;0.9 up can confirm the rocket went supersonic, and it bounds how fast it really
          went in neither direction. It&apos;s flagged, not withheld; an
          accelerometer or an inertial solution settles it.
        </p>
      </>
    ),
  },
  "gps-speed-supersonic": {
    title: "A GPS speed doesn't settle it either",
    body: (
      <>
        <p>
          A speed worked out from a <strong>GPS</strong> altitude used to be treated as settling a
          Mach&nbsp;1 crossing, on the reasoning that nothing distorts a GPS through the transonic
          region the way a shock over a static port distorts a barometer. That reasoning is sound and
          it answers the wrong question: the error in a GPS speed doesn&apos;t come from the
          transonic region, it comes from differentiating an altitude that is coarse in space and
          lagging in time. The corpus GPS flight that a second instrument also recorded measures it,
          and it runs <em>high</em>: 1,466&nbsp;ft/s at 2.1&nbsp;Hz where a Blue Raven on that same
          flight measured 1,401&nbsp;ft/s, and above the tracker&apos;s own summary of
          1,340&nbsp;ft/s — <strong>+5%</strong> against the measurement and <strong>+9%</strong>
          against itself, as speed ratios; the two Mach figures, 1.32 against 1.22, differ by +8%,
          since Mach also carries the air the peak was read in. That direction holds for every
          derived peak the corpus can check bar one, and the sizes are not small: the full set is{' '}
          {derivedPeakList('speed')} on the speeds, from a device&apos;s own binary download read
          beside its CSV export to a barometer through the transonic push — and one pair that runs
          the other way. (An endurance-flight PerfectFlite peak used to be quoted here at{' '}
          <strong>+30%</strong>; Debrief withholds that peak now — it sits 0.05&nbsp;s after
          liftoff on a log that opens below the pad — so the pair no longer exists. The list moves
          as the guards improve, which is why these figures are computed from the corpus rather
          than written down.) Wrong by an amount nothing on the file bounds is not a
          figure that decides whether a flight went supersonic, so a GPS-derived crossing is flagged
          the same way a barometric one is. The number is still shown: it is the flyer&apos;s own
          record, and the direction of its error is stated with it.
        </p>
      </>
    ),
  },
  "accelerometer-settles-mach": {
    title: "When the accelerometer settles it",
    body: (
      <>
        <p>
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
        </p>
      </>
    ),
  },
  "mach-dynamic-pressure": {
    cites: ['ussa-1976', 'gracey-1980', 'talay-1975'],
    title: "Mach & dynamic pressure",
    body: (
      <>
        <p>
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
          they carry whatever caveat it carries.
          <br />
          <br />
          Max-Q is read over the <strong>ascent</strong> — liftoff to apogee, climbing — the same
          window the peak speed comes from, and where the structural load case lives. The window is
          the whole point: q squares the speed, so a velocity that swings hard <em>negative</em>
          counts as though it were airspeed, and the place that happens is the deployment transient,
          where a charge vents the airframe and a derived or integrated velocity spikes for a
          fraction of a second. Read over the whole record, six of the 34 corpus flights that report
          a max-Q took it from such a sample instead of from the boost — 3.2&times;, 2.2&times;,
          2.2&times; and 2.0&times; the real ascent peak on four of them, and on the 121&nbsp;km
          flight a &minus;8,970&nbsp;m/s sample read 47,322&nbsp;kPa against an ascent peak of
          404&nbsp;kPa. A descent has real airspeed and a real q, but nothing near the boost&apos;s,
          and none of those six samples was a descent. A record with no ascent in it has no boost, so
          no load case, and gets no max-Q at all.
        </p>
        <p>
          <strong>The plotted curve is drawn over that same window</strong>, and so is every column
          of it that leaves the app — the channel explorer&apos;s trace and statistics, the
          comparison overlay, and the dynamic-pressure column in the analyzed-data and plotted-data
          CSVs. Past apogee the curve simply stops, and the panel says why. Until 2026-08-17 only the
          headline figure above was windowed while all four of those surfaces rebuilt ½&nbsp;ρv² over
          the whole record, so each of them republished exactly the transient this section describes
          — including the 47,322&nbsp;kPa sample, in a table beside a copy button. The Mach curve is
          <em> not</em> truncated, and the difference is the squaring: Mach keeps the sign of the
          velocity, so the same negative sample reads as a large negative Mach and never becomes a
          peak. Measured over the corpus, the plotted Mach exceeded its own headline on none of the
          recordings.
        </p>
      </>
    ),
  },
  "barometric-speed-refuted": {
    title: "A barometric speed the climb refutes",
    body: (
      <>
        <p>
          A speed derived from the altitude trace can be checked against that same trace. From
          the point the speed peaks, a drag-free coast would gain{' '}
          <span className="font-mono">v²/2g</span>, and drag only ever takes from that — so what
          the flight <em>actually</em> gained from there, as a fraction of that vacuum coast, is
          what drag cost. Across 33 corpus flights it runs from <strong>6.3% to 81.7%</strong>: a
          wide, continuous spread, because airframes differ. Two files sit at{' '}
          <strong>0.1%</strong> — an Eggtimer anomaly reading Mach 4.08 over a 4,661&nbsp;ft
          apogee, and an in-air breakup reading 2,671&nbsp;ft/s over 958&nbsp;ft. A speed whose
          coast would have carried the rocket a hundred times higher than it went is the slope of
          a trace that jumped, not a speed, and it is withheld with the arithmetic shown. The
          bound sits at 1%: six times below the lowest genuine reading, ten times above the two
          refused. It applies only to a <em>derived</em> speed, where the velocity and the
          altitude are one channel disagreeing with itself — a device-measured speed and the
          altitude are two instruments, and which to believe is not a guard&apos;s call.
        </p>
      </>
    ),
  },
  "acceleration": {
    title: "Acceleration",
    body: (
      <>
        <p>
          Read from the accelerometer when the logger recorded one: max acceleration over the boost,
          the average over the same boost (ignition to burnout), and max deceleration over the ascent.
          If the trace flat-tops at its peak — how a sensor reads once it hits its full-scale limit
          and saturates — the maximum is flagged as <em>may be clipped</em>, since the real peak could
          be higher. <strong>The average over that boost is flagged too, and differently</strong>: it
          is not itself clipped, it is dragged down by every sample that was, and clipping can only
          ever remove readings from the top. So the average is reported as a <em>floor</em> — the true
          mean is higher, never lower — and the direction of that error is the useful half of knowing
          it. With no accelerometer, acceleration is a second derivative of the barometric
          altitude, and the coarse, quantised baro trace makes its <em>peak</em> (and even its boost
          average) noise, not a measurement — a real flight can read hundreds of g off a single
          altitude step — so those numbers are withheld, and the acceleration trace isn&apos;t charted,
          offered in the explorer or comparison, or written into the data export either (its shape is the
          same noise). The velocity — a first derivative, and usable — still is, labelled as derived.
        </p>
      </>
    ),
  },
  "accelerometer-channel-meaning": {
    title: "What an accelerometer channel means",
    body: (
      <>
        <p>
          Debrief reports <strong>specific force</strong> everywhere — what the sensor actually
          measures, and the g the airframe felt, which is the number a structures check wants. An
          accelerometer sitting still on the pad reads <strong>+1&nbsp;g</strong>, not zero.
          Loggers do not agree on this: AltusMetrum&apos;s{' '}
          <code>acceleration</code> column has that gravity already taken out and rests at{' '}
          <strong>~0</strong>. The same row of one of its files proves it — the column reads
          &minus;0.98 while the device&apos;s own <code>accel_x</code> body axis reads 9.78 on that
          same sample. Read as specific force, such a channel is a full g low in{' '}
          <em>every</em> reading taken off it: the peak g, the boost average, the thrust-to-weight,
          the drag coefficient, and the accelerometer speed ceiling — which subtracts a gravity
          itself, so gravity came off twice. Ten corpus flights carried it. The importer for that
          format now marks the column, and the analysis adds the gravity back before anything is
          read from it, so a peak of 62.3&nbsp;g reads 63.3 and a boost average of 3.24 reads 4.24.
          Note that a device&apos;s own app may show you the other convention for the same flight;
          the difference is exactly one gravity, and it is a choice of definition rather than a
          disagreement about the measurement.
        </p>
      </>
    ),
  },
  "thrust-to-weight": {
    title: "Thrust-to-weight (off the pad)",
    body: (
      <>
        <p>
          The accelerometer&apos;s reading in g right at liftoff is the thrust-to-weight ratio —
          at low speed drag is negligible, so the specific force it senses is just thrust over
          weight. It&apos;s the &ldquo;5:1 rule&rdquo; number, the rail-departure safety check,
          measured rather than predicted. Only from a real accelerometer (averaged over a moment
          off the pad), and withheld when the trace was saturated at liftoff — a railed sensor
          would read a floor, not the true thrust.{' '}
          The reading is taken <em>against the rocket&apos;s own resting value</em>, because
          loggers disagree about what an accelerometer channel means. A true specific-force
          channel reads <strong>+1&nbsp;g</strong> sitting on the pad; AltusMetrum&apos;s{' '}
          <code>acceleration</code> column has that gravity already taken out and rests at{' '}
          <strong>~0</strong> — the same row of one of its files reads &minus;0.98 there while its
          own <code>accel_x</code> body axis reads 9.78. Divided by g, a gravity-removed channel
          gives exactly <strong>T/W&nbsp;&minus;&nbsp;1</strong>: a full point low. Eight corpus
          flights were affected — one read <strong>3.27:1</strong> for a real{' '}
          <strong>4.27:1</strong>, and a genuine 5.2 would have printed 4.2, under the very rule
          it is quoted against. Subtracting the resting reading cancels the convention: write the
          channel as specific force minus some unknown offset, and that offset drops out of{' '}
          <strong>(a&#8203;<sub>boost</sub> &minus; a&#8203;<sub>pad</sub>)&nbsp;/&nbsp;g + 1</strong>,
          which is T/W either way. Where a record starts too late to hold a resting stretch the
          ratio is left unread, and says why, rather than published a point out.
        </p>
        <p>
          <strong>&ldquo;A moment off the pad&rdquo; is 0.2&nbsp;seconds, taken off the clock.</strong>{' '}
          That sounds like a detail and was worth about a quarter of the answer: the window used to
          be a count of samples worked out from the whole record&apos;s median interval, and a
          flight log&apos;s rate is not one number — the pad is written slowly and the boost fast,
          and the same board&apos;s two export formats are written at different rates again. So the
          window was 0.2&nbsp;s on a uniform record and as little as 0.02&nbsp;s on the rest,
          always short, always reading before the motor was up to pressure. One corpus flight —{' '}
          <em>one device, one launch</em> — published <strong>4.98:1</strong> from its{' '}
          <code>.csv</code> and <strong>4.83:1</strong> from its <code>.eeprom</code>; the true
          0.2&nbsp;s window is <strong>6.44:1</strong> for both. On another, two altimeters on one
          airframe read 9.49:1 and 11.23:1, which by time become 11.95 and 11.34. Under a 5:1 rule
          that is the difference between a flight that passes and one that does not.
        </p>
      </>
    ),
  },
  "liftoff-burnout": {
    title: "Liftoff & burnout",
    body: (
      <>
        <p>
          With an accelerometer, liftoff is the first sustained kick above about 2 g and burnout is
          where axial acceleration falls back through zero. With baro only, liftoff is the first real
          climb off the pad and burnout is taken at peak velocity, where a coasting rocket&apos;s
          speed turns over.
        </p>
        <p>
          That search runs from the boost peak to one second past the <em>speed peak</em> — past
          it, not up to it, because the two instants are genuinely different. Debrief reads
          acceleration as specific force, the g the airframe felt, so dv/dt is the trace minus
          gravity: the speed peak is where the trace passes <em>+1 g</em>, while thrust = drag —
          the end of thrust — is where it passes <em>zero</em>, reached a little later as the motor
          tails off. Across the corpus&apos;s fourteen signed-axial flights that gap runs
          0.05–0.40&nbsp;s. A search ending at the peak stopped one instant short of the event it
          defines, and seven of those fourteen fell back to the speed peak because of it.
        </p>
        <p>
          It is still bounded, because a later, larger jolt must not be read as the boost: on four
          corpus flights the biggest axial reading between liftoff and apogee is the apogee
          ejection charge, not the motor, and searching that far took the &ldquo;crossing after the
          boost peak&rdquo; from the charge settling. That put a 39.9&nbsp;s burn time and a
          1.9&nbsp;m/s burnout speed on a flight whose motor burned 5.9&nbsp;s and whose real
          burnout speed was 581&nbsp;m/s — with the burnout altitude, coast time and boost average
          all taken from the same wrong instant. One second sits far clear of that: on every
          flight the window matters to, the crossing lands 8–34&nbsp;s before apogee.
        </p>
        <p>
          Which matters for what <em>burnout velocity</em> then is. Where the burnout sample is the
          peak sample, it is <em>max velocity</em> under a second label — one number in two rows —
          and the tile and every report say so rather than letting it look like two measurements
          agreeing. That is so by construction where burnout came from the peak, and it still
          happens on an accelerometer reading whose trace has already fallen through zero by the
          time the speed turns over. Where the crossing lands on its own sample it is a separate
          instant and is left to stand: one corpus flight crosses 0.40&nbsp;s after its peak,
          116.30 against 118.09&nbsp;m/s. An AltimeterCloud export shows the other side of it: its
          own summary puts burnout 2.7–5.0% below its peak speed, which is the gap between two
          definitions of the instant, not two readings of a speed.
        </p>
        <p>
          <strong>Two different questions, and the burnout speed answers the second one.</strong>{' '}
          How the <em>instant</em> was located — an accelerometer crossing, or the speed peak
          standing in for one — is what the burn time and the burnout altitude rest on, because a
          clock and the altitude channel are read directly at it. The burnout <em>speed</em> is
          read off the velocity trace, so where that trace is differentiated from the altitude the
          number is derived however cleanly the crossing was found. Two logs in our test corpus are
          exactly that case, and until 2026-08-09 they printed a differentiated altitude as{' '}
          <em>measured</em> three rows under the identical figure labelled <em>derived</em>. The
          instant&apos;s provenance and the speed&apos;s are now stated separately, and where
          burnout is not the peak the &ldquo;usually reads high&rdquo; tendency is left off: that
          was measured on the peak, and this is a different sample.
        </p>
      </>
    ),
  },
  "rail-exit-velocity": {
    title: "Rail-exit velocity",
    body: (
      <>
        <p>
          How fast the rocket was moving when it cleared the rail (you pick the rail length) — found by
          integrating the flown velocity from liftoff until the rocket has covered one rail-length of
          travel, and reading the velocity there. It&apos;s a measurement, not a prediction. Rail
          clearance happens in the first metre or two, where a barometric altitude is coarsest and a
          barometric velocity is far too soft to read — so this needs a logged (accelerometer) velocity,
          and is withheld on a baro-only or GPS log rather than shown as a number that low can&apos;t
          support.
        </p>
      </>
    ),
  },
  "coast-efficiency": {
    title: "Coast efficiency",
    body: (
      <>
        <p>
          After burnout the rocket coasts on the energy it has; with no drag it would trade all of
          its burnout speed for height — a vacuum coast of v²/2g above burnout. Comparing that to
          the height actually gained reads off how much of the coast drag ate: the efficiency, and
          the altitude drag cost. Pure energy conservation on the flown numbers, no aerodynamic
          model. It assumes a near-vertical flight (a tilted one reads lower, since some coast went
          sideways) and rides on the burnout velocity, so it&apos;s withheld when that&apos;s too
          soft to trust. It measures the climb from the same burnout altitude shown beside it —
          the corrected one, where a barometric trace contradicted itself through the transonic
          push and the logger&apos;s own inertial solution stood in. That correction matters most
          exactly here, because burnout falls inside the stretch a shock over the static port
          distorts: two corpus mach-busters read &minus;93&nbsp;m (below the pad) and 774&nbsp;m at
          burnouts whose corrected heights are 482&nbsp;m and 172&nbsp;m, which moved their
          efficiencies from 14.9% to 12.2% and from 15.6% to 23.9%. Where the trace contradicts
          itself and no inertial solution can stand in, the burnout altitude is withheld — and so
          is this, rather than reporting a percentage measured from a height the record cannot
          state.
        </p>
      </>
    ),
  },
  "deployments-descent-rates": {
    title: "Deployments & descent rates",
    body: (
      <>
        <p>
          After apogee, Debrief looks for a clear, sustained drop in descent speed — a fast drogue
          giving way to a slow main — and marks it as the main deployment. Descent rates are the
          average vertical speed over each phase, <strong>averaged over time rather than over
          samples</strong>; a marginal transition is left unmarked rather than guessed.
        </p>
        <p>
          That distinction is not pedantry. Plenty of loggers change their sample rate during the
          flight — a Featherweight GPS drops from 10&nbsp;Hz to 0.5&nbsp;Hz once it is under way —
          and a per-sample average then weights the crowded seconds twenty times as heavily as the
          sparse ones. Just after apogee the rocket has barely started falling and the samples are
          dense, so the error runs the rate <em>low</em>. On one corpus GPS log the drogue leg came
          out at <strong>50.7&nbsp;m/s</strong> that way; the same file&apos;s own vertical-speed
          column averages <strong>63.9&nbsp;m/s</strong> over that leg and the altitude falls at{' '}
          <strong>64.5&nbsp;m/s</strong>. Debrief reads <strong>64.5&nbsp;m/s</strong> there — and
          since Debrief&apos;s figure now <em>is</em> that altitude chord, the number worth
          weighing it against is the device&apos;s own <strong>63.9</strong>, which is a separate
          instrument and agrees to 0.9%. A descent rate is what a flyer sizes a canopy against, so
          being 21% low is not a rounding difference.
        </p>
        <p>
          <strong>The figure is the leg&apos;s own chord</strong> — the height it lost over the
          time it took — measured on the recorded altitude rather than on anything derived from
          it. Taking it directly is what makes it independent of how the samples happen to be
          spaced, which is the whole point above: a chord asks only where the rocket was at each
          end of the leg and how long it took to get between them, so a logger that changes its
          sample rate mid-descent cannot tilt it at all.
        </p>
        <p>
          Until 2026-08-04 the figure was a time-weighted mean of the smoothed descent series
          instead. That is meant to come to the same number and did not: there are three
          smoothing passes between the altitude and that series, and a moving average works on an{' '}
          <em>index</em> window, so a fast sample beside a long gap gets smeared onto the samples
          that bound the gap and is then weighted by the gap&apos;s whole duration. The clearest
          case is a TeleMega recording that climbs at 25&nbsp;Hz and descends at 3&nbsp;Hz with
          gaps up to 11&nbsp;s: it published <strong>15.6&nbsp;m/s</strong> where its altitude
          falls 2,113&nbsp;m to 150&nbsp;m in 307&nbsp;s and its own speed column reads{' '}
          <strong>6.5&nbsp;m/s</strong>. It reads <strong>6.4&nbsp;m/s</strong> now.
        </p>
        <p>
          <strong>What settles it is the flights recorded more than once</strong>, because two
          instruments watching one descent have no reason to agree better unless the reading got
          closer to the truth. Of the eight such legs in the validation corpus, seven agree more
          closely than before and none agrees less: the XPRS&nbsp;2015 flight&apos;s two
          recordings went from <strong>40.1%</strong> apart to <strong>1.8%</strong>,
          Stargazer&nbsp;1&apos;s from <strong>9.0%</strong> to <strong>0.3%</strong>, and an
          L3 flight&apos;s three recordings from <strong>19.9%</strong> to <strong>4.3%</strong>.
        </p>
        <p>
          A chord reads two samples out of a leg&apos;s however-many, and one of them is the
          record&apos;s highest — which is exactly where a pressure spike survives. So each end
          is read as a short median rather than as the one sample sitting there. On a 121&nbsp;km
          flight whose apogee sample reads 75,516&nbsp;m between neighbours of 54,233 and
          58,509&nbsp;m, that is the difference between publishing 138.9&nbsp;m/s and
          107.4&nbsp;m/s.
        </p>
        <p>
          Each phase also has to be <em>in</em> the record to be read: a rate is reported
          only where the log shows that leg dropping more than a tenth of the height it started
          from, so a log that stops in mid-air moments after a deployment reports nothing for the
          leg it barely caught. One corpus recording loses power 1.3&nbsp;s after its main fires at
          1,877&nbsp;ft; the samples left average to 2&nbsp;ft/s where the second altimeter on the
          same flight reads 57. Two feet per second is the end of the record, not a descent.
        </p>
      </>
    ),
  },
  "ejection-delay": {
    title: "Ejection delay",
    body: (
      <>
        <p>
          For a motor-ejection flight, the ideal motor delay is the coast time — the interval
          from burnout to apogee, where the rocket has slowed to a stop and a charge deploys most
          gently. Debrief measures that coast directly, so it frames it as the delay to load and,
          given the printed delay you flew, reads off how far before or after apogee that charge
          actually fired (delay − coast time). A reading of the flown flight, not a prediction; the
          offset is only as sharp as the burnout and apogee it sits between.
        </p>
      </>
    ),
  },
  "deployment-shock": {
    title: "Deployment shock",
    body: (
      <>
        <p>
          When the logger recorded acceleration, the peak the airframe felt as the apogee charge
          and the main fired — the snatch force that breaks shock cords and zippers tubes — read
          straight from the accelerometer in a bracket of clock around the deployment —{' '}
          <strong>1&nbsp;s either side of apogee</strong>, and{' '}
          <strong>3.5&nbsp;s before to 1&nbsp;s after the main</strong>. A gentle deployment shows
          none; a coarse sample rate undersamples the spike, so read it as a floor, not a ceiling.
        </p>
        <p>
          The bracket is a span of time rather than a count of samples, and it is deliberately
          lopsided, because <strong>a charge does not fire at the instant Debrief detects the
          deployment</strong>. Apogee is the top of the altitude trace, and every apogee charge in
          the corpus fires 0.35–0.78&nbsp;s <em>before</em> it. The main is detected from the
          change in descent rate, which the charge causes rather than coincides with — the canopy
          has to open and the rate has to settle before there is anything to detect — so that lag
          is far longer, 2.0–2.9&nbsp;s on the flights that can be measured.
        </p>
        <p>
          Until 2026-08-04 this was ±0.3&nbsp;s converted to a <em>sample count</em> using the
          record&apos;s median interval, which is a property of the export and not of the flight:
          the span it really covered ran from 0.13&nbsp;s to 8.24&nbsp;s, and one Kairos Booster
          recording published <strong>22.8&nbsp;g</strong> from its <code>.csv</code> and{' '}
          <strong>1.5&nbsp;g</strong> from its <code>.eeprom</code> — one board, one launch, one
          charge, read two ways. The charge itself was <strong>84.6&nbsp;g</strong>, and neither
          file reported it. Twelve of the twenty-three shocks in the corpus moved by more than
          10%, and <strong>eleven of the twelve went up</strong>: the reading a flyer sizes a
          shock cord and a harness against was being understated, by as much as nine-fold.
        </p>
      </>
    ),
  },
  "main-deploy-altitude": {
    title: "Main deploy altitude",
    body: (
      <>
        <p>
          On a dual-deploy flight the altimeter fires the main at a set altitude. Debrief detects
          the main deployment and the AGL altitude it happened at, so it reads off where the main
          actually fired — and, given the altitude you set, how close the two were. It also shows
          how far the rocket fell under drogue first (apogee minus the main altitude). A reading of
          the flown flight and a safety check: a main that fires well below its setting lands hard.
        </p>
      </>
    ),
  },
  "main-descent-rate": {
    title: "A main descent rate, or the whole descent",
    body: (
      <>
        <p>
          A <strong>main descent rate</strong> is measured over the leg after a main deployment,
          and Debrief now reports one only where it actually found that deployment in the record.
          Where it did not, there is no main leg to measure — what the record supports is the
          average from apogee to landing, which is reported under its own name and never as a
          main. The difference is not cosmetic: over the corpus, <strong>18 of 25</strong>{' '}
          descending flights had no detected main deployment, and the figures being published
          under that label ran from 17.0 to <strong>148.5&nbsp;ft/s</strong> against a
          20–50&nbsp;ft/s band for the seven that genuinely resolved one. It also reached the
          comparison: four recordings of one flight agreed on the drogue to <strong>2.1%</strong>{' '}
          while their &ldquo;main descent rate&rdquo; cross-check read a{' '}
          <strong>121.6%</strong> disagreement — three had measured a main leg and the fourth had
          measured the whole descent. They had not disagreed; they had measured different things,
          and the two are now separate readings that are only ever compared with their own kind.{' '}
          Finding the deployment is not the same as finding the ground: on{' '}
          <strong>3 of the 37</strong> corpus flights analysed end to end, the record stops while
          the rocket is still under canopy, and the main leg is then averaged from the deploy to
          the last sample rather than to a touchdown. The loudest reads{' '}
          <strong>50&nbsp;ft/s</strong> — the top of that 20–50&nbsp;ft/s band, and a figure that
          means a main that failed if you take it as a landing speed, or a record that ends early
          if you do not. The rate is still shown, because it measures the descent that WAS
          recorded, but it says which it is, and no landing energy or parachute Cd is computed
          from it.
        </p>
      </>
    ),
  },
  "parachute-cd": {
    title: "Parachute Cd",
    body: (
      <>
        <p>
          How the recovery system actually performed: under a steady canopy the rocket is at terminal
          velocity, where drag balances weight, so C<sub>d</sub> = 2&nbsp;·&nbsp;m&nbsp;·&nbsp;g ÷
          (ρ&nbsp;·&nbsp;v²&nbsp;·&nbsp;A) falls straight out of the flown descent rate, with
          the descending mass and canopy diameter you supply (A is the canopy area, ρ the low-air
          density). A measurement of the flown descent, not a prediction — check it against the
          rule of thumb (~0.75 for a flat sheet, ~1.5 for a domed chute). The same reading is offered
          for the <em>drogue</em> on a dual-deploy flight — the fast fall between apogee and the main,
          worked with the thinner air density up there — flagged approximate, since a small drogue may
          not be fully at terminal velocity.
        </p>
        <p>
          <strong>Which descent the rate came off is stated on the card, because it is not always the
          main.</strong> Where the record holds a main deployment, the rate is that leg and the
          terminal assumption is one the record supports. Where it holds no deployment change there is
          no main leg to resolve, so the rate is the average over the <em>whole</em> descent and the
          card says so instead of calling it terminal — see <em>A main descent rate, or the whole
          descent</em> above for how often that is, and for what it costs.
        </p>
        <p>
          Only the <em>direction</em> of the error is claimable in that case, and it is worth stating
          because it is the half you can act on. A whole-descent average is a time-weighted blend of
          the legs the flight actually flew, so where an unresolved drogue leg is in it the average is
          faster than the main leg alone — and C<sub>d</sub> goes as 1&nbsp;÷&nbsp;v², so the figure is
          a <strong>floor</strong>: the canopy did at least this well. The <em>size</em> is not
          claimable, because a record that resolved no main leg carries no second rate to measure the
          gap against, and naming one would be the false precision this reading exists not to publish.
        </p>
      </>
    ),
  },
  "drag-coefficient": {
    title: "Drag coefficient",
    body: (
      <>
        <p>
          Back-calculated from the coast: after burnout and before apogee the only forces are
          gravity and drag, so the deceleration is a direct reading of the drag the airframe had
          on this flight. From the coast deceleration, the air density, and the coast mass and body
          diameter you supply: C<sub>d</sub> = 2&nbsp;·&nbsp;m&nbsp;·&nbsp;(drag deceleration) ÷
          (ρ&nbsp;·&nbsp;v²&nbsp;·&nbsp;A). It&apos;s a measurement of the flown flight, not a
          prediction — the figure to check your simulation&apos;s assumed C<sub>d</sub> against.
          C<sub>d</sub> rises through the transonic region, so the value is the median over the
          faster part of the coast, with the Mach window shown; a derived (baro) velocity makes it
          softer and it&apos;s flagged approximate.
        </p>
      </>
    ),
  },
  "landing-energy": {
    title: "Landing energy",
    body: (
      <>
        <p>
          How hard it came in: ½&nbsp;·&nbsp;m&nbsp;·&nbsp;v², from the descent rate measured near
          touchdown and the descending mass you enter. Reported in ft·lbf and joules — a measurement
          of the flight you flew, shown only when the log descended to a readable landing rate. The
          landing speed is also given as the free-fall <em>drop height</em> that reaches it
          (h&nbsp;=&nbsp;v²/2g) — exact and mass-free, the gut-feel &ldquo;it came in like a drop from
          here&rdquo; for judging whether a landing was too hard.
        </p>
      </>
    ),
  },
  "descent-faster-than-vacuum": {
    title: "A descent rate that beats a vacuum",
    body: (
      <>
        <p>
          The rocket is at rest at apogee — that is what apogee means — so nothing after it can be
          travelling faster than a free fall from that height in a vacuum,{' '}
          <span className="font-mono">√(2·g·h)</span>. No drag model, no mass, nothing to tune: it
          is the same energy argument the coast-efficiency read uses in the other direction. A leg
          whose average comes out above that ceiling is not a recovery rate, it is a jump in the
          altitude record showing up in the speed derived from it — a segment boundary, a pressure
          glitch, a logger resuming on a different baseline. Three logs in the corpus produced one,
          reading <strong>16,495</strong>, <strong>8,303</strong> and <strong>749&nbsp;ft/s</strong>{' '}
          as a <em>main descent</em>: a number a flyer might size a parachute against. Those legs
          are left unread with a note saying why, and every genuine reading in the corpus sits far
          inside its own ceiling — the fastest, 148&nbsp;ft/s, against 924.
        </p>
      </>
    ),
  },
  "record-stops-in-the-air": {
    title: "A record that stops in the air",
    body: (
      <>
        <p>
          A flight time and a descent need a descent to be <em>in</em> the record, and the same
          vacuum argument says when it isn&apos;t: a body cannot fall from{' '}
          <span className="font-mono">h</span> in less than <span className="font-mono">√(2h/g)</span>,
          so a log that ends sooner than that after its own apogee holds the climb and not the
          fall — whatever the trace does at the cut. This is not a rare shape. A logger that writes
          the same flight into one file twice can cut the first copy short, and the &ldquo;landing&rdquo;
          then found is the record restarting: on one corpus Blue Raven, 0.08&nbsp;s after the peak
          of a 10,245&nbsp;ft flight, reported as an 18.3&nbsp;s flight time. Those readings are
          withheld now, with a note saying how far short the record stops. The climb — apogee, top
          speed, burnout, the whole ascent — is unaffected and still read.
        </p>
      </>
    ),
  },
  "recovery-ground-track": {
    title: "Recovery (ground track)",
    body: (
      <>
        <p>
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
          altitude to the cosine and carries the rocket further downrange.{' '}
          The track saves two ways: <strong>GPX</strong> for a GPS app or a phone, and{' '}
          <strong>KML</strong> for Google Earth — the same fixes with the altitude beside each
          one, so what you get is the flight in the air over the actual field rather than a line
          on the ground. Heights in the KML are above the pad, which is what its
          <span className="font-mono">relativeToGround</span> mode means, so nothing about the
          site&apos;s own elevation has to be invented.
        </p>
      </>
    ),
  },
  "roll-spin": {
    title: "Roll & spin",
    body: (
      <>
        <p>
          When the logger recorded a roll-rate channel (angular rate about the long axis), Debrief
          reports the peak rate and the total revolutions the airframe turned through — the
          integral of the rate over the flight, so a spin either way counts. Fins induce roll, and
          too much of it bleeds energy and can drive coning, so it&apos;s worth a look. It reads a
          roll column you map (or one a logger labels &ldquo;roll&rdquo;); a bare three-axis gyro
          is left alone, since which axis is roll is logger-specific.
        </p>
        <p>
          A column named just <span className="font-mono">roll</span> is only a rate when it
          isn&apos;t an angle, and the siblings settle which: where <span className="font-mono">pitch</span>{' '}
          and <span className="font-mono">yaw</span> sit beside it, all three are Euler angles from
          an attitude solution and the rates are in the gyro columns. Debrief used to read a peak
          roll rate of <strong>179.99&nbsp;deg/s</strong> off every AltimeterCloud file in the
          corpus — the largest value a ±180° angle column holds, and a thoroughly plausible-looking
          rocket roll rate. No roll rate is reported for those files now: which axis of a
          three-axis gyro is the roll axis is logger-specific, and saying nothing is the honest
          answer.
        </p>
        <p>
          A column whose name says <span className="font-mono">angle</span> is read as one, and
          that closes a second shape of the same mistake. The sibling test above only fires where{' '}
          <span className="font-mono">pitch</span> and <span className="font-mono">yaw</span> are
          present, so an unrecognised spreadsheet with a{' '}
          <span className="font-mono">Roll_Angle</span> column and neither of those would have had
          its degrees read as degrees per second. That path is the column mapper, not a named
          logger — no file Debrief recognises by name was affected, because none of them mapped a
          roll column at all. A roll angle is its own channel now, plotted as an angle and never
          counted as a rate.
        </p>
      </>
    ),
  },
  "roll-angle": {
    title: "Roll angle (the board's own)",
    body: (
      <>
        <p>
          Some boards solve their own orientation and write the roll angle into the log. Debrief
          reads it where it is there and plots it beside the flight; it never derives one. The
          Featherweight Blue Raven is the case in the corpus: its low-rate export carries a roll
          angle, and it is <strong>cumulative</strong> — it keeps counting past a full turn rather
          than wrapping. On one corpus flight it peaks at <strong>26,099°</strong> and ends the
          flight at <strong>25,333°</strong>, having rolled back a little; read it as how far the
          airframe has turned and not as a heading.
        </p>
        <p>
          It is the board&apos;s number, with the board&apos;s limit. The vendor states the method:
          the angle is an integration of the measured roll rate over time and takes no account of
          how motion in the other two axes moves the airframe, so the error accumulates through the
          flight and grows fastest where the other axes are busiest — under thrust and through
          deployment. Debrief carries that sentence with the channel rather than leaving it to be
          looked up. No size is put on that drift: nothing in the corpus measures roll orientation
          independently, so any figure here would be invented.
        </p>
        <p>
          <strong>And on the one flight in our test corpus that also logs its roll RATE, the angle
          is a floor rather than a total.</strong> That file heads the rate column{' '}
          <span className="font-mono">HZ</span>; taking that as revolutions per second is an
          inference, and it is the arithmetic that supports it — the column holds at exactly
          ±6.38889 for 46 of its 36,700 samples, and 6.38889 × 360 is a round{' '}
          <span className="font-mono">2,300°/s</span>, a plausible gyro limit that no other reading
          of the unit produces. A value repeated dozens of times at exactly the extreme is a sensor
          sitting at its limit, not a rocket happening to repeat itself. Whatever the airframe did
          faster than that was never recorded, so neither the rate nor the angle built from it can
          contain it.
        </p>
        <p>
          That the board&apos;s angle really is the integral of that rate was checked rather than
          assumed: integrating the rate over the flight reproduces the stated angle to the degree,{' '}
          <span className="font-mono">25,333°</span> either way. <strong>Debrief does not perform
          that integration</strong> — it reads the angle the board wrote and does not yet read the
          rate at all; the check was run once against the corpus to confirm the vendor&apos;s
          stated method, and it is quoted here for the same reason the rest of this page quotes
          its sources.
        </p>
        <p>
          The same files carry a <span className="font-mono">Future_Angle</span> column, and
          Debrief deliberately does not read it. It is the board&apos;s projection of where its
          tilt is heading, used for its own tilt lockout — not a recording of anything that
          happened. Debrief reports flights that were flown.
        </p>
      </>
    ),
  },
  "long-axis": {
    title: "Which way is up the rocket",
    body: (
      <>
        <p>
          A board&apos;s high-rate file gives three gyro traces and three accelerometer traces
          named for the board&apos;s own axes — <span className="font-mono">X</span>,{' '}
          <span className="font-mono">Y</span>, <span className="font-mono">Z</span>. Which of them
          is the rocket&apos;s <em>roll</em> rate depends on how the board was mounted, and the
          same board sits differently in different airframes: across our test corpus one flight
          rests on <span className="font-mono">X</span> and another on{' '}
          <span className="font-mono">Z</span>. Debrief works it out from the recording rather than
          assuming it, and says nothing where the recording cannot settle it.
        </p>
        <p>
          <strong>Gravity is what answers it.</strong> A rocket on the rail stands within a degree
          or two of vertical, so the 1&nbsp;g an accelerometer feels while it waits lies along the
          airframe. Debrief takes the last stretch the record sat still before it moved, averages
          the three axes over it, and the axis carrying that gravity is the long one. Across the
          four high-rate files in our corpus it lands <strong>0.26°–1.72°</strong> off, and
          outweighs the next axis by <strong>33× to 216×</strong>.
        </p>
        <p>
          The board maker describes a different method — working the axis out from the direction of
          initial motion on the rail — and we measured that before choosing. Reduced to which axis
          carries the largest excursion, it separates the winner from the runner-up by only
          1.1×&ndash;2.4× and picks the <strong>wrong</strong> axis on two of the four files,
          because at 500&nbsp;Hz the sideways axes see shock and vibration that rival the boost.
          The board has its own solution and more to go on than its log; Debrief has the log, so it
          uses the part of it that is unambiguous.
        </p>
        <p>
          <strong>It is the last still stretch, not the first.</strong> A rocket often lies
          horizontal while it is prepared, frequently for longer than it then stands on the rail,
          and gravity lying across the airframe would name a sideways axis as the long one. The
          answer is withheld altogether when the record never left the ground, when there is no
          still moment before it did, when the board was turning or rocking through that moment
          rather than resting, or when no axis is within 15° of the gravity it felt.
        </p>
        <p>
          Naming is all this does. The traces are labelled — <em>roll rate</em>, <em>lateral
          rate</em>, <em>along</em> and <em>across the airframe</em> — so you can tell which is
          which on the chart. No reading is computed from them: a high-rate stream is drawn as an
          envelope of the board&apos;s peaks rather than the full stream, and a figure taken off
          that would need its own checking first.
        </p>
        <p>
          <strong>A backup download can write part of the flight twice</strong>, and where it
          does, Debrief says so on the report. Two of the four high-rate files in our corpus
          repeat an earlier stretch of themselves verbatim &mdash; <strong>27,261</strong> of one
          file&apos;s 64,290 samples and <strong>44,793</strong> of another&apos;s 93,164 &mdash;
          with the sensor block byte-identical, so those samples are a replay of an earlier moment
          rather than a reading of the one they are drawn at. The other two repeat nothing.
          Nothing is removed on account of the repeat &mdash; those samples are reduced onto the
          flight&apos;s clock like any other, as the envelope described above &mdash; and the note
          names only the repeated stretches that fall inside the stretch of the flight being read,
          since a caution about a moment the chart does not draw is one you cannot check.
        </p>
      </>
    ),
  },
  "battery": {
    title: "Battery",
    body: (
      <>
        <p>
          When the logger recorded its battery voltage, the resting voltage at the start and the
          lowest it sagged to. A pack that droops under the current a deployment charge draws can
          fail to fire it, so the drop is worth a look — though what counts as low depends on your
          battery, so it&apos;s reported plainly, not judged.
        </p>
      </>
    ),
  },
  "when-the-flight-flew": {
    title: "When the flight flew",
    body: (
      <>
        <p>
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
        </p>
      </>
    ),
  },
  "the-samples": {
    title: "The samples themselves",
    body: (
      <>
        <p>
          Under the explorer&apos;s plot is every sample in the window, exact and in your units —
          nothing decimated away, because a sample you can&apos;t see is a sample you can&apos;t
          check. <em>Jump to</em> scrolls straight to a liftoff, burnout, apogee or deployment and
          highlights the row it landed on, and <strong>any column sorts</strong> (click once for
          highest first, again for lowest, a third time back to the order the flight was recorded
          in). Sorting a time series is not idle: sorting altitude descending is how you tell a
          real apogee from a one-sample spike — the top of the list either steps down gently or
          starts with an outlier, and the second reading is the honest one. Each column also
          copies on its own (the ⧉ beside its name): the whole set has always been a CSV away,
          but a flyer who wants the descent rates in a club sheet wants one channel, not eleven.
          What lands in the spreadsheet is what is on screen — the rows in this window, in the
          order the table is showing them.
        </p>
      </>
    ),
  },
  "what-the-charts-show": {
    title: "What the charts show, and what they leave out",
    body: (
      <>
        <p>
          The three plots open on <strong>the flight</strong> — from just before liftoff to just
          after touchdown — not on the whole file. A logger armed early records the pad wait, and
          one corpus TeleMega holds 308 seconds of it in front of a 76-second flight: opened on the
          record, four fifths of that chart is a rocket standing still and the boost is a sliver.
          Nothing is dropped or trimmed from the data. <em>Full record</em> shows the file end to
          end, the zoom row says which view you are looking at, and dragging across any chart zooms
          all three together. The saved figures and the shareable card are framed the same way as
          the screen, so a document says what the page said.
        </p>
      </>
    ),
  },
  "what-goes-in-the-report": {
    title: "What goes in the report",
    body: (
      <>
        <p>
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
        </p>
      </>
    ),
  },
  "events-called-out": {
    title: "Which events are called out",
    body: (
      <>
        <p>
          Debrief marks liftoff, burnout, apogee, the deployments and landing on the explorer&apos;s
          plot — and you can turn any of them off. That is not a nicety on a real record: measured
          across the corpus, <strong>28 of 30</strong> flights have two markers inside 6% of the
          plotted span, the tightest a burnout and an apogee <strong>0.10%</strong> apart on a
          99-second record, because the boost is a few seconds inside a log that runs for minutes.
          Only the events this flight actually has get a control, everything is on until you say
          otherwise, and the choice is kept on this device. The chart&apos;s accessible name lists
          whichever are currently marked, so the markers reach a screen reader too.
        </p>
      </>
    ),
  },
  "built-in-views": {
    title: "Built-in views",
    body: (
      <>
        <p>
          Four views are there on the first visit, before anything is saved: altitude &amp; speed,
          speed &amp; acceleration, Mach &amp; max-Q, and the recorded altitude under the one
          Debrief reads. They name only Debrief&apos;s own derived channels, never a column from
          your file — one logger&apos;s <code>Batt(V)</code> is another&apos;s{' '}
          <code>Battery</code>, so a built-in written against a column label would be right for
          one device and quietly wrong for the next. A built-in appears only where the flight has{' '}
          <em>every</em> channel it names: a barometric-only log is not offered
          &ldquo;speed &amp; acceleration&rdquo;, because a view that silently drops half its
          series is a different plot under the same name. Saving a view of your own under one of
          those names replaces it.
        </p>
      </>
    ),
  },
  "named-views": {
    title: "Named views",
    body: (
      <>
        <p>
          The explorer remembers how you last set it up, and you can also keep several plots under
          names you choose — the boost, the deployments, the airframe&apos;s health — and switch
          between them on any flight. A view names its channels rather than their column numbers,
          since column 3 means something different in every logger&apos;s export, so a saved view
          follows you across loggers and restores only the channels the flight in front of you
          actually has. Kept on this device, like the rest of Debrief&apos;s state.
        </p>
      </>
    ),
  },
  "logbook-backup": {
    title: "Logbook & backup",
    body: (
      <>
        <p>
          Flights you open are remembered in this browser (IndexedDB) for quick re-opening,
          and a note keeps one as a permanent logbook entry. Because that lives only on this
          device, <em>Export</em> bundles the whole logbook — flights and notes — into a JSON
          file you keep, and <em>Import</em> merges it back, so a new machine or a cleared
          browser doesn&apos;t lose it. The file never leaves your device; it&apos;s yours to
          store wherever you like.
        </p>
      </>
    ),
  },
  "units": {
    title: "Units",
    body: (
      <>
        <p>
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
        </p>
      </>
    ),
  },
  "offline": {
    title: "Offline",
    body: (
      <>
        <p>
          One visit with a signal is enough: as soon as the service worker takes control, the page
          hands it the list of what it just loaded, so the shell, the app&apos;s code and the
          sample flight are all cached — Debrief used to need a second visit before an offline one
          worked. These documentation pages are cached on install too, <em>with the code each one
          needs to come up</em> — a cached document alone is not a page, and a route whose scripts
          are missing shows an error instead of itself — so the methods and the limitations are
          readable at the field with no bars, as themselves rather than as the home page.
          <br />
          <br />
          Three ways an offline page used to show you the wrong one, all closed. Tapping a link
          rather than reloading makes the app fetch the route&apos;s data file, not its document —
          with no signal that failed, and the browser fell back to the data file&apos;s own address,
          so you landed on <code>/methods/index.txt</code> looking at the home page; those files are
          cached now. An address without its trailing slash (<code>/validation</code> rather than{' '}
          <code>/validation/</code>) is normally squared up by the server, which isn&apos;t there
          offline, so both forms are looked up. And a page that genuinely was never opened on this
          device now says exactly that, names the address, and points you at the part of Debrief
          that does work with no signal — instead of quietly showing the home page under someone
          else&apos;s address. Only Debrief&apos;s own static files are stored, locally; no flight
          log is ever cached, uploaded, or sent anywhere.
        </p>
      </>
    ),
  },
  "formats-privacy": {
    title: "Formats & privacy",
    body: (
      <>
        <p>
          Altus Metrum (AltOS), PerfectFlite, Eggtimer, Featherweight (Raven, Blue Raven and GPS),
          Entacore AIM, MissileWorks RRC3 (mDACS) and Rocketry Ltd Mercury (AltimeterCloud) files
          are recognized automatically — the last of those in both its header flavours, one of
          which writes its temperature in hundredths of a degree, so read as a plain column it
          comes out as thousands of degrees and is thrown away; the
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
          the device&apos;s side of the cross-check. A Featherweight GPS has two exports and they are
          not the same file: the tracker&apos;s own log, and the <em>ground station&apos;s</em> record of
          what it received. The second holds two positions per row — the receiver&apos;s and the
          rocket&apos;s — so the flight is read from the <code>TRACKER</code> columns and never from the
          receiver sitting in the field, and since that export states no elapsed time at all, its time
          base is built from the <code>DATE</code>+<code>TIME</code> wall clock it does state. Its gaps
          are lost radio packets rather than a paused logger, and it says so.
          The RRC3 export names no units, so — like a metric-configured Eggtimer — its
          altitude is ambiguous between feet and metres; Debrief settles it from physics, reading the
          altitude in whichever unit matches the apogee its own barometric-pressure column implies.
          Files are read with the browser&apos;s own file API and never uploaded.
        </p>
      </>
    ),
  },
  "what-debrief-isnt": {
    title: "What Debrief isn't",
    body: (
      <>
        <p>
          Debrief reads flights you have already flown. It is <em>not</em> a simulator: it doesn&apos;t
          predict performance, recommend motors, or model anything you haven&apos;t flown. To plan a
          flight <em>before</em> you fly it, reach for a dedicated, well-validated rocketry simulator —
          this is a hobby where that margin matters.
        </p>
      </>
    ),
  },
};
