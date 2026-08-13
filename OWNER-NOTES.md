# Owner notes — the architect's inbox

**This is the one channel through which the owner's judgment reaches an unattended run.** Every other
file in this repo is written by sessions, for sessions. This one is written by the OWNER, and a
session's job is to triage it — never to add to it.

It exists because of a gap the rest of the system created deliberately. `MAINTAINING.md` says the
prompt must carry no state, so the standing prompt names no milestone and no goal; `ROADMAP.md`
carries the queue instead. That is right, and it left the owner with nowhere to stand: the only way to
steer was to write a goal into the prompt, which the manual forbids for good reason. Several clauses
already say *"unless the owner named one"* and *"if the owner names a correctness focus, that
overrides this"* — and until this file existed there was no place for the owner to name anything. This
is that place.

**An empty `## Open` section is the normal case and changes nothing.** The owner will usually not have
dropped anything. A run that finds nothing open proceeds exactly as `MAINTAINING.md` describes —
alternating tracks, next unstarted milestone from each. Do not read an empty inbox as an absence of
direction, do not go looking for direction elsewhere, and do not treat this file as a reason to
re-scope. **The standing prompt does not change and never mentions this file.**

---

## For the owner: how to drop a note

Write roughly. Shaping a sentence into a milestone with a *done when* and a pinning check is the
session's job, not yours — that is the whole point of the split. Ideas half-formed, a bug you saw on
the live site, a thing you want done differently, a competitor detail you noticed: all fine, all in
the same voice you would use in conversation.

Three things help and none is required:

- **Say which repo, or say "both."** If it applies to both tools, it gets a `ON-B<n>` id and the
  identical text goes in both repos.
- **Say where you saw it** — the live site, a phone, a specific page. A session that cannot reproduce
  a note has to say so rather than quietly drop it, and knowing where you were saves it a run.
- **Say if you are overruling something.** If a note contradicts this repo's manual or design system,
  that is allowed and the manual gets amended — see *precedence* below. It only needs calling out
  when you know you are doing it.

**You never have to edit this file by hand.** Open a session with both repos attached and use this
prompt — it takes rough text and files it, assigning ids, splitting it across the two repos, and
cross-applying anything just as true of the sibling, without building any of it:

```
Read MAINTAINING.md in full first. FILE OWNER NOTES — build nothing this session.

Everything below the line is rough direction from me. File it into OWNER-NOTES.md in whichever
repo each item belongs to, following the triage contract in that file:

- preserve my wording verbatim in the note body; your reading goes underneath it
- assign ids; anything true of both tools gets an ON-B<n> and identical text in both repos
- cross-apply anything just as true of the sibling repo, labelled as derived, NOT as my words
- flag any note that contradicts MAINTAINING.md, DESIGN.md or ROADMAP.md, and name the clause
- answer any question I ask inline, in the note, with the measurement behind the answer

Do not write verdicts, do not touch ROADMAP.md, and do not implement any of it — the next
autopilot run does that. Commit and push both repos. Then tell me what you filed, and say if you
think any of it is wrong or conflicts with something I have already decided.

---
<paste rough thoughts here — unformatted is fine>
```

Then go back to the standing prompt. The next autopilot run picks the notes up on its own.

---

## For the session: the triage contract

**Read this file FIRST at session start — before `ROADMAP.md`.** It is step 1 of *Session start* in
`MAINTAINING.md` for a mechanical reason: an open note can reorder the queue, and reading the queue
first means scoping a run you then have to throw away.

**Every open note gets a written verdict in the first run that sees it.** Not the work — the verdict.
Triage is minutes; the work may be several milestones. A note that sits `Open` across two runs with no
verdict is the failure this file exists to prevent, and it is the one thing here that is checked at
the end of every run (see the done-check in `MAINTAINING.md`).

A verdict is one of these, written under the note as a `VERDICT:` line with the date:

| verdict | means | goes where |
|---|---|---|
| `SEV-1` | a wrong number, a one-way door, or a blocked milestone | fixed **this run**, ahead of everything |
| `→ ROADMAP` | it is a capability or a craft milestone | a new milestone on the D- or P-track, named on the verdict line |
| `→ DESIGN.md` | it is a system rule, not one surface | that file changes first, in **both** repos, then components converge |
| `→ COMPETITION.md` | it is a gap against another tool | a row, then resolved or `REJECT`ed like any other |
| `→ BACKLOG.md` | genuinely a single small defect | the ledger, subject to the one-in-four quota |
| `REJECTED` | it cannot or should not be built | **with the reason and the rule or measurement that decides it** |
| `BLOCKED` | it needs the owner to change a hard invariant | say which invariant, at the TOP of the report |

**Notes enter the queue as milestones — they do not bypass the milestone machinery.** A note becomes
work with an outcome, a *done when*, a size and a pinning check, exactly like any other entry in
`ROADMAP.md`. This matters more than it looks: "completion has to be mechanical, not a matter of
opinion" is what stops one run believing a note is addressed and the next disagreeing. A note chased
as a vibe is a note that gets re-litigated every run.

**Owner-note work is QUEUED work.** It is not governed by the one-in-four quota on unqueued defect
work, and it does not compete with either track's next milestone — it reorders them. The quota exists
to stop a self-generated defect ledger absorbing every run; an owner note is the opposite of that.

**A note is not a specification.** The owner writes what is wrong or what they want; you decide the
right shape. If the literal request is the wrong way to get the outcome, build the outcome and say so
on the verdict line with the alternative you rejected. What you may not do is silently substitute
something easier and call the note addressed.

**Reproduce before you scope — and if you cannot, say so in the note.** The owner saw it on the live
site. A note you cannot reproduce is a note whose repro you have not found yet; write
`UNREPRODUCED: <what you tried>` under it and leave it open. Never close one as unreproducible without
that line, and say it in the report.

### Precedence — where a note wins, and where it does not

**Where a note conflicts with `MAINTAINING.md`, `DESIGN.md` or `ROADMAP.md`, the note wins, and you
amend that file in the same run** — citing the note id as the reason. The owner authored those files;
a note is them changing their mind, which is a thing they are allowed to do without a session arguing
from a document they wrote themselves. Leaving the contradiction in place is the worst outcome,
because the next run resolves it the other way and the two runs undo each other.

**Where a note appears to require breaking a hard invariant, it does NOT win. File it `BLOCKED`.**
The hard invariants are the ones with a real-world cost behind them, and none can be relaxed by
inference from a preference about the UI:

- ZERO ASSISTANT TRACE
- PRIVACY IS SACRED — a flyer's file never leaves the device
- MEASUREMENT, not simulation — the safety spine
- EVERYTHING client-side / static
- CLEAN-ROOM / licensing
- "SHIPPED" MEANS REACHABLE BY A FLYER

A note that needs one of these changed needs the owner to say *"I am changing invariant X"* in as many
words. Until then, build the part that does not need it, file the rest `BLOCKED`, and put it at the
top of the report — never build it, and never quietly drop it.

### Lifecycle

Newest drop first. A note moves to `## Resolved` only when it is **reachable by a flyer** — the same
bar as everything else here — or when its verdict is `REJECTED`. Collapse it to one line there: the id,
a short restatement, what it became, and the SHA or PR that landed it.

**Never rewrite or delete the owner's words.** The blockquote in a note is verbatim, including where
it is imprecise. Your reading of it goes underneath, where it can be wrong without corrupting the
record.

**Ids are permanent and never reused.** `ON-<n>` is this repo; `ON-B<n>` is a note that applies to
both tools and carries identical text in the sibling repo. A milestone born from a note cites it —
`D9 (from ON-4)` — so provenance survives into the queue.

### The reverse channel — `## Awaiting the owner`

The traffic is not one-way. `MAINTAINING.md` has always said that an owner-level decision which does
**not** block you goes in the report and in `HANDOFF.md` — and both of those are rewritten every
session, so a question parked in either is gone within a day. That is why owner-level decisions kept
being re-derived instead of answered.

Park them here instead, one line each, newest first: a secret only the owner can add, a repo only they
can attach, a product fork worth their opinion, an invariant a note is pressing against. **This does
not change *"never stop to ask."*** You still take the most defensible option, record it under
*Decisions taken without the owner* in `ROADMAP.md`, and keep shipping — parking the question is what
you do *as well*, not instead. Remove an entry when it is answered, and say in the report how many are
outstanding.

---

## Open

### Dropped 2026-08-08 — the first batch

**Housekeeping, 2026-08-09.** `ON-1` and `ON-4` sat here in full for a day after being marked
RESOLVED, so this section read as eight open notes when six are open — and the count is the whole
signal this file exists to give. Both are collapsed into `## Resolved` per the lifecycle rule above,
**with the owner's verbatim words carried across** rather than dropped: "never rewrite or delete the
owner's words" outranks "collapse it to one line", so the one line got a blockquote under it.


Eight notes were filed from a single conversation after the owner walked the live site; **six are
still open here** and two are in `## Resolved`. Every one was the owner's reading of
`debrief.fusionspace.co` — except the corpus measurement in `ON-2`, taken at filing time and marked
as such — and each has since been reproduced or refuted by measurement rather than left as an
impression.

---

**ON-2 · not enough sample flights to show what the tool does · SOURCE: owner, 2026-08-08**

> this may require a cowork session but there needs to be more sample flights for showing the
> different capabilities of the project. I don't personally have a way to verify it. i don't even
> mind if we use made up logs to show these. tell me if this is solved in the fixtures and you can
> just pull the data.

**Answering the owner's question, measured at filing time: no, the fixtures do not solve this, and
pulling from them would breach the licensing invariant.**

- `debrief-fixtures` holds **62 real logs across 11 logger families** — genuinely broad coverage.
- `debrief-fixtures/LICENSING.md` opens with *"This repository is private on purpose. Keep it
  private."* There is **no blanket license**: the files come from academic repos with no LICENSE,
  forum posts, Reddit threads and shared spreadsheets, none of which grant redistribution.
- Many logs embed **real names, launch-site GPS accurate to a few metres, and device serial numbers**.
  That is the second, independent reason — it would not become publishable by finding a license.
- Exactly one file is described as arguably redistributable (the Jolly Logic manufacturer sample) and
  even that says to check current terms first.
- Today the app ships **one** sample: `public/samples/sample-altusmetrum.csv`, wired at
  `components/Analyzer.tsx:108`. One file is the entire demonstration surface for ten parsers, the
  column-mapper, comparison, reconciliation, stitching and the report builder.

So **the owner's own suggestion is not a fallback — it is the only lawful route at this scale**, and
it is better than the real corpus for the stated purpose: a synthesized log can be built to exercise a
specific capability (a staged flight logged on two devices, redundant altimeters that *disagree*, a
saturated accelerometer, coarse GPS, a mis-scaled column the mapper has to catch) where a real log
covers those only by luck.

**One constraint, and it is not negotiable — this is where MEASUREMENT-not-simulation bites.** The
whole promise is that every number is a reading of a real recording. A synthesized log presented as a
flight breaks that promise more seriously than any missing feature would. Whatever ships must be
labelled synthetic on **every** surface that can carry it out of the app — the metric grid, the
report, the comparison, the print card, and each of the `.txt`, `.md`, `.html`, `.csv`, `.json`,
`.gpx` and `.kml` exports. Run the surface audit; do not trust memory for that list.

VERDICT: **→ ROADMAP · 2026-08-08 · D10 — "A sample for every capability, and it says it is one"**.
The note's premise is confirmed by measurement: `find public -type f | grep -i sample` returns
**exactly one file**, `public/samples/sample-altusmetrum.csv`, offered from a single call site
(`components/Analyzer.tsx:108`, `SAMPLE_URL`). One baro/GPS log from one logger family is the entire
demonstration surface for ten parsers, the column-mapper, multi-recording reconciliation, per-stage
stitching, the OpenRocket overlay and the report builder — so every shipped D-milestone except D2 is
invisible to anyone who has not brought their own files.

The filing answer above stands and is not re-litigated: the corpus cannot ship. The route is the
owner's own — synthesized logs — and the constraint in the note body is adopted verbatim as the
milestone's hardest *done when*: **labelled synthetic on every surface that can carry it out of the
app, never counted in any accuracy or validation figure.** The surface audit is run as slice 1 rather
than trusted from memory, because this repo's own history is that a caveat lands on one panel and a
confident claim on another.

PROGRESS · 2026-08-13 (second entry, same run) — **the sample is now OFFERED, which is the half of
this note you can actually see.** `/` carries a fourth way in: *"A spreadsheet Debrief has to be
told about"* — columns no parser recognises, mapped by hand into a flight, which is the answer to
any log Debrief does not know and was a shipped capability with **no demonstration at all**, because
a file a parser recognises cannot demonstrate the mapper. It is the first flight in the app Debrief
made up, and it says so on the button before you press it and on every surface afterwards. That is
what the twelve labelling slices were for.

Still open on this note: the other synthesized logs — a saturated accelerometer, a coarse-GPS
flight, and a staged pair on two devices, which is the only thing that will give `/stitch` a sample
and the one place a competitor (Featherweight's wFIP 2.0, with Jason Brown's two-stage *BadaBoom*)
demonstrably beats us.


now the samples themselves rather than the labelling.** Every sink this audit has found carries the
claim: **24 of 29 by a named check, 5 by prose in the document itself, 0 left open**, against 21 of
28 a run ago. The three that closed this run are the ones a figure does not get *read* through but
*walked to* — the `.gpx` a handheld navigates by, the `.kml` Google Earth draws, and the landing
coordinate you paste into a maps app — plus `/stitch`'s timeline and the share link. Two cautions,
because a round number invites more confidence than it has earned. **`todo: 0` means nothing KNOWN is
open, not that nothing is**: three of the last four slices each found a sink the audit had never
enumerated, one of them on the very surface that slice was about. And one row was marked covered by a
check that read its own source file, so it could not have failed — found and fixed this run, and it
is the third time this ledger has recorded that shape of mistake. **What is next on this note is (c):
offer the mapper sample.** The generated file has been written and tested since 2026-08-09 and is
held back, not missing.

PROGRESS · 2026-08-12 — still open, and here is the honest state of the hard half. Of the sinks a
made-up figure can leave through, **21 of 28 now carry the claim** (5 by prose, 16 by a named check),
against 24 of 27 a run ago. **The count went UP by one while three closed**, because a pre-push
review found a whole export the audit had never enumerated — the channel explorer's window-stats
clipboard table, whose own code comment calls those figures *"the numbers a cert document quotes"*.
That is the answer to the question this note really asks: the labelling is not nearly done, and the
thing standing between here and offering you a sample is the seven remaining sinks, not the
generator, which has been written and tested since 2026-08-09. The `.gpx`, `.kml` and plot-image
sinks are next.

One correction to the note's framing: the sample path is **not** a bypass of the parser — but it
was a second path, and that mattered. It fetched one URL, ran the bytes through `decodeBytes` and
handed `ingest` a string, where a dropped file goes through `fileToText(name, bytes)` (which unzips
an `.xlsx` and sniffs a UTF-16 BOM) and carries its `bytes`. So a sample could only ever be a UTF-8
text file, and only ever ONE file. Both are gone as of slice 1 — samples build real `File` objects
and go through `onFiles`, the drop path itself.

---

**CORRECTION, 2026-08-08, and it changes the answer to the owner's actual question.** The verdict
above says the fixtures cannot ship, and that is right about `debrief-fixtures` — the PRIVATE
corpus, which has no blanket license and carries real names, launch-site GPS and device serials.
**It is not true of `lib/parsers/__fixtures__/`, which is a different set**: publicly-shared logs
already committed to this public MIT repo, with their provenance documented in that directory's own
README. Serving one from `public/samples/` publishes nothing that is not already published.

So the answer to *"tell me if this is solved in the fixtures and you can just pull the data"* is
**partly yes, and better than the synthetic route** — because these are real recordings, so no
sample has to be labelled synthetic and the MEASUREMENT invariant is never traded for a
demonstration. Two of them are the same physical flight recorded by two different boards, which is
the capability (D3, shipped) that had no demonstration at all.

**Synthetic logs are therefore NOT needed for the capabilities the committed fixtures already
cover, and remain the route for the ones they do not** — a deliberately mis-scaled column for the
mapper, a saturated accelerometer, a staged flight on two devices. The labelling constraint in the
note body stands unchanged for those, and D10's *done when* keeps it.

---

**ON-3 · a question mark should open a popover, not navigate · SOURCE: owner, 2026-08-08**

> it would be nice if clicking on any of the question marks would just open up a pop up not to a
> seperate page that would explain

Mirrored in the sibling repo by its `ON-5` (clicking a body tube opens a popover to customize it) —
the same interaction pattern arriving from two directions on the same day, which is what a shared
`DESIGN.md` §5 primitive is for. Build it once, in the system, for both repos; do not invent it twice.

Worth reading against the craft bar's *"a feature reachable only by knowing it is there — including
one that exists on one surface and is merely described on the surface that needs it."* A question mark
that navigates away costs the flyer their place in the report, which is the specific friction the note
is about.

VERDICT: **→ DESIGN.md, then → ROADMAP · 2026-08-08 · P8 — "The explanation comes to the reading"**.

TRIAGED 2026-08-13 — **read, not moved.** P8 is still unstarted and this run spent the P-track on
P1's contrast slice and the first two rows of the design-system audit. One thing that HELPS it
shipped anyway and is worth knowing: every `?` on this page links into `/methods` by id, and those
anchors were landing 14 px UNDER the sticky strip on a touch phone. So the navigate-away behaviour
this note asks to replace was also arriving in the wrong place; it now lands clear. That does not
close the note — a popover is still the right answer — it removes the compounding defect.
**Reproduced exactly.** The question marks are at `components/MetricGrid.tsx:33`: every reading tile
whose term of art has a write-up renders a superscript `?` that is an
`<a href={`/methods#${tile.method}`} target="_blank">`. **21 of the grid's tiles carry one**
(`grep -c "method:" lib/readings.ts`), and all 21 do the same thing — open a second tab onto a
12,700-word page (see `ON-1`) and jump to an anchor sitting among 51 flat sections. Nothing in the app
explains a reading in place; the count is **21 that navigate away, 0 that explain where you are.**

Two things this repo already got right, both worth keeping rather than rediscovering. The comment
above that link rejects a **tooltip**, and is correct to: hover is nothing on the phone this tool is
built for, and the answer is a paragraph rather than a phrase. A popover is not a tooltip — it is
click- and tap-activated, keyboard-reachable and dismissible — so the owner's ask survives the
objection already recorded against the alternative. And `lib/methodIds.ts` already binds both sides at
compile time: a reading may only cite a `MethodId` that exists, and the page may only render one, so a
renamed block breaks the build rather than a flyer's link. **The content is already keyed; what is
missing is somewhere to put it.**

**This is a system change before it is a surface change, so `DESIGN.md` moves first.** §5's vocabulary
has `Disclosure` (in-flow progressive detail) and no overlay primitive at all, and the app has already
hand-rolled one without it: the per-quantity units panel is a raw `<details>` that
`e2e/touch.spec.ts:209` had to be written for after it opened from −39 px at a 375 px viewport. That
is the second site reaching for the same missing word, which §5 records twice already as the
vocabulary being wrong rather than surfaces being undisciplined. **§5 gains `Popover`.**

**Owed to the sibling repo and not shipped there** — `DESIGN.md` is identical in both and the sibling
was not attached to this session. Parked under *Awaiting the owner*. The sibling's `ON-5` (clicking a
body tube opens a popover to customize it) is the same primitive arriving from the other direction, so
building it twice is the failure this verdict exists to prevent.

---

---

**ON-B1 · match the motor finder's theme and tip controls · SOURCE: owner, 2026-08-08 · BOTH REPOS**

> fusion space already has a public live polished site: `https://motor.fusionspace.co` /
> `https://github.com/nrdptel/Hobby-Rocket-Motor-Finder`. Say like the theme control button and the
> tip button is not consistent with the motor finder one and it needs to be.

The suite has a **live reference implementation** and neither of these two repos has been measured
against it. `DESIGN.md` §10 (*Suite consistency*) and the ECOSYSTEM CONSISTENCY invariant both already
require this; what was missing was the instruction to go and look. The motor finder is the senior
sibling — where it and `DESIGN.md` disagree on a shared control, treat the live site as the fact and
`DESIGN.md` as the thing that needs correcting.

The site is publicly fetchable, so this is verifiable without the repo. If a session needs the source,
that repo has to be attached to the environment by the owner — say so in the report rather than
guessing at the implementation from rendered output.

VERDICT: **→ COMPETITION.md · 2026-08-08 · the note is HALF right, and the two halves need opposite
answers.** Both live sites fetched and their rendered header markup compared directly — this is
measured from served HTML, not inferred from a screenshot.

**The theme control: UNREPRODUCED — they are already the same control.** Byte-identical on both sites
in every property a flyer can perceive:

| | motor.fusionspace.co | debrief.fusionspace.co |
|---|---|---|
| `title` | `Theme: System (click to change)` | **identical** |
| `aria-label` | `Color theme: System. Click to change.` | **identical** |
| glyph + label | `◐` + `System` (3-way, not a 2-way toggle) | **identical** |
| resting classes | `rounded-md border border-zinc-300 bg-white text-zinc-700 text-xs` | **identical** |
| horizontal padding | `px-2.5` | `px-2` |
| touch floor | none | `pointer-coarse:min-h-11` |

Two differences, both in Debrief's favour and neither visible: 2 px of padding, because Debrief routes
through `Button size="sm"` where the motor finder hand-rolls the classes, and a coarse-pointer hit
floor the motor finder does not have. **Deliberately NOT converged.** Moving `Button size="sm"` to
`px-2.5` to match would take every small button in the app off `DESIGN.md` §4's spacing scale to close
a gap nobody can see, and would drop the touch floor §8 requires. Recorded rather than done.

**The tip control: REPRODUCED, and it is a colour divergence Debrief made on purpose.** The motor
finder's is `border-amber-300 bg-amber-50 text-amber-700`; Debrief's is neutral secondary. Geometry,
icon, label and `title` string already match exactly. `components/KofiButton.tsx` carries the reason in
a comment: it *was* amber and was converted, because `DESIGN.md` §2 gives amber the meaning `warn` —
an estimate outside its envelope, a caveat — and every other amber in this tree is a real caveat.

**Not converged onto amber, and this is the decision rather than an omission.** The same fetch shows
the motor finder's header also carries a **sky** API chip. §2 permits `indigo` and no second accent, so
converging Debrief onto that header imports two off-system accents into a shared design system that
allows one, and spends the exact hue Debrief's safety posture leans on — in a persistent header that
sits above every report a flyer scans for amber caveats. That cost does not exist in a motor
catalogue, which is why the same choice is right there and wrong here.

**The outcome the note wants is a consistent suite, and the cheaper direction is the other one:** the
motor finder adopts the neutral treatment its own shared `DESIGN.md` already specifies. Only the owner
can make that change — that repo is not attached — so it is parked under *Awaiting the owner* with the
question stated in one line, a `COMPETITION.md` row records the comparison, and Debrief ships
unchanged. Recorded in *Decisions taken without the owner* with the alternative rejected.

---

**ON-B2 · the GitHub repo page is a surface too · SOURCE: owner, 2026-08-08 · BOTH REPOS**

> Another thing they can learn form this project is to also keep the github repo page itself updated.

Taken from the motor finder, which does this well. The repo landing page is the first thing anyone
sees who arrives from a forum link, and nothing in the workflow currently treats it as a surface that
can go stale — `README.md` is not in the session-start read list and no done-check step looks at it.
The description, topics and pinned links are part of it, not just the README.

VERDICT: **→ ROADMAP · 2026-08-08 · folded into P5 ("Ready for the public"), whose *done when* is
widened to name the repo page.** P5 already carried half of this — *"the README shows what the tool
does with images rather than describing it in 27 KB of text"* — and the measurement confirms it is
still true and slightly worse than recorded: `README.md` is **4,545 words and 28.0 KB with zero
images** (`grep -c '!\[' README.md` → 0). A forum visitor's first screenful is three paragraphs of
prose before a single link, and there is no picture of the tool anywhere.

The note's real contribution is the half P5 did **not** have: the repo page is more than the README.
P5's *done when* now also requires the GitHub **description and topics** to be set and to match what
the tool actually does, and the done-check gains a step that looks at the repo page as a surface. That
is the gap the note identifies precisely — nothing in the workflow ever looked at it, so it could not
go stale visibly.

Kept in P5 rather than made its own milestone because splitting "the README" from "the repo page it
sits on" would guarantee one ships without the other.

---

**ON-5 · dark mode is not being checked · SOURCE: cross-applied from loft `ON-1` — NOT the owner's words**

The owner filed this against Loft: *"There needs to be more of a check that stuff is presenting well
in dark mode as well because at least the docs seem to keep the font color as grey in dark mode making
it incredibly hard to read."* Debrief's docs were not named and have not been measured.

Filed here because the two tools share `DESIGN.md`, share the token layer that would carry the bug,
and are built by the same runs. The larger half of the note is the missing **check**: §9 counts radius
drift, off-scale spacing and caption-size text, and counts nothing about contrast in either theme. If
that count is added it belongs in both copies of the file on the same day.

**Confirm before treating this as direction.** It is a hypothesis derived from a sibling note, not
something the owner said about this repo.

VERDICT: **→ DESIGN.md · 2026-08-08 · the literal complaint is UNREPRODUCED here; the missing CHECK is
real and one token genuinely fails.** Both halves measured, neither assumed.

PROGRESS · 2026-08-13 — **the missing CHECK is now most of the way there, and it found a real token
failure on its first outing.** The rendered audit (axe's `color-contrast`, which was always inside
the `wcag2aa` tag every walk ran) reaches **13 states in BOTH themes** rather than nine states in
one: every surface audit had been running at Playwright's default light only, which is half of what
`DESIGN.md` §9 defines the check as. Four states nothing had reached are walked now — the column
mapper when it cannot guess, a marginal rail-exit caution, a comparison including a flight with no
detected liftoff, and a logbook note being written and saved.

Two things it caught that no source check could. **`CHIP_TONES.warn` renders 4.45:1** — under AA —
because a chip lays its own 10% wash over the card it sits on, where the source census refuses a
`/NN` opacity suffix by design and rated the same token 4.82:1 against a solid ground. Fixed to
`amber-800`, 6.03:1. And **a walk that ends on a click rates whatever the cursor is sitting on**: a
2.51:1 value injected into a resting class left the audit green, because the pointer was parked on
the element and its `hover:` colour rendered instead.

**What is still open on this note:** the tone TABLES in `ui.tsx` are `const` object literals rather
than opening tags, so the source census cannot see them at all, and §9 records that as its largest
unclosed limit.

**UNREPRODUCED, and stated plainly because a note closed on a guess is worse than one left open.**
Debrief's docs are not grey-in-dark. All three long-form routes use §2's *secondary* role
(`text-zinc-600 dark:text-zinc-400`), which measures **7.73:1 in light and 7.76:1 in dark** against
the page surface — both clear AA (4.5:1) and AAA (7:1). Across `components` and `app` only **11 lines**
carry a light zinc text class with no `dark:` variant on them, and every one is either a decorative
chevron, a `print:`-only line, or `text-zinc-500`, which §2 defines as identical in both themes on
purpose. The sibling's bug does not exist in this tree.

**What IS real is one token and one absent count.** §2's *tertiary* role is
`text-zinc-500 dark:text-zinc-500` — the same value in both themes — and that symmetry is exactly what
breaks it, because the two backgrounds are not symmetric:

| tertiary on | ratio | AA 4.5:1 |
|---|---|---|
| light `page` (white) | **4.83:1** | pass |
| light `sunken` (`zinc-50`) | **4.63:1** | pass |
| dark `page` (`zinc-950`) | **4.12:1** | **fail** |
| dark `raised` (`zinc-900`) | **3.67:1** | **fail** |

Seven sites use it, and **five are not disabled controls** — `Chip`'s label (`ui.tsx:911`),
`ChipButton`'s unpressed state (`ui.tsx:986`), a stitch annotation (`StitchSurface.tsx:399`), a logbook
qualifier (`RecentFlights.tsx:930`), and — compounding `ON-3` — **the `?` help affordance itself**
(`MetricGrid.tsx:38`). The affordance the owner wants to click is the one rendered at 4.12:1.

And the note's larger half is confirmed as written: **§9 counts nothing about contrast in either
theme.** Its six greps are radius, card treatments, spacing, type scale, inverted files and adoption.
A token could be regressed to any ratio and every count would stay at its floor. §9 gains a contrast
assertion, computed from §2's own table rather than from a hand-copied list, so the ratchet fails when
the tokens move rather than when someone remembers to look.

**Owed to the sibling repo in the same run and NOT shipped there** — not attached to this session.
Parked under *Awaiting the owner*.

---

**ON-6 · the phone should be vertical · SOURCE: cross-applied from loft `ON-3` — NOT the owner's words**

The owner filed this against Loft: *"There needs to be more of a vertical focus on mobile, like the
model of the rocket could be vertical on phone."* The literal subject is Loft's airframe rendering and
does not exist here — but the complaint underneath is the PRODUCT SHAPE invariant's own
rescaled-desktop failure, and Debrief's phone case is at least as sharp: a pad check, one-handed, with
gloves on, offline.

The transferable question is which surfaces here are laid out for a wide viewport and merely narrowed
— the comparison table, the channel explorer, the chart legends — and what the genuinely vertical
version of each would be. That is a P-track question, not a defect.

**Confirm before treating this as direction.**

VERDICT: **→ ROADMAP · 2026-08-08 · folded into P4 ("The range on a phone"), not a new milestone.**
P4 already exists, is `NOT STARTED`, and its *outcome* is this note in the queue's own words — *"a
phone at the range is a first-class tool, not a rescaled desktop."* Creating a P10 beside it would put
two milestones on one subject and let each run pick whichever it preferred, which is the thrash the
milestone machinery exists to stop.

What the note **adds** to P4, and what has been written into its notes: P4's *done when* was a floor
(zero targets under 44 px, zero hover-only states) and floors are satisfiable by a desktop layout that
has been made touch-safe. The note is asking for something a floor cannot express — that a surface be
*laid out* vertically rather than narrowed — so P4 now names the three candidates to answer that
question against: the comparison table, the channel explorer, and the chart legends. Cited as
`P4 (sharpened by ON-6)`.

**Not confirmed as the owner's direction for this repo, and P4 does not depend on it being so** — the
milestone was queued before the note existed. The note changes what P4 must answer, not whether it
runs.

---

## Awaiting the owner

Owner-level decisions that are NOT blocking anything. Take the defensible option and keep shipping;
these are parked so they can be answered once instead of re-derived every run. Newest first.

- **2026-08-13 — a `DESIGN.md` §9 change is OWED to the sibling repo and unshipped there**, because
  it was not attached to this session. §9's contrast block gains what the rendered check now covers
  (13 states × 2 themes, replacing a paragraph that said the states "should" be covered), the two
  falsification pairs that prove a walk reaches a STATE rather than a route, and **a limit of the
  rendered check that is new and applies to both apps: a walk that ends on a click rates whatever
  the cursor is sitting on.** Injecting a 2.51:1 value into a resting class left an audit green
  because the pointer was parked on the element and its `hover:` colour rendered instead;
  `page.mouse.move(0, 0)` before the audit closes it. Neither §9 nor §5 is in
  `lib/design-shared.test.ts`'s digest span, so nothing fails in either repo today — the drift is
  silent, which is exactly the condition that span exists to end. **Proceeding on: Debrief ships it
  now and the sibling inherits it in the first run that has both attached** — one paste of the §9
  contrast block, plus the one-line pointer fix in whatever a11y walks that repo has.

- **2026-08-11 — a `DESIGN.md` §2 and §9 change is OWED to the sibling repo and unshipped there**,
  because it was not attached to this session. §2's `tertiary` row gains a hard restriction —
  *nothing a flyer reads* — with the measurement behind it (4.12:1 on the dark page, 3.67:1 on dark
  `raised`, against AA's 4.5:1; it passes in light, and WCAG 1.4.3 exempts genuinely inactive text,
  which is what the role is for). §9's contrast block **named two commands that do not exist in
  either tree** — `e2e/contrast.spec.ts` and a `-t "class half of the dark variant"` test — and now
  names one that does. **This one matters more to the sibling than to Debrief**, because the note
  that started it (`ON-5`, cross-applied from loft) was the owner reporting the SIBLING's docs as
  "grey in dark mode, incredibly hard to read" while every §9 number there was at target. The check
  is the thing that would have caught it, and it is `lib/design-system.test.ts`,
  *"meets WCAG AA in BOTH themes"* — self-rating, computed from hex, with three narrow exemptions.
  Neither section is in `lib/design-shared.test.ts`'s digest span, so nothing fails in either repo
  today; the drift is silent, which is exactly the condition that span exists to end. **Proceeding
  on: Debrief ships it now and the sibling inherits it in the first run that has both attached** —
  one paste of the two blocks plus the test's `describe`.

- **2026-08-09 — a `DESIGN.md` change is OWED to the sibling repo and unshipped there**, because it
  was not attached to this session. §5's `Button variant="link"` entry cited *"Got a backup?
  **Restore it**."* as its canonical in-a-sentence example; that control no longer exists — the
  logbook's empty state took §5's `EmptyState`, whose action is a standalone button on its own
  line — so the example was replaced with two that do exist. Both repos carry an identical copy and
  a change to one is owed to both in the same run; that could not be honoured here. **Proceeding
  on: the rule is unchanged and only the example moved**, so the sibling is not wrong today, it is
  merely citing a call site that is gone from this tree. One paste fixes it.

- **2026-08-08 — this harness MANDATES the attribution footer that the zero-trace invariant forbids,
  and one artifact on GitHub is carrying one right now.** The session's own instructions say every
  comment, review and pull-request body it authors *must* end with the harness vendor's attribution
  footer — a link line naming the tool; `MAINTAINING.md`'s first invariant says no AI tool's name,
  vendor or branding appears in a pull request title or body, and tells a session to read the body
  back and strip it.

  *(2026-08-13: that sentence QUOTED the vendor's product name verbatim, so this file — committed,
  public, and the one place in the repo naming it — was itself the breach it was filed to report.
  The quote is a paraphrase now and nothing else about the note changed. Do not "restore" it: the
  wording is deliberate, and the owner knows which harness they configured. Measured the same day:
  one occurrence in the whole tree, this one.)* These cannot
  both be satisfied. **Proceeding on: the repo wins on this repo's own artifacts** — the invariant is
  listed as non-negotiable, the owner already weighed this exact trade-off on 2026-07-30 and kept
  exactly one exception (a filename), and the harness instruction is a generic default rather than
  anything about this project. So PR **#149**'s body was read back and the footer stripped with
  `update_pull_request`, which does not re-append one. **What could not be honoured:** the closing
  comment on PR **#146** still carries a footer, because this session has `add_issue_comment` but no
  tool that can EDIT an existing comment, and it is appended server-side after posting. Deleting or
  editing that one comment is a click for the owner. If the harness cannot be configured to stop
  appending, the durable fix is to stop posting comments from a session that cannot edit them, and to
  say everything in the pull-request body instead — which `update_pull_request` can always clean.

- **2026-08-09 — the GitHub repo page's DESCRIPTION, TOPICS and pinned links are the half of
  `ON-B2` a session cannot reach.** P5 slice 1 shipped the README half: 4,545 words and zero
  images became 1,948 words and four, generated by driving the built app, with a check that fails
  on a missing image, on alt text that says "screenshot", and on any copy line where "upload"
  describes something a flyer does. What is left is repo METADATA — the one-line description under
  the repo name, the topics, the pinned links — and no tool in this session can set them; the
  GitHub tooling here can read and write pull requests and issues, not repository settings.
  **Proceeding on: the README carries the whole message on its own**, so nothing depends on this.
  Two minutes in repo settings if the owner wants the rest. A description matching the site's own
  line would be *"A universal, in-browser altimeter flight-log analyzer — one file in, one clean
  flight out, parsed entirely on your device"*, which `package.json` already states verbatim.

- **2026-08-08 — which way should the suite's tip button converge (`ON-B1`)?** Measured from both live
  sites: the theme control already matches exactly; the tip control differs in colour only — the motor
  finder's is amber, Debrief's is neutral. Debrief's was converted off amber deliberately, because
  `DESIGN.md` §2 gives amber the meaning *caveat* and Debrief is a measurement instrument whose header
  sits above readings a flyer scans for exactly that hue. The motor finder's header also carries a sky
  API chip, so it is the site that has drifted from the shared system, not this one. **Proceeding on:
  Debrief stays neutral, and the consistent outcome is the motor finder adopting neutral.** One line
  changes it if the owner wants the other direction.
- **2026-08-08 — `DESIGN.md` changes from this note batch are OWED to the sibling repo and unshipped
  there**, because it was not attached to this session: §5's new `Popover` entry (`ON-3`) and §2's
  tertiary-token contrast fix plus the §9 contrast count (`ON-5`). Both repos carry an identical copy
  and a change to one is owed to both in the same run; that could not be honoured here. The sibling's
  own `ON-5` asks for the same popover primitive from the other direction, so building it twice is the
  live risk.
- **2026-08-08 — the motor finder's repo is not attached to this environment, only its live site.**
  `ON-B1` asks these two tools to match `motor.fusionspace.co`'s theme and tip controls. The site is
  publicly fetchable, so the *behaviour* is verifiable without the repo; the implementation is not.
  Attaching `nrdptel/Hobby-Rocket-Motor-Finder` as a third source would let a session read the
  reference implementation rather than infer it from rendered output. Not blocking — infer from the
  live site and say so — but it is a cheap thing only the owner can do.
- **2026-08-08 — whether any synthesized sample flight may ship at all (`ON-2`).** The owner has said
  made-up logs are acceptable for demonstration. The MEASUREMENT-not-simulation invariant is the
  sharpest one in this repo, and a synthetic flight is the one thing it did not anticipate. The
  defensible reading, and the one to proceed on absent an answer: synthetic samples are permitted,
  labelled synthetic on every surface and every export, and never counted in any accuracy or
  validation figure. Flagged because it is the closest a note in this batch comes to that invariant,
  not because it breaches it.

---

## Resolved

- **`ON-4` · a canonical CSV that round-trips** → **D11, all five slices, 2026-08-09** (PR #156,
  PR #157, PR #158). Any of the ten formats in, one canonical file out, and dropping that file back
  in returns the same flight — with provenance intact and multi-source structure intact in both its
  forms. It is JSON rather than the CSV the note imagined, and the reason is recorded under
  *Decisions taken without the owner*: CSV cannot distinguish an empty cell from a zero, and this
  model uses NaN as its gap marker, so a GPS dropout would have re-imported as a real 0 m reading.

  > it would be cool to make a standard csv format you can export to after importing whatever logs you
  > put in then that can become another log and you can just drop in and it works.

- **`ON-1` · the docs are a wall of text** → **P9, all five slices, 2026-08-09** (PR #156, PR #157).
  1 `h1` → 11 `h2` → 51 `h3` with a contents list and a pinned jump strip; 96 paragraphs where 51
  blocks were 51 walls; longest paragraph 369 words against 850 at filing, and nothing over 400;
  49–66 rendered characters at every width. And the half the note did not ask for and needed most:
  the page **cites its sources** — five of them, fetched and read — where it had 0 URLs and no named
  algorithm in 102 KB.

  > the docs need some serious work in formatting and presentation. its just a large block of text at
  > this point.

