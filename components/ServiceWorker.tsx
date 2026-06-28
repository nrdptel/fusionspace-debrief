'use client';

import { useEffect } from 'react';

/** Register the service worker so Debrief works offline once it's been opened
 *  online (the launch-site case: install at home, use in the field with no
 *  signal). Fails quietly where service workers aren't available. */
export default function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    // Register after load so it never competes with the first paint.
    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);
  return null;
}
