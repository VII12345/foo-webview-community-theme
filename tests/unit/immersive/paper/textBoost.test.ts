import { expect, test } from 'vitest';
import { luminanceOfSrgb } from '../../../../src/theme/luminance.ts';
import {
  contrastBoost,
  contrastRatio,
  contrastTarget,
  effectiveLuminance,
  paperLuminanceOf,
  type ContrastTarget,
  type Rgb,
} from '../../../../src/immersive/paper/textBoost.ts';

const luma = (rgb: Rgb) => luminanceOfSrgb(rgb[0], rgb[1], rgb[2]);
const mix = (base: Rgb, target: ContrastTarget, pct: number): Rgb => {
  const channel = target === '#fff' ? 1 : 0;
  const amount = pct / 100;
  return [
    base[0] + (channel - base[0]) * amount,
    base[1] + (channel - base[1]) * amount,
    base[2] + (channel - base[2]) * amount,
  ];
};

test('contrastRatio：黑白 21，左右对称', () => {
  expect(contrastRatio(0, 1)).toBeCloseTo(21, 9);
  expect(contrastRatio(0.2, 0.8)).toBe(contrastRatio(0.8, 0.2));
});

test('contrastTarget：背景暗时白色对比更高，背景亮时黑色更高', () => {
  expect(contrastTarget(0.05)).toBe('#fff');
  expect(contrastTarget(0.1)).toBe('#fff');
  expect(contrastTarget(0.3)).toBe('#000');
  expect(contrastTarget(0.8)).toBe('#000');
});

test('浅色字 + 深背景：向白移动；深色字 + 中亮背景：向黑移动', () => {
  const light = contrastBoost([0.9, 0.9, 0.9], 0.1, 50);
  expect(light.target).toBe('#fff');
  expect(luma(mix([0.9, 0.9, 0.9], light.target, light.pct))).toBeGreaterThan(
    luma([0.9, 0.9, 0.9]),
  );

  const dark = contrastBoost([0.02, 0.02, 0.02], 0.3, 50);
  expect(dark.target).toBe('#000');
  expect(luma(mix([0.02, 0.02, 0.02], dark.target, dark.pct))).toBeLessThan(
    luma([0.02, 0.02, 0.02]),
  );
});

test('滑杆 0、没有背景或目标不更优时不改动', () => {
  expect(contrastBoost([0.02, 0.02, 0.02], 0.3, 0).pct).toBe(0);
  expect(contrastBoost([0.02, 0.02, 0.02], null, 100).pct).toBe(0);
  const already = contrastBoost([0, 0, 0], 0.3, 100);
  expect(already.pct).toBe(0);
});

test('深色字 + 很暗背景：跨到白色一侧，但并不比原色更差', () => {
  const base: Rgb = [0.02, 0.02, 0.02];
  const boost = contrastBoost(base, 0.1, 100);
  expect(boost.target).toBe('#fff');
  expect(boost.pct).toBe(100);
  expect(luma(mix(base, boost.target, boost.pct))).toBe(1);
});

test('任意滑杆值的对比度都不低于 0%', () => {
  const cases: [Rgb, number][] = [
    [[0.02, 0.02, 0.02], 0.1],
    [[0.02, 0.02, 0.02], 0.3],
    [[0.9, 0.9, 0.9], 0.3],
    [[0.9, 0.9, 0.9], 0.8],
    [[0.12, 0.2, 0.3], 0.25],
  ];
  for (const [base, background] of cases) {
    const baseline = contrastRatio(luma(base), background);
    for (const percent of [1, 5, 25, 50, 75, 100]) {
      const boost = contrastBoost(base, background, percent);
      const mixed = mix(base, boost.target, boost.pct);
      expect(
        contrastRatio(luma(mixed), background),
        `${background} / ${percent}% -> ${boost.target} ${boost.pct}%`,
      ).toBeGreaterThanOrEqual(baseline - 1e-9);
    }
  }
});

test('effectiveLuminance：封面按底色层强度混进纸面', () => {
  expect(effectiveLuminance(0.1, 0.9, 0)).toBe(0.9);
  expect(effectiveLuminance(0.1, 0.9, 1)).toBeCloseTo(0.1, 9);
  expect(effectiveLuminance(0.1, 0.9, 0.5)).toBeCloseTo(0.5, 9);
});

test('paperLuminanceOf：sRGB 黑/白与 Rec.709 分量', () => {
  expect(paperLuminanceOf(0, 0, 0)).toBe(0);
  expect(paperLuminanceOf(1, 1, 1)).toBe(1);
  expect(paperLuminanceOf(1, 0, 0)).toBeCloseTo(0.2126, 9);
});
