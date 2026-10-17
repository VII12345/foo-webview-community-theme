import { parseQrc } from '@applemusic-like-lyrics/lyric';
import { attachLineTexts, parseLyricsText, syncedContent } from '../lyricsText.ts';
import {
  asList,
  asNumber,
  asText,
  field,
  lyricsGet,
  lyricsJson,
  lyricsPost,
  type LyricsHttpHost,
} from './lyricsHttp.ts';
import type { LyricsCandidate, LyricsQuery, LyricsSource } from './lyricsSource.ts';

const SEARCH_URL = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp';
const LYRIC_URL = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg';
/** 数字 Song ID 走的 PlayLyricInfo 接口；返回十六进制 QRC。 */
const SONGID_LYRIC_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
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

/** PlayLyricInfo 返回的十六进制 QRC：先解成文本，再按 QRC 解析出逐字时间。 */
function qrcText(hex: string): string {
  const size = Math.floor(hex.length / 2);
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) {
    const value = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    bytes[index] = Number.isFinite(value) ? value : 0;
  }
  return `[offset:0]\n${new TextDecoder().decode(bytes)}`;
}

/** 数字 Song ID 取 QRC：请求体照 QQ 网页客户端。 */
function songIdBody(id: number, durationMs: number) {
  return {
    comm: {
      _channelid: '0',
      _os_version: '6.2.9200-2',
      authst: '',
      ct: '19',
      cv: '1873',
      patch: '118',
      psrf_access_token_expiresAt: 0,
      psrf_qqaccess_token: '',
      psrf_qqopenid: '',
      psrf_qqunionid: '',
      tmeAppID: 'qqmusic',
      tmeLoginType: 2,
      uin: '0',
      wid: '0',
    },
    'music.musichallSong.PlayLyricInfo.GetPlayLyricInfo': {
      method: 'GetPlayLyricInfo',
      module: 'music.musichallSong.PlayLyricInfo',
      param: {
        albumName: '',
        crypt: 1,
        ct: 19,
        cv: 1873,
        interval: Math.round(durationMs / 1000),
        lrc_t: 0,
        qrc: 1,
        qrc_t: 0,
        roma: 1,
        roma_t: 0,
        singerName: '',
        songID: id,
        songName: '',
        trans: 1,
        trans_t: 0,
        type: -1,
      },
    },
  };
}

/**
 * QQ 音乐：网页端的搜索与歌词接口。搜索给曲名、艺人、专辑、时长与专辑图，歌词接口给 LRC 与译文。
 * 只读公开接口、带 `Referer` 即可，不需要签名。字段缺失一律兜底。
 */
export function createQqSource(host: LyricsHttpHost): LyricsSource {
  return {
    id: 'qq',
    async search(query: LyricsQuery, signal?: AbortSignal) {
      // 用户给的是 QQ 数字 Song ID 或 MID：直接造一条候选，不按关键词搜。
      const manual = query.id;
      if (manual?.source === 'qq') {
        const value = manual.value.trim();
        if (manual.kind === 'qqSongId') {
          if (!/^\d+$/.test(value)) return [];
          return [
            {
              source: 'qq' as const,
              ref: value,
              idKind: 'songId' as const,
              title: value,
              artists: [],
              album: '',
              durationMs: 0,
            },
          ];
        }
        if (manual.kind === 'qqMid') {
          if (!value) return [];
          return [
            {
              source: 'qq' as const,
              ref: value,
              idKind: 'mid' as const,
              title: value,
              artists: [],
              album: '',
              durationMs: 0,
            },
          ];
        }
        return [];
      }
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
      if (candidate.idKind === 'songId') {
        const id = Number(candidate.ref);
        if (!Number.isInteger(id) || id <= 0) return 'missing';
        const answer = await lyricsPost(
          host,
          `${SONGID_LYRIC_URL}?pcachetime=${Date.now()}`,
          songIdBody(id, candidate.durationMs),
          HEADERS,
          signal,
        );
        if (!answer) return 'failed';
        if (answer.status !== 200) return 'failed';
        const data = lyricsJson(answer);
        const root = field(data, 'music.musichallSong.PlayLyricInfo.GetPlayLyricInfo');
        if (asNumber(field(data, 'code')) !== 0 || asNumber(field(root, 'code')) !== 0)
          return 'failed';
        const lyric = asText(field(field(root, 'data'), 'lyric'));
        if (!lyric.trim()) return 'missing';
        try {
          return syncedContent(parseQrc(qrcText(lyric))) ?? 'missing';
        } catch {
          return 'failed';
        }
      }
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
