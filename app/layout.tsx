import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { SITE_URL, HUB_URL, REPO_URL } from '@/lib/links';
import './globals.css';

const DESCRIPTION =
  'Drop in a flight log from any altimeter and read the flight in your browser: apogee, max velocity and acceleration, burnout, deployments and descent rates — with ejection spikes, sensor noise, mixed sample rates and units handled. Files are parsed on your device and never uploaded.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Debrief — altimeter flight-log analyzer',
  description: DESCRIPTION,
  applicationName: 'Debrief',
  manifest: '/manifest.webmanifest',
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: 'Debrief — altimeter flight-log analyzer',
    description:
      'A universal, in-browser altimeter flight-log analyzer. One file in, one clean flight out — parsed on your device, never uploaded.',
    url: SITE_URL,
    siteName: 'Debrief',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Debrief — altimeter flight-log analyzer' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Debrief — altimeter flight-log analyzer',
    description:
      'A universal, in-browser altimeter flight-log analyzer. One file in, one clean flight out — parsed on your device, never uploaded.',
    images: ['/og.png'],
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
  colorScheme: 'light dark',
};

// Applied before first paint so the saved theme never flashes.
const themeScript = `(function(){try{var t=localStorage.getItem('debrief.theme');var e=document.documentElement;e.classList.toggle('dark',t==='dark');e.classList.toggle('light',t==='light');}catch(e){}})();`;

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${HUB_URL}/#org`,
      name: 'Fusion Space',
      url: HUB_URL,
      sameAs: ['https://github.com/nrdptel'],
    },
    {
      '@type': 'WebApplication',
      '@id': `${SITE_URL}/#app`,
      name: 'Debrief',
      url: SITE_URL,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any (web browser)',
      browserRequirements: 'Requires JavaScript',
      description: DESCRIPTION,
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      codeRepository: REPO_URL,
      publisher: { '@id': `${HUB_URL}/#org` },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-white font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
