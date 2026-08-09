// The published sources Debrief's methods are implemented from.
//
// `MAINTAINING.md`'s CLEAN-ROOM invariant has always required this — *"implement every parser and
// method from published formats and sources and cite them"* — and until 2026-08-09 the citing half
// was happening in code comments, where no flyer can reach it. Measured before this file existed:
// **0 URLs, 0 DOIs and not one named algorithm across 102 KB** of `content.tsx`, while `Hampel`
// appeared 11 times in the analysis code and the 1976 atmosphere twice. The code knew its sources
// and the page a flyer reads did not say them.
//
// **Every entry here was fetched and read before it was written down.** A fabricated citation is
// worse than none: it puts a false claim of provenance on a safety-relevant number, on a public
// site, where it reads as diligence. So this file holds only sources whose URL was retrieved and
// whose content was checked to be the thing it is cited as. Where a method is Debrief's own — the
// transonic threshold, the max-Q window, every corpus-measured bound — there is deliberately no
// entry, and the block says the number came from the corpus instead. **An uncited block is an
// honest state; a wrongly cited one is not.**
//
// The shape mirrors `lib/methodIds.ts`: a frozen list, a key type derived from it, and both
// directions checked — a block may only cite an id that exists (the compiler), and a reference
// nobody cites fails a test (`lib/methodIds.test.ts`), because a bibliography that has drifted
// from the text is the specific failure OpenRocket's frozen v13.05 technical document shows.

export interface Reference {
  /** How the marker reads in running prose. Short: it is spent out of the block's line measure. */
  short: string;
  /** Who issued it — an author list, or the standards body. */
  by: string;
  /** The document's own title, verbatim. */
  title: string;
  /** The year on the document, not the year it was fetched. */
  year: number;
  /** Where it was retrieved from, and where a reader can retrieve it too. */
  url: string;
  /** What Debrief takes from it, in one clause a flyer can check the citation against. */
  what: string;
}

export const REFERENCES = {
  'ussa-1976': {
    short: 'USSA 1976',
    by: 'NOAA, NASA and USAF',
    title: 'U.S. Standard Atmosphere, 1976',
    year: 1976,
    url: 'https://ntrs.nasa.gov/api/citations/19770009539/downloads/19770009539.pdf',
    what: 'the pressure-to-altitude relation, the tropospheric lapse rate, the speed of sound, and the sea-level constants Debrief falls back to when a file states no pad conditions',
  },
  'bosch-bmp180': {
    short: 'BMP180 datasheet',
    by: 'Bosch Sensortec',
    title: 'BMP180 Digital pressure sensor — Data sheet (BST-BMP180-DS000-09)',
    year: 2013,
    url: 'https://cdn-shop.adafruit.com/datasheets/BST-BMP180-DS000-09.pdf',
    what: 'the numeric form of the same barometric relation that altimeter firmware itself uses, which is why Debrief reproduces a logger’s own heights rather than differing from them in the third digit',
  },
  'gracey-1980': {
    short: 'Gracey 1980',
    by: 'William Gracey',
    title: 'Measurement of Aircraft Speed and Altitude (NASA RP-1046)',
    year: 1980,
    url: 'https://ntrs.nasa.gov/api/citations/19800015804/downloads/19800015804.pdf',
    what: 'Mach number as the ratio of true airspeed to the local speed of sound, and the transonic shock over a static port that makes a barometric speed unreliable from about Mach 0.9 up',
  },
  'talay-1975': {
    short: 'Talay 1975',
    by: 'Theodore A. Talay',
    title: 'Introduction to the Aerodynamics of Flight (NASA SP-367)',
    year: 1975,
    url: 'https://ntrs.nasa.gov/api/citations/19760003955/downloads/19760003955.pdf',
    what: 'dynamic pressure as ½ρv², which is the load case max-Q reports',
  },
  'pearson-2015': {
    short: 'Pearson et al. 2015',
    by: 'Ronald K. Pearson, Yrjö Neuvo, Jaakko Astola and Moncef Gabbouj',
    title: 'The Class of Generalized Hampel Filters (23rd European Signal Processing Conference)',
    year: 2015,
    url: 'https://www.eurasip.org/Proceedings/Eusipco/Eusipco2015/papers/1570096433.pdf',
    what: 'the Hampel filter Debrief despikes an altitude trace with — a sliding-window median, a median-absolute-deviation scale, and the rule that decides which samples are outliers',
  },
} as const satisfies Record<string, Reference>;

export type ReferenceId = keyof typeof REFERENCES;

/** In citation order on the page: alphabetical by the short form, which is what a reader scans. */
export const REFERENCE_IDS = (Object.keys(REFERENCES) as ReferenceId[]).sort((a, b) =>
  REFERENCES[a].short.localeCompare(REFERENCES[b].short),
);

/** The anchor a marker links to. Absolute and trailing-slashed: the same block body renders inside
 *  a popover on the analyze route, where a bare `#ref-…` would resolve against THAT page. */
export const referenceHref = (id: ReferenceId): string => `/methods/#ref-${id}`;

/** One citation, resolved for rendering — so the primitive that draws it needs to know nothing
 *  about methods, references or this module. `components/ui.tsx` §5 holds the treatment. */
export interface ResolvedSource {
  label: string;
  href: string;
  title: string;
}

/** The citations a block carries, ready to render. Empty for the blocks that rest on no published
 *  method, which is most of them. */
export function sourcesFor(cites?: readonly ReferenceId[]): ResolvedSource[] {
  return (cites ?? []).map((id) => ({
    label: REFERENCES[id].short,
    href: referenceHref(id),
    title: `${REFERENCES[id].by} — ${REFERENCES[id].title} (${REFERENCES[id].year})`,
  }));
}
