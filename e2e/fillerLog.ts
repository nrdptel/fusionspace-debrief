/**
 * A minimal Eggtimer-shaped log, for walks that need the LOGBOOK to be full rather than the flight
 * to be interesting.
 *
 * Several specs fill the un-noted window to reach a prune, a cap or a scroll, and none of them
 * cares what the flight says — only that it parses, analyses and takes a slot. This existed as an
 * inline copy in `audit`, `audit2`, `audit3` and `logbook`, each with its own slightly different
 * curve; it is here so the fifth caller did not become a fifth copy. The other four are filed in
 * `BACKLOG.md` and can adopt it whenever one of them is next touched — a mechanical change with no
 * behaviour in it, which is exactly the kind that should ride along with other work rather than
 * spend a gate of its own.
 *
 * Shaped like an Eggtimer Classic export (`T,Alt,VRaw,VFilt`, milliseconds, feet) so it
 * auto-detects and never reaches the column mapper.
 */
export function fillerCsv(): string {
  const lines = ['T,Alt,VRaw,VFilt'];
  let tms = 0;
  const push = (alt: number, v: number) => {
    lines.push(`${tms},${alt.toFixed(0)},${v.toFixed(1)},${v.toFixed(1)}`);
    tms += 100;
  };
  for (let i = 0; i < 20; i++) push(0, 0);
  for (let i = 0; i < 30; i++) push((i / 30) ** 0.5 * 300, 200 * (1 - i / 30));
  for (let i = 0; i < 80; i++) push(Math.max(0, 300 - i * 4), -20);
  return lines.join('\n');
}
