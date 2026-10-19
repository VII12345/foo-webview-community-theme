import { fb } from 'foo-webview-sdk/bridge';
import { atom, type Atom } from 'jotai/vanilla';
import { playbackAtom } from '../../playback/playback.ts';
import { SPL_BAND_EDGES } from '../../playback/splBands.ts';
import type { Store } from '../../kit/store.ts';
import type { FrameClock } from '../frame/frameScheduler.ts';
import { stereoBinsFrameOf, type StereoBinsFrame } from './spectrumBins.ts';
import { startSpectrumPull, type SpectrumAnswer } from './spectrumPull.ts';

/**
 * 频谱频带形状服务：连接宿主可视化流的 stereo FFT 频点，按 1/3 倍频程汇总成
 * 每声道 band 功率，再归一化成 shape。总能量由 PCM RMS 提供，这里只提供频率分布。
 */
export interface LiveBandPower {
  readonly edges: readonly number[];
  readonly sampleRate: number;
  readonly channels: number;
  readonly currentLeft: Float32Array | null;
  readonly currentRight: Float32Array | null;
  readonly shortTermLeft: Float32Array | null;
  readonly shortTermRight: Float32Array | null;
  readonly averageLeft: Float32Array | null;
  readonly averageRight: Float32Array | null;
  readonly failed: boolean;
}

export interface LiveBandPowerHost {
  audio: Pick<typeof fb.audio, 'subscribeSpectrum' | 'getSpectrum'>;
}

export interface LiveBandPowerService {
  dispose(): void;
}

const INITIAL: LiveBandPower = {
  edges: SPL_BAND_EDGES,
  sampleRate: 0,
  channels: 2,
  currentLeft: null,
  currentRight: null,
  shortTermLeft: null,
  shortTermRight: null,
  averageLeft: null,
  averageRight: null,
  failed: false,
};

const stateAtom = atom<LiveBandPower>(INITIAL);
export const liveBandPowerAtom: Atom<LiveBandPower> = atom((get) => get(stateAtom));

/** 频谱帧总功率低于这个值时不更新 shape（约 −100 dBFS）。 */
export const BAND_POWER_FLOOR = 1e-10;
/** 3 秒窗口的帧数上限；10–20 fps 下最多 60 帧。 */
export const SHORT_TERM_FRAMES = 60;

export function bandPowersOfBins(
  frame: StereoBinsFrame,
  edges: readonly number[] = SPL_BAND_EDGES,
): {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly totalLeft: number;
  readonly totalRight: number;
} {
  const bands = Math.max(0, edges.length - 1);
  const left = new Float32Array(bands);
  const right = new Float32Array(bands);
  let totalLeft = 0;
  let totalRight = 0;
  const first = edges[0] ?? 0;
  const last = edges[edges.length - 1] ?? 0;
  let band = 0;
  for (let index = 0; index < frame.left.length; index += 1) {
    const hz = (frame.firstBin + index) * frame.binHz;
    if (hz < first || hz > last) continue;
    while (band < bands - 1 && hz >= (edges[band + 1] ?? last)) band += 1;
    const leftPower = 10 ** ((frame.left[index] ?? -160) / 10);
    const rightPower = 10 ** ((frame.right[index] ?? -160) / 10);
    left[band] = (left[band] ?? 0) + leftPower;
    right[band] = (right[band] ?? 0) + rightPower;
    totalLeft += leftPower;
    totalRight += rightPower;
  }
  return { left, right, totalLeft, totalRight };
}

function sharesOf(power: Float32Array, total: number): Float32Array | null {
  if (!(total > 0)) return null;
  const out = new Float32Array(power.length);
  for (let index = 0; index < power.length; index += 1) out[index] = (power[index] ?? 0) / total;
  return out;
}

function sumPowers(frames: readonly { left: Float32Array; right: Float32Array }[]): {
  left: Float32Array;
  right: Float32Array;
  totalLeft: number;
  totalRight: number;
} {
  const left = new Float32Array(SPL_BAND_EDGES.length - 1);
  const right = new Float32Array(SPL_BAND_EDGES.length - 1);
  let totalLeft = 0;
  let totalRight = 0;
  for (const frame of frames) {
    for (let index = 0; index < left.length; index += 1) {
      const l = frame.left[index] ?? 0;
      const r = frame.right[index] ?? 0;
      left[index] = (left[index] ?? 0) + l;
      right[index] = (right[index] ?? 0) + r;
      totalLeft += l;
      totalRight += r;
    }
  }
  return { left, right, totalLeft, totalRight };
}

export function startLiveBandPower(
  store: Store,
  options: {
    readonly host?: LiveBandPowerHost;
    readonly clock?: FrameClock;
    readonly active?: Atom<boolean>;
  } = {},
): LiveBandPowerService {
  const host = options.host ?? fb;
  const clock = options.clock;
  const active = options.active ?? atom(true);
  store.set(stateAtom, INITIAL);
  let subscription: { readonly ready: Promise<{ ok: boolean; output?: string; subscriptionId?: string }>; (): void } | null = null;
  let subscriptionId: string | null = null;
  let pull: { stop(): void } | null = null;
  let disposed = false;
  let failed = false;
  let lastGeneration = store.get(playbackAtom).trackGeneration;
  let lastStreamTime: number | null = null;
  let frames: { time: number; left: Float32Array; right: Float32Array }[] = [];
  let averageLeft = new Float32Array(SPL_BAND_EDGES.length - 1);
  let averageRight = new Float32Array(SPL_BAND_EDGES.length - 1);

  const publish = (
    frame: StereoBinsFrame,
    current: { left: Float32Array; right: Float32Array },
    short: { left: Float32Array; right: Float32Array } | null,
    average: { left: Float32Array; right: Float32Array } | null,
  ) => {
    const currentLeft = sharesOf(current.left, current.left.reduce((a, b) => a + b, 0));
    const currentRight = sharesOf(current.right, current.right.reduce((a, b) => a + b, 0));
    store.set(stateAtom, {
      edges: SPL_BAND_EDGES,
      sampleRate: frame.nyquist * 2,
      channels: frame.channelCount,
      currentLeft,
      currentRight,
      shortTermLeft: short?.left ?? null,
      shortTermRight: short?.right ?? null,
      averageLeft: average?.left ?? null,
      averageRight: average?.right ?? null,
      failed,
    });
  };

  const resetAverage = () => {
    averageLeft = new Float32Array(SPL_BAND_EDGES.length - 1);
    averageRight = new Float32Array(SPL_BAND_EDGES.length - 1);
  };

  const onFrame = (answer: SpectrumAnswer): void => {
    if (disposed || answer.success !== true || answer.state !== 'playing') return;
    const frame = stereoBinsFrameOf(answer);
    if (!frame) return;
    const powers = bandPowersOfBins(frame);
    if (powers.totalLeft <= BAND_POWER_FLOOR && powers.totalRight <= BAND_POWER_FLOOR) return;
    const generation = store.get(playbackAtom).trackGeneration;
    if (generation !== lastGeneration) {
      lastGeneration = generation;
      resetAverage();
      frames = [];
      lastStreamTime = null;
    }
    const time = answer.streamTime;
    if (lastStreamTime !== null && time < lastStreamTime - 0.5) {
      frames = [];
      lastStreamTime = null;
    }
    lastStreamTime = time;
    frames.push({ time, left: powers.left, right: powers.right });
    if (frames.length > SHORT_TERM_FRAMES) frames.shift();
    const cutoff = time - 3;
    while (frames.length > 0 && (frames[0]?.time ?? 0) < cutoff) frames.shift();
    const short = sumPowers(frames);
    for (let index = 0; index < averageLeft.length; index += 1) {
      averageLeft[index] = (averageLeft[index] ?? 0) + (powers.left[index] ?? 0);
      averageRight[index] = (averageRight[index] ?? 0) + (powers.right[index] ?? 0);
    }
    publish(frame, powers, {
      left: sharesOf(short.left, short.totalLeft) ?? new Float32Array(0),
      right: sharesOf(short.right, short.totalRight) ?? new Float32Array(0),
    }, {
      left:
        sharesOf(averageLeft, averageLeft.reduce((a, b) => a + b, 0)) ??
        new Float32Array(0),
      right:
        sharesOf(averageRight, averageRight.reduce((a, b) => a + b, 0)) ??
        new Float32Array(0),
    });
  };

  const teardown = () => {
    pull?.stop();
    pull = null;
    const current = subscription;
    subscription = null;
    subscriptionId = null;
    current?.();
    frames = [];
    lastStreamTime = null;
    resetAverage();
  };

  const open = () => {
    if (disposed || subscription || failed) return;
    const current = host.audio.subscribeSpectrum(() => {}, {
      output: 'bins',
      channels: 'stereo',
      fftSize: 16384,
      fps: 1,
      backgroundThrottle: false,
      minFrequency: 20,
      maxFrequency: 20000,
    });
    subscription = current;
    void current.ready.then((outcome) => {
      if (disposed || subscription !== current) return;
      if (!outcome.ok || outcome.output !== 'bins' || !outcome.subscriptionId) {
        failed = true;
        teardown();
        store.set(stateAtom, { ...INITIAL, failed: true });
        return;
      }
      subscriptionId = outcome.subscriptionId;
      pull = startSpectrumPull({
        fetch: () => host.audio.getSpectrum({ subscriptionId: subscriptionId ?? undefined }),
        intervalMs: 100,
        onFrame,
        clock,
      });
    });
  };

  const follow = () => {
    if (disposed) return;
    if (!store.get(active)) {
      teardown();
      failed = false;
      store.set(stateAtom, { ...INITIAL, failed: false });
      return;
    }
    open();
  };

  const off = store.sub(active, follow);
  follow();

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      off();
      teardown();
      store.set(stateAtom, INITIAL);
    },
  };
}
