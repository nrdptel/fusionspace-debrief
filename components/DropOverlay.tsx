'use client';

/**
 * What a drag over the window says. Shown only while a file is actually over the page, so it
 * costs nothing the rest of the time — and it is the only signal that a drop anywhere is a
 * drop Debrief will read, which is not otherwise discoverable from a dashed box that is off
 * screen or not rendered at all.
 *
 * `reason` turns the one case that can't take the file (the column mapper, mid-mapping) from
 * a drop that silently does nothing into one that says why.
 */
export default function DropOverlay({ show, accept, reason }: { show: boolean; accept: boolean; reason?: string }) {
  if (!show) return null;
  return (
    <div
      // Purely a hint over the whole viewport; the window listeners own the gesture, so this
      // must never intercept it.
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-6 backdrop-blur-[2px] print:hidden"
      role="status"
      aria-live="polite"
    >
      <div
        className={`rounded-xl border-2 border-dashed px-6 py-5 text-center shadow-lg ${
          accept
            ? 'border-indigo-400 bg-white text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'
            : 'border-amber-400 bg-white text-amber-800 dark:bg-zinc-900 dark:text-amber-200'
        }`}
      >
        <p className="text-base font-medium">{accept ? 'Drop to read this flight' : 'Not right now'}</p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {accept ? 'Drop several at once to compare them. Nothing is uploaded.' : reason}
        </p>
      </div>
    </div>
  );
}
