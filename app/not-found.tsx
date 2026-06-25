import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <SiteHeader />
      <section className="mt-20 flex flex-col items-start md:mt-28">
        <p className="font-mono text-sm text-indigo-600 dark:text-indigo-400">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Off the rail.</h1>
        <p className="mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
          That page isn&apos;t here. Head back and drop in a flight log instead.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          <span aria-hidden="true">←</span> Back to Debrief
        </Link>
      </section>
      <SiteFooter />
    </main>
  );
}
