import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/links';

// Static export emits a static robots.txt at build time.
export const dynamic = 'force-static';

/** Everything here is public and safe to crawl; point bots at the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
