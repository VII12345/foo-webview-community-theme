import raw from './headphoneMeasurements.json' with { type: 'json' };
import { bandProbeFrequencies } from './splBands.ts';

/** huihifi 测量档案：FR 以 1 kHz 为 0 dB，阻抗只有幅值。 */
export interface MeasurementCurvePoint {
  readonly hz: number;
  readonly db: number;
}

export interface MeasurementImpedancePoint {
  readonly hz: number;
  readonly ohm: number;
}

export interface HeadphoneMeasurement {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly sourceUrl: string;
  readonly uuid: string;
  readonly fetchedAt: string;
  /** huihifi 的 RAW_FR 暂按固定电压下的 SPL 曲线理解。 */
  readonly frReference: 'voltage' | 'power';
  readonly driveImpedanceOhm: number | null;
  readonly frequencyResponse: readonly MeasurementCurvePoint[];
  readonly impedance: readonly MeasurementImpedancePoint[];
}

interface RawCurveRow {
  readonly [index: number]: number;
}

interface RawProfile {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly sourceUrl: string;
  readonly uuid: string;
  readonly fetchedAt: string;
  readonly frReference: 'voltage' | 'power';
  readonly driveImpedanceOhm: number | null;
  readonly frequencyResponse: readonly RawCurveRow[];
  readonly impedance: readonly RawCurveRow[];
}

interface RawFile {
  readonly schema: number;
  readonly profiles: readonly RawProfile[];
}

function curvePoints(rows: readonly RawCurveRow[]): MeasurementCurvePoint[] {
  return rows
    .map((row) => ({ hz: Number(row[0]), db: Number(row[1]) }))
    .filter((point) => Number.isFinite(point.hz) && point.hz > 0 && Number.isFinite(point.db))
    .sort((left, right) => left.hz - right.hz);
}

function impedancePoints(rows: readonly RawCurveRow[]): MeasurementImpedancePoint[] {
  return rows
    .map((row) => ({ hz: Number(row[0]), ohm: Number(row[1]) }))
    .filter(
      (point) =>
        Number.isFinite(point.hz) &&
        point.hz > 0 &&
        Number.isFinite(point.ohm) &&
        point.ohm > 0,
    )
    .sort((left, right) => left.hz - right.hz);
}

const profiles: readonly HeadphoneMeasurement[] = ((raw as unknown as RawFile).profiles ?? []).map(
  (profile) => ({
    id: profile.id,
    name: profile.name,
    source: profile.source,
    sourceUrl: profile.sourceUrl,
    uuid: profile.uuid,
    fetchedAt: profile.fetchedAt,
    frReference: profile.frReference === 'power' ? 'power' : 'voltage',
    driveImpedanceOhm:
      typeof profile.driveImpedanceOhm === 'number' ? profile.driveImpedanceOhm : null,
    frequencyResponse: curvePoints(profile.frequencyResponse ?? []),
    impedance: impedancePoints(profile.impedance ?? []),
  }),
);

const byId = new Map(profiles.map((profile) => [profile.id, profile]));

export const HEADPHONE_MEASUREMENTS: readonly HeadphoneMeasurement[] = profiles;

/** 未知/空 id 返回 null；调用方回退到标称参数。 */
export function measurementProfileOf(
  id: string | null | undefined,
): HeadphoneMeasurement | null {
  return id ? byId.get(id) ?? null : null;
}

/** 对数频率插值；曲线范围外保持端点值。 */
function interpolate<T extends { readonly hz: number }>(
  points: readonly T[],
  hz: number,
  valueOf: (point: T) => number,
): number | null {
  if (points.length === 0 || !(hz > 0)) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (hz <= first.hz) return valueOf(first);
  if (hz >= last.hz) return valueOf(last);
  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (points[middle]!.hz <= hz) low = middle;
    else high = middle;
  }
  const a = points[low]!;
  const b = points[high]!;
  const t = Math.log(hz / a.hz) / Math.log(b.hz / a.hz);
  return valueOf(a) + (valueOf(b) - valueOf(a)) * t;
}

export function frDbAt(profile: HeadphoneMeasurement | null, hz: number): number {
  if (!profile) return 0;
  return interpolate(profile.frequencyResponse, hz, (point) => point.db) ?? 0;
}

export function impedanceOhmAt(
  profile: HeadphoneMeasurement | null,
  hz: number,
  fallbackOhm: number,
): number {
  if (!profile) return fallbackOhm;
  return interpolate(profile.impedance, hz, (point) => point.ohm) ?? fallbackOhm;
}

/** dB/mW → dB/V 的参考阻抗：有档案时用 1 kHz 实测，否则用标称。 */
export function referenceImpedanceOhm(
  profile: HeadphoneMeasurement | null,
  nominalOhm: number,
): number {
  return impedanceOhmAt(profile, 1000, nominalOhm);
}

/**
 * 每个 band 的电压响应（dB）：
 * `10log10(mean |Z/(Zamp+Z)|² · 10^(FR/10))`。
 * FR 已按 1 kHz 归一化；阻抗曲线只有幅值，按 0° 处理。
 */
export function bandResponseDb(
  profile: HeadphoneMeasurement | null,
  edges: readonly number[],
  ampOutputImpedanceOhm: number,
  nominalImpedanceOhm: number,
): Float64Array {
  const result = new Float64Array(Math.max(0, edges.length - 1));
  for (let band = 0; band < result.length; band += 1) {
    const low = edges[band]!;
    const high = edges[band + 1]!;
    const probes = bandProbeFrequencies(low, high, 8);
    let power = 0;
    for (const hz of probes) {
      const z = impedanceOhmAt(profile, hz, nominalImpedanceOhm);
      const divider = z / (ampOutputImpedanceOhm + z);
      power += divider * divider * 10 ** (frDbAt(profile, hz) / 10);
    }
    result[band] = 10 * Math.log10(power / probes.length);
  }
  return result;
}
