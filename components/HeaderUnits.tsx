'use client';

import UnitsControl from './UnitsControl';
import { useUnits } from './UnitsProvider';

/** The unit control, wired to the app-wide choice. A separate component so `SiteHeader` can
 *  stay a server component and the docs pages can leave the slot empty. */
export default function HeaderUnits() {
  const { sys, toggleUnits, setUnits } = useUnits();
  return <UnitsControl sys={sys} onToggleUnits={toggleUnits} onSetUnits={setUnits} />;
}
