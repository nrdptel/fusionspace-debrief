'use client';

import { useEffect } from 'react';

/** Every same-origin thing this page has loaded, plus the page itself — the exact set the
 *  app needs to start. Read from the Performance API rather than a build-time manifest, so
 *  it can never drift out of date against content-hashed chunk names. */
function loadedUrls(): string[] {
  const here = window.location.origin;
  const urls = new Set<string>([window.location.pathname]);
  try {
    for (const e of performance.getEntriesByType('resource')) {
      const { name } = e as PerformanceResourceTiming;
      if (name.startsWith(here)) urls.add(name);
    }
  } catch {
    /* no Performance API — the navigation alone still helps */
  }
  return [...urls];
}

/** Register the service worker so Debrief works offline once it's been opened
 *  online (the launch-site case: install at home, use in the field with no
 *  signal). Fails quietly where service workers aren't available.
 *
 *  Registration alone doesn't keep that promise. On a first visit the shell, the app chunks
 *  and the CSS are all fetched before the worker exists, so it never sees those requests and
 *  caches none of them — Debrief needed a *second* online visit before an offline one
 *  worked, which is no use to someone who opened it once at home and drove to the field.
 *  Once the worker is in control, the page hands it the list of what it just loaded, so the
 *  cache is complete after the first visit. */
export default function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;
    const warm = () => {
      const worker = navigator.serviceWorker.controller;
      if (!worker || cancelled) return;
      worker.postMessage({ type: 'warm', urls: loadedUrls() });
    };

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
      } catch {
        return; // blocked (private mode, insecure origin) — nothing else to do
      }
      if (cancelled) return;
      // A first install claims this page a moment after it activates, so warm on the
      // handover as well as now, in case it has already happened.
      navigator.serviceWorker.addEventListener('controllerchange', warm);
      warm();
    };

    // Register after load so it never competes with the first paint — and so the resource
    // list the warm-up sends is the complete one.
    let onLoad: (() => void) | null = null;
    if (document.readyState === 'complete') void register();
    else {
      onLoad = () => void register();
      window.addEventListener('load', onLoad, { once: true });
    }
    return () => {
      cancelled = true;
      if (onLoad) window.removeEventListener('load', onLoad);
      navigator.serviceWorker.removeEventListener('controllerchange', warm);
    };
  }, []);
  return null;
}
