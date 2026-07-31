import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import CompareSurface from '@/components/CompareSurface';
import MethodsPointer from '@/components/MethodsPointer';
import { SITE_URL } from '@/lib/links';
import { UnitsProvider } from '@/components/UnitsProvider';
import HeaderUnits from '@/components/HeaderUnits';

export const metadata: Metadata = {
  title: 'Compare flights — Debrief',
  description:
    'Line up several flight logs side by side — a launch day, a season, or several altimeters that flew the same rocket. Curves overlaid on one timeline and the numbers in one table, with the spread across recordings stated rather than averaged away. Read in your browser; files never leave your device.',
  alternates: { canonical: `${SITE_URL}/compare/` },
};

export default function ComparePage() {
  return (
    <UnitsProvider>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-12">
      {/* Chrome at the reading width; the comparison itself uses the full width, where the
          overlaid charts and the side-by-side table live. */}
      <div className="mx-auto w-full max-w-5xl">
        <SiteHeader current="compare" brandAsHeading={false} unitsSlot={<HeaderUnits />} />
      </div>

      <section className="mt-8">
        <CompareSurface />
      </section>

      <MethodsPointer />

        <div className="mx-auto w-full max-w-5xl">
          <SiteFooter />
        </div>
      </main>
    </UnitsProvider>
  );
}
