import { describe, it, expect } from 'vitest';
import { deployCheck, DEPLOY_SLOP_M } from './deploy';

describe('deployCheck', () => {
  it('a main firing above the set altitude reads high', () => {
    const r = deployCheck(250, 150);
    expect(r.offsetM).toBeCloseTo(100);
    expect(r.when).toBe('high');
  });

  it('a main firing below the set altitude reads low', () => {
    const r = deployCheck(120, 150);
    expect(r.offsetM).toBeCloseTo(-30);
    expect(r.when).toBe('low');
  });

  it('within the slop of the set altitude reads on the mark', () => {
    expect(deployCheck(150, 150).when).toBe('on');
    expect(deployCheck(150 + DEPLOY_SLOP_M, 150).when).toBe('on');
    expect(deployCheck(150 - DEPLOY_SLOP_M, 150).when).toBe('on');
  });

  it('just past the slop tips to high/low', () => {
    expect(deployCheck(150 + DEPLOY_SLOP_M + 0.1, 150).when).toBe('high');
    expect(deployCheck(150 - DEPLOY_SLOP_M - 0.1, 150).when).toBe('low');
  });
});
