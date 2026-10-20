import type { Atom } from 'jotai/vanilla';
import {
  browserStorage,
  defineLocalPref,
  recordOf,
  storedRecord,
  type LocalPref,
  type PrefStorage,
} from '../../kit/localPref.ts';
import type { Store } from '../../kit/store.ts';
import { IMMERSIVE_PANEL_IDS, type ImmersivePanelId } from '../page/immersiveComponents.ts';
import type { ImmersiveScene } from '../page/immersivePrefs.ts';
import type { PaperTier } from '../paper/paperTiers.ts';

/**
 * 沉浸视图每个组件的摆放覆盖。
 *
 * 组件的默认位置由布局算出来（`paperComponentLayout.ts`），这里只存"挪过"的部分：
 * 组键 `${view}/${tier}` → 模块 id → 覆盖。缺哪一项就用默认盒子。
 *
 * 存的是**相对默认盒子的偏移**而不是绝对坐标：版心两档（compact / narrow）的版心宽度随窗口变，
 * 绝对坐标在窗口一变窄就会漂；偏移量与窗口无关。
 * 尺寸存**比例**而不是像素：频谱、波形、歌词这些宽度跟着右栏变动的件，比例才说得清。
 */
export interface ImmersivePlacement {
  /** 相对默认盒子的横向偏移，舞台/版心像素。 */
  readonly dx?: number;
  /** 相对默认盒子的纵向偏移，舞台/版心像素。 */
  readonly dy?: number;
  /** 宽相对默认宽的比例；1 = 默认。 */
  readonly sw?: number;
  /** 高相对默认高的比例；1 = 默认。 */
  readonly sh?: number;
  /** 组内次序：小的在前，叠放时也按它排。 */
  readonly order?: number;
}

export interface ImmersivePlacements {
  readonly version: 1;
  readonly groups: Readonly<Record<string, Readonly<Record<string, ImmersivePlacement>>>>;
}

export const IMMERSIVE_PLACEMENTS_KEY = 'default-theme.immersive.layout.v1';
const DEFAULT: ImmersivePlacements = { version: 1, groups: {} };

const PANEL_IDS: ReadonlySet<string> = new Set(IMMERSIVE_PANEL_IDS);

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** 读一个覆盖：认不出的键丢掉，数值不对的项丢掉，其余原样留下。 */
function parsePlacement(raw: unknown): ImmersivePlacement | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const source = recordOf(raw);
  const placement: {
    dx?: number;
    dy?: number;
    sw?: number;
    sh?: number;
    order?: number;
  } = {};
  for (const key of ['dx', 'dy', 'sw', 'sh', 'order'] as const) {
    const value = numberOf(source[key]);
    if (value !== undefined) placement[key] = value;
  }
  return Object.keys(placement).length > 0 ? placement : undefined;
}

function parsePlacements(raw: string): ImmersivePlacements | undefined {
  const value = storedRecord(raw);
  if (Reflect.get(value, 'version') !== 1) return undefined;
  const groups: Record<string, Record<string, ImmersivePlacement>> = {};
  for (const [group, entries] of Object.entries(recordOf(Reflect.get(value, 'groups')))) {
    const parsed: Record<string, ImmersivePlacement> = {};
    for (const [id, entry] of Object.entries(recordOf(entries))) {
      if (!PANEL_IDS.has(id)) continue;
      const placement = parsePlacement(entry);
      if (placement) parsed[id] = placement;
    }
    if (Object.keys(parsed).length > 0) groups[group] = parsed;
  }
  return { version: 1, groups };
}

const pref: LocalPref<ImmersivePlacements> = defineLocalPref({
  key: IMMERSIVE_PLACEMENTS_KEY,
  fallback: DEFAULT,
  parse: parsePlacements,
  format: (value) => JSON.stringify(value),
});

export const immersivePlacementsAtom: Atom<ImmersivePlacements> = pref.atom;
export const readImmersivePlacements = pref.read;

export function loadImmersivePlacements(
  store: Store,
  storage: PrefStorage | null = browserStorage(),
): ImmersivePlacements {
  return pref.load(store, storage);
}

/** 组键与组件可见性那边一致：卡片两档不分档位，一律按 full 记。 */
export function placementKey(scene: ImmersiveScene, tier: PaperTier): string {
  return scene === 'card' || scene === 'cardLyrics' ? `${scene}/full` : `${scene}/${tier}`;
}

function write(
  store: Store,
  scene: ImmersiveScene,
  tier: PaperTier,
  id: ImmersivePanelId,
  patch: ImmersivePlacement | null,
  storage: PrefStorage | null,
): boolean {
  const current = store.get(pref.atom);
  const key = placementKey(scene, tier);
  const entries = { ...(current.groups[key] ?? {}) };
  if (patch === null) delete entries[id];
  else entries[id] = { ...(entries[id] ?? {}), ...patch };
  const groups = { ...current.groups };
  if (Object.keys(entries).length === 0) delete groups[key];
  else groups[key] = entries;
  return pref.set(store, { version: 1, groups }, storage);
}

/** 挪一个组件：给出哪几项就改哪几项。 */
export function chooseImmersivePlacement(
  store: Store,
  scene: ImmersiveScene,
  tier: PaperTier,
  id: ImmersivePanelId,
  patch: ImmersivePlacement,
  storage: PrefStorage | null = browserStorage(),
): boolean {
  return write(store, scene, tier, id, patch, storage);
}

/** 把一个组件放回默认位置。 */
export function resetImmersivePlacement(
  store: Store,
  scene: ImmersiveScene,
  tier: PaperTier,
  id: ImmersivePanelId,
  storage: PrefStorage | null = browserStorage(),
): boolean {
  return write(store, scene, tier, id, null, storage);
}

/** 整组放回默认位置。 */
export function resetImmersivePlacementGroup(
  store: Store,
  scene: ImmersiveScene,
  tier: PaperTier,
  storage: PrefStorage | null = browserStorage(),
): boolean {
  const current = store.get(pref.atom);
  const key = placementKey(scene, tier);
  if (!current.groups[key]) return false;
  const groups = { ...current.groups };
  delete groups[key];
  return pref.set(store, { version: 1, groups }, storage);
}
