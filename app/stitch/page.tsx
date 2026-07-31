import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import StitchSurface from '@/components/StitchSurface';
import MethodsPointer from '@/components/MethodsPointer';
import { SITE_URL } from '@/lib/links';
import { UnitsProvider } from '@/components/UnitsProvider';
import HeaderUnits from '@/components/HeaderUnits';

export const metadata: Metadata = {
  title: 'Assemble a staged flight — Debrief',
  description:
    'A two-stage flight logged on separate altimeters is several files that each hold part of one launch. Put every recording’s marks in one order on the clock they share, with each mark naming the recording it came from — and a refusal that says why when they cannot be lined up. Read in your browser; files never leave your device.',
  alternates: { canonical: `${SITE_URL}/stitch/` },
};

export default function StitchPage() {
  return (
    <UnitsProvider>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-12">
        <SiteHeader current="stitch" brandAsHeading={false} unitsSlot={<HeaderUnits />} />

        <section className="mt-8">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            One launch, several recordings
          </h1>
          <p className="mt-2 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
            Each stage of a staged flight lands on its own altimeter, so no single file holds the
            flight — and the thing none of them has on its own is the <strong>order</strong>. Debrief
            lines them up on the launch, the one instant every stage shares, and shows every mark in
            sequence with the recording it came from. Nothing is merged into a single reading.
          </p>
        </section>

        <section className="mt-6">
          <StitchSurface />
        </section>

        <MethodsPointer />

        <SiteFooter />
      </main>
    </UnitsProvider>
  );
}
