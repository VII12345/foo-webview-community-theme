/**
 * 歌词拖动/滚轮预览的纯计算与状态名。界面只消费这些结果，不在 React 状态里做手势判断。
 */
export type PreviewPhase = 'idle' | 'pressing' | 'dragging' | 'holding';

/** 按下后移动超过这么多像素才算拖动，避免点击歌词时闪一下预览。 */
export const DRAG_THRESHOLD_PX = 4;
/** 滚轮累计多少像素换一行；触控板的小增量会先攒着。 */
export const WHEEL_STEP_PX = 40;
/** 松开/最后一次滚轮后预览保留多久。 */
export const PREVIEW_HOLD_MS = 3000;

export function clampPreviewIndex(index: number, lineCount: number): number {
  return Math.min(Math.max(index, 0), Math.max(0, lineCount - 1));
}

/** 向上拖（clientY 变小）去后面的行；返回相对按下位置的行数。 */
export function previewShift(startY: number, clientY: number, lineHeight: number): number {
  if (!(lineHeight > 0)) return 0;
  return Math.round((startY - clientY) / lineHeight);
}

/**
 * 把滚轮增量换成整行步数。`deltaMode` 0 是像素、1 是行、2 是页；行/页按固定步长折成像素，
 * 让鼠标滚轮与触控板都能用同一套累计。向下滚是后面的行。
 */
export function wheelSteps(
  accumulator: number,
  deltaY: number,
  deltaMode: number,
  viewportHeight: number,
): { steps: number; remainder: number } {
  const pixels =
    deltaMode === 1 ? deltaY * WHEEL_STEP_PX : deltaMode === 2 ? deltaY * viewportHeight : deltaY;
  if (!Number.isFinite(pixels) || pixels === 0) return { steps: 0, remainder: accumulator };
  // 触控板一次只给几像素；方向翻转时先把反向的余量清掉，免得来回抵消。
  const base = accumulator !== 0 && Math.sign(pixels) !== Math.sign(accumulator) ? 0 : accumulator;
  const total = base + pixels;
  const steps = Math.trunc(total / WHEEL_STEP_PX);
  return { steps, remainder: total - steps * WHEEL_STEP_PX };
}
