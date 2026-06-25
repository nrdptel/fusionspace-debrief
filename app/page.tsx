import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <SiteHeader />

      <section className="mt-12">
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Flight-log drop zone — coming next.
          </p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
