import { attachLineTexts, parseLyricsText, syncedContent } from '../lyricsText.ts';
import {
  asList,
  asNumber,
  asText,
  field,
  lyricsGet,
  lyricsJson,
  type LyricsHttpHost,
} from './lyricsHttp.ts';
import type { LyricsCandidate, LyricsQuery, LyricsSource } from './lyricsSource.ts';

const SEARCH_URL = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp';
const LYRIC_URL = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg';
/** 照网页客户端：歌词与搜索接口都要求带 Referer。 */
const HEADERS = { Referer: 'https://y.qq.com/' };
const SEARCH_LIMIT = 10;

/** 专辑图：`albummid` 拼固定的封面地址，300×300。 */
const coverOf = (albumMid: string): string =>
  albumMid ? `https://y.qq.com/music/photo_new/T002R300x300M000${albumMid}.jpg` : '';

function candidateOf(item: unknown): LyricsCandidate | null {
  const mid = asText(field(item, 'songmid'));
  const title = asText(field(item, 'songname'));
  if (!mid || !title) return null;
  const cover = coverOf(asText(field(item, 'albummid')));
  return {
    source: 'qq',
    ref: mid,
    title,
    artists: asList(field(item, 'singer'))
      .map((singer) => asText(field(singer, 'name')))
      .filter(Boolean),
    album: asText(field(item, 'albumname')),
    durationMs: Math.round(asNumber(field(item, 'interval')) * 1000),
    ...(cover ? { coverUrl: cover } : {}),
  };
}

/** 另给的译文按行首时间并进正文；空串就不并。 */
function withTranslation(text: string, translation: string) {
  const content = parseLyricsText(text);
  if (!content || content.kind !== 'synced') return content;
  return translation ? syncedContent(attachLineTexts(content.lines, translation, 'translatedLyric')) : content;
}

/**
 * QQ 音乐：网页端的搜索与歌词接口。搜索给曲名、艺人、专辑、时长与专辑图，歌词接口给 LRC 与译文。
 * 只读公开接口、带 `Referer` 即可，不需要签名。字段缺失一律兜底。
 */
export function createQqSource(host: LyricsHttpHost): LyricsSource {
  return {
    id: 'qq',
    async search(query: LyricsQuery, signal?: AbortSignal) {
      const keyword = query.keywords ?? [query.title, query.artists[0]].filter(Boolean).join(' ');
      if (!keyword) return [];
      const params = new URLSearchParams({
        w: keyword,
        format: 'json',
        n: String(SEARCH_LIMIT),
        p: '1',
        cr: '1',
        t: '0',
      });
      const answer = await lyricsGet(host, `${SEARCH_URL}?${params.toString()}`, HEADERS, signal);
      const data = lyricsJson(answer);
      if (answer?.status !== 200 || asNumber(field(data, 'code')) !== 0) return 'failed';
      const list = field(field(field(data, 'data'), 'song'), 'list');
      return asList(list).flatMap((item) => candidateOf(item) ?? []);
    },
    async fetch(candidate: LyricsCandidate, signal?: AbortSignal) {
      const params = new URLSearchParams({
        songmid: candidate.ref,
        format: 'json',
        nobase64: '1',
        g_tk: '5381',
      });
      const answer = await lyricsGet(host, `${LYRIC_URL}?${params.toString()}`, HEADERS, signal);
      const data = lyricsJson(answer);
      if (answer?.status !== 200 || asNumber(field(data, 'retcode')) !== 0) return 'failed';
      const lyric = asText(field(data, 'lyric'));
      if (!lyric.trim()) return 'missing';
      return withTranslation(lyric, asText(field(data, 'trans'))) ?? 'missing';
    },
  };
}
