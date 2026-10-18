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
 * 沉浸视图的可视模块。模块级：一个开关控制整块频谱/整个仪表行/整张卡片封面等，
 * 不细到每个按钮。新增模块只往这里加值，旧存档缺的字段按可见处理。
 */
export const IMMERSIVE_PANEL_IDS = [
  'wash',
  'terrain',
  'ruler',
  'decor',
  'marks',
  'pad',
  'dial.rings',
  'dial.orbit',
  'dial.ticks',
  'dial.album',
  'dial.cover',
  'dial.brackets',
  'dial.cells',
  'dial.transport',
  'card.cover',
  'card.title',
  'card.rating',
  'card.more',
  'card.seek',
  'card.transport',
  'card.cells',
  'right.header',
  'right.meter',
  'right.spectrum',
  'right.waveform',
  'right.gauges',
  'right.fileInfo',
  'right.footnote',
  'right.meta',
  'right.lyrics',
] as const;

export type ImmersivePanelId = (typeof IMMERSIVE_PANEL_IDS)[number];

export const IMMERSIVE_PANEL_LABELS: Readonly<Record<ImmersivePanelId, MessageKey>> = {
  wash: 'settings.immersivePanelWash',
  terrain: 'settings.immersivePanelTerrain',
  ruler: 'settings.immersivePanelRuler',
  decor: 'settings.immersivePanelDecor',
  marks: 'settings.immersivePanelMarks',
  pad: 'settings.immersivePanelPad',
  'dial.rings': 'settings.immersivePanelDialRings',
  'dial.orbit': 'settings.immersivePanelDialOrbit',
  'dial.ticks': 'settings.immersivePanelDialTicks',
  'dial.album': 'settings.immersivePanelDialAlbum',
  'dial.cover': 'settings.immersivePanelDialCover',
  'dial.brackets': 'settings.immersivePanelDialBrackets',
  'dial.cells': 'settings.immersivePanelDialCells',
  'dial.transport': 'settings.immersivePanelDialTransport',
  'card.cover': 'settings.immersivePanelCardCover',
  'card.title': 'settings.immersivePanelCardTitle',
  'card.rating': 'settings.immersivePanelCardRating',
  'card.more': 'settings.immersivePanelCardMore',
  'card.seek': 'settings.immersivePanelCardSeek',
  'card.transport': 'settings.immersivePanelCardTransport',
  'card.cells': 'settings.immersivePanelCardCells',
  'right.header': 'settings.immersivePanelRightHeader',
  'right.meter': 'settings.immersivePanelRightMeter',
  'right.spectrum': 'settings.immersivePanelRightSpectrum',
  'right.waveform': 'settings.immersivePanelRightWaveform',
  'right.gauges': 'settings.immersivePanelRightGauges',
  'right.fileInfo': 'settings.immersivePanelRightFileInfo',
  'right.footnote': 'settings.immersivePanelRightFootnote',
  'right.meta': 'settings.immersivePanelRightMeta',
  'right.lyrics': 'settings.immersivePanelRightLyrics',
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
    panels: ['wash', 'terrain', 'ruler', 'decor', 'marks', 'pad'],
  },
  {
    id: 'dial',
    label: 'settings.immersiveComponentsDial',
    panels: [
      'dial.rings',
      'dial.orbit',
      'dial.ticks',
      'dial.album',
      'dial.cover',
      'dial.brackets',
      'dial.cells',
      'dial.transport',
    ],
  },
  {
    id: 'card',
    label: 'settings.immersiveComponentsCard',
    panels: [
      'card.cover',
      'card.title',
      'card.rating',
      'card.more',
      'card.seek',
      'card.transport',
      'card.cells',
    ],
  },
  {
    id: 'right',
    label: 'settings.immersiveComponentsRight',
    panels: [
      'right.header',
      'right.meter',
      'right.spectrum',
      'right.waveform',
      'right.gauges',
      'right.fileInfo',
      'right.footnote',
      'right.meta',
      'right.lyrics',
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
 * 某个视图/布局实际可能出现的模块。只把可用的模块摆进设置，避免出现“频谱在聚焦视图里”
 * 这种没有意义的开关；不可用模块的存档保留但忽略。
 */
export function panelsFor(
  scene: ImmersiveScene,
  tier: PaperTier,
): ReadonlySet<ImmersivePanelId> {
  const panels = new Set<ImmersivePanelId>([
    'wash',
    'terrain',
    'decor',
    'marks',
    'right.lyrics',
  ]);
  const card = CARD_SCENES.has(scene);
  const effectiveTier: PaperTier = card ? 'full' : tier;
  if (effectiveTier === 'full') panels.add('ruler');
  if (scene === 'paper' || scene === 'focus') panels.add('pad');
  if (DIAL_SCENES.has(scene)) {
    for (const id of [
      'dial.album',
      'dial.cover',
      'dial.brackets',
      'dial.transport',
    ] as const)
      panels.add(id);
    if (effectiveTier !== 'narrow') {
      panels.add('dial.rings');
      panels.add('dial.orbit');
      panels.add('dial.ticks');
    }
    if (effectiveTier === 'full') panels.add('dial.cells');
  }
  if (card) {
    for (const id of [
      'card.cover',
      'card.rating',
      'card.more',
      'card.seek',
      'card.transport',
      'card.cells',
    ] as const)
      panels.add(id);
    if (scene === 'cardLyrics') panels.add('card.title');
  }
  if (!(scene === 'cardLyrics' && effectiveTier === 'full')) panels.add('right.header');
  if ((scene === 'paper' || scene === 'focus') && effectiveTier === 'full')
    panels.add('right.meter');
  if (scene === 'paper') panels.add('right.spectrum');
  if (scene === 'paper' || scene === 'focus') {
    panels.add('right.waveform');
    if (
      effectiveTier === 'full' ||
      effectiveTier === 'compact' ||
      effectiveTier === 'portrait' ||
      effectiveTier === 'portrait-compact'
    ) {
      panels.add('right.gauges');
    }
    if (effectiveTier === 'full' || effectiveTier === 'portrait') {
      panels.add('right.fileInfo');
    }
    if (
      effectiveTier === 'compact' ||
      effectiveTier === 'portrait' ||
      effectiveTier === 'portrait-compact'
    ) {
      panels.add('right.footnote');
      panels.add('right.meta');
    }
  }
  return panels;
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
  return panelsFor(scene, tier).has(id) && !hiddenModulesFor(value, scene, tier).has(id);
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
