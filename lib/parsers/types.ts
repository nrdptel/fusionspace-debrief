import type { RawFlight } from '../flight/types';

export interface ParseInput {
  /** File name, used as a detection hint and carried into the flight. */
  name: string;
  /** Decoded text contents of the file. */
  text: string;
  /**
   * The file's bytes, exactly as they came off the card.
   *
   * `text` is a VIEW of a file, not the file. It is what the encoding sniff made of
   * these bytes (and, for an .xlsx, the first worksheet flattened to CSV) — which is
   * the whole file for a CSV and mojibake for a raw download. A logger that writes a
   * binary flight record — an AltOS `.eeprom`, an Entacore `.bin`/`.xtra`, an RRC3
   * `.rff` — cannot be read from that view at all, so the bytes ride alongside it and
   * a parser reads whichever one its format is written in.
   *
   * Always present: a parser is promised the file, so a binary parser can never
   * silently do nothing because some call site forgot to pass it. `importFlight`
   * encodes them from `text` (lazily — a text import pays for nothing it never reads)
   * for the callers that only ever had text: the share link and a logbook row saved
   * before the logbook kept bytes.
   */
  bytes: Uint8Array;
}

/**
 * What a CALLER hands `importFlight`: a file it has the bytes of, the text of, or both.
 * Whichever is missing is derived, so every parser still sees a whole `ParseInput`.
 */
export type FileInput =
  | { name: string; text: string; bytes?: Uint8Array }
  | { name: string; bytes: Uint8Array; text?: string };

export interface Parser {
  id: string;
  label: string;
  /** Confidence in [0,1] that this parser recognises the file. */
  detect(input: ParseInput): number;
  /** Parse a recognised file into a canonical flight. */
  parse(input: ParseInput): RawFlight;
}

/**
 * A deliberate, user-facing parsing error: the file was recognised but can't be
 * analysed for a reason worth telling the user directly — e.g. it's the wrong
 * file of a pair (a high-rate gyro log with no altitude). Unlike an unexpected
 * exception, `importFlight` surfaces this message rather than quietly falling
 * back to the generic column mapper.
 */
export class ParseGuidanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseGuidanceError';
  }
}
