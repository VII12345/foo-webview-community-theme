import type { LyricsDisplay } from '../../lyrics/lyricsDisplay.ts';
import { atom, type Atom } from 'jotai/vanilla';
import { playbackAtom } from '../../playback/playback.ts';
import type { Store } from '../../kit/store.ts';
import type { LyricsService, LyricsState } from '../../lyrics/lyricsService.ts';

export const LYRIC_STATUS_MESSAGES = {
  loading: 'lyrics.loading',
  searching: 'lyrics.searching',
  'local-failed': 'lyrics.localFailed',
  'online-failed': 'lyrics.onlineFailed',
} as const;

export type LyricLogState = 'none' | 'plain' | 'synced' | keyof typeof LYRIC_STATUS_MESSAGES;

/** 逐字时间（秒）；只有整行时间的歌词每个字与整行同起同止，逐字高亮退化为整行。 */
export interface LyricWord {
  readonly word: string;
  readonly start: number;
  readonly end: number;
}

interface LyricLine {
  /** 秒。 */
  readonly time: number;
  readonly end: number;
  readonly text: string;
  readonly translation: string;
  /** 逐字时间；间奏空行没有。 */
  readonly words: readonly LyricWord[];
}

export interface LyricRows {
  prev: LyricLine | null;
  current: LyricLine | null;
  next: LyricLine | null;
}

export interface LyricWindowLine {
  readonly time: number;
  readonly end: number;
  readonly text: string;
  readonly translation: string;
  readonly words: readonly LyricWord[];
  readonly current: boolean;
}

/** 当前播放位置（秒，已减歌词偏移）；逐字高亮按它算每个字的进度。 */
export const lyricPositionAtom: Atom<number> = atom((get) => get(positionAtom));

export const lyricWindowAtom: Atom<readonly LyricWindowLine[]> = atom((get) => {
  const { state, lines } = get(loadedAtom);
  if (state !== 'synced' || lines.length === 0) return [];
  const at = get(indexAtom);
  const start = Math.max(0, Math.min(Math.max(0, lines.length - 7), at - 3));
  return lines.slice(start, start + 7).map((line, index) => ({
    ...line,
    current: start + index === at,
  }));
});

/** 歌词卡的两行：主行是当前行；副行有译文放译文，没有放下一句，都没有就空、卡按一行排。 */
export interface LyricCardLines {
  main: string;
  sub: string;
  /** 副行放的是什么：译文与下一句的颜色不同。 */
  subKind: 'translation' | 'next' | 'none';
  /** 主行的逐字时间；卡片按它做逐字高亮。 */
  mainWords: readonly LyricWord[];
  /** 副行是下一句时它自己的逐字时间；副行是译文或空时为空。 */
  subWords: readonly LyricWord[];
}

export interface LyricLog {
  readonly state: LyricLogState;
  /** 本地或在线来源；尚未取得歌词时为空串。 */
  readonly source: string;
  /** 无时间轴时的非空行数；有时间轴与无词时为 0。 */
  readonly lineCount: number;
}

export interface LyricLogService {
  dispose(): void;
}

interface Loaded extends LyricLog {
  readonly lines: readonly LyricLine[];
}

const EMPTY: Loaded = { state: 'none', source: '', lineCount: 0, lines: [] };
const NO_ROWS: LyricRows = { prev: null, current: null, next: null };
const loadedAtom = atom<Loaded>(EMPTY);
const positionAtom = atom(0);
const showTranslationAtom = atom(true);

export const lyricLogAtom: Atom<LyricLog> = atom((get) => {
  const { state, source, lineCount } = get(loadedAtom);
  return { state, source, lineCount };
});

/** 首行之前与无时间轴时为 -1；最后一句结束后为行数，使当前行留空。 */
const indexAtom = atom((get) => {
  const { state, lines } = get(loadedAtom);
  if (state !== 'synced') return -1;
  const position = get(positionAtom);
  const at = currentIndex(lines, position);
  const last = lines.at(-1);
  return last && position >= last.end ? lines.length : at;
});

/** 有时间轴时按播放位置取的三行；首行之前当前行为空、下一行是首行。 */
export const lyricRowsAtom: Atom<LyricRows> = atom((get) => {
  const { state, lines } = get(loadedAtom);
  if (state !== 'synced') return NO_ROWS;
  const at = get(indexAtom);
  return {
    prev: lines[at - 1] ?? null,
    current: lines[at] ?? null,
    next: lines[at + 1] ?? null,
  };
});

/** 有时间轴且已播到首行才有；首行之前、无时间轴与无词时为 null，无时间轴那一行由调用方按 `lineCount` 写。 */
export const lyricCardAtom: Atom<LyricCardLines | null> = atom((get) => {
  const { current, next } = get(lyricRowsAtom);
  if (!current) return null;
  if (current.translation && get(showTranslationAtom)) {
    return { main: current.text, sub: current.translation, subKind: 'translation', mainWords: current.words, subWords: [] };
  }
  if (next?.text)
    return { main: current.text, sub: next.text, subKind: 'next', mainWords: current.words, subWords: next.words };
  return { main: current.text, sub: '', subKind: 'none', mainWords: current.words, subWords: [] };
});

function project(result: LyricsState): Loaded {
  if (result.status === 'loading')
    return { ...EMPTY, state: result.stage === 'online' ? 'searching' : 'loading' };
  if (result.status === 'failed')
    return { ...EMPTY, state: result.stage === 'online' ? 'online-failed' : 'local-failed' };
  if (result.status !== 'ready') return EMPTY;
  const { content, source } = result;
  if (content.kind === 'plain')
    return { ...EMPTY, state: 'plain', source, lineCount: content.lines.length };
  // 双行卡和日志只跟随主唱，避免背景人声把当前句顶掉；不改共享的逐字数据。
  const main = content.lines.filter((line) => !line.isBG);
  const sorted = (main.length ? main : content.lines)
    .map((line) => {
      // 逐字时间原样保留；整行只有一个「字」时（逐行 LRC）退化成整行同起同止。
      const words = line.words
        .map((word) => ({
          word: word.word,
          start: word.startTime / 1000,
          end: word.endTime / 1000,
        }))
        .filter((word) => word.word !== '');
      return {
        time: line.startTime / 1000,
        end: line.endTime / 1000,
        text: line.words
          .map((word) => word.word)
          .join('')
          .trim(),
        translation: line.translatedLyric,
        words,
      };
    })
    .sort((a, b) => a.time - b.time);
  // 不再把间奏空隙还原成空行：卡片与日志都直接排真实歌词行，行与行之间不留空白；
  // 间奏期间当前行停在上一句，而不是切成一条只剩时间码的空行。
  return {
    state: 'synced',
    source,
    lineCount: 0,
    lines: sorted,
  };
}

/**
 * 把共用歌词投影为双行卡与三行日志。只在沉浸视图可见时订阅，离开后冻结退场内容；
 * 重新进入先订阅再初读。同一行内只更新位置，行下标不变就不重新发布行内容。
 */
export function startLyricLog(
  store: Store,
  {
    lyrics,
    active,
    offset,
    display,
  }: {
    lyrics: Pick<LyricsService, 'state'>;
    active: Atom<boolean>;
    offset?: Atom<number>;
    display?: Atom<LyricsDisplay>;
  },
): LyricLogService {
  store.set(loadedAtom, EMPTY);
  store.set(positionAtom, 0);
  let offs: (() => void)[] = [];
  const updateLyrics = () => store.set(loadedAtom, project(store.get(lyrics.state)));
  const updatePosition = () =>
    store.set(positionAtom, store.get(playbackAtom).position - (offset ? store.get(offset) : 0));
  const updateDisplay = () =>
    store.set(showTranslationAtom, display ? store.get(display).showTranslation : true);

  function follow(): void {
    for (const off of offs.splice(0)) off();
    if (!store.get(active)) return;
    offs = [
      store.sub(lyrics.state, updateLyrics),
      store.sub(playbackAtom, updatePosition),
      ...(offset ? [store.sub(offset, updatePosition)] : []),
      ...(display ? [store.sub(display, updateDisplay)] : []),
    ];
    updateDisplay();
    updatePosition();
    updateLyrics();
  }

  const stopActive = store.sub(active, follow);
  follow();

  return {
    dispose() {
      stopActive();
      for (const off of offs.splice(0)) off();
    },
  };
}

/** `position`（秒）落在哪一行：时间不晚于它的最后一行；首行之前是 -1。 */
function currentIndex(lines: readonly LyricLine[], position: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((lines[middle]?.time ?? Infinity) <= position) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** 时间码显示成 mm:ss；日志的行宽不放百分秒。 */
export function formatLyricTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${String(minutes).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}
