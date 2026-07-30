// What to say about a raw download Debrief cannot read yet.
//
// A file pulled straight off an altimeter's card has no columns in it, so the generic
// column mapper reads nothing and the flyer was told "Debrief couldn't find any data rows
// in this file. Is it a flight log export?" — which is false. It IS a flight log; Debrief
// just can't read that one. Being told your flight log is not a flight log is worse than
// being told nothing, because it sends you looking for the wrong problem.
//
// So a raw download that reaches the end of the line is recognised for what it is and
// says so, naming the ones Debrief DOES read straight off the card so the flyer knows
// which side of the line their file is on. This is the last thing `importFlight` tries,
// after every named parser has passed and the mapper has found nothing to map.

import { ParseGuidanceError, type ParseInput } from './types';

/** Boost's serialisation header, at the head of every Entacore AIM XTRA `.xtra`. */
const BOOST_ARCHIVE = 'serialization::archive';

/**
 * Is this file bytes rather than text?
 *
 * Two things have to be true at once, and the second is what keeps this off a text file.
 * NUL bytes: text essentially never contains one, a binary record stream is full of them.
 * AND a decode that lost something: the text carries replacement characters, meaning the
 * decoder met bytes that are not text in any encoding it knows. A UTF-16 export — the
 * RRC3's mDACS text file, Excel's "Unicode Text" — is NUL-heavy and decodes perfectly, so
 * it fails the second test and is never called a binary download.
 *
 * Only the head of the file is sampled for NULs; that is enough for a format that is
 * binary from its first record, and it keeps a 6 MB flash dump from being walked twice.
 */
export function looksBinary(bytes: Uint8Array, text: string): boolean {
  const n = Math.min(bytes.length, 8192);
  if (n < 64) return false;
  let nul = 0;
  for (let i = 0; i < n; i++) if (bytes[i] === 0) nul++;
  return nul / n >= 0.05 && text.includes('\uFFFD');
}

/** Which logger's raw download this is, where the file says so. */
function nameIt(input: ParseInput): string | null {
  const head = Math.min(input.bytes.length, 4096);
  for (let i = 0; i + BOOST_ARCHIVE.length <= head; i++) {
    let k = 0;
    while (k < BOOST_ARCHIVE.length && input.bytes[i + k] === BOOST_ARCHIVE.charCodeAt(k)) k++;
    if (k === BOOST_ARCHIVE.length) return 'an Entacore AIM XTRA raw flight file';
  }
  if (/\.xtra$/i.test(input.name)) return 'an Entacore AIM XTRA raw flight file';
  if (/\.bin$/i.test(input.name) && input.bytes.length > 1024 * 1024) return 'a raw flash snapshot off an altimeter';
  return null;
}

/**
 * Throw the message this file deserves, or return so the caller can fall through to the
 * column mapper. Only fires on a file that is plainly binary AND holds nothing the mapper
 * could work with — a text export with an odd byte in it still reaches the mapper.
 */
export function refuseRawDownload(input: ParseInput, mappable: boolean): void {
  if (mappable || !looksBinary(input.bytes, input.text)) return;
  const what = nameIt(input);
  const known =
    'Debrief reads two raw downloads straight off the card today: an Altus Metrum ' +
    '.eeprom and a MissileWorks RRC3 .rff.';
  throw new ParseGuidanceError(
    what
      ? `This is ${what}, and Debrief can’t read that format yet — so rather than guess at it, it won’t. ${known} For this one, open it in the AIM XTRA software and export the flight to CSV, then drop that here. It still never leaves your device.`
      : `This file is a binary download off a device rather than a text export, and Debrief doesn’t recognise the format — so rather than guess at it, it won’t. ${known} For anything else, open the file in your altimeter’s own software and export or save-as CSV, then drop that here.`,
  );
}
