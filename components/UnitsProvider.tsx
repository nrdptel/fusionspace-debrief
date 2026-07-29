'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { decodeUnits, encodeUnits, systemOf, type UnitChoice, type Units } from '@/lib/display';

/**
 * The unit choice, owned once for the whole app.
 *
 * It used to live inside `Analyzer` and, separately, inside `CompareSurface` — two copies of
 * the same reader and the same writer, and a control that only existed once a flight was
 * loaded. So the analyze page's landing screen had NO unit control at all (measured: zero),
 * the comparison picker had none either, and the report's sat 880 px from the right edge of
 * a 1440 px viewport — while `app/page.tsx` told the flyer to "switch feet and meters with
 * one click (top-right)". A promise the page could not keep on any surface.
 *
 * Held here so `SiteHeader` can carry the control on every page, before a file is dropped and
 * after — which is also where the logbook's own apogee and speed columns are already being
 * formatted by it.
 */
interface UnitsApi {
  sys: UnitChoice;
  /** The fast path: flip the whole set between feet and metres, discarding any overrides. */
  toggleUnits: () => void;
  setUnits: (units: Units) => void;
}

const UnitsContext = createContext<UnitsApi | null>(null);

function readInitialUnits(): UnitChoice {
  if (typeof window === 'undefined') return 'imperial';
  // A shared link's units win over this device's remembered choice, so a link opens
  // reading the way its sender saw it.
  return (
    decodeUnits(new URLSearchParams(window.location.search).get('u')) ??
    decodeUnits(window.localStorage.getItem('debrief.units')) ??
    'imperial'
  );
}

/** Remember the choice on this device and put it in the URL, so a refresh, a shared
 *  link and the next visit all read the same way. */
function rememberUnits(next: UnitChoice): void {
  try {
    const code = encodeUnits(next);
    window.localStorage.setItem('debrief.units', code);
    const url = new URL(window.location.href);
    url.searchParams.set('u', code);
    window.history.replaceState(null, '', url);
  } catch {
    /* a private window with storage blocked — the choice still applies to this view */
  }
}

export function UnitsProvider({ children }: { children: React.ReactNode }) {
  // Starts imperial and is corrected after mount, not read during render: the pages are a
  // static export, so a value read from localStorage at render time would differ from the
  // prerendered HTML and trip hydration.
  const [sys, setSys] = useState<UnitChoice>('imperial');
  useEffect(() => setSys(readInitialUnits()), []);

  const toggleUnits = useCallback(() => {
    setSys((prev) => {
      const next: UnitChoice = systemOf(prev) === 'imperial' ? 'metric' : 'imperial';
      rememberUnits(next);
      return next;
    });
  }, []);

  const setUnits = useCallback((next: Units) => {
    setSys(next);
    rememberUnits(next);
  }, []);

  return <UnitsContext.Provider value={{ sys, toggleUnits, setUnits }}>{children}</UnitsContext.Provider>;
}

/** The unit choice and the two ways to change it. */
export function useUnits(): UnitsApi {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error('useUnits must be used inside <UnitsProvider>');
  return ctx;
}
