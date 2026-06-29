import type { RawFlight } from '../flight/types';

export interface ParseInput {
  /** File name, used as a detection hint and carried into the flight. */
  name: string;
  /** Decoded text contents of the file. */
  text: string;
}

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
