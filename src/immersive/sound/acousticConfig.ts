import type { fb } from 'foo-webview-sdk/bridge';
import { settle } from '../../host/hostCall.ts';
import { writeTextFile } from '../../host/fileWrite.ts';
import type { Store } from '../../kit/store.ts';
import { customMeasurementProfilesAtom } from '../../playback/customHeadphoneMeasurements.ts';
import { measurementProfileOf } from '../../playback/headphoneMeasurements.ts';
import type { HeadphoneMeasurement } from '../../playback/measurementCurves.ts';
import {
  bandResponseDb,
  referenceImpedanceOhm,
} from '../../playback/measurementCurves.ts';
import type { AmpProfile, HeadphoneProfile } from '../../playback/soundPressure.ts';
import { sensitivityDbPerVAtReference } from '../../playback/soundPressure.ts';
import { SPL_BAND_EDGES } from '../../playback/splBands.ts';
import type { SplWeighting } from '../../playback/splWeighting.ts';
import { acousticConfigPath } from '../../playback/acousticPlugin.ts';
import { soundPressureViewAtom } from './soundPressureReading.ts';

/**
 * 写给 `foo_acoustic_stats` 的测量配置。
 *
 * 插件在 foobar 进程里算声压与耳机使用时长：窗口最小化、收进托盘、网页被挂起时它照旧在跑
 * —— 但耳机档案（FR 曲线、阻抗、灵敏度）与耳放档位在页面手里，页面挂起时读不到设备。
 *
 * 所以页面把**算好的**东西写成一份纯文本配置放在 profile 下，插件读它：
 * 插件那边没有 JSON 解析器（foobar 的 SDK 不带），纯文本几行就能读完。
 *
 * 格式是"每行一个键 值"，见 `foo_acoustic_stats/docs/配置契约.md`。
 */

export {
  ACOUSTIC_CONFIG_FILE,
  ACOUSTIC_LIVE_FILE,
  ACOUSTIC_PLUGIN_DIRECTORY,
  ACOUSTIC_PLUGIN_STATE_FILE,
  acousticConfigPath,
  acousticLivePath,
} from '../../playback/acousticPlugin.ts';

export interface AcousticConfigInput {
  /** 当前选中的耳机；没有就不写配置（插件据此不测）。 */
  readonly headphone: HeadphoneProfile | null;
  /** 当前选中的耳放。 */
  readonly amp: AmpProfile | null;
  /** 耳机的测量档案；没有就按标称模型算。 */
  readonly profile: HeadphoneMeasurement | null;
  /** 耳放的输出阻抗（Ω）；DX52 是 0.2。 */
  readonly ampOutputImpedanceOhm: number;
  /** 加权：A / K / Z。 */
  readonly weighting: SplWeighting;
}

/**
 * 拼出配置的文本。
 *
 * 频带响应在这里就算好（耳放分压 + 测量 FR），插件那边只做加权与合成 —— 耳机档案的
 * 插值规则留在主题这一边，两边不必各写一份。
 */
export function buildAcousticConfig(input: AcousticConfigInput): string {
  const { headphone, amp } = input;
  if (!headphone || !amp) return '';
  const edges = SPL_BAND_EDGES;
  const referenceOhm = referenceImpedanceOhm(input.profile, headphone.impedanceOhm);
  const responseDb = bandResponseDb(
    input.profile,
    edges,
    input.ampOutputImpedanceOhm,
    headphone.impedanceOhm,
  );
  const sensitivityDbPerV = sensitivityDbPerVAtReference(headphone, referenceOhm);

  const lines = [
    '# foo_acoustic_stats 的测量配置（由主题写入，插件只读）',
    'version 1',
    `headphoneId ${headphone.id}`,
    `headphoneName ${headphone.name}`,
    `sensitivityDbPerV ${sensitivityDbPerV}`,
    `referenceImpedanceOhm ${referenceOhm}`,
    `ampVrmsAt0db ${amp.vrmsAt0db}`,
    `ampGainDb ${amp.gainDb}`,
    `ampOutputImpedanceOhm ${input.ampOutputImpedanceOhm}`,
    `weighting ${input.weighting}`,
    `bandResponseDb ${Array.from(responseDb).map((value) => value.toFixed(6)).join(' ')}`,
    '',
  ];
  return lines.join('\n');
}

export interface AcousticConfigHost {
  readonly misc: Pick<typeof fb.misc, 'getProfilePath'>;
  readonly file: Pick<typeof fb.file, 'write'>;
}

/**
 * 把配置写下去。写不进去只记一次警告 —— 插件没装或没权限都不影响主题自己照常用。
 */
export async function writeAcousticConfig(
  host: AcousticConfigHost,
  text: string,
): Promise<boolean> {
  if (!text) return false;
  const answer = await settle(() => host.misc.getProfilePath());
  if (!answer || answer.success === false || typeof answer.path !== 'string' || !answer.path) {
    return false;
  }
  const result = await writeTextFile(host.file, acousticConfigPath(answer.path), text);
  return result.ok;
}

/**
 * 耳机换了、增益档变了、加权换了、DX52 的档位变了 —— 插件读的是最新那份。
 */
export function startAcousticConfigWriter(
  store: Store,
  host: AcousticConfigHost,
): { dispose(): void } {
  let lastText = '';
  const write = () => {
    const view = store.get(soundPressureViewAtom);
    const custom = store.get(customMeasurementProfilesAtom);
    const profile = measurementProfileOf(
      view.headphone?.measurementProfileId ?? null,
      custom,
    );
    const text = buildAcousticConfig({
      headphone: view.headphone,
      amp: view.amp,
      profile,
      // DX52 的输出阻抗是 0.2 Ω；别的耳放按 0 算（分压那一项就没有）。
      ampOutputImpedanceOhm: view.auto.active ? 0.2 : 0,
      weighting: view.weighting,
    });
    if (!text || text === lastText) return;
    lastText = text;
    void writeAcousticConfig(host, text);
  };
  const offs = [
    store.sub(soundPressureViewAtom, write),
    store.sub(customMeasurementProfilesAtom, write),
  ];
  write();
  return {
    dispose() {
      for (const off of offs) off();
    },
  };
}
