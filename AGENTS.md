# Start here

**Read `MAINTAINING.md` in full before touching anything.** It is the operating manual for this
repo — who you are on this project, what the bar is, how work ships, and the invariants that override
everything else. This file exists only to point at it, so a session that never names it still finds
it. Where this file and `MAINTAINING.md` disagree, the manual wins.

Then, in this order:

| file | holds |
|---|---|
| `ROADMAP.md` | **the queue.** Two tracks — D (capability) and P (product & craft). A run ships the next unstarted milestone from **each**, alternating. |
| `DESIGN.md` | **binding** design system: tokens, type and spacing scale, component vocabulary, the five required states, product shape, touch contract. Read before writing a component. |
| `COMPETITION.md` | the tracked gap against the Featherweight Interface Program, AltosUI, the vendor apps and a spreadsheet. One row added or resolved per run. |
| `HANDOFF.md` | what the last session did, and the arc across sessions. |
| `BACKLOG.md` | a defect ledger to file into — **not** a list of what to build. |
| `CONTRIBUTING.md` | architecture and the gate. |

The gate — all three green before every push. **There is no lint script**; `npm run build` runs the
lint and the type-check, so the gate is three commands, not four.

```bash
npm test
npm run build
npm run test:e2e     # serves out/ — build first, always
```

Four things that are easy to get wrong and expensive to fix afterwards. All are spelled out in
`MAINTAINING.md`; they are repeated here because each has already cost a session real time.

- **Set the git identity per-repo before the first commit.** It arrives as the harness vendor's
  default, which the zero-trace invariant forbids. `HANDOFF.md` carries the exact value.
- **Never push straight to `main`.** The deploy fires on any push to `main` whether a test ran or
  not. Ship through a pull request; merging on green is pre-authorised.
- **Read the pull request body back after posting it** and strip any attribution footer the harness
  appended. This is a zero-trace breach on a public artifact.
- **The e2e browser variable here is `PLAYWRIGHT_CHROMIUM_PATH`, not the sibling repo's name.**
  Exporting the wrong one fails all 223 tests in about 4 ms each, which reads exactly like a
  catastrophic regression and is not one. Then expect the revision guard to refuse a mismatched
  sandbox build and let it — run `npx playwright install chromium` and then plain
  `npx playwright test` with no override.
