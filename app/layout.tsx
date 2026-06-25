import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { SITE_URL } from '@/lib/links';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Debrief — altimeter flight-log analyzer',
  description:
    'Drop in a flight log from any altimeter and read the flight in your browser: apogee, max velocity and acceleration, burnout, deployments and descent rates — with ejection spikes, sensor noise, mixed sample rates and units handled. Files are parsed on your device and never uploaded.',
  applicationName: 'Debrief',
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: 'Debrief — altimeter flight-log analyzer',
    description:
      'A universal, in-browser altimeter flight-log analyzer. One file in, one clean flight out — parsed on your device, never uploaded.',
    url: SITE_URL,
    siteName: 'Debrief',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Debrief — altimeter flight-log analyzer',
    description:
      'A universal, in-browser altimeter flight-log analyzer. One file in, one clean flight out — parsed on your device, never uploaded.',
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-white font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
