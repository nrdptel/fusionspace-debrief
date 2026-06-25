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
