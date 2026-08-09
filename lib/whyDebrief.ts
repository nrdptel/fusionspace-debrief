// The claims Debrief makes about itself on the surface a first-time visitor lands on.
//
// What Debrief does that the tools a flyer already owns do not — said on the surface where they
// decide whether to bother, rather than left to be discovered.
//
////*These four are not marketing; they are the standing conclusion of `COMPETITION.md`**, which is
// the file that tracks Debrief against the Featherweight Interface Program, AltosUI, the vendor
// apps and a spreadsheet, row by row, with each claim marked verified or `UNVERIFIED`. That file
// opens its conclusion by saying "it is what the landing surface and the README should say, and
// right now they do not say it." This is that sentence being acted on.
//
// `lib/whyDebrief.test.ts` holds the two lists side by side, so a claim here that stops being true
// in the ledger fails the build rather than sitting on the landing page for a year. That is this
// repo's standing rule for two things that must agree, and it matters more here than usual: every
// one of these is a claim about a competitor, and the ledger is where the evidence lives.
//
////*Each is worded to the ledger's own warnings**, which are there because the broader version of
// two of them is false:
//
//  - Overlaying several of its OWN files is something Featherweight's tool now does too (row 15).
//    What no other tool does is put files from DIFFERENT manufacturers side by side, so that is
//    what this says.
//  - On staging the field is empty rather than behind (row 23) — but what Debrief does is put each
//    stage's own figures beside each other and combine nothing, and the ledger says to publish
//    that carefully, because combining them is the part a rival would be tempted to skip.

export const WHY = [
  {
    title: 'Reads every board, not just the one that made it',
    body: 'Ten logger families are auto-detected from the file itself, and anything else — any CSV or spreadsheet — works through a column mapper that remembers the mapping.',
  },
  {
    title: 'Puts two altimeters side by side, even from different makers',
    body: 'Flew redundant boards? Their readings sit beside each other as independent measurements, with the disagreement shown rather than averaged away. Agreement is confidence; a gap is worth chasing.',
  },
  {
    title: 'Reads a staged launch as a staged launch',
    body: 'Each stage keeps its own apogee, speed and burn, on one shared clock, from the logs you already have. Nothing is combined into a single number — a composite adds order, not readings.',
  },
  {
    title: 'Nothing uploaded, nothing installed, nothing paid for',
    body: 'Your file is read in this browser and never leaves the device. Once opened it works with no signal, so it works at the range.',
  },
] as const;
