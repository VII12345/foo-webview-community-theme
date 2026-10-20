import type { PaperTier } from './paperTiers.ts';
import type { ImmersiveScene } from '../page/immersivePrefs.ts';
import {
  groupVisible,
  moduleHidden,
  panelsFor,
  type ImmersivePanelId,
} from '../page/immersiveComponents.ts';
import { STAGE_TITLE } from './paperStage.ts';

/** 舞台坐标的盒子：左上角与宽高。 */
export interface StageBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * 右栏里的一格。横向排开的一组格子构成一行；格子可以固定左缘、靠右缘、跟着另一格同一列，
 * 也可以在流动的行里接着上一格排。
 */
interface Cell {
  readonly id: ImmersivePanelId;
  /** 左缘；流动的行里由上一格推进。 */
  readonly x?: number;
  /** 右缘；右对齐的件从右往左排。 */
  readonly right?: number;
  /** 与另一格同一列（声压格与专辑艺人格）。 */
  readonly with?: ImmersivePanelId;
  readonly w: number;
  readonly h: number;
  /** 与下一格之间的空当。 */
  readonly gap?: number;
}

/**
 * 右栏里的一行。一行的高度就是这一行里可见格子的最大高：整行的格子都藏了，这一行收成 0，
 * 后面的行跟着上移——藏一个组件不留空白就是这么来的。
 */
interface Row {
  readonly cells: readonly Cell[];
  /** 行顶与上一行底之间的空当。 */
  readonly gap: number;
  /** 行内的格子横向流动：藏掉一格，后面的跟着左移。 */
  readonly flow?: boolean;
  /** 固定行顶（不接上面的流）。 */
  readonly top?: number;
}

/** 四行字：From 行、标题行、By 行（Quality 与 By 同行）。三行之和 214，82→296。 */
const HEADER_ROWS: readonly Row[] = [
  { cells: [{ id: 'right.header.from', x: 1000, w: 860, h: 26 }], gap: 0 },
  { cells: [{ id: 'right.header.title', x: 1000, w: STAGE_TITLE.width, h: 114 }], gap: 0 },
  {
    cells: [
      { id: 'right.header.by', x: 1000, w: 640, h: 74 },
      { id: 'right.header.quality', right: 1860, w: 220, h: 74 },
    ],
    gap: 0,
  },
];

/**
 * 仪表行：声场 | BPM | 耳机声压（下面上下排 Album artist）| Duration。
 * 四格横向流动：藏掉一格，后面的跟着左移，不再留一段空当。
 */
const METER_ROW: Row = {
  cells: [
    { id: 'right.meter.stereo', x: 760, w: 332, h: 155, gap: 48 },
    { id: 'right.meter.bpm', x: 1140, w: 136, h: 155, gap: 60 },
    { id: 'right.meter.soundPressure', x: 1336, w: 299, h: 155 },
    { id: 'right.meter.albumArtist', with: 'right.meter.soundPressure', w: 299, h: 40 },
    { id: 'right.meter.duration', right: 1780, w: 145, h: 155 },
  ],
  gap: 0,
  flow: true,
};

/** 右栏媒体行：量表与文件信息并排。行高取可见格子的最大高。 */
const MEDIA_ROW = (gap: number, gaugesH: number, fileInfoH: number): Row => ({
  cells: [
    { id: 'right.gauges', x: 760, w: 532, h: gaugesH },
    { id: 'right.fileInfo', x: 1360, w: 420, h: fileInfoH },
  ],
  gap,
});

/** 频谱与整轨波形两行：整块可见或整块收掉。 */
const SPECTRUM_ROW: Row = {
  cells: [{ id: 'right.spectrum', x: 760, w: 1020, h: 224 }],
  gap: 6,
};
const WAVEFORM_ROW = (gap: number, h: number): Row => ({
  cells: [{ id: 'right.waveform', x: 760, w: 1020, h }],
  gap,
});

/** 纸面档底部那行歌词卡：跟着上面的块走，藏在最底下。 */
const LYRIC_CARD_ROW: Row = {
  cells: [{ id: 'right.lyrics', x: 760, w: 406, h: 78 }],
  gap: 20,
};

/** 聚焦档底部的聚焦歌词日志。 */
const FOCUS_LYRICS_ROW: Row = {
  cells: [{ id: 'right.lyrics', x: 760, w: 906, h: 230 }],
  gap: 64,
};

/** 歌词、卡片、卡片歌词三档的动画歌词：右半区整块，位置固定。 */
const ANIMATED_LYRICS_ROW: Row = {
  cells: [{ id: 'right.lyrics', x: 1152, w: 768, h: 660 }],
  gap: 4,
  top: 300,
};

function rowsFor(scene: ImmersiveScene, tier: PaperTier): readonly Row[] {
  if (scene === 'paper') {
    if (tier !== 'full') return [];
    return [
      ...HEADER_ROWS,
      METER_ROW,
      SPECTRUM_ROW,
      WAVEFORM_ROW(24, 100),
      MEDIA_ROW(23, 100, 116),
      LYRIC_CARD_ROW,
    ];
  }
  if (scene === 'focus') {
    if (tier !== 'full') return [];
    return [
      ...HEADER_ROWS,
      METER_ROW,
      WAVEFORM_ROW(9, 80),
      MEDIA_ROW(12, 84, 84),
      FOCUS_LYRICS_ROW,
    ];
  }
  // 歌词 / 卡片 / 卡片歌词：四行字在右半顶部，动画歌词整块占右半。
  const rows: Row[] = [];
  if (panelsFor(scene, tier).has('right.header')) rows.push(...HEADER_ROWS);
  rows.push(ANIMATED_LYRICS_ROW);
  return rows;
}

/**
 * 右栏每个模块的盒子。可见的按行排布，藏掉的行整行收掉，后面的跟着上移；
 * 行内的格子横向流动，藏掉一格后面的左移。全可见时就是现有的图纸坐标。
 */
export function stageRightBoxes(
  scene: ImmersiveScene,
  tier: PaperTier,
  hidden: ReadonlySet<string>,
): ReadonlyMap<ImmersivePanelId, StageBox> {
  const boxes = new Map<ImmersivePanelId, StageBox>();
  let cursor = 82;
  for (const row of rowsFor(scene, tier)) {
    const top = row.top ?? cursor + row.gap;
    const visible = row.cells.filter((cell) => !moduleHidden(hidden, cell.id));
    if (visible.length === 0) {
      cursor = top;
      continue;
    }
    const placed = new Map<ImmersivePanelId, number>();
    let flowX = Number.NaN;
    let height = 0;
    for (const cell of visible) {
      let x: number;
      if (cell.right !== undefined) x = cell.right - cell.w;
      else if (cell.with !== undefined) x = placed.get(cell.with) ?? cell.x ?? 0;
      else if (row.flow && !Number.isNaN(flowX)) x = flowX;
      else x = cell.x ?? 0;
      placed.set(cell.id, x);
      boxes.set(cell.id, { x, y: top, w: cell.w, h: cell.h });
      height = Math.max(height, cell.h);
      flowX = x + cell.w + (cell.gap ?? 0);
    }
    cursor = top + height;
  }
  return boxes;
}

/** full 舞台右侧可重排的纵向块。 */
export interface StageRightTops {
  readonly header: number | null;
  readonly meter: number | null;
  readonly spectrum: number | null;
  readonly waveform: number | null;
  readonly media: number | null;
  readonly gauges: number | null;
  readonly fileInfo: number | null;
  /** 纸面歌词卡/聚焦歌词/动画歌词面板的基准 top；纸面歌词卡内部再按单行/两行微调。 */
  readonly lyrics: number;
}

/**
 * 纸面/聚焦/歌词/卡片/卡片歌词全舞台的右栏 top。隐藏一个块后，它后面的块按块高上移。
 * 纸面歌词卡返回两行卡的基准 964，组件再按单行 +36。
 */
export function stageRightTops(
  scene: ImmersiveScene,
  tier: PaperTier,
  hidden: ReadonlySet<string>,
): StageRightTops {
  const boxes = stageRightBoxes(scene, tier, hidden);
  // 一行里可能有好几个格子（仪表行四格、四行字三行），行顶取第一个可见的。
  const topOf = (...ids: readonly ImmersivePanelId[]): number | null => {
    for (const id of ids) {
      const box = boxes.get(id);
      if (box) return box.y;
    }
    return null;
  };
  if (scene === 'paper' || scene === 'focus') {
    return {
      header: topOf('right.header.from', 'right.header.title', 'right.header.by'),
      meter: topOf(
        'right.meter.stereo',
        'right.meter.bpm',
        'right.meter.soundPressure',
        'right.meter.duration',
      ),
      spectrum: topOf('right.spectrum'),
      waveform: topOf('right.waveform'),
      media: topOf('right.gauges') ?? topOf('right.fileInfo'),
      gauges: topOf('right.gauges'),
      fileInfo: topOf('right.fileInfo'),
      lyrics: boxes.get('right.lyrics')?.y ?? 0,
    };
  }
  return {
    header: topOf('right.header.from', 'right.header.title', 'right.header.by'),
    meter: null,
    spectrum: null,
    waveform: null,
    media: null,
    gauges: null,
    fileInfo: null,
    lyrics: boxes.get('right.lyrics')?.y ?? 0,
  };
}

/** 卡片左区的纵向流。只返回可见模块的 top；隐藏的模块给 null。 */
export interface CardTops {
  readonly cover: number | null;
  readonly meta: number | null;
  readonly seek: number | null;
  readonly transport: number | null;
  readonly cells: number | null;
  /** 第一个可见模块的 top；全隐藏时 null。 */
  readonly top: number | null;
  /** 最后一个可见模块的 bottom；全隐藏时 null。 */
  readonly bottom: number | null;
}

export function cardTops(
  scene: ImmersiveScene,
  hidden: ReadonlySet<string>,
): CardTops {
  const show = (id: ImmersivePanelId) => groupVisible(scene, 'full', hidden, id);
  let cursor = 220;
  const cover = show('card.cover') ? cursor : null;
  if (cover !== null) cursor += 480; // 460 封面 + 20 间隔
  const title = scene === 'cardLyrics' && show('card.title');
  const actions = show('card.rating') || show('card.more');
  const metaHeight =
    title && actions
      ? 66
      : title
        ? 60
        : actions
          ? scene === 'card' ? 66 : 40
          : 0;
  const meta = metaHeight > 0 ? cursor : null;
  cursor += metaHeight;
  const seek = show('card.seek') ? cursor : null;
  if (seek !== null) cursor += 40;
  const transport = show('card.transport') ? cursor : null;
  if (transport !== null) cursor += 124; // 80 高 + 44 间隔
  const cells = show('card.cells') ? cursor : null;

  const top = cover ?? meta ?? seek ?? transport ?? cells;
  let bottom: number | null = null;
  if (cells !== null) bottom = cells + 48;
  else if (transport !== null) bottom = transport + 80;
  else if (seek !== null) bottom = seek + 40;
  else if (meta !== null) bottom = meta + metaHeight;
  else if (cover !== null) bottom = cover + 460;
  return { cover, meta, seek, transport, cells, top, bottom };
}
