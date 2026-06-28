import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { SITE_URL, REPO_URL } from '@/lib/links';

const GITHUB_ISSUES = `${REPO_URL}/issues`;

export const metadata: Metadata = {
  title: 'Privacy — Debrief',
  description:
    'What Debrief collects (nothing — your flight files are parsed in your browser and never uploaded), what lives on your device, and how share links work.',
  alternates: { canonical: `${SITE_URL}/privacy/` },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6 md:py-10">
      <SiteHeader />

      <h1 className="mt-10 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Privacy
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Debrief is a personal, non-commercial project. It collects as little as possible — in
        fact, nothing — so this page is short.
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            What we collect
          </h2>
          <p className="mt-2">
            Nothing. There is no account, no sign-up, no email, and no analytics. Your flight file
            is read and analyzed <strong>entirely in your browser</strong> and is never uploaded —
            there is no server to upload it to. Debrief is a static site.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            What lives on your device
          </h2>
          <p className="mt-2">
            A few things are saved locally so the tool is pleasant to use, and they never leave your
            browser:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Recent flights</strong> — kept in your browser&apos;s local database
              (IndexedDB) so you can reopen a file without choosing it again.
            </li>
            <li>
              <strong>Your theme and units</strong> — a small local-storage value remembering
              light/dark and feet/metres.
            </li>
            <li>
              <strong>An offline copy of the app</strong> — a service worker caches Debrief&apos;s own
              pages and code (so it works without a signal at the field). It caches the app itself,
              never your flight files.
            </li>
          </ul>
          <p className="mt-2">
            Clearing your browser data (or using the &ldquo;clear&rdquo; control on the recents list)
            removes all of it.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Share links</h2>
          <p className="mt-2">
            When you create a share link, the flight is compressed and packed into the part of the
            URL <em>after the</em> <code className="font-mono text-xs">#</code> (the fragment).
            Browsers never send the fragment to a server, so the flight still isn&apos;t uploaded —
            the link works because whoever opens it decodes it in their own browser. Treat a share
            link like the file itself: only send it to people you&apos;d give the flight to.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Hosting</h2>
          <p className="mt-2">
            The site is served as static files by{' '}
            <a
              href="https://www.cloudflare.com/application-services/products/pages/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Cloudflare Pages
            </a>
            . Like any web host, Cloudflare may keep standard, short-lived request logs (such as IP
            addresses) for delivering and protecting the site. That&apos;s infrastructure-level and
            applies to fetching the page — it never includes your flight data, which stays in your
            browser.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            What we don&apos;t do
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>No tracking pixels, advertising, or third-party analytics.</li>
            <li>No cookies beyond the local theme/units preference described above.</li>
            <li>No selling, renting, or sharing of anything — there is nothing to share.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Contact</h2>
          <p className="mt-2">
            Questions? Open a{' '}
            <a
              href={GITHUB_ISSUES}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              GitHub issue
            </a>
            .
          </p>
        </section>
      </div>

      <p className="mt-10 border-t border-zinc-200 pt-5 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <Link href="/" className="underline hover:text-zinc-700 dark:hover:text-zinc-300">
          ← Back to Debrief
        </Link>
      </p>

      <SiteFooter />
    </main>
  );
}
