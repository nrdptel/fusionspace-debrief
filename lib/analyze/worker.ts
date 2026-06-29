// Web Worker entry: runs the flight analysis off the main thread so a large or
// high-rate log never freezes the UI. The heavy work (spike filtering, derived
// channels) is all pure and framework-free, so it runs here unchanged. The main
// thread posts a RawFlight in and gets a FlightAnalysis back; see runner.ts for
// the wrapper (and its synchronous fallback when Workers aren't available).

import { analyzeFlight } from './index';
import type { RawFlight } from '../flight/types';

// `self` is typed as a Window under the dom lib; narrow it to what we use here.
const ctx = self as unknown as {
  postMessage: (message: unknown) => void;
  addEventListener: (type: 'message', listener: (e: MessageEvent) => void) => void;
};

ctx.addEventListener('message', (e: MessageEvent<{ id: number; flight: RawFlight }>) => {
  const { id, flight } = e.data;
  try {
    const analysis = analyzeFlight(flight);
    ctx.postMessage({ id, analysis });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : 'Could not analyze this flight.' });
  }
});
