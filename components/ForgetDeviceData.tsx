'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { deviceDataPresent, forgetDeviceData, type DeviceDatum } from '@/lib/deviceData';

/** "Forget everything Debrief saved on this device", on the page that promises it.
 *
 *  The privacy page used to say the logbook's Clear removed all of it. Clear takes the flights
 *  and what rides with them; seventeen other keys survived it, including the flyer's rocket
 *  parameters and their own typed text. Rather than widen Clear — which names flights, counts
 *  them, and should keep meaning that — this is the second control, on the page that makes the
 *  claim, scoped to exactly what that page lists.
 *
 *  It reports what was ACTUALLY there, because a control that says "done" on an empty device
 *  teaches a flyer nothing about whether it works. */
export default function ForgetDeviceData() {
  const [present, setPresent] = useState<DeviceDatum[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // What this browser holds, read after mount: a static export cannot know, and a count rendered
  // on the server would be a guess. Re-read whenever the panel opens or a pass finishes, because
  // this page is NOT modal — the theme toggle in the site header is reachable while the confirm
  // is up, and it writes a key. A confirm that named two and then took three would be exactly the
  // sort of uncheckable number this page exists to end.
  const refresh = useCallback(() => setPresent(deviceDataPresent()), []);
  useEffect(refresh, [refresh]);

  const disarm = useCallback(() => {
    setConfirming(false);
    triggerRef.current?.focus();
  }, []);

  // Focus the panel's SAFE control when it opens, so a keyboard or screen-reader flyer lands
  // inside the thing that just appeared — and lands on "Keep them", never on the destructive one.
  // The trigger stays MOUNTED behind the panel for the same reason the logbook's Clear does: a
  // control that unmounts itself has already nulled its own ref, so restoring focus to it
  // silently does nothing and drops a keyboard flyer to the body — from where the next Tab landed
  // on "Yes, forget them". The first version of this did exactly that while its comment claimed
  // to follow the pattern that avoids it.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  if (present === null) return null;

  return (
    <div className="mt-3">
      {done !== null && (
        <p
          role="status"
          className="mb-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/40"
        >
          {done === 0
            ? 'Nothing was stored — this device was already clear.'
            : `Forgotten — ${done === 1 ? '1 setting' : `${done} settings`} removed from this device. Your flights are untouched.`}
        </p>
      )}

      {/* The trigger is ALWAYS here, and pressing it re-reads storage. The count below it is a
          snapshot and can go stale — the theme toggle sits in this page's own header and writes a
          key, and nothing broadcasts that — so the control must not be built on the snapshot.
          The first version hid the trigger whenever the last read came back empty, which made
          "this device is clear" a claim the page could not take back: storage refilled behind it
          and there was no way to run it again but a reload. */}
      <>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => {
              if (confirming) return disarm();
              const now = deviceDataPresent();
              setPresent(now);
              setDone(now.length === 0 ? 0 : null);
              setConfirming(now.length > 0);
            }}
            aria-expanded={confirming}
            aria-controls="forget-device-data-confirm"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Forget these settings
          </button>
          {!confirming && (
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              {present.length === 0
                ? 'None of them were stored when this page loaded.'
                : `${present.length === 1 ? '1 of them is' : `${present.length} of them are`} stored on this device right now.`}
            </p>
          )}

          {confirming && (
            // A live region rather than a dialog: an `alertdialog` that nothing focuses is
            // announced to nobody, and an inline panel does not promise the modality (focus trap,
            // aria-modal) a dialog would. The same shape the logbook's Clear confirm settled on,
            // down to the Escape handler living on the panel — which only works because focus is
            // genuinely inside it.
            <div
              id="forget-device-data-confirm"
              role="alert"
              onKeyDown={(e) => {
                if (e.key === 'Escape') disarm();
              }}
              className="mt-3 rounded-md border border-red-300/70 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-200"
            >
              <p className="font-medium">
                Forget {present.length === 1 ? 'the 1 setting' : `all ${present.length} settings`}{' '}
                stored on this device?
              </p>
              <p className="mt-1">
                {present.map((d) => d.what).join('; ')}. Your flights stay — the logbook&apos;s own
                Clear is what removes those. This cannot be undone.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {/* Safe first, in DOM order as well as on screen. */}
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={disarm}
                  className="min-h-11 rounded-md border border-red-300 bg-white px-2.5 py-1 font-medium text-red-800 transition hover:bg-red-100 sm:min-h-0 dark:border-red-500/40 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-950/60"
                >
                  Keep them
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDone(forgetDeviceData());
                    setConfirming(false);
                    refresh();
                    triggerRef.current?.focus();
                  }}
                  className="min-h-11 rounded-md bg-red-600 px-2.5 py-1 font-medium text-white transition hover:bg-red-500 sm:min-h-0"
                >
                  Yes, forget them
                </button>
              </div>
            </div>
          )}
      </>
    </div>
  );
}
