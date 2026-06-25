// Featherweight Blue Raven. The Blue Raven records two flight files; the
// low-rate file (downloaded via the Featherweight Interface Program, mnemonic
// "@ LOG_LOW", ~50 Hz) is the one carrying barometric data, so it's the one we
// analyze. It isn't CSV — each sample is a line of labelled tokens, documented
// in the Blue Raven User's Guide:
//
//   [sync] Bo: [temp] [pressure, atm ×50000] V: [batt mV] […] Vel: [up ft/s] […]
//          Pos: [inertial alt ft] […] ang: [tilt ×10] […] FER: […] CRC: […]
//
// We take altitude from the barometric pressure (robust, and what the analysis
// is built around). The Blue Raven's inertial velocity and its high-rate
// accelerometer/gyro live in its other files; the manual notes the inertial
// estimate drifts after deployment, so we don't rely on it here.

import type { Parser, ParseInput } from './types';
import type { RawFlight, Channel } from '../flight/types';

const ATM_PA = 101325;

function tokenValueAfter(tokens: string[], label: string, offset: number): number {
  const i = tokens.indexOf(label);
  if (i < 0) return NaN;
  const v = Number(tokens[i + offset]);
  return Number.isFinite(v) ? v : NaN;
}

export const blueRavenParser: Parser = {
  id: 'blueraven',
  label: 'Featherweight Blue Raven',

  detect(input: ParseInput): number {
    const head = input.text.slice(0, 4000);
    if (/\bLOG_LOW\b/.test(head)) return 0.96;
    if (/\bLOG_HIR\b/.test(head)) return 0.96; // recognized, but handled in parse()
    return 0;
  },

  parse(input: ParseInput): RawFlight {
    const head = input.text.slice(0, 4000);
    if (/\bLOG_HIR\b/.test(head) && !/\bLOG_LOW\b/.test(head)) {
      throw new Error(
        'This is the Blue Raven high-rate file (gyro and acceleration only). Upload the low-rate file (LOG_LOW) for altitude and the flight profile.',
      );
    }

    const pressurePa: number[] = [];
    const voltageV: number[] = [];
    for (const line of input.text.split(/\r?\n/)) {
      if (!line.includes('Bo:')) continue;
      const tokens = line.trim().split(/\s+/);
      // Bo: [temperature] [pressure atm ×50000]
      const rawPressure = tokenValueAfter(tokens, 'Bo:', 2);
      if (!Number.isFinite(rawPressure) || rawPressure <= 0) continue;
      pressurePa.push((rawPressure / 50000) * ATM_PA);
      const battMv = tokenValueAfter(tokens, 'V:', 1);
      voltageV.push(Number.isFinite(battMv) ? battMv / 1000 : NaN);
    }

    if (pressurePa.length < 4) {
      throw new Error('No Blue Raven low-rate samples with barometric pressure were found.');
    }

    // The low-rate log is a fixed 50 Hz, so time comes from the sample index
    // (the on-board sync code rolls over every 250 ms and can't be used directly).
    const n = pressurePa.length;
    const time = new Float64Array(n);
    for (let i = 0; i < n; i++) time[i] = i / 50;

    const channels: Channel[] = [
      { kind: 'pressure', label: 'Baro pressure', unit: 'Pa', values: Float64Array.from(pressurePa) },
    ];
    if (voltageV.some(Number.isFinite)) {
      channels.push({ kind: 'voltage', label: 'Battery', unit: 'V', values: Float64Array.from(voltageV) });
    }

    return {
      source: input.name,
      format: 'blueraven',
      formatLabel: 'Featherweight Blue Raven',
      time,
      channels,
      meta: { device: 'Featherweight Blue Raven', sampleRate: '50 Hz (low-rate)' },
      notes: [
        'Blue Raven low-rate log: altitude is derived from the barometric sensor. The onboard inertial velocity and the high-rate accelerometer/gyro are in the Blue Raven’s other files, which this view doesn’t use.',
      ],
    };
  },
};
