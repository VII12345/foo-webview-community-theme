import { atom, createStore } from 'jotai/vanilla';
import { describe, expect, it, onTestFinished } from 'vitest';
import {
  liveBandPowerAtom,
  startLiveBandPower,
  type LiveBandPowerHost,
} from '../../../../src/immersive/spectrum/liveBandPower.ts';
import { fakeFrames, flush } from '../../../fixtures/fakeFrames.ts';

function binsFrame() {
  const size = 400;
  const left = new Array<number>(size).fill(-160);
  const right = new Array<number>(size).fill(-160);
  left[341] = 0;
  right[341] = 0;
  return {
    success: true as const,
    output: 'bins' as const,
    state: 'playing' as const,
    streamTime: 1,
    left,
    right,
    channelCount: 2,
    firstBin: 0,
    fftSize: 16384,
    sampleRate: 48000,
  };
}

describe('频谱频带服务', () => {
  it('订阅 stereo bins，拉帧后发布左右归一化 shape', async () => {
    const frames = fakeFrames();
    let pulls = 0;
    let options: Record<string, unknown> | null = null;
    const host = {
      audio: {
        subscribeSpectrum: (_callback: unknown, params: Record<string, unknown>) => {
          options = params;
          const unsubscribe = () => {};
          return Object.assign(unsubscribe, {
            ready: Promise.resolve({
              ok: true as const,
              output: 'bins' as const,
              subscriptionId: 's1',
            }),
          });
        },
        getSpectrum: async () => {
          pulls += 1;
          return binsFrame();
        },
      },
    } as unknown as LiveBandPowerHost;
    const store = createStore();
    const service = startLiveBandPower(store, {
      host,
      clock: frames.clock,
      active: atom(true),
    });
    onTestFinished(() => service.dispose());
    await flush();
    await frames.step();
    await flush();
    const state = store.get(liveBandPowerAtom);
    expect(options).toMatchObject({
      output: 'bins',
      channels: 'stereo',
      fftSize: 16384,
      minFrequency: 20,
      maxFrequency: 20000,
    });
    expect(pulls).toBeGreaterThan(0);
    expect(state.sampleRate).toBe(48000);
    expect(state.channels).toBe(2);
    expect(state.currentLeft).not.toBeNull();
    expect(state.shortTermLeft).not.toBeNull();
    expect(state.averageLeft).not.toBeNull();
    const sum = (values: Float32Array | null) =>
      values ? [...values].reduce((a, b) => a + b, 0) : 0;
    expect(sum(state.currentLeft)).toBeCloseTo(1, 5);
    expect(sum(state.shortTermLeft)).toBeCloseTo(1, 5);
    expect(sum(state.averageLeft)).toBeCloseTo(1, 5);
  });
});
