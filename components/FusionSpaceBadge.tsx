import { HUB_URL } from '@/lib/links';

/** Parent-brand eyebrow. Debrief is one of several Fusion Space tools; this small
 * linked lockup sits above the product name to place it under the Fusion Space
 * brand and let people discover the other tools at fusionspace.co. Uses the
 * official FusionSpace wordmark from the main site so the two read as one family
 * (the gradient reads on both light and dark). */
export default function FusionSpaceBadge({ className = '' }: { className?: string }) {
  return (
    <a
      href={HUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Fusion Space — free, polished tools for high-power rocketry"
      className={`group inline-flex w-fit items-center gap-1 transition hover:opacity-80 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/fusion-space-wordmark.svg"
        alt="Fusion Space"
        width={1598}
        height={281}
        className="h-4 w-auto"
      />
      <span
        aria-hidden="true"
        className="text-xs text-zinc-400 opacity-0 transition group-hover:opacity-100 dark:text-zinc-500"
      >
        ↗
      </span>
    </a>
  );
}
