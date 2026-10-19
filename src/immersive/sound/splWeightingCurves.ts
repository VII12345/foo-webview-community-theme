import { kWeighting, type Biquad } from '../gauges/loudnessMeter.ts';
import { bandProbeFrequencies } from '../../playback/splBands.ts';

/** IEC 61672 A 加权的极点频率（Hz）。 */
export const A_WEIGHTING_HZ = [20.598997, 107.65265, 737.86223, 12194.217] as const;

/** A 加权在 1 kHz 的归一化偏移；解析式本身在 1 kHz 约为 −2 dB。 */
const A_NORMALIZATION_DB = 2.0;

/** 解析 A 加权（dB），1 kHz 归一到 0 dB。 */
export function aWeightingDbAt(hz: number): number {
  if (!(hz > 0)) return 0;
  const [f1, f2, f3, f4] = A_WEIGHTING_HZ;
  const f2Hz = hz * hz;
  const numerator = f4 ** 2 * hz ** 4;
  const denominator =
    (f2Hz + f1 ** 2) *
    Math.sqrt((f2Hz + f2 ** 2) * (f2Hz + f3 ** 2)) *
    (f2Hz + f4 ** 2);
  return 20 * Math.log10(numerator / denominator) + A_NORMALIZATION_DB;
}

/** 双二阶级联在某频率的功率响应（dB）。 */
function biquadPowerDb(filter: Biquad, hz: number, sampleRate: number): number {
  const omega = (2 * Math.PI * hz) / sampleRate;
  const cos1 = Math.cos(omega);
  const sin1 = Math.sin(omega);
  const cos2 = Math.cos(2 * omega);
  const sin2 = Math.sin(2 * omega);
  const numeratorReal = filter.b0 + filter.b1 * cos1 + filter.b2 * cos2;
  const numeratorImag = -(filter.b1 * sin1 + filter.b2 * sin2);
  const denominatorReal = 1 + filter.a1 * cos1 + filter.a2 * cos2;
  const denominatorImag = -(filter.a1 * sin1 + filter.a2 * sin2);
  const numerator = numeratorReal ** 2 + numeratorImag ** 2;
  const denominator = denominatorReal ** 2 + denominatorImag ** 2;
  return 10 * Math.log10(Math.max(1e-30, numerator / denominator));
}

/** BS.1770 K 加权的幅频响应（dB），再按 1 kHz 归一到 0 dB。 */
export function kWeightingDbAt(hz: number, sampleRate: number): number {
  if (!(hz > 0) || !(sampleRate > 0)) return 0;
  const [shelf, highPass] = kWeighting(sampleRate);
  const raw = (frequency: number) =>
    biquadPowerDb(shelf, frequency, sampleRate) +
    biquadPowerDb(highPass, frequency, sampleRate);
  return raw(hz) - raw(1000);
}

export interface WeightTables {
  readonly A: Float64Array;
  readonly K: Float64Array;
  readonly Z: Float64Array;
}

const cache = new Map<string, WeightTables>();

/** 每个 band 的加权功率（dB），用 band 内 8 个对数点做功率平均。 */
export function weightTables(
  edges: readonly number[],
  sampleRate: number,
): WeightTables {
  const key = `${sampleRate}|${edges.length}|${edges[0] ?? 0}|${edges[edges.length - 1] ?? 0}`;
  const known = cache.get(key);
  if (known) return known;
  const bands = Math.max(0, edges.length - 1);
  const A = new Float64Array(bands);
  const K = new Float64Array(bands);
  const Z = new Float64Array(bands);
  for (let band = 0; band < bands; band += 1) {
    const probes = bandProbeFrequencies(edges[band]!, edges[band + 1]!, 8);
    let aPower = 0;
    let kPower = 0;
    for (const hz of probes) {
      aPower += 10 ** (aWeightingDbAt(hz) / 10);
      kPower += 10 ** (kWeightingDbAt(hz, sampleRate) / 10);
    }
    A[band] = 10 * Math.log10(aPower / probes.length);
    K[band] = 10 * Math.log10(kPower / probes.length);
  }
  const tables = { A, K, Z };
  cache.set(key, tables);
  return tables;
}
