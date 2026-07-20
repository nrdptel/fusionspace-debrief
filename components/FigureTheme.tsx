'use client';

import { useState } from 'react';

// A light/dark choice for an exported vector (SVG) figure. A report, cert document
// or forum post almost always wants a light figure whatever theme the app is in, so
// this defaults to light — but a slide deck or a dark write-up can flip it. It only
// governs the exported figure; the on-screen chart still follows the app theme.

export function useFigureDark(): [boolean, () => void] {
  const [dark, setDark] = useState(false);
  return [dark, () => setDark((d) => !d)];
}

export function FigureThemeButton({
  dark,
  onToggle,
  className,
}: {
  dark: boolean;
  onToggle: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Exported figure background: ${dark ? 'dark' : 'light'}. Switch to ${dark ? 'light' : 'dark'}.`}
      title="Background for the exported vector (SVG) figure — light for most reports, dark for a slide deck"
      className={className}
    >
      Figure: {dark ? 'dark' : 'light'}
    </button>
  );
}
