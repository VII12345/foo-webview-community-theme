import { describe, expect, it } from 'vitest';
import { linearLuminance, sceneTone } from '../../../../src/immersive/wash/sceneLift.ts';

/**
 * 场景提亮：封面底色那一层铺满整幅场景，它就是"整个界面"的背景。
 * 提亮把亮度与色度分开——亮度往纸面亮度拉并夹进可读带，色度按上限保留封面的颜色。
 */

/** 封面混进纸面之后的亮度：线性光里按同一比例混。 */
const baseLuma = (coverLuma: number, paperLuma: number, strength: number) =>
  paperLuma + (coverLuma - paperLuma) * strength;

/** 这一层落定的亮度：底色平移之后、逐像素夹带之后的中间亮度。 */
const settledLuma = (
  coverLuma: number,
  paperLuma: number,
  strength: number,
  tone: ReturnType<typeof sceneTone>,
) => {
  const base = baseLuma(coverLuma, paperLuma, strength);
  const level = Math.min(tone.high, Math.max(tone.low, base + tone.offset));
  return level;
};

describe('linearLuminance', () => {
  it('Rec.709 加权，黑白两端就是 0 与 1', () => {
    expect(linearLuminance([0, 0, 0])).toBe(0);
    expect(linearLuminance([1, 1, 1])).toBe(1);
    expect(linearLuminance([1, 0, 0])).toBeCloseTo(0.2126, 9);
    expect(linearLuminance([0, 1, 0])).toBeCloseTo(0.7152, 9);
  });
});

describe('sceneTone', () => {
  it('滑杆 0 时不夹也不平移：与旧样一模一样', () => {
    const tone = sceneTone(0.03, 0.85, 0.5, 0, 'light');
    expect(tone.offset).toBe(0);
    expect(tone.low).toBe(0);
    expect(tone.high).toBe(1);
  });

  it('浅色档 + 深封面：底色被拉回纸面附近，界面不再发灰', () => {
    const off = sceneTone(0.03, 0.85, 0.5, 0, 'light');
    const on = sceneTone(0.03, 0.85, 0.5, 100, 'light');
    // 旧样：纸面 0.85 与封面 0.03 各占一半 → 0.44，整幅界面落到中间亮度。
    expect(settledLuma(0.03, 0.85, 0.5, off)).toBeCloseTo(0.44, 9);
    // 拉满之后回到纸面亮度附近。
    expect(settledLuma(0.03, 0.85, 0.5, on)).toBeGreaterThan(0.75);
  });

  it('浅色档 + 中等亮度封面：提得少一些', () => {
    const on = sceneTone(0.42, 0.85, 0.5, 100, 'light');
    expect(settledLuma(0.42, 0.85, 0.5, on)).toBeGreaterThan(
      settledLuma(0.42, 0.85, 0.5, sceneTone(0.42, 0.85, 0.5, 0, 'light')),
    );
    expect(settledLuma(0.42, 0.85, 0.5, on)).toBeLessThan(0.85);
  });

  it('浅色档 + 亮封面：底色不会亮过纸面太多，画面基本不变', () => {
    const off = sceneTone(0.95, 0.85, 0.5, 0, 'light');
    const on = sceneTone(0.95, 0.85, 0.5, 100, 'light');
    expect(Math.abs(settledLuma(0.95, 0.85, 0.5, on) - settledLuma(0.95, 0.85, 0.5, off))).toBeLessThan(
      0.02,
    );
  });

  it('深色档 + 亮封面：底色被压回深色，近白歌词不会失去对比', () => {
    const off = sceneTone(0.95, 0.08, 0.4, 0, 'dark');
    const on = sceneTone(0.95, 0.08, 0.4, 100, 'dark');
    expect(settledLuma(0.95, 0.08, 0.4, off)).toBeCloseTo(0.428, 9);
    expect(settledLuma(0.95, 0.08, 0.4, on)).toBeLessThanOrEqual(0.18);
  });

  it('深色档 + 深封面：底色保持深色', () => {
    const on = sceneTone(0.03, 0.08, 0.4, 100, 'dark');
    expect(settledLuma(0.03, 0.08, 0.4, on)).toBeLessThanOrEqual(0.18);
    expect(settledLuma(0.03, 0.08, 0.4, on)).toBeGreaterThan(0);
  });

  it('亮度带随滑杆收紧：浅色档压低下界，深色档压低上界', () => {
    expect(sceneTone(0.03, 0.85, 0.5, 0, 'light').low).toBe(0);
    expect(sceneTone(0.03, 0.85, 0.5, 100, 'light').low).toBeCloseTo(0.45, 9);
    expect(sceneTone(0.95, 0.08, 0.4, 0, 'dark').high).toBe(1);
    expect(sceneTone(0.95, 0.08, 0.4, 100, 'dark').high).toBeCloseTo(0.18, 9);
  });

  it('滑杆越大越亮：同一张深封面，提亮强度单调', () => {
    const levels = [0, 25, 50, 75, 100].map((amount) =>
      settledLuma(0.03, 0.85, 0.5, sceneTone(0.03, 0.85, 0.5, amount, 'light')),
    );
    for (let at = 1; at < levels.length; at += 1) {
      expect(levels[at]!).toBeGreaterThan(levels[at - 1]!);
    }
  });
});
