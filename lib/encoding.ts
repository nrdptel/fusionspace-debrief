// Decode a dropped file's raw bytes into text, detecting the character encoding
// before falling back to UTF-8. Loggers and spreadsheet tools on Windows commonly
// export UTF-16 — the Missile Works RRC3 mDACS text export is UTF-16LE, and Excel's
// "Unicode Text" save is UTF-16 too — and read as plain UTF-8 those arrive as
// mojibake with a NUL in every other byte, so no column ever maps. The web File
// API's file.text() always assumes UTF-8, so the encoding sniff has to run on the
// bytes, upstream of the CSV layer.
//
// Detection is by byte-order mark first (unambiguous), then a conservative UTF-16
// heuristic for BOM-less exports, else UTF-8. A plain UTF-8 file — the common case —
// decodes identically to file.text().
//
// BOMs and encoding labels: WHATWG Encoding Standard (https://encoding.spec.whatwg.org),
// Unicode byte-order mark (https://en.wikipedia.org/wiki/Byte_order_mark).

/** Decode file bytes to a string, honouring a leading BOM (UTF-8 / UTF-16 LE/BE)
 *  and otherwise guessing UTF-16 only when the bytes clearly look like it, else
 *  UTF-8. TextDecoder drops a leading BOM from its output for every label here. */
export function decodeBytes(bytes: Uint8Array): string {
  return stripLeadingBom(decodeRaw(bytes));
}

function decodeRaw(bytes: Uint8Array): string {
  const a = bytes[0];
  const b = bytes[1];
  const c = bytes[2];
  if (a === 0xef && b === 0xbb && c === 0xbf) return new TextDecoder('utf-8').decode(bytes); // UTF-8 BOM
  if (a === 0xff && b === 0xfe) return new TextDecoder('utf-16le').decode(bytes); // UTF-16 LE BOM
  if (a === 0xfe && b === 0xff) return new TextDecoder('utf-16be').decode(bytes); // UTF-16 BE BOM
  const guess = guessUtf16(bytes);
  return new TextDecoder(guess ?? 'utf-8').decode(bytes);
}

/** Drop a leading byte-order mark: a real BOM char (U+FEFF, which TextDecoder
 *  usually removes already), or a UTF-8 BOM that survived a re-encode to UTF-16 as
 *  its three raw bytes (EF BB BF → the characters "ï»¿"), as the RRC3 mDACS export
 *  does — otherwise it clings to the first header cell and muddles the column name. */
function stripLeadingBom(s: string): string {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1);
  if (s.charCodeAt(0) === 0x00ef && s.charCodeAt(1) === 0x00bb && s.charCodeAt(2) === 0x00bf) return s.slice(3);
  return s;
}

/** Returns 'utf-16le' | 'utf-16be' when a BOM-less buffer is almost certainly
 *  UTF-16 — ASCII-heavy text leaves a NUL in half the bytes, essentially all on one
 *  side — else null. The signal has to be strong and one-sided so plain UTF-8 (which
 *  effectively never contains NUL) can't trip it and get mangled. */
function guessUtf16(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const n = Math.min(bytes.length, 4096) & ~1; // sample an even byte count
  if (n < 16) return null;
  let even = 0; // NULs at even offsets  → the ASCII high byte of UTF-16 big-endian
  let odd = 0; // NULs at odd offsets    → the ASCII high byte of UTF-16 little-endian
  for (let i = 0; i < n; i++) {
    if (bytes[i] !== 0x00) continue;
    if (i % 2 === 0) even++;
    else odd++;
  }
  const total = even + odd;
  if (total < n * 0.2) return null; // not NUL-heavy enough to be ASCII UTF-16
  if (odd > even * 8) return 'utf-16le';
  if (even > odd * 8) return 'utf-16be';
  return null;
}
