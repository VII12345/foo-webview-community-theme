import type { LyricsContent } from '../lyricsText.ts';

/** 在线来源的编号；存进偏好，已发布的不改名。 */
export const LYRICS_SOURCE_IDS = ['lrclib', 'netease', 'kugou', 'qq', 'ttmlDb', 'lrcmux'] as const;
export type LyricsSourceId = (typeof LYRICS_SOURCE_IDS)[number];

/** 一次搜索里某个来源的结果：有候选、成功但没有、请求或解析失败。 */
export interface LyricsSourceOutcome {
  readonly id: LyricsSourceId;
  readonly status: 'results' | 'empty' | 'failed';
}

/** 拿去在线搜的那一首：只有这几项会发出去，不带路径。 */
export interface LyricsQuery {
  /** 手动搜索的原始关键词；有值时不按曲名、艺人或时长筛选。 */
  readonly keywords?: string;
  readonly title: string;
  readonly artists: readonly string[];
  /** 未知时为空串。 */
  readonly album: string;
  /** 未知时为空数组。 */
  readonly albumArtists: readonly string[];
  /** 毫秒；未知时为 0。 */
  readonly durationMs: number;
}

/** 来源搜出来的一条候选。`ref` 是来源自己认的身份（曲目 id、下载凭据），只在同一来源里用。 */
export interface LyricsCandidate {
  readonly source: LyricsSourceId;
  readonly ref: string;
  readonly title: string;
  /** 已按这家的写法拆成单个艺人。 */
  readonly artists: readonly string[];
  readonly album: string;
  /** 首批几家都不给专辑艺人。 */
  readonly albumArtists?: readonly string[];
  /** 毫秒；来源没给时为 0。 */
  readonly durationMs: number;
  /** 搜索应答里已经带着歌词时直接放这里，取词不再发请求。 */
  readonly content?: LyricsContent;
  /** 来源给出的本候选封面地址；不借用正在播放曲目的图片。 */
  readonly coverUrl?: string;
}

/** 取词的结果：`missing` 是来源明确没有这首的词（含纯音乐），`failed` 是请求或解析失败，可以稍后再试。 */
export type LyricsFetchResult = LyricsContent | 'missing' | 'failed';

/** 补查封面要的那几项：来源身份、来源给的封面地址，以及按曲名/艺人再搜一次时要用的标题与艺人。 */
export type LyricsCoverTarget = Pick<
  LyricsCandidate,
  'source' | 'ref' | 'coverUrl' | 'title' | 'artists'
>;

export interface LyricsSource {
  readonly id: LyricsSourceId;
  /** 请求失败答 `failed`；搜到零条答空数组。 */
  search(query: LyricsQuery, signal?: AbortSignal): Promise<readonly LyricsCandidate[] | 'failed'>;
  fetch(candidate: LyricsCandidate, signal?: AbortSignal): Promise<LyricsFetchResult>;
  /** 根据候选补查封面；封面地址直接给在候选里时不调用。没有封面时返回空串。 */
  cover?(candidate: LyricsCoverTarget, signal?: AbortSignal): Promise<string>;
}
