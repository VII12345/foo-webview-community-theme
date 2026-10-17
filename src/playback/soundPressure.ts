/**
 * 耳机输出声压估算的共享模型：设备参数、灵敏度换算与从实时 LUFS 到 dB SPL 的纯计算。
 *
 * 这是估算，不是测量：不建模耳放输出阻抗、耳机阻抗随频率的变化、耳道耦合与头相关传输，
 * 也不叠加 ReplayGain。所有外部值（config）进入前都要经过本文件的校验与夹取。
 */

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
export const AMP_GAIN_MIN = -20;
export const AMP_GAIN_MAX = 20;
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

export interface SoundPressureReading {
  readonly state: SoundPressureState;
  /** dB SPL；不可算时为 null。 */
  readonly spl: number | null;
  /** mW；不可算时为 null。 */
  readonly powerMw: number | null;
  /** Vrms；不可算时为 null。 */
  readonly voltage: number | null;
  /** 80 − SPL，正数是余量，负数是超出；不可算时为 null。 */
  readonly marginDb: number | null;
}

export interface SoundPressureInput {
  /** 沉浸视图当前的 Short-term LUFS；无值时为 null。 */
  readonly shortTermLufs: number | null;
  /** 播放器音量增益，dB。 */
  readonly volumeDb: number;
  readonly muted: boolean;
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
 * Lch = S + 0.691 + volumeDb
 * V   = V0 · 10^((Lch + G) / 20)
 * P   = 1000 · V² / Z
 * SPL = M + 10·log10(P) = Vsen + 20·log10(V)
 */
export function estimateSoundPressure(
  input: SoundPressureInput,
  rig: HeadphoneRig,
): SoundPressureReading {
  const { amp, headphone } = selectedRig(rig);
  if (!rig.amps.length && !rig.headphones.length)
    return { state: 'no-device', spl: null, powerMw: null, voltage: null, marginDb: null };
  if (!amp) return { state: 'no-amp', spl: null, powerMw: null, voltage: null, marginDb: null };
  if (!headphone)
    return {
      state: 'no-headphone',
      spl: null,
      powerMw: null,
      voltage: null,
      marginDb: null,
    };
  if (input.muted || input.volumeDb <= -100) {
    return {
      state: 'muted',
      spl: null,
      powerMw: 0,
      voltage: 0,
      marginDb: SPL_SAFETY_LIMIT_DB,
    };
  }
  if (input.shortTermLufs === null || input.shortTermLufs <= -70)
    return { state: 'no-loudness', spl: null, powerMw: null, voltage: null, marginDb: null };

  const digital = input.shortTermLufs + 0.691 + input.volumeDb;
  const voltage = amp.vrmsAt0db * 10 ** ((digital + amp.gainDb) / 20);
  const powerMw = (1000 * voltage ** 2) / headphone.impedanceOhm;
  const spl =
    headphone.sensitivityUnit === 'dbPerV'
      ? headphone.sensitivity + 20 * Math.log10(voltage)
      : headphone.sensitivity + 10 * Math.log10(powerMw);
  const marginDb = SPL_SAFETY_LIMIT_DB - spl;
  return {
    state: spl > SPL_SAFETY_LIMIT_DB ? 'over' : 'ok',
    spl,
    powerMw,
    voltage,
    marginDb,
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
