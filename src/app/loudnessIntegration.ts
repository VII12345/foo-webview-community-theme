import { atom } from 'jotai/vanilla';
import { startLiveLoudness } from '../immersive/gauges/liveLoudness.ts';
import { startLiveBandPower } from '../immersive/spectrum/liveBandPower.ts';
import {
  soundPressureAutoActiveAtom,
  soundPressureViewAtom,
} from '../immersive/sound/soundPressureReading.ts';
import type { Store } from '../kit/store.ts';
import { playbackAtom } from '../playback/playback.ts';
import { startLoudnessStats } from '../stats/loudnessStats.ts';
import type { ImmersiveIntegration } from './immersiveIntegration.ts';

export interface LoudnessIntegration {
  dispose(): void;
}

/**
 * 全局实时响度、频谱形状与耳机音量记录器。这三件事会把 PCM/频谱/响度模块拉进包；
 * 启动壳只动态导入这一块，主启动包仍然不包含 `liveLoudness`。沉浸页打开或 DX52 自动读数可用且正在播放时才订阅。
 */
export function startLoudnessIntegration(
  store: Store,
  immersive: Pick<ImmersiveIntegration, 'active'>,
): LoudnessIntegration {
  const demand = atom(
    (get) =>
      get(immersive.active) ||
      (get(playbackAtom).state === 'playing' && get(soundPressureAutoActiveAtom)),
  );
  const live = startLiveLoudness(store, { active: demand });
  const bands = startLiveBandPower(store, { active: demand });
  const stats = startLoudnessStats(store, {
    view: soundPressureViewAtom,
    playback: playbackAtom,
  });
  return {
    dispose() {
      stats.dispose();
      bands.dispose();
      live.dispose();
    },
  };
}
