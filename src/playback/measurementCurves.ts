import { bandProbeFrequencies } from './splBands.ts';

/** 耳机测量曲线的纯数学层；不 import 内置 JSON，供自定义档案和 SPL 共用。 */
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

export interface RawCurveRow {
  readonly [index: number]: number;
}

const round = (value: number, digits = 3): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function curvePoints(rows: readonly RawCurveRow[]): MeasurementCurvePoint[] {
  return rows
    .map((row) => ({ hz: Number(row[0]), db: Number(row[1]) }))
    .filter((point) => Number.isFinite(point.hz) && point.hz > 0 && Number.isFinite(point.db))
    .sort((left, right) => left.hz - right.hz);
}

export function impedancePoints(rows: readonly RawCurveRow[]): MeasurementImpedancePoint[] {
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

/** 对数频率插值；曲线范围外保持端点值。 */
export function interpolate<T extends { readonly hz: number }>(
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

/** 对数频率网格，首尾包含。 */
export function logGrid(minHz: number, maxHz: number, count: number): number[] {
  if (!(minHz > 0) || !(maxHz > minHz) || !(count > 1)) return [minHz];
  const ratio = (maxHz / minHz) ** (1 / (count - 1));
  return Array.from({ length: count }, (_, index) => minHz * ratio ** index);
}

/** FR 在 1 kHz 归一化为 0 dB。 */
export function normalizeFrequencyResponse(
  points: readonly MeasurementCurvePoint[],
): MeasurementCurvePoint[] {
  const at1k = interpolate(points, 1000, (point) => point.db) ?? 0;
  return points.map((point) => ({ ...point, db: point.db - at1k }));
}

/** 按给定网格插值并降采样成紧凑的 `[hz, value]` 行。 */
export function downsampleCurve<T extends { readonly hz: number }>(
  points: readonly T[],
  grid: readonly number[],
  valueOf: (point: T) => number,
  digits = 3,
): [number, number][] {
  return grid.map((hz) => {
    const value = interpolate(points, hz, valueOf);
    return [round(hz, digits), round(value ?? 0, digits)];
  });
}
