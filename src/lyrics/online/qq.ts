import { decryptQrcHex, parseQrc } from '@applemusic-like-lyrics/lyric';
import type { LyricsContent } from '../lyricsText.ts';
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
import type {
  LyricsCandidate,
  LyricsFetchResult,
  LyricsQuery,
  LyricsSource,
} from './lyricsSource.ts';

const SEARCH_URL = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp';
const LYRIC_URL = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg';
/** 数字 Song ID 走的 PlayLyricInfo 接口；返回加密 QRC。 */
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
  const songId = asNumber(field(item, 'songid'));
  return {
    source: 'qq',
    ref: mid,
    ...(Number.isInteger(songId) && songId > 0 ? { songId } : {}),
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
  return translation
    ? syncedContent(attachLineTexts(content.lines, translation, 'translatedLyric'))
    : content;
}

/** PlayLyricInfo 返回的十六进制 QRC：明文旧格式直接解成文本，加密格式由 AMLL 解密。 */
function qrcText(hex: string): string {
  const size = Math.floor(hex.length / 2);
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) {
    const value = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    bytes[index] = Number.isFinite(value) ? value : 0;
  }
  return `[offset:0]\n${new TextDecoder().decode(bytes)}`;
}

const XML_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
};
const decodeXml = (text: string): string =>
  text.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (entity) => XML_ENTITIES[entity] ?? entity);

/** 解密后的 QRC 外面包着 `<QrcInfos>`，正文在 `Lyric_1` 的 `LyricContent` 属性里。 */
function lyricContentOf(text: string): string {
  const marker = 'LyricContent="';
  const start = text.indexOf(marker);
  if (start < 0) return text;
  const from = start + marker.length;
  const end = text.indexOf('"', from);
  return end > from ? decodeXml(text.slice(from, end)) : text;
}

function parseQrcText(text: string): LyricsContent | null {
  try {
    return syncedContent(parseQrc(lyricContentOf(text)));
  } catch {
    return null;
  }
}

/**
 * PlayLyricInfo 的 `lyric` 可能是加密 QRC（DES + deflate + XML），也可能是老的明文十六进制 QRC。
 * 先按加密解；解不开再退回十六进制直解。非十六进制正文按纯文本处理。
 */
export function decodeQqQrc(hex: string): LyricsContent | 'missing' {
  const value = hex.trim();
  if (!value) return 'missing';
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0)
    return parseQrcText(value) ?? 'missing';
  try {
    const decoded = parseQrcText(decryptQrcHex(value));
    if (decoded) return decoded;
  } catch {
    // 不是加密格式，落到下面的明文直解。
  }
  return parseQrcText(qrcText(value)) ?? 'missing';
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

/** 手输 MID 先解析成数字 Song ID，才能走 PlayLyricInfo 的逐字 QRC。 */
async function resolveMid(
  host: LyricsHttpHost,
  mid: string,
  signal?: AbortSignal,
): Promise<LyricsCandidate | null> {
  const answer = await lyricsPost(
    host,
    `${SONGID_LYRIC_URL}?pcachetime=${Date.now()}`,
    {
      comm: { ct: 24, cv: 0, uin: '0' },
      req_0: {
        module: 'music.pf_song_detail_svr',
        method: 'get_song_detail',
        param: { song_mid: mid },
      },
    },
    HEADERS,
    signal,
  );
  if (!answer || answer.status !== 200) return null;
  const data = lyricsJson(answer);
  const track = field(field(field(data, 'req_0'), 'data'), 'track_info');
  const id = asNumber(field(track, 'id'));
  const title = asText(field(track, 'name')) || asText(field(track, 'title'));
  if (!Number.isInteger(id) || id <= 0 || !title) return null;
  const artists = asList(field(track, 'singer'))
    .map((singer) => asText(field(singer, 'name')))
    .filter(Boolean);
  return {
    source: 'qq',
    ref: mid,
    idKind: 'mid',
    songId: id,
    title,
    artists,
    album: asText(field(field(track, 'album'), 'name')),
    durationMs: Math.round(asNumber(field(track, 'interval')) * 1000),
  };
}

async function fetchQrc(
  host: LyricsHttpHost,
  songId: number,
  durationMs: number,
  signal?: AbortSignal,
): Promise<LyricsFetchResult> {
  const answer = await lyricsPost(
    host,
    `${SONGID_LYRIC_URL}?pcachetime=${Date.now()}`,
    songIdBody(songId, durationMs),
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
  return decodeQqQrc(lyric);
}

async function fetchLrc(
  host: LyricsHttpHost,
  mid: string,
  signal?: AbortSignal,
): Promise<LyricsFetchResult> {
  const params = new URLSearchParams({
    songmid: mid,
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
}

/**
 * QQ 音乐：网页端的搜索与歌词接口。搜索给曲名、艺人、专辑、时长、专辑图与数字 Song ID；
 * 取词优先用 Song ID 走 PlayLyricInfo 的逐字 QRC，失败再按 MID 回退到 LRC。
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
          const resolved = await resolveMid(host, value, signal);
          return [
            resolved ?? {
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
      const keyword =
        query.keywords ??
        [query.title, ...query.artists].filter(Boolean).join(' ');
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
      const songId =
        candidate.songId ??
        (candidate.idKind === 'songId' ? Number(candidate.ref) : 0);
      const qrc =
        Number.isInteger(songId) && songId > 0
          ? await fetchQrc(host, songId, candidate.durationMs, signal)
          : null;
      if (qrc !== null && qrc !== 'missing' && qrc !== 'failed') return qrc;
      // 手输数字 ID 没有 MID 可回退；搜索候选与手输 MID 还能走 LRC。
      if (candidate.idKind === 'songId') return qrc ?? 'missing';
      const lrc = await fetchLrc(host, candidate.ref, signal);
      if (lrc !== 'missing' && lrc !== 'failed') return lrc;
      return qrc === 'failed' || lrc === 'failed' ? 'failed' : 'missing';
    },
  };
}
