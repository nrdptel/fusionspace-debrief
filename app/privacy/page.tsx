import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { SITE_URL, REPO_URL } from '@/lib/links';
import { DEVICE_DATA, DEVICE_DATA_KINDS, deviceDataOfKind } from '@/lib/deviceData';
import ForgetDeviceData from '@/components/ForgetDeviceData';

const GITHUB_ISSUES = `${REPO_URL}/issues`;

export const metadata: Metadata = {
  title: 'Privacy — Debrief',
  description:
    'What Debrief collects (nothing — your flight files are parsed in your browser and never uploaded), what lives on your device, and how share links work.',
  alternates: { canonical: `${SITE_URL}/privacy/` },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6 md:py-12">
      <SiteHeader brandAsHeading={false} />

      <h1 className="mt-12 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
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
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>
              <strong>Recent flights</strong> — kept in your browser&apos;s local database
              (IndexedDB) so you can reopen a file without choosing it again. This is the one the
              logbook&apos;s own <em>Clear</em> takes, and it says how many and what goes with them.
            </li>
            <li>
              <strong>An offline copy of the app</strong> — a service worker caches Debrief&apos;s own
              pages and code (so it works without a signal at the field). It caches the app itself,
              never your flight files.
            </li>
            <li>
              <strong>{DEVICE_DATA.length} small settings</strong> — everything below, in local
              storage. Some of it is more than a preference, so it is all named rather than
              summarised.
            </li>
          </ul>

          {/* Rendered from lib/deviceData.ts, which is the list the app actually writes: a test
              greps the source for `debrief.*` and fails if a key is stored without appearing
              here. This section used to read "Your theme and units — a small local-storage value"
              while nineteen keys existed, including the flyer's own typed text and their rocket's
              dimensions, and it said the logbook's Clear removed all of it while Clear took the
              flights and one key. A privacy page a person cannot check is not one. */}
          <div className="mt-4 space-y-4">
            {DEVICE_DATA_KINDS.map((k) => (
              <div key={k.kind}>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{k.heading}</h3>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{k.lede}</p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-6">
                  {deviceDataOfKind(k.kind).map((d) => (
                    <li key={d.key}>
                      {d.what} <code className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{d.key}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-4">
            None of it is sent anywhere, and none of it identifies you — but a shared or borrowed
            laptop is exactly the case a privacy page is for, so here is the control that takes all
            of it at once. The flights are separate: they live in the local database above, and the
            logbook&apos;s own <em>Clear</em> is what removes those.
          </p>
          <ForgetDeviceData />
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Clearing your browser data for this site removes everything on this page, the flights
            and the offline copy together.
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
          <p className="mt-2">
            One consequence worth knowing, since the rest of this page is exhaustive about what is
            kept: opening a share link leaves the whole flight in that browser&apos;s{' '}
            <strong>address bar and session history</strong>. That is the browser&apos;s own record
            of where you have been rather than Debrief&apos;s storage — nothing above reaches it,
            and clearing history is what does.
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
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>No tracking pixels, advertising, or third-party analytics.</li>
            <li>
              No cookies at all. The settings above are local storage, which is a different thing:
              it stays in your browser and is never attached to a request.
            </li>
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

      <p className="mt-12 border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <Link href="/" className="underline hover:text-zinc-700 dark:hover:text-zinc-300">
          ← Back to Debrief
        </Link>
      </p>

      <SiteFooter />
    </main>
  );
}
