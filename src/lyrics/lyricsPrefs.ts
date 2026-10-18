import { atom, type Atom } from 'jotai/vanilla';
import {
  defineConfigPref,
  startConfigPrefs,
  type ConfigPersistence,
  type ConfigPrefFace,
} from '../host/configPref.ts';
import type { ConfigWriter } from '../host/configWrite.ts';
import type { Store } from '../kit/store.ts';
import { serviceKey } from '../kit/serviceKey.ts';
import { LYRICS_SOURCE_IDS, type LyricsSourceId } from './online/lyricsSource.ts';

export const LYRICS_PRIORITY = ['localWord', 'local', 'word', 'line', 'plain'] as const;
export type LyricsPriority = (typeof LYRICS_PRIORITY)[number];
export const WORD_FIRST: readonly LyricsPriority[] = ['word', 'localWord', 'local', 'line', 'plain'];
export const LOCAL_WORD_FIRST: readonly LyricsPriority[] = [
  'localWord',
  'word',
  'local',
  'line',
  'plain',
];
export const isLocalPriority = (value: LyricsPriority): boolean =>
  value === 'local' || value === 'localWord';

/**
 * 头一批就有的来源。存档里 `sources` 记的是「勾了哪些来源」，所以后来新加的来源不会自动出现在老存档里——
 * 用户看不到、也搜不到（QQ 音乐就是这样漏掉的）。读档后把**基线之外**的新来源补进去：老存档里从没出现过
 * 它们，谈不上「用户关掉了」。基线之内的来源不补，用户手动关掉的那些照旧关着。
 */
const LYRICS_SOURCE_BASELINE: readonly LyricsSourceId[] = ['lrclib', 'netease', 'kugou', 'ttmlDb', 'lrcmux'];

/**
 * 老存档里没见过的来源：只补这些，且只在用户确实留着来源列表时才补。
 * 空列表是用户一条条关掉的结果（「一个来源都不要」），不是老存档，不补。
 */
export function missingNewSources(sources: readonly LyricsSourceId[]): LyricsSourceId[] {
  if (sources.length === 0) return [];
  const known = new Set<LyricsSourceId>(sources);
  return LYRICS_SOURCE_IDS.filter(
    (id) => !known.has(id) && !LYRICS_SOURCE_BASELINE.includes(id),
  );
}

export function parseLyricsPriority(raw: unknown): LyricsPriority[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const order = raw.flatMap((value: unknown) =>
    LYRICS_PRIORITY.filter((known) => known === value),
  );
  // 旧存档是 4 项（没有 localWord）；在 local 前补上，保留用户原来的相对顺序。
  if (raw.length === 4) {
    if (order.length !== 4 || new Set(order).size !== 4) return undefined;
    const at = order.indexOf('local');
    order.splice(at < 0 ? 0 : at, 0, 'localWord');
    return order;
  }
  if (raw.length !== LYRICS_PRIORITY.length) return undefined;
  return order.length === LYRICS_PRIORITY.length &&
    new Set(order).size === LYRICS_PRIORITY.length
    ? order
    : undefined;
}

const PRIORITY_PREF = defineConfigPref(
  'defaultTheme.lyrics.priority',
  [...LYRICS_PRIORITY],
  parseLyricsPriority,
);
export const LYRICS_PRIORITY_KEY = PRIORITY_PREF.key;

export interface LyricsPrefs {
  readonly order?: readonly LyricsPriority[];
  readonly enabled: boolean;
  /** null 表示尚未选择首次预设；空数组表示不使用任何来源。 */
  readonly sources: readonly LyricsSourceId[] | null;
}

const DEFAULT_PREFS = { version: 1, enabled: false, sources: null };

function parsePrefs(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  if (Reflect.get(raw, 'version') !== 1) return undefined;
  const enabled: unknown = Reflect.get(raw, 'enabled');
  const sources: unknown = Reflect.get(raw, 'sources');
  if (typeof enabled !== 'boolean' || (sources !== null && !Array.isArray(sources)))
    return undefined;
  if (
    Array.isArray(sources) &&
    !sources.every((id: unknown) => LYRICS_SOURCE_IDS.some((known) => known === id))
  )
    return undefined;
  return {
    version: 1,
    enabled,
    sources:
      sources === null
        ? null
        : [...new Set(sources.flatMap((id: unknown) => LYRICS_SOURCE_IDS.filter((s) => s === id)))],
  };
}

const ONLINE_PREF = defineConfigPref<NonNullable<ReturnType<typeof parsePrefs>>>(
  'defaultTheme.online.lyrics',
  DEFAULT_PREFS,
  parsePrefs,
);

export const LYRICS_PREFS_KEY = ONLINE_PREF.key;

export interface LyricsPrefsService {
  readonly pref: Atom<LyricsPrefs>;
  readonly ready: Promise<void>;
  readonly persistence: ConfigPersistence;
  setEnabled(enabled: boolean, locale: string): Promise<boolean>;
  setOrder(order: readonly LyricsPriority[]): Promise<boolean>;
  setSources(sources: readonly LyricsSourceId[]): Promise<boolean>;
  dispose(): void;
}

export const lyricsPrefsKey = serviceKey<LyricsPrefsService>('lyricsPrefs');

export function startLyricsPrefs(
  store: Store,
  host?: ConfigPrefFace,
  writer?: Pick<ConfigWriter, 'set'>,
): LyricsPrefsService {
  const prefs = startConfigPrefs(store, [ONLINE_PREF, PRIORITY_PREF], host, writer);
  // 读档结束时把老存档没见过的来源补进去并写回：界面与搜索都看得到，下次读档也不必再补。
  void prefs.ready.then(() => {
    const current = store.get(ONLINE_PREF.atom);
    const sources = current.sources;
    if (!sources) return;
    const added = missingNewSources(sources);
    if (added.length === 0) return;
    void prefs.set(ONLINE_PREF, { ...current, sources: [...sources, ...added] });
  });
  return {
    pref: atom((get) => ({ ...get(ONLINE_PREF.atom), order: get(PRIORITY_PREF.atom) })),
    ready: prefs.ready,
    persistence: prefs,
    setEnabled(enabled, locale) {
      const current = store.get(ONLINE_PREF.atom);
      const sources: LyricsSourceId[] | null =
        current.sources ??
        (enabled
          ? locale.toLowerCase().startsWith('zh')
            ? ['netease', 'kugou', 'qq', 'ttmlDb', 'lrclib', 'lrcmux']
            : ['lrclib', 'ttmlDb', 'netease', 'kugou', 'qq', 'lrcmux']
          : null);
      return prefs.set(ONLINE_PREF, { version: 1, enabled, sources });
    },
    setOrder: (order) => prefs.set(PRIORITY_PREF, [...order]),
    setSources: (sources) =>
      prefs.set(ONLINE_PREF, { ...store.get(ONLINE_PREF.atom), sources: [...sources] }),
    dispose: prefs.dispose,
  };
}
