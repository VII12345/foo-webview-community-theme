import type { Atom } from 'jotai/vanilla';
import type { MessageKey } from '../../i18n/en.ts';
import {
  browserStorage,
  defineLocalPref,
  recordOf,
  storedRecord,
  type LocalPref,
  type PrefStorage,
} from '../../kit/localPref.ts';
import type { Store } from '../../kit/store.ts';
import type { PaperTier } from '../paper/paperTiers.ts';
import type { ImmersiveScene } from './immersivePrefs.ts';

/**
 * 沉浸视图的可视模块。父组（`decor`、`right.header` 等）保留给旧存档与布局判断；
 * 设置页只列叶子项，叶子细到每个可见元素。新增模块只往这里加值，旧存档缺的字段按可见处理。
 */
export const IMMERSIVE_PANEL_IDS = [
  'wash',
  'terrain',
  'ruler',
  'decor',
  'decor.grid',
  'decor.arcs',
  'marks',
  'pad',
  'dial.rings',
  'dial.orbit',
  'dial.ticks',
  'dial.album',
  'dial.albumText',
  'dial.trackNo',
  'dial.cover',
  'dial.brackets',
  'dial.cells',
  'dial.cell.date',
  'dial.cell.track',
  'dial.cell.label',
  'dial.transport',
  'card.cover',
  'card.title',
  'card.titleText',
  'card.artist',
  'card.rating',
  'card.more',
  'card.seek',
  'card.transport',
  'card.cells',
  'card.cell.date',
  'card.cell.track',
  'card.cell.label',
  'right.header',
  'right.header.from',
  'right.header.title',
  'right.header.by',
  'right.header.quality',
  'right.meter',
  'right.meter.stereo',
  'right.meter.bpm',
  'right.meter.soundPressure',
  'right.meter.albumArtist',
  'right.meter.duration',
  'right.spectrum',
  'right.waveform',
  'right.gauges',
  'right.gauges.dynamicRange',
  'right.gauges.loudness',
  'right.fileInfo',
  'right.fileInfo.sampleRate',
  'right.fileInfo.bitDepth',
  'right.fileInfo.channels',
  'right.fileInfo.bitrate',
  'right.fileInfo.fileSize',
  'right.fileInfo.format',
  'right.footnote',
  'right.meta',
  'right.meta.stereo',
  'right.meta.soundPressure',
  'right.meta.year',
  'right.meta.label',
  'right.meta.duration',
  'right.meta.elapsed',
  'right.lyrics',
  'right.lyrics.main',
  'right.lyrics.sub',
  'right.lyrics.source',
  'right.lyrics.status',
] as const;

export type ImmersivePanelId = (typeof IMMERSIVE_PANEL_IDS)[number];

/** 父组 → 子项。旧存档里的父 ID 通过祖先判断继续隐藏整组。 */
export const IMMERSIVE_PANEL_CHILDREN: Readonly<
  Partial<Record<ImmersivePanelId, readonly ImmersivePanelId[]>>
> = {
  decor: ['decor.grid', 'decor.arcs'],
  'dial.album': ['dial.albumText', 'dial.trackNo'],
  'dial.cells': ['dial.cell.date', 'dial.cell.track', 'dial.cell.label'],
  'card.title': ['card.titleText', 'card.artist'],
  'card.cells': ['card.cell.date', 'card.cell.track', 'card.cell.label'],
  'right.header': [
    'right.header.from',
    'right.header.title',
    'right.header.by',
    'right.header.quality',
  ],
  'right.meter': [
    'right.meter.stereo',
    'right.meter.bpm',
    'right.meter.soundPressure',
    'right.meter.albumArtist',
    'right.meter.duration',
  ],
  'right.meta': [
    'right.meta.stereo',
    'right.meta.soundPressure',
    'right.meta.year',
    'right.meta.label',
    'right.meta.duration',
    'right.meta.elapsed',
  ],
  'right.gauges': ['right.gauges.dynamicRange', 'right.gauges.loudness'],
  'right.fileInfo': [
    'right.fileInfo.sampleRate',
    'right.fileInfo.bitDepth',
    'right.fileInfo.channels',
    'right.fileInfo.bitrate',
    'right.fileInfo.fileSize',
    'right.fileInfo.format',
  ],
  'right.lyrics': [
    'right.lyrics.main',
    'right.lyrics.sub',
    'right.lyrics.source',
    'right.lyrics.status',
  ],
};

const PARENT_OF: Readonly<Partial<Record<ImmersivePanelId, ImmersivePanelId>>> = Object.entries(
  IMMERSIVE_PANEL_CHILDREN,
).reduce<Partial<Record<ImmersivePanelId, ImmersivePanelId>>>((map, [parent, children]) => {
  for (const child of children) map[child] = parent as ImmersivePanelId;
  return map;
}, {});

export const IMMERSIVE_PANEL_LABELS: Readonly<Record<ImmersivePanelId, MessageKey>> = {
  wash: 'settings.immersivePanelWash',
  terrain: 'settings.immersivePanelTerrain',
  ruler: 'settings.immersivePanelRuler',
  decor: 'settings.immersivePanelDecor',
  'decor.grid': 'settings.immersivePanelDecorGrid',
  'decor.arcs': 'settings.immersivePanelDecorArcs',
  marks: 'settings.immersivePanelMarks',
  pad: 'settings.immersivePanelPad',
  'dial.rings': 'settings.immersivePanelDialRings',
  'dial.orbit': 'settings.immersivePanelDialOrbit',
  'dial.ticks': 'settings.immersivePanelDialTicks',
  'dial.album': 'settings.immersivePanelDialAlbum',
  'dial.albumText': 'settings.immersivePanelDialAlbumText',
  'dial.trackNo': 'settings.immersivePanelDialTrackNo',
  'dial.cover': 'settings.immersivePanelDialCover',
  'dial.brackets': 'settings.immersivePanelDialBrackets',
  'dial.cells': 'settings.immersivePanelDialCells',
  'dial.cell.date': 'settings.immersivePanelDialDate',
  'dial.cell.track': 'settings.immersivePanelDialTrack',
  'dial.cell.label': 'settings.immersivePanelDialLabel',
  'dial.transport': 'settings.immersivePanelDialTransport',
  'card.cover': 'settings.immersivePanelCardCover',
  'card.title': 'settings.immersivePanelCardTitle',
  'card.titleText': 'settings.immersivePanelCardTitleText',
  'card.artist': 'settings.immersivePanelCardArtist',
  'card.rating': 'settings.immersivePanelCardRating',
  'card.more': 'settings.immersivePanelCardMore',
  'card.seek': 'settings.immersivePanelCardSeek',
  'card.transport': 'settings.immersivePanelCardTransport',
  'card.cells': 'settings.immersivePanelCardCells',
  'card.cell.date': 'settings.immersivePanelCardDate',
  'card.cell.track': 'settings.immersivePanelCardTrack',
  'card.cell.label': 'settings.immersivePanelCardLabel',
  'right.header': 'settings.immersivePanelRightHeader',
  'right.header.from': 'settings.immersivePanelRightHeaderFrom',
  'right.header.title': 'settings.immersivePanelRightHeaderTitle',
  'right.header.by': 'settings.immersivePanelRightHeaderBy',
  'right.header.quality': 'settings.immersivePanelRightHeaderQuality',
  'right.meter': 'settings.immersivePanelRightMeter',
  'right.meter.stereo': 'settings.immersivePanelRightMeterStereo',
  'right.meter.bpm': 'settings.immersivePanelRightMeterBpm',
  'right.meter.soundPressure': 'settings.immersivePanelRightMeterSoundPressure',
  'right.meter.albumArtist': 'settings.immersivePanelRightMeterAlbumArtist',
  'right.meter.duration': 'settings.immersivePanelRightMeterDuration',
  'right.spectrum': 'settings.immersivePanelRightSpectrum',
  'right.waveform': 'settings.immersivePanelRightWaveform',
  'right.gauges': 'settings.immersivePanelRightGauges',
  'right.gauges.dynamicRange': 'settings.immersivePanelRightGaugesDynamicRange',
  'right.gauges.loudness': 'settings.immersivePanelRightGaugesLoudness',
  'right.fileInfo': 'settings.immersivePanelRightFileInfo',
  'right.fileInfo.sampleRate': 'settings.immersivePanelRightFileInfoSampleRate',
  'right.fileInfo.bitDepth': 'settings.immersivePanelRightFileInfoBitDepth',
  'right.fileInfo.channels': 'settings.immersivePanelRightFileInfoChannels',
  'right.fileInfo.bitrate': 'settings.immersivePanelRightFileInfoBitrate',
  'right.fileInfo.fileSize': 'settings.immersivePanelRightFileInfoFileSize',
  'right.fileInfo.format': 'settings.immersivePanelRightFileInfoFormat',
  'right.footnote': 'settings.immersivePanelRightFootnote',
  'right.meta': 'settings.immersivePanelRightMeta',
  'right.meta.stereo': 'settings.immersivePanelRightMetaStereo',
  'right.meta.soundPressure': 'settings.immersivePanelRightMetaSoundPressure',
  'right.meta.year': 'settings.immersivePanelRightMetaYear',
  'right.meta.label': 'settings.immersivePanelRightMetaLabel',
  'right.meta.duration': 'settings.immersivePanelRightMetaDuration',
  'right.meta.elapsed': 'settings.immersivePanelRightMetaElapsed',
  'right.lyrics': 'settings.immersivePanelRightLyrics',
  'right.lyrics.main': 'settings.immersivePanelRightLyricsMain',
  'right.lyrics.sub': 'settings.immersivePanelRightLyricsSub',
  'right.lyrics.source': 'settings.immersivePanelRightLyricsSource',
  'right.lyrics.status': 'settings.immersivePanelRightLyricsStatus',
};

export interface ImmersivePanelGroup {
  readonly id: string;
  readonly label: MessageKey;
  readonly panels: readonly ImmersivePanelId[];
}

export const IMMERSIVE_PANEL_GROUPS: readonly ImmersivePanelGroup[] = [
  {
    id: 'background',
    label: 'settings.immersiveComponentsBackground',
    panels: ['wash', 'terrain', 'ruler', 'decor.grid', 'decor.arcs', 'marks', 'pad'],
  },
  {
    id: 'dial',
    label: 'settings.immersiveComponentsDial',
    panels: [
      'dial.rings',
      'dial.orbit',
      'dial.ticks',
      'dial.albumText',
      'dial.trackNo',
      'dial.cover',
      'dial.brackets',
      'dial.cell.date',
      'dial.cell.track',
      'dial.cell.label',
      'dial.transport',
    ],
  },
  {
    id: 'card',
    label: 'settings.immersiveComponentsCard',
    panels: [
      'card.cover',
      'card.titleText',
      'card.artist',
      'card.rating',
      'card.more',
      'card.seek',
      'card.transport',
      'card.cell.date',
      'card.cell.track',
      'card.cell.label',
    ],
  },
  {
    id: 'header',
    label: 'settings.immersiveComponentsHeader',
    panels: [
      'right.header.from',
      'right.header.title',
      'right.header.by',
      'right.header.quality',
    ],
  },
  {
    id: 'meter',
    label: 'settings.immersiveComponentsMeter',
    panels: [
      'right.meter.stereo',
      'right.meter.bpm',
      'right.meter.soundPressure',
      'right.meter.albumArtist',
      'right.meter.duration',
    ],
  },
  {
    id: 'meta',
    label: 'settings.immersiveComponentsMeta',
    panels: [
      'right.meta.stereo',
      'right.meta.soundPressure',
      'right.meta.year',
      'right.meta.label',
      'right.meta.duration',
      'right.meta.elapsed',
    ],
  },
  {
    id: 'media',
    label: 'settings.immersiveComponentsMedia',
    panels: [
      'right.spectrum',
      'right.waveform',
      'right.gauges.dynamicRange',
      'right.gauges.loudness',
      'right.fileInfo.sampleRate',
      'right.fileInfo.bitDepth',
      'right.fileInfo.channels',
      'right.fileInfo.bitrate',
      'right.fileInfo.fileSize',
      'right.fileInfo.format',
      'right.footnote',
    ],
  },
  {
    id: 'lyrics',
    label: 'settings.immersiveComponentsLyrics',
    panels: [
      'right.lyrics',
      'right.lyrics.main',
      'right.lyrics.sub',
      'right.lyrics.source',
      'right.lyrics.status',
    ],
  },
];

export const IMMERSIVE_LAYOUTS: readonly PaperTier[] = [
  'full',
  'compact',
  'narrow',
  'portrait',
  'portrait-compact',
  'portrait-narrow',
];

const DIAL_SCENES = new Set<ImmersiveScene>(['paper', 'focus', 'lyrics']);
const CARD_SCENES = new Set<ImmersiveScene>(['card', 'cardLyrics']);

/**
 * 某个视图/布局实际可能出现的模块。父组与子项都列出来，布局判断用父组、设置页用 `isLeafPanel`
 * 过滤掉可展开的父组；不可用模块的存档保留但忽略。
 */
export function panelsFor(
  scene: ImmersiveScene,
  tier: PaperTier,
): ReadonlySet<ImmersivePanelId> {
  const panels = new Set<ImmersivePanelId>([
    'wash',
    'terrain',
    'decor',
    'decor.grid',
    'decor.arcs',
    'marks',
    'right.lyrics',
  ]);
  const card = CARD_SCENES.has(scene);
  const effectiveTier: PaperTier = card ? 'full' : tier;
  if (effectiveTier === 'full') panels.add('ruler');
  if (scene === 'paper' || scene === 'focus') panels.add('pad');
  if (scene === 'paper' && effectiveTier === 'full') {
    for (const id of [
      'right.lyrics.main',
      'right.lyrics.sub',
      'right.lyrics.source',
      'right.lyrics.status',
    ] as const)
      panels.add(id);
  }
  if (DIAL_SCENES.has(scene)) {
    for (const id of [
      'dial.album',
      'dial.albumText',
      'dial.cover',
      'dial.brackets',
      'dial.transport',
    ] as const)
      panels.add(id);
    if (effectiveTier !== 'full') panels.add('dial.trackNo');
    if (effectiveTier !== 'narrow') {
      panels.add('dial.rings');
      panels.add('dial.orbit');
      panels.add('dial.ticks');
    }
    if (effectiveTier === 'full') {
      for (const id of [
        'dial.cells',
        'dial.cell.date',
        'dial.cell.track',
        'dial.cell.label',
      ] as const)
        panels.add(id);
    }
  }
  if (card) {
    for (const id of [
      'card.cover',
      'card.rating',
      'card.more',
      'card.seek',
      'card.transport',
      'card.cells',
      'card.cell.date',
      'card.cell.track',
      'card.cell.label',
    ] as const)
      panels.add(id);
    if (scene === 'cardLyrics') {
      for (const id of ['card.title', 'card.titleText', 'card.artist'] as const)
        panels.add(id);
    }
  }
  if (!(scene === 'cardLyrics' && effectiveTier === 'full')) {
    for (const id of [
      'right.header',
      'right.header.from',
      'right.header.title',
      'right.header.by',
    ] as const)
      panels.add(id);
    // 窄档与竖版窄档的右栏只放 From / 标题 / By，Quality 不出。
    if (effectiveTier !== 'narrow' && effectiveTier !== 'portrait-narrow')
      panels.add('right.header.quality');
  }
  if ((scene === 'paper' || scene === 'focus') && effectiveTier === 'full') {
    for (const id of [
      'right.meter',
      'right.meter.stereo',
      'right.meter.bpm',
      'right.meter.soundPressure',
      'right.meter.albumArtist',
      'right.meter.duration',
    ] as const)
      panels.add(id);
  }
  if (scene === 'paper') panels.add('right.spectrum');
  if (scene === 'paper' || scene === 'focus') {
    panels.add('right.waveform');
    if (
      effectiveTier === 'full' ||
      effectiveTier === 'compact' ||
      effectiveTier === 'portrait' ||
      effectiveTier === 'portrait-compact'
    ) {
      for (const id of [
        'right.gauges',
        'right.gauges.dynamicRange',
        'right.gauges.loudness',
      ] as const)
        panels.add(id);
    }
    if (effectiveTier === 'full' || effectiveTier === 'portrait') {
      for (const id of [
        'right.fileInfo',
        'right.fileInfo.sampleRate',
        'right.fileInfo.bitDepth',
        'right.fileInfo.channels',
        'right.fileInfo.bitrate',
        'right.fileInfo.fileSize',
        'right.fileInfo.format',
      ] as const)
        panels.add(id);
    }
    if (
      effectiveTier === 'compact' ||
      effectiveTier === 'portrait' ||
      effectiveTier === 'portrait-compact'
    ) {
      panels.add('right.footnote');
      for (const id of [
        'right.meta',
        'right.meta.soundPressure',
        'right.meta.year',
        'right.meta.label',
        'right.meta.duration',
        'right.meta.elapsed',
      ] as const)
        panels.add(id);
      if (effectiveTier !== 'compact') panels.add('right.meta.stereo');
    }
  }
  return panels;
}

/** 设置页只列叶子：父组有可用子项时由子项代替。 */
export function isLeafPanel(
  scene: ImmersiveScene,
  tier: PaperTier,
  id: ImmersivePanelId,
): boolean {
  const available = panelsFor(scene, tier);
  if (!available.has(id)) return false;
  return !(IMMERSIVE_PANEL_CHILDREN[id] ?? []).some((child) => available.has(child));
}

/** 自身或任一祖先被隐藏都算隐藏；旧存档里的父 ID 因此继续隐藏整组。 */
export function moduleHidden(hidden: ReadonlySet<string>, id: ImmersivePanelId): boolean {
  let current: ImmersivePanelId | undefined = id;
  while (current) {
    if (hidden.has(current)) return true;
    current = PARENT_OF[current];
  }
  return false;
}

/** 父组是否可见：叶子看自己，父组看至少一个可用子项。 */
export function groupVisible(
  scene: ImmersiveScene,
  tier: PaperTier,
  hidden: ReadonlySet<string>,
  parentId: ImmersivePanelId,
): boolean {
  const available = panelsFor(scene, tier);
  if (!available.has(parentId) || moduleHidden(hidden, parentId)) return false;
  const children = (IMMERSIVE_PANEL_CHILDREN[parentId] ?? []).filter((child) =>
    available.has(child),
  );
  if (children.length === 0) return true;
  return children.some((child) => !moduleHidden(hidden, child));
}

export interface ImmersiveComponents {
  readonly version: 1;
  /** 组键 `${view}/${tier}` → 隐藏的模块；缺组/缺 ID 都表示可见。 */
  readonly hidden: Readonly<Record<string, readonly string[]>>;
}

export const IMMERSIVE_COMPONENTS_KEY = 'default-theme.immersive.components.v1';
const DEFAULT: ImmersiveComponents = { version: 1, hidden: {} };

function parseComponents(raw: string): ImmersiveComponents | undefined {
  const value = storedRecord(raw);
  if (Reflect.get(value, 'version') !== 1) return undefined;
  const groups = recordOf(Reflect.get(value, 'hidden'));
  const hidden: Record<string, string[]> = {};
  for (const [key, entry] of Object.entries(groups)) {
    if (!Array.isArray(entry)) continue;
    hidden[key] = [
      ...new Set(
        entry.filter((item: unknown): item is string => typeof item === 'string'),
      ),
    ];
  }
  return { version: 1, hidden };
}

const pref: LocalPref<ImmersiveComponents> = defineLocalPref({
  key: IMMERSIVE_COMPONENTS_KEY,
  fallback: DEFAULT,
  parse: parseComponents,
  format: (value) => JSON.stringify(value),
});

export const immersiveComponentsAtom: Atom<ImmersiveComponents> = pref.atom;
export const readImmersiveComponents = pref.read;

export function loadImmersiveComponents(
  store: Store,
  storage: PrefStorage | null = browserStorage(),
): ImmersiveComponents {
  return pref.load(store, storage);
}

export function componentsKey(scene: ImmersiveScene, tier: PaperTier): string {
  return `${scene}/${CARD_SCENES.has(scene) ? 'full' : tier}`;
}

export function hiddenModulesFor(
  value: ImmersiveComponents,
  scene: ImmersiveScene,
  tier: PaperTier,
): ReadonlySet<string> {
  return new Set(value.hidden[componentsKey(scene, tier)] ?? []);
}

export function isPanelShown(
  value: ImmersiveComponents,
  scene: ImmersiveScene,
  tier: PaperTier,
  id: ImmersivePanelId,
): boolean {
  return groupVisible(scene, tier, hiddenModulesFor(value, scene, tier), id);
}

/** 只改当前组的一个模块；删到空数组就把组删掉，避免存档膨胀。 */
export function chooseImmersiveComponent(
  store: Store,
  scene: ImmersiveScene,
  tier: PaperTier,
  id: ImmersivePanelId,
  visible: boolean,
  storage: PrefStorage | null = browserStorage(),
): boolean {
  const current = store.get(pref.atom);
  const key = componentsKey(scene, tier);
  const next = new Set(current.hidden[key] ?? []);
  if (visible) next.delete(id);
  else next.add(id);
  const hidden = { ...current.hidden };
  if (next.size === 0) delete hidden[key];
  else hidden[key] = [...next];
  return pref.set(store, { version: 1, hidden }, storage);
}
