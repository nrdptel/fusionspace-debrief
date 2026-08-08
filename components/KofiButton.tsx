import { Button } from './ui';

/** Small "buy me a coffee" link to the project's Ko-fi page.
 *
 * It used to be amber, "so it reads as a tip jar, distinct from the neutral theme
 * control". That is the one thing it must not be: `DESIGN.md` §2 gives amber the
 * meaning `warn` — an estimate outside its envelope, an extrapolation, a caveat — and
 * says semantic colours are "never for decoration". Every other amber in the tree is
 * a real caveat: `Card tone="warn"`, `Extrapolated`, the rail-exit stability caution,
 * the GPS/barometer disagreement chip. A flyer learns amber means "this number is
 * qualified"; spending it on a tip jar in the persistent header devalues the one
 * signal the safety posture leans on. The coffee cup is what distinguishes it, and a
 * glyph costs the colour system nothing.
 *
 * Label is "Tip" (not "Donate") deliberately: Stripe — Ko-fi's payment
 * processor — restricts "donation/donate" to registered non-profits and flags
 * its use by individuals, so optional payments for content must be framed as
 * "tips". */
export default function KofiButton() {
  return (
    <Button
      variant="secondary"
      size="sm"
      href="https://ko-fi.com/nrdptel"
      target="_blank"
      rel="noopener noreferrer"
      title="Tip the project — buy me a coffee on Ko-fi"
      aria-label="Tip the project — buy me a coffee on Ko-fi"
      className="shrink-0"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-3.5 w-3.5"
      >
        <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
        <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
        <line x1="6" x2="6" y1="1" y2="4" />
        <line x1="10" x2="10" y1="1" y2="4" />
        <line x1="14" x2="14" y1="1" y2="4" />
      </svg>
      Tip
    </Button>
  );
}
