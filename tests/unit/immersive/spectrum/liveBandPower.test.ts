import { describe, expect, it } from 'vitest';
import { SPL_BAND_EDGES } from '../../../../src/playback/splBands.ts';
import {
  BAND_POWER_FLOOR,
  bandPowersOfBins,
} from '../../../../src/immersive/spectrum/liveBandPower.ts';
import { stereoBinsFrameOf } from '../../../../src/immersive/spectrum/spectrumBins.ts';

describe('频谱频带功率', () => {
  it('把左右声道 bin 功率并入 1/3 倍频程 band', () => {
    const frame = {
      left: [-160, -160, -160, -160, -160, -160, -160, -160, -160, -160, 0, -160],
      right: [-160, -160, -160, -160, -160, -160, -160, -160, -160, -160, 0, -160],
      firstBin: 0,
      binHz: 100,
      nyquist: 24000,
      channelCount: 2,
    };
    const powers = bandPowersOfBins(frame);
    expect(powers.left).toHaveLength(SPL_BAND_EDGES.length - 1);
    expect(powers.totalLeft).toBeGreaterThan(BAND_POWER_FLOOR);
    expect(powers.totalRight).toBeCloseTo(powers.totalLeft, 9);
    const peak = [...powers.left].reduce((best, value, index) =>
      value > (powers.left[best] ?? 0) ? index : best,
    0,
    );
    expect(SPL_BAND_EDGES[peak]).toBeLessThanOrEqual(1000);
    expect(SPL_BAND_EDGES[peak + 1]).toBeGreaterThanOrEqual(1000);
  });

  it('解析 stereo bin 帧，拒绝 mix/缺声道', () => {
    const frame = stereoBinsFrameOf({
      output: 'bins',
      left: [-20, -30],
      right: [-22, -32],
      firstBin: 2,
      fftSize: 1024,
      sampleRate: 48000,
      channelCount: 2,
    });
    expect(frame).toMatchObject({ firstBin: 2, channelCount: 2 });
    expect(frame?.binHz).toBeCloseTo(48000 / 1024, 9);
    expect(stereoBinsFrameOf({ output: 'bins', spectrum: [-20], firstBin: 0, fftSize: 1024, sampleRate: 48000 })).toBeNull();
  });
});
