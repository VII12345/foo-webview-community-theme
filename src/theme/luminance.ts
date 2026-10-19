/** sRGB 分量（0…1）换成线性光，再按 Rec.709 加权；用于封面/纸面亮度的统一口径。 */
export function linearChannel(value: number): number {
  const v = Math.min(1, Math.max(0, value));
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function luminanceOfSrgb(red: number, green: number, blue: number): number {
  return (
    0.2126 * linearChannel(red) +
    0.7152 * linearChannel(green) +
    0.0722 * linearChannel(blue)
  );
}
