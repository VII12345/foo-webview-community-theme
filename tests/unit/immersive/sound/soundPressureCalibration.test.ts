import { describe, expect, it } from 'vitest';
import {
  channelWeightSum,
  createBlockMeter,
  loudnessOf,
} from '../../../../src/immersive/gauges/loudnessMeter.ts';
import {
  emptyRig,
  estimateSoundPressure,
  type HeadphoneRig,
} from '../../../../src/playback/soundPressure.ts';

const RATE = 48000;

function sine(seconds: number, dbfs: number): Float32Array {
  const amplitude = 10 ** (dbfs / 20);
  const out = new Float32Array(Math.round(RATE * seconds));
  for (let index = 0; index < out.length; index += 1) {
    out[index] = amplitude * Math.sin((2 * Math.PI * 1000 * index) / RATE);
  }
  return out;
}

/** 喂满几秒后最后一个 100 ms 块的能量。 */
function energyOf(signal: Float32Array, channels: number): number {
  let energy = 0;
  const meter = createBlockMeter(RATE, channels, (block) => {
    energy = block;
  });
  meter.push(Array.from({ length: channels }, () => signal));
  return energy;
}

const rig: HeadphoneRig = {
  ...emptyRig(),
  amps: [{ id: 'amp', name: 'Amp', vrmsAt0db: 2, gainDb: 0 }],
  headphones: [
    { id: 'hp', name: 'HP', impedanceOhm: 300, sensitivity: 120, sensitivityUnit: 'dbPerV' },
  ],
  selectedAmpId: 'amp',
  selectedHeadphoneId: 'hp',
};

describe('声压校准', () => {
  it('立体声 0 dBFS 1 kHz 正弦是 0 LUFS，SPL 以 0 dBFS 正弦的 V0 为准', () => {
    const loudness = loudnessOf(energyOf(sine(5, 0), 2));
    expect(loudness).not.toBeNull();
    expect(loudness ?? -99).toBeCloseTo(0, 0.15);
    const reading = estimateSoundPressure(
      { shortTermLufs: loudness, volumeDb: 0, muted: false, channelGainDb: 0 },
      rig,
    );
    expect(reading.spl).toBeCloseTo(120 + 20 * Math.log10(2), 1);
  });

  it('单声道同电平比立体声低 3.01 LUFS，补 +3.01 dB 后 SPL 相同', () => {
    const loudness = loudnessOf(energyOf(sine(5, 0), 1));
    expect(loudness).not.toBeNull();
    expect(loudness ?? -99).toBeCloseTo(-3.01, 0.15);
    const gain = 10 * Math.log10(2 / channelWeightSum(1));
    expect(gain).toBeCloseTo(3.01, 2);
    const reading = estimateSoundPressure(
      { shortTermLufs: loudness, volumeDb: 0, muted: false, channelGainDb: gain },
      rig,
    );
    expect(reading.spl).toBeCloseTo(120 + 20 * Math.log10(2), 1);
  });

  it('5.1 的权重和与声道修正是 -4.64 dB', () => {
    expect(channelWeightSum(6)).toBeCloseTo(5.82, 6);
    expect(10 * Math.log10(2 / channelWeightSum(6))).toBeCloseTo(-4.64, 2);
  });
});
