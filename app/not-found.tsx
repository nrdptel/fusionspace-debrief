import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-12">
      <SiteHeader />
      <section className="mt-8 flex flex-col items-start md:mt-12">
        <p className="font-mono text-sm text-indigo-600 dark:text-indigo-400">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Off the rail.</h1>
        <p className="mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
          That page isn&apos;t here. Head back and drop in a flight log instead.
        </p>
        <Button href="/" variant="primary" className="mt-6">
          <span aria-hidden="true">←</span> Back to Debrief
        </Button>
      </section>
      <SiteFooter />
    </main>
  );
}
