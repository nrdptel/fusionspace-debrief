import { GitHubIcon } from './icons';
import { HUB_URL, MOTOR_URL, REPO_URL } from '@/lib/links';

export default function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-zinc-200 pt-6 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 md:mt-28">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            <GitHubIcon className="h-4 w-4 fill-current" />
            GitHub
          </a>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
            ·
          </span>
          <a
            href={HUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Fusion Space
          </a>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
            ·
          </span>
          <a
            href={MOTOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Motor Finder
          </a>
        </nav>
        <div className="flex items-center gap-1.5">
          <span>© 2026</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/fusion-space-wordmark.svg"
            alt="Fusion Space"
            width={1598}
            height={281}
            className="h-4 w-auto"
          />
        </div>
      </div>
      <p className="mt-5 max-w-3xl leading-relaxed text-zinc-500 dark:text-zinc-400">
        Your flight file is read in this browser and never uploaded — all parsing and
        analysis happen on your device. The numbers Debrief reports are derived
        best-effort from your logger's data and are only as good as it; treat them as a
        careful reading, not gospel. Personal, non-commercial project — not affiliated
        with any altimeter or rocketry manufacturer. Built for the hobby rocketry
        community.
      </p>
    </footer>
  );
}
