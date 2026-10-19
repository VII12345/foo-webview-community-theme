/** 1/3 倍频程中心频率，20 Hz–20 kHz，共 31 段。 */
export const SPL_BAND_CENTERS: readonly number[] = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
  1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000,
  20000,
];

/** 相邻中心频率的几何平均作为 band 边界；首尾夹到 20 Hz / 20 kHz。 */
export const SPL_BAND_EDGES: readonly number[] = [
  SPL_BAND_CENTERS[0]!,
  ...SPL_BAND_CENTERS.slice(1).map((center, index) =>
    Math.sqrt(SPL_BAND_CENTERS[index]! * center),
  ),
  SPL_BAND_CENTERS[SPL_BAND_CENTERS.length - 1]!,
];

/** 在 band 内取对数等距的采样频率；首尾略向内收，避免边界重复。 */
export function bandProbeFrequencies(
  low: number,
  high: number,
  count = 8,
): readonly number[] {
  if (!(high > low) || !(count > 0)) return [Math.sqrt(low * high)];
  return Array.from({ length: count }, (_, index) =>
    low * (high / low) ** ((index + 0.5) / count),
  );
}
