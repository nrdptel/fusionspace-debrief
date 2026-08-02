'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FlightSeries, FlightEvent } from '@/lib/analyze/types';
import { systemOf } from '@/lib/display';
import type { UnitChoice } from '@/lib/display';
import { dragCoefficient, diameterToM, LEN_TO_M, MAX_REASONABLE_DIAMETER_M } from '@/lib/drag';
import { massToKg, MASS_TO_KG, MAX_REASONABLE_MASS_KG } from '@/lib/landing';
import { Card, NumberField, Readout } from './ui';

const MASS_KEY = 'debrief.dragmass.kg';
const DIAM_KEY = 'debrief.diameter.m';

function round(v: number, places: number): string {
  const f = Math.pow(10, places);
  return (Math.round(v * f) / f).toLocaleString('en-US', { maximumFractionDigits: places });
}

/** Like round, but without thousands separators — a grouped "1,500" is invalid in
 *  a number input, so the editable fields use this (a coast mass is often ≥1 kg). */
function plain(v: number, places: number): string {
  const f = Math.pow(10, places);
  return String(Math.round(v * f) / f);
}

function readNum(key: string, max: number): number | null {
  if (typeof window === 'undefined') return null;
  const v = Number(window.localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 && v <= max ? v : null;
}

function store(key: string, kg: number | null) {
  try {
    if (kg == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, String(kg));
  } catch {
    /* ignore */
  }
}

/**
 * Measured drag coefficient — the drag the airframe actually had on this flight,
 * back-calculated from the coast deceleration (after burnout, before apogee, when
 * only gravity and drag are acting). A reading of the flown flight, not a
 * prediction; the flier supplies two numbers the log can't carry — the coast mass
 * and the body diameter — and the rest comes from the recording.
 */
export default function DragCoefficient({
  series,
  events,
  sys,
}: {
  series: FlightSeries;
  events: FlightEvent[];
  sys: UnitChoice;
}) {
  const [massKg, setMassKg] = useState<number | null>(null);
  const [diamM, setDiamM] = useState<number | null>(null);

  useEffect(() => {
    setMassKg(readNum(MASS_KEY, MAX_REASONABLE_MASS_KG));
    setDiamM(readNum(DIAM_KEY, MAX_REASONABLE_DIAMETER_M));
  }, []);

  const massUnit = systemOf(sys) === 'imperial' ? 'oz' : 'g';
  const lenUnit = systemOf(sys) === 'imperial' ? 'in' : 'mm';

  const massField = massKg == null ? '' : plain(massKg / MASS_TO_KG[massUnit], massUnit === 'oz' ? 1 : 0);
  const diamField = diamM == null ? '' : plain(diamM / LEN_TO_M[lenUnit], lenUnit === 'in' ? 2 : 0);

  const onMass = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n) || n <= 0) {
      setMassKg(null);
      store(MASS_KEY, null);
      return;
    }
    const kg = Math.min(massToKg(n, massUnit), MAX_REASONABLE_MASS_KG);
    setMassKg(kg);
    store(MASS_KEY, kg);
  };
  const onDiam = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n) || n <= 0) {
      setDiamM(null);
      store(DIAM_KEY, null);
      return;
    }
    const m = Math.min(diameterToM(n, lenUnit), MAX_REASONABLE_DIAMETER_M);
    setDiamM(m);
    store(DIAM_KEY, m);
  };

  const result = useMemo(
    () => (massKg != null && diamM != null ? dragCoefficient(series, events, massKg, diamM) : null),
    [series, events, massKg, diamM],
  );

  const haveInputs = massKg != null && diamM != null;

  return (
    <Card
      as="section"
      aria-labelledby="drag-coefficient-heading"
      className={result == null ? 'print:hidden' : ''}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3
            id="drag-coefficient-heading"
            className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300"
          >
            Drag coefficient (measured)
          </h3>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            The drag your airframe actually had, read from the coast deceleration. Enter the coast mass and body
            diameter.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NumberField
            label="Coast mass"
            unit={massUnit}
            ariaLabel={`Coast mass (${massUnit === 'oz' ? 'ounces' : 'grams'})`}
            value={massField}
            onChange={onMass}
            min={0}
            max={MAX_REASONABLE_MASS_KG / MASS_TO_KG[massUnit]}
            step={massUnit === 'oz' ? 0.1 : 1}
            placeholder={massUnit}
          />
          <NumberField
            label="Diameter"
            unit={lenUnit}
            ariaLabel={`Body diameter (${lenUnit === 'in' ? 'inches' : 'millimetres'})`}
            value={diamField}
            onChange={onDiam}
            min={0}
            max={MAX_REASONABLE_DIAMETER_M / LEN_TO_M[lenUnit]}
            step={lenUnit === 'in' ? 0.1 : 1}
            placeholder={lenUnit}
          />
        </div>
      </div>

      <Readout
        size="hero"
        layout="inline"
        className="mt-3"
        value={result != null ? round(result.cd, 2) : '—'}
        sub={
          result != null && (
            <>
              C<sub>d</sub>·A {round(result.cdA * 1e4, 1)} cm²
              {result.machLow != null && result.machHigh != null
                ? ` · over Mach ${round(result.machLow, 2)}–${round(result.machHigh, 2)}`
                : ''}
              {result.approximate ? ' · approximate (derived velocity)' : ''}
            </>
          )
        }
      />

      {!haveInputs ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Enter the rocket’s mass during coast (at burnout, propellant spent) and its body diameter to read the drag
          coefficient this flight flew at. Kept on this device; compare it against the C<sub>d</sub> your simulation
          assumed.
        </p>
      ) : result == null ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Couldn’t read a clean coast on this flight — the coast may be too short or too slow for drag to register
          above the noise.
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Measured over the faster part of the coast (drag is only readable at speed). C<sub>d</sub> changes with
          Mach, so this is the average across the window shown.
        </p>
      )}
    </Card>
  );
}
