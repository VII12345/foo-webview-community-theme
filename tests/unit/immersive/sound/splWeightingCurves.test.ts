import { describe, expect, it } from 'vitest';
import { SPL_BAND_EDGES } from '../../../../src/playback/splBands.ts';
import {
  aWeightingDbAt,
  kWeightingDbAt,
  weightTables,
} from '../../../../src/immersive/sound/splWeightingCurves.ts';

describe('SPL 加权曲线', () => {
  it('A 加权在 1 kHz 为 0，常用频点接近 IEC 61672', () => {
    expect(aWeightingDbAt(1000)).toBeCloseTo(0, 3);
    expect(aWeightingDbAt(100)).toBeCloseTo(-19.1, 0);
    expect(aWeightingDbAt(10000)).toBeCloseTo(-2.5, 0);
    expect(aWeightingDbAt(20000)).toBeCloseTo(-9.3, 0);
  });

  it('K 加权在 1 kHz 归一化为 0', () => {
    for (const rate of [44100, 48000, 96000]) {
      expect(kWeightingDbAt(1000, rate)).toBeCloseTo(0, 9);
    }
  });

  it('每个 band 都有 A/K/Z 三份有限值，Z 全为 0', () => {
    const tables = weightTables(SPL_BAND_EDGES, 48000);
    expect(tables.A).toHaveLength(SPL_BAND_EDGES.length - 1);
    expect(tables.K).toHaveLength(SPL_BAND_EDGES.length - 1);
    expect(tables.Z).toHaveLength(SPL_BAND_EDGES.length - 1);
    expect([...tables.A].every(Number.isFinite)).toBe(true);
    expect([...tables.K].every(Number.isFinite)).toBe(true);
    expect([...tables.Z].every((value) => value === 0)).toBe(true);
  });
});
