import { luminanceOfSrgb } from '../../theme/luminance.ts';

/** 合成底色亮于此不提亮；暗于 `DARK` 时按设定强度全额提亮。 */
export const TEXT_BOOST_LIGHT_LUMA = 0.55;
export const TEXT_BOOST_DARK_LUMA = 0.25;

/** 纸面亮度读不到时的保守值。 */
export const PAPER_LUMA_FALLBACK = { light: 0.85, dark: 0.15 } as const;

/** 封面亮度按封面底色混进纸面的比例，与 `PaperCoverWash` 的 `WASH_STRENGTH` 同步。 */
export function effectiveLuminance(
  coverLuma: number,
  paperLuma: number,
  washStrength: number,
): number {
  return paperLuma + (coverLuma - paperLuma) * washStrength;
}

/**
 * 提亮比例 0…1：合成底色越暗越大，亮封面为 0；`percent` 是设置里的 0–100。
 * 只提亮文字颜色，背景与纸面染色不变。
 */
export function textBoostFactor(
  effectiveLuma: number | null,
  percent: number,
): number {
  if (effectiveLuma === null || !Number.isFinite(effectiveLuma)) return 0;
  const strength = Math.min(1, Math.max(0, percent / 100));
  if (strength === 0) return 0;
  const darkness = Math.min(
    1,
    Math.max(
      0,
      (TEXT_BOOST_LIGHT_LUMA - effectiveLuma) /
        (TEXT_BOOST_LIGHT_LUMA - TEXT_BOOST_DARK_LUMA),
    ),
  );
  return strength * darkness;
}

/** 从计算后的 CSS 颜色（0…1 的 sRGB 分量）读纸面亮度。 */
export function paperLuminanceOf(red: number, green: number, blue: number): number {
  return luminanceOfSrgb(red, green, blue);
}
