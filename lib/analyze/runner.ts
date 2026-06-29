// Run the analysis in a Web Worker when one is available, so a large log doesn't
// freeze the UI; fall back to synchronous analysis on the main thread otherwise
// (server render, no Worker support, or any worker failure). The worker is a
// browser feature — it runs on the visitor's device, like the rest of Debrief;
// nothing is uploaded and there's no server cost.

import { analyzeFlight } from './index';
import type { RawFlight } from '../flight/types';
import type { FlightAnalysis } from './types';

interface Pending {
  resolve: (a: FlightAnalysis) => void;
  reject: (e: Error) => void;
}

let worker: Worker | null = null;
let unavailable = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function ensureWorker(): Worker | null {
  if (unavailable) return null;
  if (worker) return worker;
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('./worker.ts', import.meta.url));
    w.addEventListener('message', (e: MessageEvent<{ id: number; analysis?: FlightAnalysis; error?: string }>) => {
      const { id, analysis, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error || !analysis) p.reject(new Error(error || 'Worker returned no analysis.'));
      else p.resolve(analysis);
    });
    // If the worker fails to load or throws fatally, reject anything in flight so
    // each caller falls back to synchronous analysis, and stop using it.
    w.addEventListener('error', () => {
      unavailable = true;
      worker = null;
      for (const [, p] of pending) p.reject(new Error('Worker failed.'));
      pending.clear();
    });
    worker = w;
    return w;
  } catch {
    unavailable = true;
    return null;
  }
}

/**
 * Analyze a flight, off the main thread when possible. The result is identical to
 * calling analyzeFlight() directly — this only changes *where* it runs.
 */
export async function analyzeAsync(flight: RawFlight): Promise<FlightAnalysis> {
  const w = ensureWorker();
  if (!w) return analyzeFlight(flight);
  try {
    return await new Promise<FlightAnalysis>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      w.postMessage({ id, flight });
    });
  } catch {
    // Worker unavailable or errored mid-flight — analysis still has to happen, so
    // do it synchronously here. Correct, just not off-thread.
    return analyzeFlight(flight);
  }
}
