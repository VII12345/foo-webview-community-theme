/** 声压显示加权；Loudness 表的 K 加权 LUFS 不受这个设置影响。 */
export type SplWeighting = 'A' | 'K' | 'Z';

export const SPL_WEIGHTINGS: readonly SplWeighting[] = ['A', 'K', 'Z'];
export const SPL_WEIGHTING_DEFAULT: SplWeighting = 'A';
export const SPL_WEIGHTING_KEY = 'defaultTheme.playback.splWeighting';

export function parseSplWeighting(raw: unknown): SplWeighting | undefined {
  return raw === 'A' || raw === 'K' || raw === 'Z' ? raw : undefined;
}

export function splUnit(weighting: SplWeighting): string {
  if (weighting === 'A') return 'dBA';
  if (weighting === 'K') return 'dB SPL (K)';
  return 'dB SPL (Z)';
}
