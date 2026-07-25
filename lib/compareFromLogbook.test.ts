import { describe, it, expect } from 'vitest';
import { idsFromParam, withIds } from './compareFromLogbook';
import { MAX_COMPARE } from './compare';

// The `?ids=` parameter is the whole reason the comparison is a place rather than a
// moment: it is what survives a reload, a bookmark and a paste into a club thread. It is
// also user-editable text, so reading it back has to be defensive.

describe('idsFromParam', () => {
  it('reads a comma-separated list', () => {
    expect(idsFromParam('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('is empty for nothing at all', () => {
    expect(idsFromParam(null)).toEqual([]);
    expect(idsFromParam(undefined)).toEqual([]);
    expect(idsFromParam('')).toEqual([]);
  });

  it('drops blanks and trims, so a hand-edited URL still opens', () => {
    expect(idsFromParam(' a , ,b,,')).toEqual(['a', 'b']);
  });

  it('keeps each flight once — a repeated id would compare a flight with itself', () => {
    expect(idsFromParam('a,b,a')).toEqual(['a', 'b']);
  });

  it('caps at the comparison limit rather than trying to build a wider one', () => {
    const many = Array.from({ length: MAX_COMPARE + 4 }, (_, i) => `f${i}`).join(',');
    expect(idsFromParam(many)).toHaveLength(MAX_COMPARE);
  });
});

describe('withIds', () => {
  it('writes real commas, not %2C', () => {
    expect(withIds(new URL('https://example.test/compare'), ['a', 'b'])).toBe(
      'https://example.test/compare?ids=a,b',
    );
  });

  it('round-trips through the reader', () => {
    const ids = ['1784-abc', '1785-def'];
    const url = new URL(withIds(new URL('https://example.test/compare'), ids));
    expect(idsFromParam(url.searchParams.get('ids'))).toEqual(ids);
  });

  it('leaves the other parameters alone, encoding and all', () => {
    const url = new URL('https://example.test/compare?u=ft.mph.g.f.psi&q=a%2Cb');
    const out = withIds(url, ['x', 'y']);
    expect(out).toContain('u=ft.mph.g.f.psi');
    // A comma that was encoded in someone else's parameter stays encoded.
    expect(out).toContain('q=a%2Cb');
    expect(out).toContain('ids=x,y');
  });

  it('replaces an existing set rather than appending a second one', () => {
    const out = withIds(new URL('https://example.test/compare?ids=old1,old2'), ['new1']);
    expect(out).toBe('https://example.test/compare?ids=new1');
  });
});
