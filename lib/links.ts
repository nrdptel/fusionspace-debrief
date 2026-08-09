export const HUB_URL = 'https://fusionspace.co';
export const REPO_URL = 'https://github.com/nrdptel/fusionspace-debrief';
export const SITE_URL = 'https://debrief.fusionspace.co';

/**
 * The two ways a flyer can tell the project something, each landing on the right form.
 *
 * `.github/ISSUE_TEMPLATE/` has carried a bug report and a format request since long before this,
 * and until 2026-08-09 the only link to either was a sentence on the PRIVACY page — which is
 * `MAINTAINING.md`'s craft-bar tell almost word for word: "a feature reachable only by knowing it
 * is there". A flyer whose logger is not read has no reason to visit the privacy page.
 *
 * `?template=` names the file, so the flyer gets the form with its questions rather than an empty
 * box. Kept here rather than at the call sites because the footer and the recognized-loggers card
 * both link the second one, and a hand-written query string in two places drifts on the day a
 * template is renamed.
 */
export const BUG_REPORT_URL = `${REPO_URL}/issues/new?template=bug_report.yml`;
export const FORMAT_REQUEST_URL = `${REPO_URL}/issues/new?template=format_request.yml`;
