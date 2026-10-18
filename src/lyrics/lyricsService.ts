import { atom, type Atom } from 'jotai/vanilla';
import type { Store } from '../kit/store.ts';
import { serviceKey } from '../kit/serviceKey.ts';
import type { LocalLyricsService, LocalLyricsState, LyricsTrack } from './lyricsLocal.ts';
import { lacksWordLevel } from './lyricsLocal.ts';
import { LYRICS_PRIORITY, isLocalPriority, type LyricsPrefs, type LyricsPrefsService, type LyricsPriority } from './lyricsPrefs.ts';
import { isWordLevel } from './lyricsText.ts';
import type { LyricsCoverAccess } from './lyricsCandidateCovers.ts';
import { lyricsVersion, type LyricsArchive, type LyricsReady } from './lyricsArchive.ts';
import {
  startLyricsSearchSession,
  lyricsTargetId,
  type LyricsChoiceState,
  type LyricsCandidatePreview,
} from './lyricsSearchSession.ts';
import type { LyricsHttpHost } from './online/lyricsHttp.ts';
import type { createLyricsOnline } from './online/lyricsOnline.ts';
import type { FoundLyrics } from './online/lyricsSearch.ts';
import { levelRank } from './online/lyricsMatch.ts';
import type { LyricsCandidate, LyricsIdQuery, LyricsQuery } from './online/lyricsSource.ts';

export interface LyricsTarget extends LyricsTrack {
  /** Path-free metadata identity used only for saved lyric preferences. */
  readonly archiveKey: string | null;
  /** 网络流的曲名可在相同路径下变化，查询元数据也参与过期保护。 */
  readonly query: LyricsQuery;
}

export type LyricsState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly key: string; readonly stage: 'local' | 'online' }
  | { readonly status: 'waiting'; readonly key: string }
  | {
      readonly status: 'missing';
      readonly key: string;
      readonly reason: 'local' | 'online' | 'metadata';
    }
  | { readonly status: 'failed'; readonly key: string; readonly stage: 'local' | 'online' }
  | LyricsReady;

export interface LyricsDeps {
  readonly host: LyricsHttpHost;
  readonly track: Atom<LyricsTarget | null>;
  readonly connected: Atom<boolean>;
  readonly active: Atom<boolean>;
  readonly visible?: Atom<boolean>;
  readonly local: Pick<LocalLyricsService, 'state' | 'refresh' | 'saveEmbedded'>;
  readonly prefs: Pick<LyricsPrefsService, 'pref'> & { readonly autoSaveWord?: Atom<boolean> };
  readonly archive?: LyricsArchive;
}

export interface LyricsService {
  readonly state: Atom<LyricsState>;
  readonly local: Atom<LocalLyricsState>;
  readonly choices: Atom<LyricsChoiceState>;
  readonly covers: LyricsCoverAccess;
  search(keywords: string, force?: boolean, id?: LyricsIdQuery): Promise<void>;
  readonly preview: Atom<LyricsCandidatePreview>;
  readonly offset: Atom<number>;
  readonly subject: Atom<string>;
  readonly canRemember: Atom<boolean>;
  /** 为当前曲目保留一次预览取词需求，沿用已有来源设置，不刷新已经完成的结果。 */
  requestPreview(): void;
  candidate(id: string): LyricsCandidate | undefined;
  previewCandidate(
    candidate: LyricsCandidate,
    subject?: string,
  ): Promise<import('./lyricsText.ts').LyricsContent | null>;
  choose(candidate: LyricsCandidate, makeDefault?: boolean, subject?: string): Promise<boolean>;
  chooseLocal(makeDefault?: boolean, subject?: string): Promise<boolean>;
  restoreAutomatic(): Promise<boolean>;
  setOffset(seconds: number): Promise<boolean>;
  seekTime(seconds: number): number;
  cancelSearch(): void;
  refresh(): void;
  dispose(): void;
}

export const lyricsKey = serviceKey<LyricsService>('lyrics');

/** 按用户顺序取词；只有界面有取词需求且已启用联网时才加载在线模块、发起搜索。 */
export function startLyrics(store: Store, deps: LyricsDeps): LyricsService {
  const state = atom<LyricsState>({ status: 'idle' });
  let disposed = false;
  let search: ReturnType<typeof createLyricsOnline> | undefined;
  let request: AbortController | null = null;
  let input = '';
  let outcome: LyricsState | null = null;
  const session = startLyricsSearchSession(store, { ...deps, prefs: deps.prefs.pref });
  let chosen: LyricsReady | null = null;
  let manualInput = '';
  let previewInput = '';
  let selection = 0;
  // 本地有逐行/纯文本、但开关要求写逐字时，在线搜索只作为后台写标签，不改变当前显示。
  let backgroundSave = false;
  // 自动写入只试一次：成功、失败、只读文件都不在后续 follow 里反复重试。
  const autoSaved = new Map<string, 'pending' | 'done'>();
  const subject = atom((get) => lyricsTargetId(get(deps.track)));
  const offset = atom((get) => {
    const ready = get(state);
    return ready.status === 'ready' && deps.archive
      ? (get(deps.archive.record).offsets[lyricsVersion(ready)] ?? 0)
      : 0;
  });

  function cancel(): void {
    request?.abort();
    request = null;
  }

  /**
   * 在线自动匹配到逐字歌词且开关打开时，把它写进本地文件的 LYRICS。只在没有本地歌词、没有手选、
   * 没有归档选择、匹配度高以上时写；写入前再核对曲目没换，避免把旧词写进新文件。
   */
  function maybeAutoSaveWord(
    target: LyricsTarget,
    found: LyricsReady,
    local: LocalLyricsState,
  ): void {
    const enabled = deps.prefs.autoSaveWord
      ? store.get(deps.prefs.autoSaveWord)
      : false;
    if (
      !enabled ||
      !target.local ||
      !lacksWordLevel(local) ||
      !('key' in local) ||
      local.key !== target.key
    )
      return;
    if (chosen) return;
    if (target.archiveKey && deps.archive && store.get(deps.archive.selected)) return;
    if (!found.match || !isWordLevel(found.content)) return;
    if (levelRank(found.match.level) > levelRank('high')) return;
    const key = `${target.key}\u0000${lyricsVersion(found)}`;
    if (autoSaved.has(key)) return;
    autoSaved.set(key, 'pending');
    if (autoSaved.size > 50) {
      const oldest = autoSaved.keys().next().value;
      if (oldest !== undefined && oldest !== key) autoSaved.delete(oldest);
    }
    const stillCurrent = () =>
      store.get(deps.track)?.key === target.key &&
      !chosen &&
      !(target.archiveKey && deps.archive && store.get(deps.archive.selected)) &&
      (deps.prefs.autoSaveWord ? store.get(deps.prefs.autoSaveWord) : false) &&
      (() => {
        const current = store.get(deps.local.state);
        return 'key' in current && current.key === target.key && lacksWordLevel(current);
      })();
    if (!stillCurrent()) {
      autoSaved.delete(key);
      return;
    }
    void deps.local.saveEmbedded(found.content).finally(() => autoSaved.set(key, 'done'));
  }

  async function load(
    target: LyricsTarget,
    query: LyricsQuery,
    prefs: LyricsPrefs,
    localFailed: boolean,
    controller: AbortController,
  ): Promise<void> {
    let result: FoundLyrics | 'missing' | 'failed' | null;
    try {
      const { createLyricsOnline } = await import('./online/lyricsOnline.ts');
      if (controller.signal.aborted) return;
      search ??= createLyricsOnline(deps.host, await session.sources());
      result = await search(query, prefs, controller.signal);
    } catch {
      result = 'failed';
    }
    if (disposed || controller.signal.aborted || request !== controller) return;
    request = null;
    outcome =
      result && typeof result === 'object'
        ? { ...result, status: 'ready', key: target.key }
        : result === 'missing'
          ? localFailed
            ? { status: 'failed', key: target.key, stage: 'local' }
            : { status: 'missing', key: target.key, reason: 'online' }
          : { status: 'failed', key: target.key, stage: 'online' };
    follow();
  }

  function follow(): void {
    if (disposed) return;
    const target = store.get(deps.track);
    const local = store.get(deps.local.state);
    const identity = target ? JSON.stringify([target.key, target.query]) : '';
    if (identity !== manualInput || !store.get(deps.connected)) {
      manualInput = identity;
      previewInput = '';
      chosen = null;
      selection += 1;
    }
    if (!target || !store.get(deps.connected)) {
      cancel();
      input = '';
      outcome = null;
      store.set(state, { status: 'idle' });
      return;
    }
    const preferred = chosen ?? (target.archiveKey && deps.archive ? store.get(deps.archive.selected) : null);
    if (preferred) {
      cancel();
      store.set(state, { ...preferred, key: target.key });
      return;
    }
    if (local.status === 'idle' || local.key !== target.key || local.status === 'loading') {
      cancel();
      input = '';
      outcome = null;
      store.set(state, { status: 'loading', key: target.key, stage: 'local' });
      return;
    }
    const prefs = store.get(deps.prefs.pref);
    const order = prefs.order ?? LYRICS_PRIORITY;
    const localCategory = (content: LyricsReady['content']): LyricsPriority =>
      isWordLevel(content) ? 'localWord' : 'local';
    const localRank = (content: LyricsReady['content']): number => {
      const preferred = order.indexOf(localCategory(content));
      const fallback = order.indexOf('local');
      return preferred >= 0 ? preferred : fallback;
    };
    const firstOnline = order.findIndex((value) => !isLocalPriority(value));
    const autoSaveEnabled = deps.prefs.autoSaveWord
      ? store.get(deps.prefs.autoSaveWord)
      : false;
    const archiveSelected =
      target.archiveKey && deps.archive ? store.get(deps.archive.selected) : null;
    const autoSaveWanted =
      autoSaveEnabled &&
      target.local &&
      !chosen &&
      !archiveSelected &&
      local.key === target.key &&
      lacksWordLevel(local);
    if (local.status === 'ready') {
      const rank = localRank(local.content);
      // 本地逐行/纯文本会赢得显示优先级；自动写标签要在后台继续搜在线逐字，不能在这里直接返回。
      const mustSearchForSave = autoSaveWanted && prefs.enabled && firstOnline >= 0;
      if (!prefs.enabled || firstOnline < 0 || (rank < firstOnline && !mustSearchForSave)) {
        cancel();
        input = '';
        outcome = null;
        store.set(state, local);
        return;
      }
    }
    // 只交出查询字段，不把曲目路径或调用方附带的其他属性传进在线来源。
    const query: LyricsQuery = {
      title: target.query.title.trim(),
      artists: [...target.query.artists],
      album: target.query.album,
      albumArtists: [...target.query.albumArtists],
      durationMs: target.query.durationMs,
    };
    const next = JSON.stringify([target.key, query, prefs, autoSaveEnabled]);
    if (next !== input) {
      cancel();
      input = next;
      outcome = null;
    }
    if (!prefs.enabled) {
      cancel();
      store.set(
        state,
        local.status === 'failed'
          ? { status: 'failed', key: target.key, stage: 'local' }
          : { status: 'missing', key: target.key, reason: 'local' },
      );
      return;
    }
    if (!query.title || !query.artists.some((artist) => artist.trim())) {
      if (local.status === 'ready') {
        store.set(state, local);
        return;
      }
      store.set(
        state,
        local.status === 'failed'
          ? { status: 'failed', key: target.key, stage: 'local' }
          : { status: 'missing', key: target.key, reason: 'metadata' },
      );
      return;
    }
    if (outcome) {
      const kind =
        outcome.status === 'ready'
          ? isWordLevel(outcome.content)
            ? 'word'
            : outcome.content.kind === 'synced'
              ? 'line'
              : 'plain'
          : null;
      const localWins =
        local.status === 'ready' && (!kind || localRank(local.content) < order.indexOf(kind));
      store.set(state, localWins ? local : outcome);
      if (outcome.status === 'ready') maybeAutoSaveWord(target, outcome, local);
      return;
    }
    const previewWanted = previewInput === identity && (!deps.visible || store.get(deps.visible));
    if (!store.get(deps.active) && !previewWanted) {
      cancel();
      store.set(state, local.status === 'ready' ? local : { status: 'waiting', key: target.key });
      return;
    }
    if (request) return;
    request = new AbortController();
    // 本地已有一份逐行词时，在线搜索只服务自动写标签：保持本地显示，不把状态切成 loading。
    backgroundSave = autoSaveWanted && local.status === 'ready';
    if (!backgroundSave)
      store.set(state, { status: 'loading', key: target.key, stage: 'online' });
    void load(target, query, prefs, local.status === 'failed', request);
  }

  const offs = [
    store.sub(deps.track, follow),
    store.sub(deps.connected, follow),
    store.sub(deps.active, follow),
    ...(deps.visible ? [store.sub(deps.visible, follow)] : []),
    store.sub(deps.local.state, follow),
    store.sub(deps.prefs.pref, follow),
    ...(deps.prefs.autoSaveWord ? [store.sub(deps.prefs.autoSaveWord, follow)] : []),
    ...(deps.archive ? [store.sub(deps.archive.selected, follow)] : []),
  ];
  follow();

  return {
    state: atom((get) => get(state)),
    local: deps.local.state,
    choices: session.choices,
    covers: session.covers,
    preview: session.preview,
    offset,
    subject,
    canRemember: atom((get) => !!get(deps.track)?.archiveKey && !!deps.archive),
    requestPreview() {
      const current = store.get(subject);
      if (disposed || !current || previewInput === current) return;
      previewInput = current;
      follow();
    },
    candidate: session.candidate,
    previewCandidate: session.previewCandidate,
    cancelSearch: session.cancelSearch,
    search: session.search,
    async choose(candidate, makeDefault = false, expected = store.get(subject)) {
      const target = store.get(deps.track);
      if (!target || expected !== store.get(subject)) return false;
      const mine = ++selection;
      const content = await session.previewCandidate(candidate, expected);
      if (!content || disposed || mine !== selection || expected !== store.get(subject))
        return false;
      // 记住这份选择：本地文件尽量写进标签（别的播放器也能看到），同时**始终**写主题存档兜底——
      // 写标签可能因为只读/权限/宿主事件缺失而不生效，存档在 config 里、切歌与重启都能恢复。
      if (makeDefault) {
        if (target.local) await deps.local.saveEmbedded(content);
        if (disposed || mine !== selection || expected !== store.get(subject)) return false;
        if (target.archiveKey && deps.archive)
          void deps.archive.select(target.archiveKey, target.key, {
            status: 'ready',
            key: target.archiveKey,
            source: candidate.source,
            content,
            candidate,
          });
      }
      chosen = {
        status: 'ready',
        key: target.key,
        source: candidate.source,
        content,
        candidate,
      };
      follow();
      return true;
    },
    async chooseLocal(makeDefault = false, expected = store.get(subject)) {
      const target = store.get(deps.track);
      const local = store.get(deps.local.state);
      if (
        !target ||
        expected !== store.get(subject) ||
        local.status !== 'ready' ||
        local.key !== target.key
      )
        return false;
      if (makeDefault) {
        if (target.local) await deps.local.saveEmbedded(local.content);
        if (disposed || expected !== store.get(subject)) return false;
        if (target.archiveKey && deps.archive)
          void deps.archive.select(target.archiveKey, target.key, {
            ...local,
            key: target.archiveKey,
          });
      }
      chosen = local;
      follow();
      return true;
    },
    async restoreAutomatic() {
      const target = store.get(deps.track);
      if (!target || disposed) return false;
      chosen = null;
      selection += 1;
      cancel();
      input = '';
      outcome = null;
      const saved =
        target.archiveKey && deps.archive
          ? await deps.archive.select(target.archiveKey, target.key, null)
          : true;
      if (!disposed) follow();
      return saved;
    },
    setOffset(seconds) {
      const current = store.get(state);
      const target = store.get(deps.track);
      return current.status === 'ready' && target?.archiveKey && deps.archive
        ? deps.archive.setOffset(target.archiveKey, target.key, lyricsVersion(current), seconds)
        : Promise.resolve(false);
    },
    seekTime(seconds) {
      const duration = store.get(deps.track)?.query.durationMs ?? 0;
      return Math.max(
        0,
        Math.min(duration > 0 ? duration / 1000 : Infinity, seconds + store.get(offset)),
      );
    },
    refresh() {
      if (disposed) return;
      chosen = null;
      session.cancelSearch();
      cancel();
      input = '';
      outcome = null;
      deps.local.refresh();
      follow();
    },
    dispose() {
      disposed = true;
      session.dispose();
      cancel();
      for (const off of offs) off();
    },
  };
}
