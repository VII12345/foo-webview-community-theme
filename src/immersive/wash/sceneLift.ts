import type { ColorScheme } from '../../theme/themes.ts';

/**
 * 场景底色的提亮。
 *
 * 封面底色那一层（`PaperCoverWash` 的根是 `inset: 0` 且不透明）铺满整幅场景，它就是"整个界面"的背景。
 * 底色的亮度原先直接跟着封面走：浅色档 + 深封面时，纸面 0.85、封面 0.03、混色比例 0.5，
 * 场景落到 0.44 —— 整幅界面发灰，主题的近黑歌词贴在上面就看不清。
 *
 * 这里把**亮度与色度分开**：
 * - 亮度按纸面亮度平移，并夹在当前深浅的可读带里（浅色档的近黑字、深色档的近白字各有临界）；
 * - 色度按上限保留封面的颜色，封面只给颜色、不给亮度。
 *
 * 平移量按封面提取的亮度自适应：封面亮度离纸面越远，平移越多 —— 封面暗就多提一点，
 * 封面亮就把场景压回纸面附近（深色档下这挡住了"亮封面把白字冲没"）。
 * 滑杆只决定提亮的上限：0 是旧样（封面全权决定底色），100 是底色亮度锁在纸面附近。
 *
 * 做法照主窗口背景：那边的 `backgroundPalette.ts` 把封面的 HCT tone 夹在带里，
 * `flowShaders.ts` 的 `lightField()` 把亮度与色度分开。沉浸底色保留"模糊流动的封面"这个视觉本体，
 * 只改它怎么取色。
 */

/**
 * 场景亮度的可读带。浅色档的正文是近黑（亮度约 0.03），要 4.5:1 的对比度就需要场景不低于 0.31；
 * 这里取 0.45 留出余量。深色档的正文是近白（亮度约 0.97），要 4.5:1 就需要场景不高于 0.18。
 */
const BAND: Readonly<Record<ColorScheme, { readonly low: number; readonly high: number }>> = {
  light: { low: 0.45, high: 1 },
  dark: { low: 0, high: 0.18 },
};

/**
 * 色度上限：封面的颜色最多带进场景多少（线性光）。混色比例只有 0.4–0.5，色度本来就小，
 * 这里只是兜一道上限，防过艳的封面在提亮后把某个通道顶到 1 之外。
 */
const CHROMA = 0.5;

export interface SceneTone {
  /** 整层亮度的平移量，线性光。 */
  readonly offset: number;
  /** 亮度带的下界与上界，逐像素的亮度都夹在这个带里。 */
  readonly low: number;
  readonly high: number;
  /** 色度上限：色度按它限幅，封面再艳也不会把画面带进纯色。 */
  readonly chroma: number;
}

/**
 * 中性的提亮参数：不平移、不夹带、不限幅 —— 也就是"底色完全由封面与纸面决定"。
 * `shade()` 不给提亮参数时用它，等于旧样。
 */
export const NEUTRAL_TONE: SceneTone = {
  offset: 0,
  low: 0,
  high: 1,
  chroma: Number.POSITIVE_INFINITY,
};

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** 纸面亮度读不到时的缺省值：浅色档的纸染色接近白，深色档接近黑。 */
export const PAPER_LUMA_FALLBACK = { light: 0.85, dark: 0.15 } as const;

/** 线性光下的相对亮度，Rec.709 加权；与 `theme/luminance.ts` 同一个口径。 */
export function linearLuminance(rgb: readonly [number, number, number]): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/**
 * 算这一层底色的提亮参数。
 *
 * `coverLuma` 是封面提取出来的平均线性亮度，`paperLuma` 是纸面的线性亮度，
 * `strength` 是封面混进纸面的比例，`amount` 是滑杆（0–100）。
 */
export function sceneTone(
  coverLuma: number,
  paperLuma: number,
  strength: number,
  amount: number,
  scheme: ColorScheme,
): SceneTone {
  const k = clamp(amount / 100, 0, 1);
  const band = BAND[scheme];
  // 带随滑杆收紧：0 时是 [0, 1]，不夹；100 时是完整的可读带。
  const low = band.low * k;
  const high = 1 - (1 - band.high) * k;
  // 封面混进纸面之后的亮度（线性光里按同一比例混）。
  const base = paperLuma + (coverLuma - paperLuma) * strength;
  // 往纸面拉多少：封面亮度离纸面越远拉得越多，滑杆决定拉几成。
  const pull = Math.min(1, Math.abs(coverLuma - paperLuma)) * k;
  const target = clamp(base + (paperLuma - base) * pull, low, high);
  return { offset: target - base, low, high, chroma: CHROMA };
}
