import { expect, test } from 'vitest';
import {
  effectiveLuminance,
  paperLuminanceOf,
  textBoostFactor,
  TEXT_BOOST_DARK_LUMA,
  TEXT_BOOST_LIGHT_LUMA,
} from '../../../../src/immersive/paper/textBoost.ts';

test('textBoostFactor：亮底不提亮，暗底按强度提亮，中间线性', () => {
  expect(textBoostFactor(null, 50)).toBe(0);
  expect(textBoostFactor(0.6, 50)).toBe(0);
  expect(textBoostFactor(TEXT_BOOST_LIGHT_LUMA, 50)).toBe(0);
  expect(textBoostFactor(TEXT_BOOST_DARK_LUMA, 50)).toBeCloseTo(0.5, 9);
  expect(textBoostFactor(0, 50)).toBeCloseTo(0.5, 9);
  expect(textBoostFactor(0, 100)).toBeCloseTo(1, 9);
  expect(textBoostFactor(0, 0)).toBe(0);
  expect(
    textBoostFactor((TEXT_BOOST_LIGHT_LUMA + TEXT_BOOST_DARK_LUMA) / 2, 100),
  ).toBeCloseTo(0.5, 9);
});

test('effectiveLuminance：封面按底色层强度混进纸面；0 是纸面、1 是封面', () => {
  expect(effectiveLuminance(0.1, 0.9, 0)).toBe(0.9);
  expect(effectiveLuminance(0.1, 0.9, 1)).toBeCloseTo(0.1, 9);
  expect(effectiveLuminance(0.1, 0.9, 0.5)).toBeCloseTo(0.5, 9);
});

test('paperLuminanceOf：sRGB 黑/白与 Rec.709 分量', () => {
  expect(paperLuminanceOf(0, 0, 0)).toBe(0);
  expect(paperLuminanceOf(1, 1, 1)).toBe(1);
  expect(paperLuminanceOf(1, 0, 0)).toBeCloseTo(0.2126, 9);
});
