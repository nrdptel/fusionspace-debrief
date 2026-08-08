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

Eight notes, filed from a single conversation after the owner walked the live site. **Nothing in this
batch has been reproduced by a session** — every one is the owner's reading of `debrief.fusionspace.co`,
except the corpus measurement in `ON-2`, which was taken at filing time and is marked as such.

---

**ON-1 · the docs are a wall of text · SOURCE: owner, 2026-08-08**

> the docs need some serious work in formatting and presentation. its just a large block of text at
> this point.

LIVING DOCS is a first-class invariant and workflow step 5 makes every calculation change update
them — so they have been *maintained* for accuracy every run and *designed* never. That is the likely
mechanism: content accreted a paragraph at a time by sessions each correctly updating one sentence,
with nothing in the workflow ever asking what the page had become. `DESIGN.md` covers tokens, scale
and component vocabulary; it says nothing about long-form reading — no measure, no heading rhythm, no
structure for a page someone reads rather than scans.

The fix is unlikely to be one page. Cross-applied to the sibling repo as its `ON-8` on the same
reasoning.

VERDICT: *(pending — first run to read this file)*

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

VERDICT: *(pending)*

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

VERDICT: *(pending)*

---

**ON-4 · a canonical CSV that round-trips · SOURCE: owner, 2026-08-08**

> it would be cool to make a standard csv format you can export to after importing whatever logs you
> put in then that can become another log and you can just drop in and it works.

A canonical export of the internal flight model that Debrief can re-import losslessly: bring any of
the ten formats, export one, drop it back in, get the same flight.

This is worth more than a convenience feature, because it is a **test of the architecture the manual
already commits to**. If every parser and the column-mapper are genuinely thin producers of one
canonical model, a round-trip is nearly free — and wherever it is not free, that is a place where a
parser is smuggling format-specific state past the model. It also gives the corpus a new class of
assertion that golden values cannot produce.

Two things it must carry, both from existing invariants: **provenance survives the round-trip**
(measured / derived / estimated is part of the model, so a re-imported flight must not silently
promote a derived value to a measured one), and **multi-source structure survives it** — a flight with
two recordings must not flatten into one. A round-trip that loses either is a lossy export wearing a
canonical label.

VERDICT: *(pending)*

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

VERDICT: *(pending)*

---

**ON-B2 · the GitHub repo page is a surface too · SOURCE: owner, 2026-08-08 · BOTH REPOS**

> Another thing they can learn form this project is to also keep the github repo page itself updated.

Taken from the motor finder, which does this well. The repo landing page is the first thing anyone
sees who arrives from a forum link, and nothing in the workflow currently treats it as a surface that
can go stale — `README.md` is not in the session-start read list and no done-check step looks at it.
The description, topics and pinned links are part of it, not just the README.

VERDICT: *(pending)*

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

VERDICT: *(pending)*

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

VERDICT: *(pending)*

---

## Awaiting the owner

Owner-level decisions that are NOT blocking anything. Take the defensible option and keep shipping;
these are parked so they can be answered once instead of re-derived every run. Newest first.

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

*Nothing yet — this file was created 2026-08-08.*
