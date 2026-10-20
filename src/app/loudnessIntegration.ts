import { fb } from 'foo-webview-sdk/bridge';
import { atom } from 'jotai/vanilla';
import { startLiveLoudness } from '../immersive/gauges/liveLoudness.ts';
import { startLiveBandPower } from '../immersive/spectrum/liveBandPower.ts';
import { startAcousticConfigWriter } from '../immersive/sound/acousticConfig.ts';
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

/** 实时响度、频谱与统计记录器共用的宿主面；测试可整体替换。 */
export interface LoudnessIntegrationHost {
  readonly audio: Pick<
    typeof fb.audio,
    'subscribeStream' | 'subscribeSpectrum' | 'getSpectrum'
  >;
  readonly misc: Pick<typeof fb.misc, 'getProfilePath'>;
  readonly file: Pick<typeof fb.file, 'read' | 'write' | 'exists'>;
}

/**
 * 全局实时响度、频谱形状与耳机音量记录器。这三件事会把 PCM/频谱/响度模块拉进包；
 * 启动壳只动态导入这一块，主启动包仍然不包含 `liveLoudness`。沉浸页打开或 DX52 自动读数可用且正在播放时才订阅。
 */
export function startLoudnessIntegration(
  store: Store,
  immersive: Pick<ImmersiveIntegration, 'active'>,
  host: LoudnessIntegrationHost = fb,
): LoudnessIntegration {
  const demand = atom(
    (get) =>
      get(immersive.active) ||
      (get(playbackAtom).state === 'playing' && get(soundPressureAutoActiveAtom)),
  );
  const live = startLiveLoudness(store, { active: demand, host });
  const bands = startLiveBandPower(store, { active: demand, host });
  // 写给 foo_acoustic_stats 的测量配置：插件在 foobar 进程里算声压与统计，页面挂起时它照旧在跑，
  // 但耳机档案与耳放档位在页面手里 —— 算好了写给它。
  const config = startAcousticConfigWriter(store, host);
  const stats = startLoudnessStats(store, {
    view: soundPressureViewAtom,
    playback: playbackAtom,
    host,
  });
  return {
    dispose() {
      config.dispose();
      stats.dispose();
      bands.dispose();
      live.dispose();
    },
  };
}
