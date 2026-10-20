import { expect, test } from 'vitest';
import { bandPowersOfBins } from '../../../../src/immersive/spectrum/liveBandPower.ts';
import { weightTables } from '../../../../src/immersive/sound/splWeightingCurves.ts';
import { SPL_BAND_EDGES } from '../../../../src/playback/splBands.ts';

/**
 * 频带与加权的参考值。
 *
 * 插件（`foo_acoustic_stats`）那边把同一套数学搬到了 C++，断言的是这里同一组数。
 * 两边各自锁住这些值，就说明"插件算的频带与主题算的一致"这件事不会随改动悄悄跑偏。
 */

const SAMPLE_RATE = 48000;
const FFT_SIZE = 16384;
const FIRST_BIN = 7; // 20 Hz 往上第一个频点
const BIN_COUNT = 6820; // 到 20 kHz

/** 一个假的频谱：每个频点 −100 dB，只有 1 kHz 那个是 −20 dB。 */
function fakeFrame() {
  const binHz = SAMPLE_RATE / FFT_SIZE;
  const left = new Float32Array(BIN_COUNT);
  const right = new Float32Array(BIN_COUNT);
  left.fill(-100);
  right.fill(-100);
  const loud = Math.round(1000 / binHz) - FIRST_BIN;
  left[loud] = -20;
  right[loud] = -20;
  return { left, right, firstBin: FIRST_BIN, binHz };
}

test('band 边界是相邻中心频率的几何平均', () => {
  expect(SPL_BAND_EDGES).toHaveLength(32);
  expect(SPL_BAND_EDGES[0]).toBe(20);
  expect(SPL_BAND_EDGES[31]).toBe(20000);
  expect(SPL_BAND_EDGES[18]).toBeCloseTo(Math.sqrt(1000 * 1250), 9);
  expect(SPL_BAND_EDGES[17]).toBeCloseTo(Math.sqrt(800 * 1000), 9);
});

test('频带功率与占比', () => {
  const powers = bandPowersOfBins(fakeFrame(), SPL_BAND_EDGES);
  expect(powers.left).toHaveLength(31);
  // 1 kHz 落在第 17 段（800–1250 Hz）。
  expect(powers.left[17]).toBeCloseTo(0.01000000350177288, 9);
  expect(powers.totalLeft).toBeCloseTo(0.010000681899997409, 9);
  const share = powers.left[17]! / powers.totalLeft;
  expect(share).toBeCloseTo(0.9999321648032292, 9);
});

test('每个 band 的 A/K 加权', () => {
  const tables = weightTables(SPL_BAND_EDGES, SAMPLE_RATE);
  expect(tables.A).toHaveLength(31);
  expect(tables.K).toHaveLength(31);
  expect(tables.Z).toHaveLength(31);
  expect(tables.A[17]).toBeCloseTo(-0.004261400283627217, 9);
  expect(tables.K[17]).toBeCloseTo(0.01406425543689539, 9);
  expect(tables.A[0]).toBeCloseTo(-48.88174960653059, 9);
  expect(tables.K[0]).toBeCloseTo(-13.20457722315638, 9);
  expect(tables.A[30]).toBeCloseTo(-8.637726942034828, 9);
  // Z 恒为 0。
  expect([...tables.Z].every((value) => value === 0)).toBe(true);
});
