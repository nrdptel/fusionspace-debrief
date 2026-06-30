import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parachuteCd, chuteDiameterToM } from './parachute';
import { G0 } from './units';
import { importFlight } from './parsers';
import { analyzeFlight } from './analyze';

describe('parachuteCd', () => {
  it('recovers a known Cd from the terminal descent (force balance)', () => {
    // Pick Cd, mass, chute, density → the terminal rate they imply, then check the
    // back-calculation lands on the same Cd.
    const cd = 0.9;
    const m = 1.4;
    const d = 0.91; // 36 in
    const rho = 1.2;
    const area = Math.PI * (d / 2) ** 2;
    const v = Math.sqrt((2 * m * G0) / (rho * cd * area)); // terminal velocity for that Cd
    expect(parachuteCd(m, d, v, rho)).toBeCloseTo(cd, 6);
  });

  it('returns null on bad inputs or a wild result', () => {
    expect(parachuteCd(0, 0.9, 6, 1.2)).toBeNull(); // no mass
    expect(parachuteCd(1.4, 0, 6, 1.2)).toBeNull(); // no chute
    expect(parachuteCd(1.4, 0.9, null, 1.2)).toBeNull(); // no descent rate
    expect(parachuteCd(1.4, 0.9, 6, 0)).toBeNull(); // no density
    // A tiny chute under a heavy rocket gives an unphysical Cd → withheld.
    expect(parachuteCd(40, 0.1, 6, 1.2)).toBeNull();
  });

  it('chuteDiameterToM converts cm and inches', () => {
    expect(chuteDiameterToM(91, 'cm')).toBeCloseTo(0.91, 6);
    expect(chuteDiameterToM(36, 'in')).toBeCloseTo(0.9144, 6);
  });
});

describe('parachuteCd on the bundled sample (integration)', () => {
  it('reads a physically plausible chute Cd from the main descent', () => {
    const text = readFileSync(fileURLToPath(new URL('../public/samples/sample-altusmetrum.csv', import.meta.url)), 'utf8');
    const r = importFlight({ name: 'sample-altusmetrum.csv', text });
    expect(r.kind).toBe('flight');
    if (r.kind !== 'flight') return;
    const a = analyzeFlight(r.flight);
    let rho = 1.225;
    for (const x of a.series.airDensity) {
      if (Number.isFinite(x)) {
        rho = x;
        break;
      }
    }
    // A 36 in chute on a ~1.5 kg airframe — the rule-of-thumb band for real canopies.
    const cd = parachuteCd(1.5, chuteDiameterToM(36, 'in'), a.metrics.mainDescentRate, rho)!;
    expect(cd).toBeGreaterThan(0.4);
    expect(cd).toBeLessThan(1.6);
  });
});
