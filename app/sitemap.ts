import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/links';

// Static export emits a static sitemap.xml at build time (no runtime
// regeneration); each deploy refreshes it.
export const dynamic = 'force-static';

/** Every indexable page. Debrief is a small static tool: the analyzer, the
 * methods write-up, and the privacy page. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_URL}/methods/`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/privacy/`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
