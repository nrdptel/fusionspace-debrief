import { describe, it, expect } from 'vitest';
import { encodeFlight, decodeFlight, payloadFromHash, shareUrl } from './share';

describe('share-by-link round trip', () => {
  it('encodes a flight into a fragment payload and decodes it back exactly', async () => {
    const name = 'flight 2026-06-25.csv';
    const text = 'T,Alt,VRaw,VFilt\n0,0,0,0\n100,2,20,7.6\n200,19,170,69.6\n';
    const payload = await encodeFlight(name, text);
    expect(payload.length).toBeGreaterThan(0);
    const back = await decodeFlight(payload);
    expect(back).not.toBeNull();
    expect(back!.name).toBe(name);
    expect(back!.text).toBe(text);
  });

  it('compresses repetitive data well below its raw size', async () => {
    const text = 'T,Alt,VRaw,VFilt\n' + Array.from({ length: 2000 }, (_, i) => `${i * 100},${i},${i},${i}`).join('\n');
    const payload = await encodeFlight('big.csv', text);
    // gzip should make the payload a fraction of the raw text length.
    expect(payload.length).toBeLessThan(text.length / 2);
    const back = await decodeFlight(payload);
    expect(back!.text).toBe(text);
  });

  it('round-trips through a URL hash', async () => {
    const payload = await encodeFlight('f.csv', 'a,b\n1,2\n');
    const url = shareUrl('https://debrief.fusionspace.co', '/', payload);
    expect(url).toContain('#f=');
    expect(payloadFromHash(new URL(url).hash)).toBe(payload);
  });

  it('returns null on a corrupt payload', async () => {
    expect(await decodeFlight('1@@@not-base64@@@')).toBeNull();
    expect(await decodeFlight('')).toBeNull();
  });
});
