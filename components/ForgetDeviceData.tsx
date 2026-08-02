'use client';

import { useCallback, useEffect, useState } from 'react';
import { deviceDataPresent, forgetDeviceData, type DeviceDatum } from '@/lib/deviceData';
import { Button, Card, useReturnFocus } from './ui';

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

  // What this browser holds, read after mount: a static export cannot know, and a count rendered
  // on the server would be a guess. Re-read whenever the panel opens or a pass finishes, because
  // this page is NOT modal — the theme toggle in the site header is reachable while the confirm
  // is up, and it writes a key. A confirm that named two and then took three would be exactly the
  // sort of uncheckable number this page exists to end.
  const refresh = useCallback(() => setPresent(deviceDataPresent()), []);
  useEffect(refresh, [refresh]);

  // The trigger stays MOUNTED behind the panel, which is the contract `useReturnFocus` documents
  // and the reason it exists: the first version of this component unmounted its own trigger while
  // its comment claimed to follow the pattern that avoids it.
  const { triggerRef, safeRef, dismiss, onKeyDown } = useReturnFocus(confirming, () =>
    setConfirming(false),
  );

  if (present === null) return null;

  return (
    <div className="mt-3">
      {done !== null && (
        <Card as="div" tone="sunken" role="status" className="mb-3 text-sm">
          {done === 0
            ? 'Nothing was stored — this device was already clear.'
            : `Forgotten — ${done === 1 ? '1 setting' : `${done} settings`} removed from this device. Your flights are untouched.`}
        </Card>
      )}

      {/* The trigger is ALWAYS here, and pressing it re-reads storage. The count below it is a
          snapshot and can go stale — the theme toggle sits in this page's own header and writes a
          key, and nothing broadcasts that — so the control must not be built on the snapshot.
          The first version hid the trigger whenever the last read came back empty, which made
          "this device is clear" a claim the page could not take back: storage refilled behind it
          and there was no way to run it again but a reload. */}
      <>
          <Button
            ref={triggerRef}
            onClick={() => {
              if (confirming) return dismiss();
              const now = deviceDataPresent();
              setPresent(now);
              setDone(now.length === 0 ? 0 : null);
              setConfirming(now.length > 0);
            }}
            aria-expanded={confirming}
            aria-controls="forget-device-data-confirm"
          >
            Forget these settings
          </Button>
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
            <Card
              tone="danger"
              id="forget-device-data-confirm"
              role="alert"
              onKeyDown={onKeyDown}
              className="mt-3 text-sm"
            >
              <p className="font-medium">
                Forget {present.length === 1 ? 'the 1 setting' : `all ${present.length} settings`}{' '}
                stored on this device?
              </p>
              <p className="mt-1">
                {present.map((d) => d.what).join('; ')}. Your flights stay — the logbook&apos;s own
                Clear is what removes those. This cannot be undone.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {/* Safe first, in DOM order as well as on screen — and the SAFE one is the neutral
                    weight. `DESIGN.md` §5 reserves the danger weight for removal, so marking both
                    of them red told a flyer nothing about which way out was which. */}
                <Button ref={safeRef} size="sm" onClick={dismiss}>
                  Keep them
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setDone(forgetDeviceData());
                    refresh();
                    dismiss();
                  }}
                >
                  Yes, forget them
                </Button>
              </div>
            </Card>
          )}
      </>
    </div>
  );
}
