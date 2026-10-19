/**
 * 耳机输出声压估算的共享模型：设备参数、灵敏度换算与从实时电平到 dB SPL 的纯计算。
 *
 * 这是估算，不是测量：不建模耳放输出阻抗、耳机阻抗随频率的变化、耳道耦合与头相关传输。
 * 不额外叠加 ReplayGain；读数跟随宿主实际提供的 PCM/频谱电平，宿主已在播放链路中应用时会计入。
 * 所有外部值（config）进入前都要经过本文件的校验与夹取。
 */

import type { SplWeighting } from './splWeighting.ts';

export type SensitivityUnit = 'dbPerMw' | 'dbPerV';

export type AmpProfile = {
  readonly id: string;
  readonly name: string;
  /** 0 dBFS 正弦输出 RMS，V。 */
  readonly vrmsAt0db: number;
  /** 耳放增益，dB。 */
  readonly gainDb: number;
};

export type HeadphoneProfile = {
  readonly id: string;
  readonly name: string;
  readonly impedanceOhm: number;
  readonly sensitivity: number;
  readonly sensitivityUnit: SensitivityUnit;
  /** 可选测量档案 id；未知 id 保留在配置里，找不到档案时回退标称模型。 */
  readonly measurementProfileId?: string | null;
};

export type HeadphoneRig = {
  readonly version: 1;
  readonly amps: AmpProfile[];
  readonly headphones: HeadphoneProfile[];
  readonly selectedAmpId: string | null;
  readonly selectedHeadphoneId: string | null;
};

export const HEADPHONE_RIG_KEY = 'defaultTheme.playback.headphoneRig';
/** 长时间聆听的安全参考上限。 */
export const SPL_SAFETY_LIMIT_DB = 80;
/** 超过这个值只显示 >140，避免错误配置产生荒谬数字。 */
export const SPL_DISPLAY_MAX_DB = 140;

export const AMP_VRMS_MIN = 0.1;
export const AMP_VRMS_MAX = 10;
export const AMP_VRMS_DEFAULT = 2;
export const AMP_GAIN_MIN = -99;
export const AMP_GAIN_MAX = 0;
export const AMP_GAIN_DEFAULT = 0;
export const HEADPHONE_IMPEDANCE_MIN = 8;
export const HEADPHONE_IMPEDANCE_MAX = 2000;
export const HEADPHONE_IMPEDANCE_DEFAULT = 300;
export const HEADPHONE_SENS_DB_MW_MIN = 70;
export const HEADPHONE_SENS_DB_MW_MAX = 140;
export const HEADPHONE_SENS_DB_V_MIN = 80;
export const HEADPHONE_SENS_DB_V_MAX = 150;
export const HEADPHONE_SENS_DEFAULT = 100;
export const RIG_DEVICE_LIMIT = 64;
const NAME_LIMIT = 64;

export type SoundPressureState =
  | 'ok'
  | 'over'
  | 'muted'
  | 'no-loudness'
  | 'no-amp'
  | 'no-headphone'
  | 'no-device';

export type SoundPressureMethod = 'bands' | 'rms' | 'lufs' | 'none';

export interface SoundPressureReading {
  readonly state: SoundPressureState;
  /** 当前显示加权的 dB SPL；不可算时为 null。 */
  readonly spl: number | null;
  /** 三种加权的同一帧读数；没有频谱时 A/K 可能为 null。 */
  readonly splA: number | null;
  readonly splK: number | null;
  readonly splZ: number | null;
  /** mW；不可算时为 null。 */
  readonly powerMw: number | null;
  /** Vrms；不可算时为 null。 */
  readonly voltage: number | null;
  /** 80 − SPL_A，正数是余量，负数是超出；不可算时为 null。 */
  readonly marginDb: number | null;
  readonly method: SoundPressureMethod;
}

export interface SoundPressureInput {
  /** 沉浸视图当前的 Short-term LUFS；无值时为 null。 */
  readonly shortTermLufs: number | null;
  /** 播放器音量增益，dB。 */
  readonly volumeDb: number;
  readonly muted: boolean;
  /**
   * 每声道电平相对立体声合并响度的修正，dB。立体声为 0，单声道 +3.01，5.1 约 −4.64。
   * 由响度层按声道权重算好后传入，`soundPressure.ts` 不依赖沉浸层。
   */
  readonly channelGainDb?: number;
}

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

function finite(raw: unknown, fallback: number, min: number, max: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? clamp(raw, min, max) : fallback;
}

function text(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  return value && value.length <= NAME_LIMIT ? value : undefined;
}

const field = (raw: unknown, key: string): unknown =>
  raw && typeof raw === 'object' ? Reflect.get(raw, key) : undefined;

export function emptyRig(): HeadphoneRig {
  return {
    version: 1,
    amps: [],
    headphones: [],
    selectedAmpId: null,
    selectedHeadphoneId: null,
  };
}

export function ampDraft(): Omit<AmpProfile, 'id'> {
  return {
    name: 'New amplifier',
    vrmsAt0db: AMP_VRMS_DEFAULT,
    gainDb: AMP_GAIN_DEFAULT,
  };
}

export function headphoneDraft(): Omit<HeadphoneProfile, 'id'> {
  return {
    name: 'New headphones',
    impedanceOhm: HEADPHONE_IMPEDANCE_DEFAULT,
    sensitivity: HEADPHONE_SENS_DEFAULT,
    sensitivityUnit: 'dbPerMw',
    measurementProfileId: null,
  };
}

export function normalizeAmp(raw: unknown): AmpProfile | undefined {
  const id = text(field(raw, 'id'));
  const name = text(field(raw, 'name'));
  if (!id || !name) return undefined;
  return {
    id,
    name,
    vrmsAt0db: finite(field(raw, 'vrmsAt0db'), AMP_VRMS_DEFAULT, AMP_VRMS_MIN, AMP_VRMS_MAX),
    gainDb: finite(field(raw, 'gainDb'), AMP_GAIN_DEFAULT, AMP_GAIN_MIN, AMP_GAIN_MAX),
  };
}

export function normalizeHeadphone(raw: unknown): HeadphoneProfile | undefined {
  const id = text(field(raw, 'id'));
  const name = text(field(raw, 'name'));
  if (!id || !name) return undefined;
  const unit = field(raw, 'sensitivityUnit');
  const sensitivityUnit: SensitivityUnit =
    unit === 'dbPerV' ? 'dbPerV' : 'dbPerMw';
  const measurement = text(field(raw, 'measurementProfileId'));
  return {
    id,
    name,
    impedanceOhm: finite(
      field(raw, 'impedanceOhm'),
      HEADPHONE_IMPEDANCE_DEFAULT,
      HEADPHONE_IMPEDANCE_MIN,
      HEADPHONE_IMPEDANCE_MAX,
    ),
    sensitivity: finite(
      field(raw, 'sensitivity'),
      HEADPHONE_SENS_DEFAULT,
      sensitivityUnit === 'dbPerV' ? HEADPHONE_SENS_DB_V_MIN : HEADPHONE_SENS_DB_MW_MIN,
      sensitivityUnit === 'dbPerV' ? HEADPHONE_SENS_DB_V_MAX : HEADPHONE_SENS_DB_MW_MAX,
    ),
    sensitivityUnit,
    measurementProfileId: measurement ?? null,
  };
}

function uniqueById<T extends { readonly id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
    if (result.length >= RIG_DEVICE_LIMIT) break;
  }
  return result;
}

/** config 是外部数据：缺字段补默认、越界夹回、非法条目丢弃、重复 id 保留第一个。 */
export function parseHeadphoneRig(raw: unknown): HeadphoneRig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const version = field(raw, 'version');
  if (version !== undefined && version !== 1) return undefined;
  const amps = uniqueById(
    (Array.isArray(field(raw, 'amps')) ? (field(raw, 'amps') as unknown[]) : []).flatMap(
      (item) => normalizeAmp(item) ?? [],
    ),
  );
  const headphones = uniqueById(
    (Array.isArray(field(raw, 'headphones'))
      ? (field(raw, 'headphones') as unknown[])
      : []
    ).flatMap((item) => normalizeHeadphone(item) ?? []),
  );
  const selectedAmp = field(raw, 'selectedAmpId');
  const selectedHeadphone = field(raw, 'selectedHeadphoneId');
  return {
    version: 1,
    amps,
    headphones,
    selectedAmpId:
      typeof selectedAmp === 'string' && amps.some((amp) => amp.id === selectedAmp)
        ? selectedAmp
        : null,
    selectedHeadphoneId:
      typeof selectedHeadphone === 'string' &&
      headphones.some((headphone) => headphone.id === selectedHeadphone)
        ? selectedHeadphone
        : null,
  };
}

/** dB/mW 灵敏度换算成 dB/V。 */
export function sensitivityDbPerV(profile: HeadphoneProfile): number {
  return profile.sensitivityUnit === 'dbPerV'
    ? profile.sensitivity
    : profile.sensitivity + 10 * Math.log10(1000 / profile.impedanceOhm);
}

/** dB/V 灵敏度换算成 dB/mW。 */
export function sensitivityDbPerMw(profile: HeadphoneProfile): number {
  return profile.sensitivityUnit === 'dbPerMw'
    ? profile.sensitivity
    : profile.sensitivity + 10 * Math.log10(profile.impedanceOhm / 1000);
}

/** 切换单位时保持同一个物理灵敏度。 */
export function convertSensitivity(
  value: number,
  from: SensitivityUnit,
  to: SensitivityUnit,
  impedanceOhm: number,
): number {
  if (from === to) return value;
  return from === 'dbPerMw'
    ? value + 10 * Math.log10(1000 / impedanceOhm)
    : value + 10 * Math.log10(impedanceOhm / 1000);
}

/** dB/mW 灵敏度换成 dB/V；参考阻抗默认用标称值，有测量档案时可传 1 kHz 实测值。 */
export function sensitivityDbPerVAtReference(
  profile: HeadphoneProfile,
  referenceImpedanceOhm = profile.impedanceOhm,
): number {
  if (profile.sensitivityUnit === 'dbPerV') return profile.sensitivity;
  return profile.sensitivity + 10 * Math.log10(1000 / referenceImpedanceOhm);
}

/** 满幅正弦 = 0 dBFS；meanSquare 是样本均方。 */
export function rmsDbfsOfMeanSquare(meanSquare: number): number | null {
  return Number.isFinite(meanSquare) && meanSquare > 0
    ? 10 * Math.log10(2 * meanSquare)
    : null;
}

/** 数字 RMS 电平（满幅正弦 0 dBFS）→ 每声道源电压。 */
export function voltageFromRms(
  rmsDbfs: number,
  volumeDb: number,
  ampGainDb: number,
  vrmsAt0db: number,
): number | null {
  if (![rmsDbfs, volumeDb, ampGainDb, vrmsAt0db].every(Number.isFinite)) return null;
  const voltage = vrmsAt0db * 10 ** ((rmsDbfs + volumeDb + ampGainDb) / 20);
  return Number.isFinite(voltage) && voltage > 0 ? voltage : null;
}

/** 耳放输出阻抗分压；Zamp 默认 0，DX52 传 0.2 Ω。 */
export function loadVoltage(
  sourceVoltage: number,
  zHeadphone: number,
  zAmp = 0,
): number | null {
  if (![sourceVoltage, zHeadphone, zAmp].every(Number.isFinite)) return null;
  if (!(sourceVoltage > 0) || !(zHeadphone > 0) || zAmp < 0) return null;
  const voltage = (sourceVoltage * zHeadphone) / (zAmp + zHeadphone);
  return Number.isFinite(voltage) && voltage > 0 ? voltage : null;
}

/** 单频点电压 → SPL（电压参考 FR 与频率加权都以 dB 叠加）。 */
export function splFromVoltage(
  voltage: number | null,
  sensitivityDbV: number,
  frDb = 0,
  weightingDb = 0,
): number | null {
  if (voltage === null || !(voltage > 0)) return null;
  const value =
    sensitivityDbV + 20 * Math.log10(voltage) + frDb + weightingDb;
  return Number.isFinite(value) ? value : null;
}

const noneReading = (state: SoundPressureState): SoundPressureReading => ({
  state,
  spl: null,
  splA: null,
  splK: null,
  splZ: null,
  powerMw: null,
  voltage: null,
  marginDb: null,
  method: 'none',
});

const mutedReading = (): SoundPressureReading => ({
  state: 'muted',
  spl: null,
  splA: null,
  splK: null,
  splZ: null,
  powerMw: 0,
  voltage: 0,
  marginDb: SPL_SAFETY_LIMIT_DB,
  method: 'none',
});

function readyRig(
  rig: HeadphoneRig,
  muted: boolean,
): { readonly amp: AmpProfile; readonly headphone: HeadphoneProfile } | SoundPressureReading {
  const { amp, headphone } = selectedRig(rig);
  if (!rig.amps.length && !rig.headphones.length) return noneReading('no-device');
  if (!amp) return noneReading('no-amp');
  if (!headphone) return noneReading('no-headphone');
  if (muted) return mutedReading();
  return { amp, headphone };
}

function channelPower(
  v0: number,
  rmsDbfs: number,
  shares: ArrayLike<number>,
  responseDb: ArrayLike<number>,
  weightDb: ArrayLike<number>,
): number | null {
  if (!Number.isFinite(rmsDbfs)) return null;
  const rms = 10 ** (rmsDbfs / 20);
  let power = 0;
  for (let band = 0; band < shares.length; band += 1) {
    const share = Number(shares[band]);
    if (!Number.isFinite(share) || share <= 0) continue;
    const response = Number(responseDb[band] ?? 0);
    const weight = Number(weightDb[band] ?? 0);
    power +=
      v0 *
      v0 *
      rms *
      rms *
      share *
      10 ** (((Number.isFinite(response) ? response : 0) + (Number.isFinite(weight) ? weight : 0)) / 10);
  }
  return power > 0 && Number.isFinite(power) ? power : null;
}

export interface BandSoundPressureInput {
  /** 每声道、每个 band 的功率占比；单声道可只给一路。 */
  readonly sharesByChannel: readonly (ArrayLike<number> | null)[] | null;
  /** 每声道 RMS，满幅正弦 0 dBFS。 */
  readonly rmsDbfsByChannel: readonly number[] | null;
  /** 每 band 的电压响应 dB（含耳放分压和测量 FR）。 */
  readonly bandResponseDb: ArrayLike<number>;
  readonly bandWeightDb: {
    readonly A: ArrayLike<number>;
    readonly K: ArrayLike<number>;
    readonly Z: ArrayLike<number>;
  };
  readonly volumeDb: number;
  readonly muted: boolean;
  readonly weighting: SplWeighting;
  readonly referenceImpedanceOhm: number;
  readonly ampOutputImpedanceOhm?: number;
}

/** 频谱/频带路径：先算每声道三种加权的 SPL，再取较响声道。 */
export function estimateSoundPressureFromBands(
  input: BandSoundPressureInput,
  rig: HeadphoneRig,
): SoundPressureReading {
  const resolved = readyRig(rig, input.muted);
  if ('state' in resolved) return resolved;
  const { amp, headphone } = resolved;
  const { sharesByChannel, rmsDbfsByChannel } = input;
  if (!sharesByChannel || !rmsDbfsByChannel) return noneReading('no-loudness');
  const v0 = amp.vrmsAt0db * 10 ** ((input.volumeDb + amp.gainDb) / 20);
  if (!Number.isFinite(v0) || v0 <= 0) return noneReading('no-loudness');
  const sensV = sensitivityDbPerVAtReference(headphone, input.referenceImpedanceOhm);
  let bestA: number | null = null;
  let bestK: number | null = null;
  let bestZ: number | null = null;
  let bestVoltage: number | null = null;
  let bestPower: number | null = null;
  for (let channel = 0; channel < sharesByChannel.length; channel += 1) {
    const shares = sharesByChannel[channel];
    const rmsDbfs = rmsDbfsByChannel[channel];
    if (!shares || rmsDbfs === undefined || !Number.isFinite(rmsDbfs)) continue;
    const powerA = channelPower(v0, rmsDbfs, shares, input.bandResponseDb, input.bandWeightDb.A);
    const powerK = channelPower(v0, rmsDbfs, shares, input.bandResponseDb, input.bandWeightDb.K);
    const powerZ = channelPower(v0, rmsDbfs, shares, input.bandResponseDb, input.bandWeightDb.Z);
    const splA = powerA === null ? null : sensV + 10 * Math.log10(powerA);
    const splK = powerK === null ? null : sensV + 10 * Math.log10(powerK);
    const splZ = powerZ === null ? null : sensV + 10 * Math.log10(powerZ);
    if (splA !== null && (bestA === null || splA > bestA)) {
      bestA = splA;
      bestK = splK;
      bestZ = splZ;
      const source = v0 * 10 ** (rmsDbfs / 20);
      bestVoltage = source;
      bestPower = (1000 * source * source) / input.referenceImpedanceOhm;
    }
  }
  if (bestA === null) return noneReading('no-loudness');
  const selected =
    input.weighting === 'A' ? bestA : input.weighting === 'K' ? bestK : bestZ;
  const marginDb = SPL_SAFETY_LIMIT_DB - bestA;
  return {
    state: marginDb < 0 ? 'over' : 'ok',
    spl: selected ?? bestA,
    splA: bestA,
    splK: bestK,
    splZ: bestZ,
    powerMw: bestPower,
    voltage: bestVoltage,
    marginDb,
    method: 'bands',
  };
}

/** 只有 PCM RMS、没有频谱时的回退：平坦响应 + Z 加权。 */
export function estimateSoundPressureFromRms(
  input: Omit<BandSoundPressureInput, 'sharesByChannel' | 'bandResponseDb' | 'bandWeightDb'>,
  rig: HeadphoneRig,
): SoundPressureReading {
  const resolved = readyRig(rig, input.muted);
  if ('state' in resolved) return resolved;
  const { amp, headphone } = resolved;
  if (!input.rmsDbfsByChannel) return noneReading('no-loudness');
  const sensV = sensitivityDbPerVAtReference(headphone, input.referenceImpedanceOhm);
  let best: number | null = null;
  let bestVoltage: number | null = null;
  let bestPower: number | null = null;
  for (const rmsDbfs of input.rmsDbfsByChannel) {
    const voltage = voltageFromRms(
      rmsDbfs,
      input.volumeDb,
      amp.gainDb,
      amp.vrmsAt0db,
    );
    if (voltage === null) continue;
    const spl = sensV + 20 * Math.log10(voltage);
    if (best === null || spl > best) {
      best = spl;
      bestVoltage = voltage;
      bestPower = (1000 * voltage * voltage) / input.referenceImpedanceOhm;
    }
  }
  if (best === null) return noneReading('no-loudness');
  const marginDb = SPL_SAFETY_LIMIT_DB - best;
  return {
    state: marginDb < 0 ? 'over' : 'ok',
    spl: best,
    splA: best,
    splK: null,
    splZ: best,
    powerMw: bestPower,
    voltage: bestVoltage,
    marginDb,
    method: 'rms',
  };
}

export interface RigSelection {
  readonly amp: AmpProfile | null;
  readonly headphone: HeadphoneProfile | null;
}

export function selectedRig(rig: HeadphoneRig): RigSelection {
  return {
    amp: rig.amps.find((amp) => amp.id === rig.selectedAmpId) ?? null,
    headphone: rig.headphones.find((item) => item.id === rig.selectedHeadphoneId) ?? null,
  };
}

/**
 * 从实时 Short-term LUFS 估算耳机的输出声压。
 *
 * BS.1770 的定标：立体声双单声道 997 Hz 正弦在 0 dBFS 峰值读 0 LUFS（EBU Tech 3341 用 1 kHz、
 * −23 dBFS 读 −23.0 LUFS）。功放的 `V0` 正是 0 dBFS 正弦的 RMS，所以立体声每声道相对正弦的电平
 * 就是 `S`；单声道、5.1 等多声道内容再由 `channelGainDb = 10·log10(2/Σw)` 换算。
 * 旧实现的 `+0.691` 把立体声高估 0.69 dB；`S − 2.32` 则把 0 dBFS 正弦 RMS 当成 0 dBFS RMS，
 * 会低估 2.32 dB。
 *
 * L_ch = S + channelGainDb + volumeDb
 * V   = V0 · 10^((L_ch + G) / 20)
 * P   = 1000 · V² / Z
 * SPL = M + 10·log10(P) = Vsen + 20·log10(V)
 */
export function estimateSoundPressure(
  input: SoundPressureInput,
  rig: HeadphoneRig,
): SoundPressureReading {
  const resolved = readyRig(rig, input.muted || input.volumeDb <= -100);
  if ('state' in resolved) return resolved;
  const { amp, headphone } = resolved;
  if (input.shortTermLufs === null || input.shortTermLufs <= -70)
    return noneReading('no-loudness');

  const digital = input.shortTermLufs + (input.channelGainDb ?? 0) + input.volumeDb;
  const voltage = amp.vrmsAt0db * 10 ** ((digital + amp.gainDb) / 20);
  const powerMw = (1000 * voltage ** 2) / headphone.impedanceOhm;
  const spl =
    headphone.sensitivityUnit === 'dbPerV'
      ? headphone.sensitivity + 20 * Math.log10(voltage)
      : headphone.sensitivity + 10 * Math.log10(powerMw);
  if (!Number.isFinite(voltage) || !Number.isFinite(powerMw) || !Number.isFinite(spl))
    return noneReading('no-loudness');
  const marginDb = SPL_SAFETY_LIMIT_DB - spl;
  return {
    state: spl > SPL_SAFETY_LIMIT_DB ? 'over' : 'ok',
    spl,
    splA: spl,
    splK: spl,
    splZ: spl,
    powerMw,
    voltage,
    marginDb,
    method: 'lufs',
  };
}

export function formatSpl(value: number | null): string {
  if (value === null) return '—';
  return value > SPL_DISPLAY_MAX_DB ? `>${SPL_DISPLAY_MAX_DB}` : value.toFixed(1);
}

export function formatPower(value: number | null): string {
  if (value === null) return '—';
  if (value <= 0) return '0 mW';
  if (value >= 1000) return `${(value / 1000).toFixed(2)} W`;
  if (value >= 1) return `${value.toFixed(1)} mW`;
  if (value >= 0.001) return `${value.toFixed(3)} mW`;
  return `${(value * 1000).toFixed(1)} µW`;
}

export function formatVoltage(value: number | null): string {
  if (value === null) return '—';
  if (value <= 0) return '0 V';
  return value >= 1 ? `${value.toFixed(2)} V` : `${Math.round(value * 1000)} mV`;
}

/** 正数写 +，负数写 −；单位与“余量/超出”文案由组件加。 */
export function formatMargin(value: number | null): string {
  if (value === null) return '—';
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`;
}
