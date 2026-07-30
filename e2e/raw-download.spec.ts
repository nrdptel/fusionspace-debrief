import { test, expect } from '@playwright/test';

// A flyer drops the file the card actually holds — a raw download off the board, with no
// CSV export in between — and gets a report. In a real browser, through the real drop
// handler, all the way to the headline number.
//
// The two files here are BUILT, not sampled: the corpus that proves these parsers read
// real flights correctly is private, and the point of this walk is the plumbing — that a
// binary file survives the drop handler, the worker, the logbook and a reload, which no
// unit test can show. What the numbers mean is settled in `altosEeprom.test.ts` and
// `missileworksRff.test.ts`, sample-for-sample against the vendors' own exports.

/** The MP3H6115A count an AltOS TeleMetrum v1 would log for a given pressure. */
const baroCount = (pa: number) => Math.round(((pa / 1000) * 0.009 - 0.095) * 2047 * 16);

/**
 * An AltOS raw download in log format 1: the board's JSON configuration, then the flight
 * log as lines of hex. One 'F' record (boost, which is where t=0 sits) and one 'A' record
 * per 10 ms, flying a parabola from the pad to about 500 m and back.
 */
function altosEeprom(): Buffer {
  const header = {
    accel_cal_minus_cooked: 8433,
    accel_cal_plus_cooked: 8250,
    callsign: 'N0CALL',
    log_format: 1,
    manufacturer: 'altusmetrum.org',
    product: 'TeleMetrum-v1.2',
    serial: 1234,
    version: '1.1.1',
  };
  const bytes: number[] = [];
  const rec = (type: string, tick: number, a: number, b: number) => {
    bytes.push(type.charCodeAt(0), 0, tick & 0xff, (tick >> 8) & 0xff, a & 0xff, (a >> 8) & 0xff, b & 0xff, (b >> 8) & 0xff);
  };
  const PAD = 101_000; // Pa
  const boost = 1000; // ticks
  // Two seconds on the pad, a 6 s climb to ~500 m, then a 30 s descent back to it.
  const shape = (t: number) => {
    if (t < 0) return 0;
    if (t < 6) return 500 * (1 - (1 - t / 6) ** 2);
    return Math.max(0, 500 * (1 - (t - 6) / 30));
  };
  rec('F', boost, 8250, 1);
  for (let i = -200; i < 3600; i++) {
    const t = i / 100;
    // Barometric formula, near enough for a made-up flight: 12 Pa per metre at sea level.
    rec('A', boost + i, 8250, baroCount(PAD - shape(t) * 11.9));
  }
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i += 32) {
    hex.push(
      Array.from(bytes.slice(i, i + 32))
        .map((v) => v.toString(16).padStart(2, '0'))
        .join(' '),
    );
  }
  return Buffer.from(`${JSON.stringify(header, null, '\t')}\n${hex.join('\n')}\n`, 'utf8');
}

/**
 * A MissileWorks RRC3 raw flight file: a .NET BinaryFormatter stream holding a
 * `List<Int16>` whose backing array is the log — barometer readings in tenths of a
 * millibar, with two auxiliary words every twentieth reading.
 */
function rrc3Rff(peakM = 400): Buffer {
  const words: number[] = [];
  const PAD = 10_100; // tenths of a millibar: 1,010.0 mbar on the pad
  const shape = (t: number) => (t < 2 ? 0 : t < 8 ? peakM * (1 - (1 - (t - 2) / 6) ** 2) : Math.max(0, peakM * (1 - (t - 8) / 40)));
  words.push(0x6f0e, 0x7ee4, 0x0482); // the preamble: the first auxiliary pair, and one word Debrief skips
  for (let i = 0; i < 1200; i++) {
    if (i > 0 && i % 20 === 0) words.push(0x6f0e, 0x7ee4);
    // ~0.119 mbar per metre near sea level, in the tenths the RRC3 logs.
    words.push(Math.round(PAD - shape(i / 20) * 1.19));
  }
  const size = words.length;
  const capacity = 2048 > size ? 2048 : 4096;

  const head = Buffer.alloc(17);
  head.writeUInt8(0x00, 0); // SerializedStreamHeader
  head.writeInt32LE(1, 1); // rootId
  head.writeInt32LE(-1, 5); // headerId
  head.writeInt32LE(1, 9); // major
  head.writeInt32LE(0, 13); // minor
  // Record type 5 (ClassWithMembersAndTypes) for object 1, then the class name the way
  // NRBF writes a string: a length byte, then ASCII. Only the name matters to the reader.
  const CLASS = 'mDACS.AnalysisSupport+FlightRecord';
  const name = Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x00, 0x00, CLASS.length]), Buffer.from(CLASS, 'latin1')]);
  const owner = Buffer.alloc(13);
  owner.writeUInt8(0x09, 0); // MemberReference
  owner.writeInt32LE(5, 1); // → object 5, the backing array
  owner.writeInt32LE(size, 5); // _size
  owner.writeInt32LE(size, 9); // _version
  const arr = Buffer.alloc(10 + capacity * 2);
  arr.writeUInt8(0x0f, 0); // ArraySinglePrimitive
  arr.writeInt32LE(5, 1); // objectId
  arr.writeInt32LE(capacity, 5); // length
  arr.writeUInt8(7, 9); // Int16
  words.forEach((w, i) => arr.writeUInt16LE(w, 10 + i * 2));
  return Buffer.concat([head, name, owner, arr, Buffer.from([0x0b])]);
}

const chooser = (page: import('@playwright/test').Page) => page.getByLabel('Choose a flight log file');

test('an Altus Metrum raw .eeprom download opens into a report', async ({ page }) => {
  await page.goto('/');
  await chooser(page).setInputFiles({ name: 'TeleMetrum-flight-3.eeprom', mimeType: 'application/octet-stream', buffer: altosEeprom() });

  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible({ timeout: 20_000 });
  // It never went near the column mapper, which is where this file used to end up.
  await expect(page.getByText(/no flight data in this file/i)).toHaveCount(0);
  await expect(page.getByText('Altus Metrum (raw .eeprom download)')).toBeVisible();

  // The headline reads a flight, at the height the file was built to fly (500 m ≈ 1,640 ft),
  // and says out loud that the altitude came from the barometer rather than a height column.
  await expect(page.locator('[data-reading="Apogee"]').first()).toContainText(/1,6\d\d ft/);
  await expect(page.getByText(/derived from barometric pressure/i).first()).toBeVisible();
});

test('an RRC3 raw .rff download opens, and survives a reload through the logbook', async ({ page }) => {
  await page.goto('/');
  await chooser(page).setInputFiles({ name: 'XPRS_Scratch.rff', mimeType: 'application/octet-stream', buffer: rrc3Rff() });

  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('MissileWorks RRC3 (raw .rff download)')).toBeVisible();
  const first = await page.locator('[data-reading="Apogee"]').first().innerText();
  expect(first).toMatch(/\d/);

  // The logbook stores a flight as TEXT and re-parses it on every reopen, which is lossless
  // right up until the text is mojibake. This is the walk that proves the bytes are kept:
  // reload the page, click the row, and read the same number back off the same file.
  await page.goto('/');
  const row = page.getByRole('button', { name: /XPRS_Scratch\.rff/ }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();

  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('MissileWorks RRC3 (raw .rff download)')).toBeVisible();
  expect(await page.locator('[data-reading="Apogee"]').first().innerText()).toBe(first);
});

test('the share button says a raw download cannot ride in a link, before it is pressed', async ({ page }) => {
  await page.goto('/');
  await chooser(page).setInputFiles({ name: 'XPRS_Scratch.rff', mimeType: 'application/octet-stream', buffer: rrc3Rff() });
  await expect(page.getByRole('button', { name: /Analyze another flight/ })).toBeVisible({ timeout: 20_000 });

  // A share link carries the FILE, and the file here is bytes. Encoding its text would make
  // a link that opens to a refusal on the other end, so the button says so before it is
  // pressed rather than after — and points at the exports that do carry this report.
  const share = page.getByRole('button', { name: /No link for a raw file/ });
  await expect(share).toBeVisible();
  await share.click();
  await expect(page.getByText(/only works for a text export/i)).toBeVisible();
  await expect(page.getByText(/Save \.html/i).first()).toBeVisible();
});

test('a raw download Debrief cannot read is named, not called "not a flight log"', async ({ page }) => {
  // An Entacore AIM XTRA raw flight file: a Boost serialization archive. Debrief can say
  // what it is and cannot read it, and those are two different sentences.
  const blob = Buffer.alloc(8192);
  for (let i = 0; i < blob.length; i++) blob[i] = i % 7 === 0 ? 0 : 0x80 + (i % 0x40);
  blob.write('serialization::archive', 4, 'latin1');

  await page.goto('/');
  await chooser(page).setInputFiles({ name: 'skys_limit.xtra', mimeType: 'application/octet-stream', buffer: blob });

  await expect(page.getByText(/Entacore AIM XTRA raw flight file/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\.eeprom and a MissileWorks RRC3 \.rff/i)).toBeVisible();
  // The sentence it used to get, which was false.
  await expect(page.getByText(/Is it a flight log export\?/i)).toHaveCount(0);
});
