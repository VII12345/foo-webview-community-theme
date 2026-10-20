import type { CSSProperties } from 'react';
import {
  groupVisible,
  moduleHidden,
  type ImmersivePanelId,
} from '../page/immersiveComponents.ts';
import type { ImmersiveScene } from '../page/immersivePrefs.ts';
import {
  cardTops,
  sheetBoxes,
  stageRightBoxes,
  type StageBox,
} from '../paper/paperComponentLayout.ts';
import { STAGE_COVER, STAGE_DIAL, STAGE_TRANSPORT } from '../paper/paperStage.ts';
import { STAGE_CARD_COVER } from '../dial/stageCard.ts';
import type { PaperTier } from '../paper/paperTiers.ts';
import {
  placementKey,
  type ImmersivePlacement,
  type ImmersivePlacements,
} from './immersivePlacement.ts';

/**
 * 沉浸视图各组件的盒子与摆放。
 *
 * 默认盒子由布局算出来（`paperComponentLayout.ts`）：右栏按行排布、卡片左区竖着排、罗盘那几件按图纸坐标。
 * 用户在编排器里挪过、改过大小的组件，这里按覆盖算成最终盒子；没动过的沿用默认。
 *
 * 覆盖以"平移 + 按比例缩放"落在组件自己的定位上：组件内部照旧按舞台坐标排，外层套一层
 * `translate() scale()`，所以挪动与改大小都不用动组件内部的排版。
 */

/** 罗盘那几件在图纸上的盒子。 */
const DIAL_BOXES: Readonly<Record<string, StageBox>> = {
  'dial.rings': { x: STAGE_DIAL.x - 440, y: STAGE_DIAL.y - 440, w: 880, h: 880 },
  'dial.orbit': { x: STAGE_DIAL.x - 450, y: STAGE_DIAL.y - 450, w: 900, h: 900 },
  'dial.ticks': { x: 0, y: 143, w: 690, h: 615 },
  'dial.albumText': { x: 150, y: 232, w: 460, h: 24 },
  'dial.cover': { x: STAGE_COVER.x, y: STAGE_COVER.y, w: STAGE_COVER.size, h: STAGE_COVER.size },
  'dial.brackets': {
    x: STAGE_COVER.x - 2,
    y: STAGE_COVER.y - 2,
    w: STAGE_COVER.size + 4,
    h: STAGE_COVER.size + 4,
  },
  'dial.cells': { x: 150, y: 776, w: 480, h: 42 },
  'dial.transport': {
    x: STAGE_TRANSPORT.centers[0]! - STAGE_TRANSPORT.side / 2,
    y: STAGE_TRANSPORT.y - STAGE_TRANSPORT.play / 2,
    w: STAGE_TRANSPORT.centers[2]! - STAGE_TRANSPORT.centers[0]! + STAGE_TRANSPORT.side,
    h: STAGE_TRANSPORT.play,
  },
};

/** 卡片左区那几件在图纸上的盒子。 */
const CARD_BOXES: Readonly<Record<string, StageBox>> = {
  'card.cover': {
    x: STAGE_CARD_COVER.x,
    y: STAGE_CARD_COVER.y,
    w: STAGE_CARD_COVER.size,
    h: STAGE_CARD_COVER.size,
  },
  'card.titleText': { x: 250, y: 700, w: 300, h: 36 },
  'card.artist': { x: 250, y: 736, w: 300, h: 24 },
  'card.rating': { x: 500, y: 700, w: 130, h: 40 },
  'card.more': { x: 670, y: 700, w: 40, h: 40 },
  'card.seek': { x: 250, y: 766, w: 460, h: 40 },
  'card.transport': { x: 312, y: 806, w: 336, h: 80 },
  'card.cells': { x: 250, y: 930, w: 460, h: 48 },
};

/** 罗盘整体在歌词视图里右移 100（`PaperScene.tsx` 的 `lyricsDialOffset`）。 */
function dialOffsetX(scene: ImmersiveScene): number {
  return scene === 'lyrics' ? 100 : 0;
}

/**
 * 这一组里各组件的默认盒子。可见性之外的模块也给盒子——编排器里要能看见并拖动它们。
 */
export function defaultBoxes(
  scene: ImmersiveScene,
  tier: PaperTier,
  hidden: ReadonlySet<string>,
): ReadonlyMap<ImmersivePanelId, StageBox> {
  const boxes = new Map<ImmersivePanelId, StageBox>();
  for (const [id, box] of stageRightBoxes(scene, tier, hidden)) {
    boxes.set(id, box);
  }
  if (tier === 'full') {
    if (scene === 'card' || scene === 'cardLyrics') {
      const tops = cardTops(scene, hidden);
      for (const [id, box] of Object.entries(CARD_BOXES)) {
        if (id === 'card.cover' && tops.cover === null) continue;
        if (id === 'card.seek' && tops.seek === null) continue;
        if (id === 'card.transport' && tops.transport === null) continue;
        if (id === 'card.cells' && tops.cells === null) continue;
        boxes.set(id as ImmersivePanelId, box);
      }
    } else {
      const shift = dialOffsetX(scene);
      for (const [id, box] of Object.entries(DIAL_BOXES)) {
        boxes.set(id as ImmersivePanelId, shift ? { ...box, x: box.x + shift } : box);
      }
    }
  } else {
    // 版心各档：右栏与罗盘那几件按版心坐标排。
    for (const [id, box] of sheetBoxes(tier, hidden)) boxes.set(id, box);
  }
  return boxes;
}

/** 这一组里可以摆放的模块（叶子，不含父组）。 */
export function placeablePanels(
  scene: ImmersiveScene,
  tier: PaperTier,
): readonly ImmersivePanelId[] {
  const seen = new Set<ImmersivePanelId>();
  for (const id of defaultBoxes(scene, tier, new Set()).keys()) seen.add(id);
  return [...seen];
}

/** 覆盖里没有的项沿用默认盒子；偏移量与比例按默认盒子展开成绝对盒子。 */
export function resolvedBox(
  box: StageBox,
  override: ImmersivePlacement | undefined,
): StageBox {
  if (!override) return box;
  return {
    x: box.x + (override.dx ?? 0),
    y: box.y + (override.dy ?? 0),
    w: box.w * (override.sw ?? 1),
    h: box.h * (override.sh ?? 1),
  };
}

/**
 * 覆盖落在组件上的变换：从默认盒子平移到目标盒子，并按目标与默认的比例缩放。
 * 缩放的原点取默认盒子的左上角，缩放就在原地发生。
 */
export function placementTransform(
  box: StageBox | undefined,
  override: ImmersivePlacement | undefined,
): CSSProperties | undefined {
  if (!box || !override) return undefined;
  const target = resolvedBox(box, override);
  const scaleX = box.w > 0 ? target.w / box.w : 1;
  const scaleY = box.h > 0 ? target.h / box.h : 1;
  const dx = target.x - box.x;
  const dy = target.y - box.y;
  if (dx === 0 && dy === 0 && scaleX === 1 && scaleY === 1) return undefined;
  return {
    transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`,
    transformOrigin: `${box.x}px ${box.y}px`,
  };
}

/**
 * 覆盖落在**元素自己**上的变换：平移与缩放，原点取元素自己的左上角（也就是默认盒子的角）。
 * 版心右栏的块已经按盒子绝对定位了，变换直接加在块上，不必再套一层定位层。
 * 给了次序的按次序叠放（`z-index`），与 `Placed` 那一套一致。
 */
export function placementStyle(
  box: StageBox | undefined,
  override: ImmersivePlacement | undefined,
): CSSProperties | undefined {
  if (!box || !override) return undefined;
  const dx = override.dx ?? 0;
  const dy = override.dy ?? 0;
  const sw = override.sw ?? 1;
  const sh = override.sh ?? 1;
  const order = override.order;
  if (dx === 0 && dy === 0 && sw === 1 && sh === 1 && order === undefined) return undefined;
  return {
    transform: `translate(${dx}px, ${dy}px) scale(${sw}, ${sh})`,
    transformOrigin: '0 0',
    ...(order === undefined ? null : { zIndex: order }),
  };
}

/**
 * 一个目标盒子写成覆盖：相对默认盒子的偏移与比例。
 * 编排器拖出来的绝对位置经这里转成偏移量，窗口怎么变都不漂。
 */
export function placementFor(
  box: StageBox,
  target: StageBox,
): ImmersivePlacement {
  return {
    dx: target.x - box.x,
    dy: target.y - box.y,
    sw: box.w > 0 ? target.w / box.w : 1,
    sh: box.h > 0 ? target.h / box.h : 1,
  };
}

/** 这一组的覆盖。 */
export function placementsFor(
  placements: ImmersivePlacements,
  scene: ImmersiveScene,
  tier: PaperTier,
): Readonly<Record<string, ImmersivePlacement>> {
  return placements.groups[placementKey(scene, tier)] ?? {};
}

/** 组件当前是否可见（编排器里看不见的组件也列出来，标成已隐藏）。 */
export function panelVisible(
  scene: ImmersiveScene,
  tier: PaperTier,
  hidden: ReadonlySet<string>,
  id: ImmersivePanelId,
): boolean {
  return groupVisible(scene, tier, hidden, id) && !moduleHidden(hidden, id);
}
