import { describe, it, expect } from 'vitest';
import { resolveUnit, convert } from '../units';
import { detectDelimiter, splitLine } from '../csv';
import { analyzeTable } from '../flight/columns';
import { importFlight } from './index';
import { analyzeFlight } from '../analyze';
import { getChannel } from '../flight/types';

describe('units', () => {
  it('resolves and converts common altimeter units', () => {
    expect(resolveUnit('ft')!.quantity).toBe('length');
    expect(convert(1000, 'ft', 'm')).toBeCloseTo(304.8, 1);
    expect(convert(1, 'g', 'm/s²')).toBeCloseTo(9.80665, 3);
    expect(convert(1013.25, 'hPa', 'Pa')).toBeCloseTo(101325, 0);
    expect(convert(32, 'F', 'C')).toBeCloseTo(0, 6);
  });
});

describe('csv', () => {
  it('detects delimiters and splits quoted fields', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(splitLine('1,"two, still two",3', ',')).toEqual(['1', 'two, still two', '3']);
  });
});

describe('generic CSV column detection', () => {
  it('guesses roles and units from headers', () => {
    const rows = [
      ['Time (s)', 'Altitude (ft)', 'Accel (g)'],
      ['0', '0', '1'],
      ['0.1', '5', '8'],
      ['0.2', '20', '7'],
    ];
    const t = analyzeTable(rows);
    const byRole = Object.fromEntries(t.columns.map((c) => [c.role, c]));
    expect(byRole.time).toBeTruthy();
    expect(byRole.altitude.unit).toBe('ft');
    expect(byRole.accelAxial.unit).toBe('g');
  });
});

describe('generic CSV with a separate units row', () => {
  it('reads names from one row and units from the next', () => {
    const rows = [
      ['Time', 'Altitude', 'Accel'],
      ['s', 'ft', 'g'],
      ['0', '0', '1'],
      ['0.1', '5', '8'],
      ['0.2', '20', '7'],
    ];
    const t = analyzeTable(rows);
    expect(t.headers).toEqual(['Time', 'Altitude', 'Accel']);
    const byRole = Object.fromEntries(t.columns.map((c) => [c.role, c]));
    expect(byRole.altitude.unit).toBe('ft');
    expect(byRole.accelAxial.unit).toBe('g');
    expect(t.dataRows.length).toBe(3);
  });
});

describe('a bare "g" column does not get mis-read as acceleration', () => {
  it('leaves a geoid/GPS g column ignored', () => {
    const rows = [
      ['time', 'g', 'height'],
      ['0', '17.1', '0'],
      ['0.1', '17.1', '5'],
    ];
    const t = analyzeTable(rows);
    const byIndex = Object.fromEntries(t.columns.map((c) => [c.header, c.role]));
    expect(byIndex['g']).toBe('ignore');
    expect(byIndex['height']).toBe('altitude');
  });
});

describe('BOM-prefixed Altus file still detects', () => {
  it('strips a UTF-8 BOM before parsing', () => {
    const text =
      '﻿version,serial,flight,call,time,clock,rssi,lqi,state,state_name,acceleration,pressure,altitude,height,accel_speed,baro_speed,temperature,battery_voltage,drogue_voltage,main_voltage\n' +
      '5,1,1,N,0,0,0,0,1,boost,150,1013.25,100,0,0,0,20,7.4,0,0\n' +
      '5,1,1,N,0.1,0,0,0,1,boost,150,1000,110,10,40,5,20,7.4,0,0';
    const result = importFlight({ name: 'f.csv', text });
    expect(result.kind).toBe('flight');
  });
});

describe('AltOS radio-telemetry CSV', () => {
  // The telemetry log is keyed by tick/ptype (no state_name/pressure columns), with a
  // dominant sensor packet type carrying height/speed in SI. It must parse as an Altus
  // Metrum flight, not fall to the generic mapper (which would read the `v_apogee`
  // voltage column as an altitude).
  function telemetryCsv(): string {
    const header = 'serial,tick,ptype,state,v_batt,v_apogee,ground_pres,acceleration,speed,height,crc';
    const lines = [header];
    // A modest flight to apogee ~230 m, ~20 Hz; a couple of interleaved ptype=8 GPS
    // packets with stale height that must be filtered out.
    let t = 40; // telemetry starts mid-pad-wait
    let prev = 0;
    const G = 9.80665;
    const aBoost = 40;
    const tBurn = 1.5;
    const vB = aBoost * tBurn;
    const hB = 0.5 * aBoost * tBurn * tBurn;
    for (let i = 0; i < 400; i++, t += 0.05) {
      const ft = t - 42;
      let h: number;
      if (ft <= 0) h = 0;
      else if (ft <= tBurn) h = 0.5 * aBoost * ft * ft;
      else {
        const c = ft - tBurn;
        h = Math.max(0, hB + vB * c - 0.5 * G * c * c);
      }
      const v = (h - prev) / 0.05;
      prev = h;
      lines.push(`7,${t.toFixed(2)},9,3,7.4,4.2,97000,${(v > 0 ? 20 : -5).toFixed(2)},${v.toFixed(2)},${h.toFixed(1)},T`);
      if (i % 60 === 59) lines.push(`7,${t.toFixed(2)},8,3,7.4,4.2,97000,0,0,99999,T`); // GPS packet, stale height
    }
    return lines.join('\n');
  }

  it('parses the telemetry log as an Altus Metrum flight and reads metric height', () => {
    const result = importFlight({ name: 'flight-Telemetry.csv', text: telemetryCsv() });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('altusmetrum');
    const a = analyzeFlight(result.flight);
    const apogeeM = a.metrics.apogeeAltitude;
    // ~230 m. Crucially, the stale ptype=8 GPS rows (height 99999) were filtered out —
    // otherwise apogee would read tens of thousands of metres.
    expect(apogeeM).toBeGreaterThan(180);
    expect(apogeeM).toBeLessThan(300);
  });
});

describe('detection is token-anchored, not substring', () => {
  it('does not treat a CSV that merely contains "vraw" as an Eggtimer file', () => {
    // "vraw_x"/"vfilt_y" are column names, not the bare VRaw/VFilt tokens.
    const text = ['time,vraw_x,vfilt_y,alt', '0,1,2,0', '0.1,1,2,5', '0.2,1,2,9'].join('\n');
    const result = importFlight({ name: 'data.csv', text });
    expect(result.kind).toBe('mapping');
  });
});

describe('units-row detection does not misfire on terse headers', () => {
  it('keeps a short header (T,M,S) as names, not units, when there is no real names row above', () => {
    const rows = [
      ['# my logger'],
      ['T', 'M', 'S'],
      ['0', '0', '0'],
      ['0.1', '5', '12'],
      ['0.2', '20', '30'],
    ];
    const t = analyzeTable(rows);
    expect(t.headers).toEqual(['T', 'M', 'S']);
    expect(t.dataRows.length).toBe(3);
  });
});

describe('real-world messiness: CRLF, trailing commas, blank lines', () => {
  it('parses an Eggtimer Classic export with CRLF and a trailing blank line', () => {
    const text = 'T,Alt,VRaw,VFilt\r\n0,0,0,0\r\n100,2,20,7\r\n200,19,170,69\r\n\r\n';
    const result = importFlight({ name: 'flight.csv', text });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('eggtimer');
  });

  it('handles a generic CSV with a trailing comma / empty last column', () => {
    const rows = [
      'Time (s),Altitude (m),',
      '0,0,',
      '0.1,5,',
      '0.2,20,',
    ].join('\n');
    const result = importFlight({ name: 'data.csv', text: rows });
    // Either auto-maps or offers a mapping — must not throw and must see the columns.
    if (result.kind === 'mapping') {
      expect(result.table.headers.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('Altus Metrum: real files use a single "speed" column, not accel_speed', () => {
  const sample = [
    '# Altus Metrum',
    '# serial 2098',
    'version,serial,flight,call,time,state,state_name,acceleration,pressure,altitude,height,speed,temperature,battery_voltage,altitude,latitude',
    '6,2098,12,KD9LJW,-1.0,3,boost,3.6,98235,260,0,0,28,3.9,218,41.4',
    '6,2098,12,KD9LJW,0.0,3,boost,80,97000,300,40,90,28,3.9,218,41.4',
    '6,2098,12,KD9LJW,0.5,4,fast,0,90000,800,540,120,27,3.9,218,41.4',
  ].join('\n');

  it('detects and maps the speed column to velocity', () => {
    const result = importFlight({ name: 'TeleMetrum.csv', text: sample });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('altusmetrum');
    expect(getChannel(result.flight, 'velocity')).toBeTruthy();
    expect(getChannel(result.flight, 'altitude')).toBeTruthy(); // from "height"
  });
});

describe('Altus Metrum parser', () => {
  const sample = [
    '# Altus Metrum',
    '# serial 1234',
    '# flight 7',
    'version,serial,flight,call,time,clock,rssi,lqi,state,state_name,acceleration,pressure,altitude,height,accel_speed,baro_speed,temperature,battery_voltage,drogue_voltage,main_voltage',
    '5,1234,7,N0CALL,-1.00,0,0,0,0,pad,0.1,1013.25,100,0,0,0,20,7.4,0,0',
    '5,1234,7,N0CALL,0.00,0,0,0,1,boost,150,1013.25,100,0,0,0,20,7.4,0,0',
    '5,1234,7,N0CALL,0.10,0,0,0,1,boost,150,1000.0,110,10,40,5,20,7.4,0,0',
    '5,1234,7,N0CALL,0.20,0,0,0,2,fast,0,980.0,130,30,80,12,20,7.4,0,0',
  ].join('\n');

  it('detects and parses an AltOS export', () => {
    const result = importFlight({ name: 'flight.csv', text: sample });
    expect(result.kind).toBe('flight');
    if (result.kind !== 'flight') return;
    expect(result.parser.id).toBe('altusmetrum');
    const flight = result.flight;
    // height is AGL in metres; velocity comes from accel_speed.
    expect(getChannel(flight, 'altitude')!.unit).toBe('m');
    expect(getChannel(flight, 'velocity')).toBeTruthy();
    expect(getChannel(flight, 'accelAxial')).toBeTruthy();
  });
});

// D2's structural precondition. `ParseInput` was `{ name, text }`, so the bytes of a
// dropped file reached no parser at all and a binary format could not be read even in
// principle. These pin the contract that replaced it: a parser is handed the WHOLE file,
// whichever half the caller happened to have.
describe('a parser is handed the file, not just its text', () => {
  /** A parser that records what it was given and never claims anything. */
  function spy() {
    const seen: { name: string; text: string; bytes: Uint8Array }[] = [];
    return {
      seen,
      parser: {
        id: 'spy',
        label: 'spy',
        detect(input: { name: string; text: string; bytes: Uint8Array }) {
          seen.push({ name: input.name, text: input.text, bytes: input.bytes });
          return 0;
        },
        parse(): never {
          throw new Error('never');
        },
      },
    };
  }

  it('encodes the bytes from the text when the caller only had text', () => {
    const { seen, parser } = spy();
    importFlight({ name: 'x.csv', text: 'time,altitude\n0,0\n1,10\n' }, [parser]);
    expect(seen).toHaveLength(1);
    expect(new TextDecoder().decode(seen[0].bytes)).toBe('time,altitude\n0,0\n1,10\n');
  });

  it('decodes the text from the bytes when the caller only had bytes', () => {
    const { seen, parser } = spy();
    const bytes = new TextEncoder().encode('time,altitude\n0,0\n1,10\n');
    importFlight({ name: 'x.csv', bytes }, [parser]);
    expect(seen[0].text).toBe('time,altitude\n0,0\n1,10\n');
    expect(seen[0].bytes).toBe(bytes);
  });

  it('hands over the bytes it was given, not a re-encode of the text', () => {
    // The whole point: a file whose text is a LOSSY view of it — every byte the decoder
    // could not read became U+FFFD, and re-encoding that gives a different file. A parser
    // that read the re-encode would be reading something the flyer never dropped.
    const { seen, parser } = spy();
    const bytes = new Uint8Array([0x00, 0x01, 0xff, 0xfe, 0x80, 0x42, 0x00, 0x99]);
    importFlight({ name: 'flight.rff', bytes }, [parser]);
    expect([...seen[0].bytes]).toEqual([...bytes]);
    // …and the text really is the lossy view, so this is not a distinction without a
    // difference: the two disagree about the file.
    expect([...new TextEncoder().encode(seen[0].text)]).not.toEqual([...bytes]);
  });

  it('strips a UTF-8 BOM from the text on both paths', () => {
    const { seen, parser } = spy();
    importFlight({ name: 'a.csv', text: '﻿time,alt\n0,0\n' }, [parser]);
    importFlight({ name: 'b.csv', bytes: new Uint8Array([0xef, 0xbb, 0xbf, 0x74, 0x69, 0x6d, 0x65]) }, [parser]);
    expect(seen[0].text.startsWith('time')).toBe(true);
    expect(seen[1].text).toBe('time');
  });
});

// A raw download that no parser can read is told what it is — not told it isn't a flight.
describe('a binary download off a card is named, not called "not a flight log"', () => {
  /** A NUL-heavy blob that decodes to mojibake: what a flash dump actually looks like. */
  function blob(n: number, seed: number[] = []): Uint8Array {
    const b = new Uint8Array(n);
    for (let i = 0; i < n; i++) b[i] = i % 7 === 0 ? 0 : 0x80 + (i % 0x40);
    b.set(seed, 0);
    return b;
  }

  it('names an Entacore AIM XTRA raw flight file by its container', () => {
    const b = blob(4096);
    b.set(new TextEncoder().encode('serialization::archive'), 4);
    expect(() => importFlight({ name: 'skys_limit.xtra', bytes: b })).toThrow(/Entacore AIM XTRA raw flight file/);
    // …and says which raw downloads it CAN read, so the flyer knows where the line is.
    expect(() => importFlight({ name: 'skys_limit.xtra', bytes: b })).toThrow(/\.eeprom and a MissileWorks RRC3 \.rff/);
  });

  it('says something true about a binary download it cannot name at all', () => {
    expect(() => importFlight({ name: 'FLIGHT01.DAT', bytes: blob(4096) })).toThrow(/binary download off a device/);
  });

  it('does not send a flash dump off an unknown board to one vendor’s software', () => {
    // A .bin says nothing about which board wrote it. Naming the SHAPE is fair; naming a
    // vendor is not, and telling a Raven owner to open their file in the AIM XTRA software
    // is a confident wrong answer — worse than the vague one it replaced.
    const big = blob(2 * 1024 * 1024);
    expect(() => importFlight({ name: 'FLIGHT.BIN', bytes: big })).toThrow(/raw flash snapshot off an altimeter/);
    expect(() => importFlight({ name: 'FLIGHT.BIN', bytes: big })).toThrow(/your altimeter’s own software/);
    expect(() => importFlight({ name: 'FLIGHT.BIN', bytes: big })).not.toThrow(/AIM XTRA/);
    // …while a file that DOES name its maker still gets that maker's own instruction.
    const xtra = blob(4096);
    xtra.set(new TextEncoder().encode('serialization::archive'), 4);
    expect(() => importFlight({ name: 'x.xtra', bytes: xtra })).toThrow(/AIM XTRA software/);
  });

  it('leaves a text export alone, including a NUL-heavy UTF-16 one', () => {
    // UTF-16 is half NUL bytes. It is still text, it still decodes cleanly, and it still
    // belongs in the column mapper — this is the case the NUL count alone would get wrong.
    const utf16 = new Uint8Array(2 * 200);
    const line = 'Notes about this flight, written by hand, no numbers at all.\n'.repeat(6);
    for (let i = 0; i < Math.min(line.length, 200); i++) utf16[i * 2] = line.charCodeAt(i);
    expect(importFlight({ name: 'notes.txt', bytes: utf16 }).kind).toBe('mapping');
  });

  it('needs BOTH halves of its rule — NUL-heavy bytes, and a decode that lost something', () => {
    // Either half alone is not enough, and each is here because a real file trips exactly one.
    // Without the NUL count, a text file carrying one bad byte reads as a binary download;
    // without the lossy-decode count, a UTF-16 export does. Delete either clause and one of
    // these two cases starts failing, which is what stops the rule quietly becoming half a rule.
    const lossyNoNuls = new Uint8Array(4096);
    for (let i = 0; i < lossyNoNuls.length; i++) lossyNoNuls[i] = 0x80 + (i % 0x40); // invalid UTF-8, no NULs
    expect(new TextDecoder().decode(lossyNoNuls), 'the decode really is lossy').toContain('\uFFFD');
    expect(lossyNoNuls.includes(0), 'and there really are no NULs').toBe(false);
    expect(importFlight({ name: 'odd.txt', bytes: lossyNoNuls }).kind, 'lossy but not NUL-heavy').toBe('mapping');

    const nulsNoLoss = new Uint8Array(4096);
    for (let i = 0; i < nulsNoLoss.length; i += 2) nulsNoLoss[i] = 0x41; // UTF-16LE 'A's: half NULs, decodes clean
    expect(new TextDecoder('utf-16le').decode(nulsNoLoss), 'the decode really is clean').not.toContain('\uFFFD');
    expect(importFlight({ name: 'notes.txt', bytes: nulsNoLoss }).kind, 'NUL-heavy but not lossy').toBe('mapping');
  });

  it('leaves a binary file alone when the mapper can still find columns in it', () => {
    const csv = 'time,altitude\n0,0\n1,10\n2,40\n3,90\n';
    const b = new Uint8Array(csv.length + 400);
    b.set(new TextEncoder().encode(csv), 0);
    // …trailing NULs and high bytes, as a truncated download off a card would have.
    for (let i = csv.length; i < b.length; i++) b[i] = i % 5 === 0 ? 0 : 0xc0;
    expect(importFlight({ name: 'half.csv', bytes: b }).kind).toBe('mapping');
  });
});
