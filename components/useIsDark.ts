'use client';

import { useEffect, useState } from 'react';

/** Track whether the page is currently rendering dark, honouring both the
 *  explicit `.dark`/`.light` class and the system preference under `System`. */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const compute = () => {
      const el = document.documentElement;
      if (el.classList.contains('dark')) return true;
      if (el.classList.contains('light')) return false;
      return mq.matches;
    };
    const update = () => setDark(compute());
    update();
    mq.addEventListener('change', update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      mq.removeEventListener('change', update);
      obs.disconnect();
    };
  }, []);

  return dark;
}
