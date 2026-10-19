import { luminanceOfSrgb } from '../../theme/luminance.ts';

/** 纸面亮度读不到时的保守值。 */
export const PAPER_LUMA_FALLBACK = { light: 0.85, dark: 0.15 } as const;

export type Rgb = readonly [number, number, number];
export type ContrastTarget = '#fff' | '#000';

export interface ContrastBoost {
  /** 混向白色还是黑色。 */
  readonly target: ContrastTarget;
  /** `color-mix` 里目标色占的百分比 0…100。 */
  readonly pct: number;
  readonly baseContrast: number;
  readonly targetContrast: number;
}

const ZERO: ContrastBoost = { target: '#fff', pct: 0, baseContrast: 1, targetContrast: 1 };

/** 封面亮度按封面底色混进纸面的比例，与 `PaperCoverWash` 的 `WASH_STRENGTH` 同步。 */
export function effectiveLuminance(
  coverLuma: number,
  paperLuma: number,
  washStrength: number,
): number {
  return paperLuma + (coverLuma - paperLuma) * washStrength;
}

/** WCAG 相对亮度对比度。 */
export function contrastRatio(first: number, second: number): number {
  const high = Math.max(first, second);
  const low = Math.min(first, second);
  return (high + 0.05) / (low + 0.05);
}

/** 白/黑中与背景对比度更高的一端。 */
export function contrastTarget(backgroundLuma: number): ContrastTarget {
  return contrastRatio(1, backgroundLuma) >= contrastRatio(0, backgroundLuma) ? '#fff' : '#000';
}

function mixSrgb(base: Rgb, target: ContrastTarget, pct: number): Rgb {
  const targetChannel = target === '#fff' ? 1 : 0;
  const amount = Math.min(1, Math.max(0, pct / 100));
  return [
    base[0] + (targetChannel - base[0]) * amount,
    base[1] + (targetChannel - base[1]) * amount,
    base[2] + (targetChannel - base[2]) * amount,
  ];
}

const lumaOf = (rgb: Rgb): number => luminanceOfSrgb(rgb[0], rgb[1], rgb[2]);

/**
 * 找到混向目标色后“刚好不降低原对比度”的百分比。基色与目标在背景两侧时，直接混会穿过背景亮度、
 * 中途对比度下降；从 safePct 起步再继续混向目标，任意滑杆值都不会比原色更差。
 */
function safePercent(base: Rgb, target: ContrastTarget, backgroundLuma: number): number {
  const targetLuma = target === '#fff' ? 1 : 0;
  const baseContrast = contrastRatio(lumaOf(base), backgroundLuma);
  for (let pct = 0.5; pct <= 100; pct += 0.5) {
    const luma = lumaOf(mixSrgb(base, target, pct));
    const sameSide = (luma - backgroundLuma) * (targetLuma - backgroundLuma) > 0;
    if (sameSide && contrastRatio(luma, backgroundLuma) >= baseContrast - 1e-9) return pct;
  }
  return 100;
}

/**
 * 对比度优先的文字修正：目标色取白/黑中与背景对比更高的一端；滑杆 0 保持原色，滑杆越大越靠近目标色。
 * 若基色与目标色在背景两侧，先跳到“不低于原对比度”的安全百分比再继续。
 */
export function contrastBoost(
  base: Rgb,
  backgroundLuma: number | null,
  percent: number,
): ContrastBoost {
  const amount = Math.min(1, Math.max(0, percent / 100));
  if (backgroundLuma === null || amount <= 0) return ZERO;
  const baseLuma = lumaOf(base);
  const target = contrastTarget(backgroundLuma);
  const targetLuma = target === '#fff' ? 1 : 0;
  const baseContrast = contrastRatio(baseLuma, backgroundLuma);
  const targetContrast = contrastRatio(targetLuma, backgroundLuma);
  if (targetContrast <= baseContrast) return ZERO;
  const sameSide = (baseLuma - backgroundLuma) * (targetLuma - backgroundLuma) > 0;
  const start = sameSide
    ? 0
    : safePercent(base, target, backgroundLuma);
  return {
    target,
    pct: amount >= 1 ? 100 : start + (100 - start) * amount,
    baseContrast,
    targetContrast,
  };
}

/** 从计算后的 CSS 颜色（0…1 的 sRGB 分量）读纸面亮度。 */
export function paperLuminanceOf(red: number, green: number, blue: number): number {
  return luminanceOfSrgb(red, green, blue);
}
