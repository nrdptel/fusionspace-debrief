'use client';

import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'debrief.theme';
const ORDER: Theme[] = ['system', 'light', 'dark'];
const LABEL: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

function apply(theme: Theme) {
  const el = document.documentElement;
  el.classList.toggle('dark', theme === 'dark');
  el.classList.toggle('light', theme === 'light');
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  // Read the persisted choice once mounted; the pre-paint script in <head> has
  // already applied it, so this just syncs React's view of it.
  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system';
    setTheme(ORDER.includes(saved) ? saved : 'system');
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    apply(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode — the choice just won't persist */
    }
  }

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${LABEL[theme]} (click to change)`}
      aria-label={`Color theme: ${LABEL[theme]}. Click to change.`}
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      <span aria-hidden="true" className="text-sm leading-none">
        ◐
      </span>
      {LABEL[theme]}
    </button>
  );
}
