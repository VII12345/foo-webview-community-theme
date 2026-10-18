import type { PaperTier } from './paperTiers.ts';
import type { ImmersiveScene } from '../page/immersivePrefs.ts';
import { panelsFor } from '../page/immersiveComponents.ts';

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

interface Band {
  readonly top: number;
  readonly height: number;
  readonly ids: readonly string[];
  /** 每个模块的实际高度；只给同一条带里高度不同的媒体行。 */
  readonly heights?: Readonly<Record<string, number>>;
}

const PAPER_BANDS: readonly Band[] = [
  { top: 82, height: 214, ids: ['right.header'] },
  { top: 296, height: 155, ids: ['right.meter'] },
  { top: 457, height: 224, ids: ['right.spectrum'] },
  { top: 705, height: 100, ids: ['right.waveform'] },
  {
    top: 828,
    height: 116,
    ids: ['right.gauges', 'right.fileInfo'],
    heights: { 'right.gauges': 100, 'right.fileInfo': 116 },
  },
];

const FOCUS_BANDS: readonly Band[] = [
  { top: 82, height: 214, ids: ['right.header'] },
  { top: 296, height: 155, ids: ['right.meter'] },
  { top: 460, height: 80, ids: ['right.waveform'] },
  {
    top: 552,
    height: 84,
    ids: ['right.gauges', 'right.fileInfo'],
    heights: { 'right.gauges': 84, 'right.fileInfo': 84 },
  },
];

const HEADER_BAND: Band = { top: 82, height: 214, ids: ['right.header'] };

function shownIn(
  scene: ImmersiveScene,
  tier: PaperTier,
  hidden: ReadonlySet<string>,
  id: string,
): boolean {
  return panelsFor(scene, tier).has(id as never) && !hidden.has(id);
}

function applyBands(
  bands: readonly Band[],
  scene: ImmersiveScene,
  tier: PaperTier,
  hidden: ReadonlySet<string>,
): { tops: Map<string, number>; offset: number } {
  const tops = new Map<string, number>();
  let offset = 0;
  for (const band of bands) {
    const visible = band.ids.filter((id) => shownIn(scene, tier, hidden, id));
    if (visible.length === 0) {
      offset += band.height;
      continue;
    }
    const top = band.top - offset;
    for (const id of visible) tops.set(id, top);
    const visibleHeight = Math.max(
      ...visible.map((id) => band.heights?.[id] ?? band.height),
    );
    offset += band.height - visibleHeight;
  }
  return { tops, offset };
}

/**
 * 纸面/聚焦/歌词/卡片全舞台的右栏 top。所有可见时返回的就是现有图纸坐标；
 * 隐藏一个块后，它后面的块按块高上移。纸面歌词卡返回两行卡的基准 964，组件再按单行 +36。
 */
export function stageRightTops(
  scene: ImmersiveScene,
  tier: PaperTier,
  hidden: ReadonlySet<string>,
): StageRightTops {
  if (scene === 'paper') {
    const { tops, offset } = applyBands(PAPER_BANDS, scene, tier, hidden);
    return {
      header: tops.get('right.header') ?? null,
      meter: tops.get('right.meter') ?? null,
      spectrum: tops.get('right.spectrum') ?? null,
      waveform: tops.get('right.waveform') ?? null,
      media:
        tops.get('right.gauges') ?? tops.get('right.fileInfo') ?? null,
      gauges: tops.get('right.gauges') ?? null,
      fileInfo: tops.get('right.fileInfo') ?? null,
      lyrics: 964 - offset,
    };
  }
  if (scene === 'focus') {
    const { tops, offset } = applyBands(FOCUS_BANDS, scene, tier, hidden);
    return {
      header: tops.get('right.header') ?? null,
      meter: tops.get('right.meter') ?? null,
      spectrum: null,
      waveform: tops.get('right.waveform') ?? null,
      media:
        tops.get('right.gauges') ?? tops.get('right.fileInfo') ?? null,
      gauges: tops.get('right.gauges') ?? null,
      fileInfo: tops.get('right.fileInfo') ?? null,
      lyrics: 700 - offset,
    };
  }
  // lyrics / card / cardLyrics：header 与 768×660 动画歌词两带；cardLyrics 没有 header。
  let offset = 0;
  let header: number | null = null;
  if (shownIn(scene, tier, hidden, 'right.header')) {
    header = HEADER_BAND.top;
  } else if (panelsFor(scene, tier).has('right.header')) {
    offset += HEADER_BAND.height;
  }
  return {
    header,
    meter: null,
    spectrum: null,
    waveform: null,
    media: null,
    gauges: null,
    fileInfo: null,
    lyrics: 300 - offset,
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
  const available = panelsFor(scene, 'full');
  const show = (id: string) => available.has(id as never) && !hidden.has(id);
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
