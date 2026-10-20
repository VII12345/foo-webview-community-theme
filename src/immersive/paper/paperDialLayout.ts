import type { CSSProperties } from 'react';
import { COVER_SIZE, DIAL_CENTER } from './paperLayout.ts';
import { COMPACT_SCALE, type DialPlacement } from './paperTiers.ts';

/**
 * 版心左栏罗盘那几件的排法。
 *
 * 单独成模块，不跟 `PaperDial.tsx` 放一起：布局的盒子模型（`paperComponentLayout.ts`）要用这份排法算
 * 罗盘那几件的盒子，组件文件里有 JSX 与一堆子件，被它拉进来会让布局模块所在的整块跟着变大。
 */

/** 原尺寸下的环半径；圆心与封面边长同 `paperLayout.ts` 的 `DIAL_CENTER`、`COVER_SIZE`。 */
export const RINGS: readonly number[] = [196, 236, 276];
/** 原尺寸下刻度字的中心（版心坐标），逐个手排，不是等距的。 */
export const TICKS = [
  { text: 'W', x: 270, y: 124 },
  { text: 'N', x: 12, y: 380 },
  { text: '270', x: 93, y: 380 },
  { text: '90', x: 521, y: 380 },
  { text: 'v', x: 270, y: 624 },
] as const;
/** 原尺寸下专辑名、曲号两个文字块的顶边到圆心的竖直距离，以及文字块的半宽。 */
export const ALBUM_TOP = -206;
export const TRACK_NO_TOP = 195;
export const TEXT_HALF_WIDTH = 210;
/** 传输键一组在原尺寸下的外框。 */
export const TRANSPORT = { width: 240, height: 80 } as const;
/** narrow 档那一行：封面边长与顶边、封面与右侧文字列的间距、右侧三行各自的顶边。 */
export const NARROW = {
  cover: 160,
  top: 24,
  gap: 16,
  albumTop: 44,
  transportTop: 76,
  trackNoTop: 152,
} as const;
/** 四角括号在封面外扩 8 处，每个角的臂长 14（含线宽）。 */
export const BRACKET_OUTSET = 8;
export const BRACKET_ARM = 14;

export interface Positioned {
  readonly text: string;
  readonly style: CSSProperties;
}

export interface DialLayout {
  /** 传输键的缩放：有罗盘时跟罗盘，narrow 档固定 0.8。 */
  readonly scale: number;
  readonly cover: { readonly left: number; readonly top: number; readonly size: number };
  readonly album: CSSProperties;
  readonly trackNo: CSSProperties;
  readonly transport: CSSProperties;
  readonly rings: readonly { readonly radius: number; readonly style: CSSProperties }[];
  readonly ticks: readonly Positioned[];
}

/** 有罗盘时（版心的各档）的罗盘排法。编排器算盒子时用同一份，别各算各的。 */
export function dialLayout(dial: DialPlacement): DialLayout {
  const s = dial.scale;
  const cover = COVER_SIZE * s;
  const textLeft = dial.x - TEXT_HALF_WIDTH * s;
  const textWidth = TEXT_HALF_WIDTH * 2 * s;
  return {
    scale: s,
    cover: { left: dial.x - cover / 2, top: dial.y - cover / 2, size: cover },
    album: { left: textLeft, top: dial.y + ALBUM_TOP * s, width: textWidth },
    trackNo: { left: textLeft, top: dial.y + TRACK_NO_TOP * s, width: textWidth },
    transport: {
      left: dial.x - (TRANSPORT.width * s) / 2,
      top: dial.y + dial.transportOffset - (TRANSPORT.height * s) / 2,
    },
    rings: RINGS.map((radius) => ({
      radius,
      style: { left: dial.x, top: dial.y, width: radius * 2 * s, height: radius * 2 * s },
    })),
    ticks: TICKS.map((tick) => ({
      text: tick.text,
      style: {
        left: dial.x + (tick.x - DIAL_CENTER.x) * s,
        top: dial.y + (tick.y - DIAL_CENTER.y) * s,
      },
    })),
  };
}

/** narrow 档没有罗盘：单栏里封面与右侧文字列的排法。 */
export function narrowLayout(column: { x: number; width: number }): DialLayout {
  const { x, width } = column;
  const right = x + NARROW.cover + NARROW.gap;
  const textWidth = width - NARROW.cover - NARROW.gap;
  const transportLeft = Math.min(right, x + width - TRANSPORT.width * COMPACT_SCALE);
  return {
    scale: COMPACT_SCALE,
    cover: { left: x, top: NARROW.top, size: NARROW.cover },
    album: { left: right, top: NARROW.albumTop, width: textWidth },
    trackNo: { left: right, top: NARROW.trackNoTop, width: textWidth },
    transport: { left: transportLeft, top: NARROW.transportTop },
    rings: [],
    ticks: [],
  };
}
