import { fb } from 'foo-webview-sdk/bridge';
import { atom } from 'jotai/vanilla';
import { settle } from '../host/hostCall.ts';
import { writeTextFile } from '../host/fileWrite.ts';
import { startLiveLoudness } from '../immersive/gauges/liveLoudness.ts';
import { startLiveBandPower } from '../immersive/spectrum/liveBandPower.ts';
import { startAcousticConfigWriter } from '../immersive/sound/acousticConfig.ts';
import { acousticPluginStatePath } from '../playback/acousticPlugin.ts';
import {
  soundPressureAutoActiveAtom,
  soundPressureViewAtom,
} from '../immersive/sound/soundPressureReading.ts';
import type { Store } from '../kit/store.ts';
import { backgroundFrameClock } from '../host/backgroundClock.ts';
import {
  backgroundNormalAtom,
  backgroundSuspendedAtom,
} from '../host/backgroundMode.ts';
import { miniWindowAtom } from '../host/miniWindow.ts';
import { playbackAtom } from '../playback/playback.ts';
import { loadLoudnessStats, startLoudnessStats } from '../stats/loudnessStats.ts';
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
 * 插件第一次跑之前，把主题已有的统计种进插件的存档。
 *
 * 插件没有 JSON 解析器（foobar 的 SDK 不带），它自己读不了 `loudness-v2.json`；
 * 不种的话，它第一次运行会拿空存档把那份历史整份覆盖掉。主题这边有 JSON，
 * 换成插件认的纯文本塞过去（一行一个耳机：日期、id、秒数、三种能量、名字）。
 */
async function seedPluginStats(host: LoudnessIntegrationHost): Promise<void> {
  const answer = await settle(() => host.misc.getProfilePath());
  if (!answer || answer.success === false || typeof answer.path !== 'string' || !answer.path) {
    return;
  }
  const profile = answer.path.replace(/[\\/]+$/, '');
  const statePath = acousticPluginStatePath(profile);
  const exists = await settle(() => host.file.exists(statePath));
  // 插件的存档已经在，就别动它。
  if (!exists || exists.success !== true || exists.exists) return;
  const load = await loadLoudnessStats(host);
  if (load.state !== 'ready') return;
  const lines: string[] = [];
  for (const [ymd, day] of Object.entries(load.data.days)) {
    for (const [id, bucket] of Object.entries(day)) {
      if (!(bucket.seconds > 0)) continue;
      lines.push(
        [
          ymd,
          id,
          bucket.seconds.toFixed(6),
          bucket.energyA.toExponential(6),
          bucket.energyK.toExponential(6),
          bucket.energyZ.toExponential(6),
          bucket.name,
        ].join('\t'),
      );
    }
  }
  if (lines.length === 0) return;
  await writeTextFile(host.file, statePath, `${lines.join('\n')}\n`);
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
  const demand = atom((get) => {
    // "停止加载"档隐藏时先拆订阅，压过下面的迷你播放器等条件。
    if (get(backgroundSuspendedAtom)) return false;
    return (
      get(immersive.active) ||
      get(miniWindowAtom).active ||
      (get(playbackAtom).state === 'playing' &&
        (get(soundPressureAutoActiveAtom) || get(backgroundNormalAtom)))
    );
  });
  // 隐藏页面里 rAF 不触发；"正常运行"档用定时器时钟接着采（浏览器会降频，尽力而为）。
  const clock = backgroundFrameClock(store, backgroundNormalAtom);
  const live = startLiveLoudness(store, { active: demand, host, clock });
  const bands = startLiveBandPower(store, { active: demand, host, clock });
  // 写给 foo_acoustic_stats 的测量配置：插件在 foobar 进程里算声压与统计，页面挂起时它照旧在跑，
  // 但耳机档案与耳放档位在页面手里 —— 算好了写给它。
  void seedPluginStats(host);
  const config = startAcousticConfigWriter(store, host);
  const statsActive = atom((get) => !get(backgroundSuspendedAtom));
  const stats = startLoudnessStats(store, {
    view: soundPressureViewAtom,
    playback: playbackAtom,
    host,
    active: statsActive,
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
