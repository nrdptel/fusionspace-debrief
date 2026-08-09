// A minimal ZIP writer and an OpenRocket design builder, shared by the specs that need one.
//
// **Shared rather than copied, and that is this repo's own rule rather than tidiness**: two specs
// building the same archive two ways is two things that can drift, and the second copy of this was
// about to be written for `compare-page.spec.ts` when it was extracted instead.

/**
 * A minimal STORED (uncompressed) ZIP holding one member. OpenRocket deflates its own files,
 * but the reader takes method 0 as well, and building one here means this spec can state the
 * exact design it wants rather than shipping a second fixture that says almost the same thing
 * as the corpus one. Little-endian throughout, per PKWARE APPNOTE.
 */
export function storedZip(name: string, contents: string): Buffer {
  const data = Buffer.from(contents, 'utf8');
  const nameBuf = Buffer.from(name, 'utf8');
  // CRC-32, computed the long way so the spec depends on nothing.
  let crc = 0xffffffff;
  for (const b of data) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  crc = (crc ^ 0xffffffff) >>> 0;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 8); // stored
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42); // local header offset

  const localSize = local.length + nameBuf.length + data.length;
  const centralSize = central.length + nameBuf.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(localSize, 16);

  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]);
}

/** An OpenRocket design stating `count` simulations, with apogees far enough apart to tell apart.
 *
 *  Built inline rather than taken from the corpus so every case using it runs on a fork with no
 *  fixtures token. The corpus `.ork` states five and is the same shape. */
export function designWithSimulations(count: number, rocket = 'Telemetrum'): Buffer {
  const sims = Array.from({ length: count }, (_, i) => {
    const alt = 100 * (i + 1);
    return (
      `<simulation status="uptodate"><name>Simulation ${i + 1}</name>` +
      `<flightdata maxaltitude="${alt}" maxvelocity="68.6" maxacceleration="143.649" maxmach="0.2" ` +
      `timetoapogee="6.5" flighttime="60" groundhitvelocity="4.681" launchrodvelocity="15.365" ` +
      `deploymentvelocity="2.646" optimumdelay="2.751"/></simulation>`
    );
  }).join('');
  return storedZip(
    'rocket.ork',
    `<?xml version='1.0' encoding='utf-8'?><openrocket version="1.10" creator="OpenRocket 24.12">` +
      `<rocket><name>${rocket}</name></rocket><simulations>${sims}</simulations></openrocket>`,
  );
}
