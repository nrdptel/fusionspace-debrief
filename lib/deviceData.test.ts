import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEVICE_DATA, DEVICE_DATA_KINDS, deviceDataPresent, forgetDeviceData } from './deviceData';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
// The whole shipped app. `public/sw.js` is deliberately out: a service worker has no access to
// localStorage, so it cannot add a key — the Cache it does hold is named on the privacy page as
// the offline copy. `scripts/` is build tooling and never reaches a browser.
//
// This grep only sees keys written as LITERALS. Checked by hand when this was written: every
// `.setItem` call site in the app passes either a literal or a module-level constant declared in
// the same file (`DragCoefficient`, `ParachuteCd`, `DrogueCd` and `RailExit` take a `key`
// parameter, and every caller passes such a constant), so there is nothing built at runtime for
// this to miss. A key assembled from a prefix and an id WOULD be invisible here — if one is ever
// added, it has to be registered by hand and this comment is the warning.
const SEARCHED = ['lib', 'components', 'app'];

/** Every `debrief.*` string literal in the app's own source. */
function keysInSource(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '__corpus__' || name === '__fixtures__') continue;
      const path = `${dir}/${name}`;
      // `lstat`, and the name check BEFORE it: `lib/parsers/__corpus__` is a symlink to the
      // private fixtures repo, and `statSync` follows it — so a missing corpus would have turned
      // this privacy test red for a reason that has nothing to do with privacy.
      if (lstatSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(name) || name.includes('.test.')) continue;
      // deviceData.ts is the registry itself; it would trivially satisfy this.
      if (path.endsWith('/lib/deviceData.ts')) continue;
      const src = readFileSync(path, 'utf8');
      for (const m of src.matchAll(/['"`](debrief\.[A-Za-z0-9._-]+)['"`]/g)) found.add(m[1]);
    }
  };
  for (const d of SEARCHED) walk(ROOT + d);
  return found;
}

describe('the privacy page can name everything this app stores', () => {
  it('registers every debrief.* key the source writes', () => {
    // The page said local storage held "your theme and units" and that Clear removed all of it.
    // Nineteen keys existed and Clear took one. Reading the SOURCE rather than trusting a second
    // hand-typed list means a new stored preference cannot reach production without appearing on
    // the privacy page and being taken by the control that promises to take everything.
    const inSource = keysInSource();
    // A real liveness floor, not a token one: 19 keys exist, so a threshold of 10 would survive
    // the walk losing half the tree and silently reading less than it thinks.
    expect(inSource.size, 'the sweep found the app, rather than silently reading nothing').toBeGreaterThanOrEqual(
      DEVICE_DATA.length,
    );
    // A domain that happens to start with the same word is not a storage key.
    inSource.delete('debrief.fusionspace.co');

    const registered = new Set(DEVICE_DATA.map((d) => d.key));
    const missing = [...inSource].filter((k) => !registered.has(k));
    expect(missing, `stored in the app but not on the privacy page: ${missing.join(', ')}`).toEqual([]);
  });

  it('registers nothing the app does not actually use', () => {
    // The other direction: a key removed from the app but left here would have the page promising
    // to hold something it does not, and "Forget everything" reporting a number it cannot reach.
    const inSource = keysInSource();
    const stale = DEVICE_DATA.map((d) => d.key).filter((k) => !inSource.has(k));
    expect(stale, `on the privacy page but nowhere in the app: ${stale.join(', ')}`).toEqual([]);
  });

  it('describes each one in words a flyer can check, under a heading the page renders', () => {
    const kinds = new Set(DEVICE_DATA_KINDS.map((k) => k.kind));
    for (const d of DEVICE_DATA) {
      expect(d.what.length, `${d.key} needs a description`).toBeGreaterThan(8);
      expect(kinds.has(d.kind), `${d.key} is a "${d.kind}", which the page has no section for`).toBe(true);
    }
    // Every section the page renders has something in it, so none renders as an empty heading.
    for (const k of DEVICE_DATA_KINDS) {
      expect(DEVICE_DATA.some((d) => d.kind === k.kind), `"${k.heading}" would render empty`).toBe(true);
    }
  });

  it('names the rocket parameters and typed text specifically', () => {
    // The case this exists for: these are the ones a flyer lending a laptop would be surprised
    // to find still there, and the ones the old page never mentioned.
    const byKind = (k: string) => DEVICE_DATA.filter((d) => d.kind === k).map((d) => d.key);
    expect(byKind('rocket')).toContain('debrief.mass.kg');
    expect(byKind('rocket')).toContain('debrief.maindeploy.m');
    expect(byKind('their-own-words')).toContain('debrief.compare.captions');
    expect(byKind('their-own-words')).toContain('debrief.mappings.v1');
  });
});

describe('forgetting everything on this device', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
  });

  it('takes every registered key and reports what was actually there', () => {
    store.set('debrief.mass.kg', '12.4');
    store.set('debrief.compare.captions', '{"a,b":{"label":"L3"}}');
    store.set('debrief.theme', 'dark');
    // Something this app did not write is not ours to delete.
    store.set('someone-elses-key', 'keep me');

    expect(deviceDataPresent().map((d) => d.key).sort()).toEqual([
      'debrief.compare.captions',
      'debrief.mass.kg',
      'debrief.theme',
    ]);
    expect(forgetDeviceData(), 'the count is what was there, not the size of the list').toBe(3);
    expect(store.has('debrief.mass.kg')).toBe(false);
    expect(store.has('debrief.compare.captions')).toBe(false);
    expect(store.get('someone-elses-key'), 'another app’s key is not Debrief’s to remove').toBe('keep me');
    expect(deviceDataPresent()).toEqual([]);
    expect(forgetDeviceData(), 'and again on an empty device takes nothing').toBe(0);
  });
});
