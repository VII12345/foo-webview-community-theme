// KRC 的解密照 Lyricify Lyrics Helper（https://github.com/WXRIW/Lyricify-Lyrics-Helper，Apache License 2.0，
// Copyright 2023 XY Wang, WXRIW）
// 提交 53a2f81 的 Decrypter/Krc/Decrypter.cs 改写为 TypeScript，解压改用浏览器的 DecompressionStream。
import type { LyricLine, LyricWord } from '@applemusic-like-lyrics/core';
import { syncedContent } from '../lyricsText.ts';
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

const SEARCH_URL = 'https://lyrics.kugou.com/search';
/** 按歌曲 Hash 查歌词候选；返回的 id/accesskey 仍走同一个下载接口。 */
const HASH_SEARCH_URL = 'https://krcs.kugou.com/search';
const DOWNLOAD_URL = 'https://lyrics.kugou.com/download';
/** 歌词接口不给封面，靠歌搜索接口的 `Image` 字段补；`{size}` 是尺寸占位符。 */
const SONG_SEARCH_URL = 'https://songsearch.kugou.com/song_search_v2';

/** KRC 的固定密钥：解开 base64、去掉 4 字节的 `krc1` 头之后，逐字节按它循环异或，再 zlib 解压。 */
const KRC_KEY = [
  0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69,
];

/** 把酷狗下载接口给的 base64 正文解成 KRC 文本；格式不对或解压失败答 null。 */
export async function decryptKrc(base64: string): Promise<string | null> {
  try {
    const raw = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    if (raw.length <= 4) return null;
    const body = raw
      .subarray(4)
      .map((byte, index) => byte ^ (KRC_KEY[index % KRC_KEY.length] ?? 0));
    const stream = new Blob([body]).stream().pipeThrough(new DecompressionStream('deflate'));
    return await new Response(stream).text();
  } catch {
    return null;
  }
}

/** 行头 `[开始,时长]`，毫秒；字头 `<相对行首的偏移,时长,0>`。 */
const LINE = /^\[(\d+),(\d+)\](.*)$/;
const WORD = /<(\d+),(\d+),\d+>([^<]*)/g;

/** `[language:]` 里的翻译与音译：按行序与歌词行一一对应。type 1 是译文（每行一段），type 0 是音译（每行按字给）。 */
function languageLines(header: string): { translation: string[]; roman: string[] } {
  const empty = { translation: [], roman: [] };
  try {
    const bytes = Uint8Array.from(atob(header), (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const content: unknown =
      typeof parsed === 'object' && parsed ? Reflect.get(parsed, 'content') : undefined;
    if (!Array.isArray(content)) return empty;
    const linesOf = (type: number): string[] => {
      const block: unknown = content.find(
        (item: unknown) => typeof item === 'object' && item && Reflect.get(item, 'type') === type,
      );
      const rows: unknown =
        typeof block === 'object' && block ? Reflect.get(block, 'lyricContent') : undefined;
      if (!Array.isArray(rows)) return [];
      return rows.map((row: unknown) =>
        Array.isArray(row)
          ? row
              .filter((part) => typeof part === 'string')
              .join('')
              .trim()
          : '',
      );
    };
    return { translation: linesOf(1), roman: linesOf(0) };
  } catch {
    return empty;
  }
}

/** KRC 文本解析成 AMLL 的行；逐字时间换成绝对毫秒。没有一行带时间时答空数组。 */
export function parseKrc(text: string): LyricLine[] {
  let extra: { translation: string[]; roman: string[] } = { translation: [], roman: [] };
  const lines: LyricLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[language:')) {
      extra = languageLines(line.slice('[language:'.length, line.indexOf(']')));
      continue;
    }
    const head = LINE.exec(line);
    if (!head) continue;
    const start = Number(head[1]);
    const end = start + Number(head[2]);
    const body = head[3] ?? '';
    const words: LyricWord[] = [...body.matchAll(WORD)].map((match) => {
      const wordStart = start + Number(match[1]);
      return { startTime: wordStart, endTime: wordStart + Number(match[2]), word: match[3] ?? '' };
    });
    lines.push({
      words: words.length > 0 ? words : [{ startTime: start, endTime: end, word: body }],
      translatedLyric: '',
      romanLyric: '',
      startTime: start,
      endTime: end,
      isBG: false,
      isDuet: false,
    });
  }
  return lines.map((line, index) => ({
    ...line,
    translatedLyric: extra.translation[index] ?? '',
    romanLyric: extra.roman[index] ?? '',
  }));
}

/** 酷狗有的接口把 id/accesskey 写成数字；统一转成候选 ref 能用的字符串。 */
const idText = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : '';

/**
 * 酷狗候选的 duration：普通候选按秒（274），UGC 候选按毫秒（274320）。小于 10000 的值按秒处理，
 * 否则按毫秒；字符串数字也接受。
 */
export function kugouDurationMs(value: unknown): number {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : 0;
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number < 10_000 ? Math.round(number * 1000) : Math.round(number);
}

/**
 * 候选的 `ref` 是下载要的 id 与 accesskey，中间用冒号隔开。酷狗的候选不带专辑，合作艺人用顿号连写。
 * 自动搜索标成 ugc 的是未经审核的用户上传，有时挂着别的歌的词，不收；用户手动按关键词或 Hash 找时
 * 允许 UGC，否则唯一有词的那条会被丢掉。
 */
function candidateOf(item: unknown, allowUgc: boolean): LyricsCandidate | null {
  if (!allowUgc && asText(field(item, 'product_from')).toLowerCase() === 'ugc') return null;
  const id = idText(field(item, 'id'));
  const key = idText(field(item, 'accesskey'));
  const title = asText(field(item, 'song'));
  if (!id || !key || !title) return null;
  const singer = asText(field(item, 'singer'));
  return {
    source: 'kugou',
    ref: `${id}:${key}`,
    title,
    artists: singer.split('、').filter(Boolean),
    album: '',
    durationMs: kugouDurationMs(field(item, 'duration')),
  };
}

const normalizeKeyword = (value: string) =>
  value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** 搜索页默认是「曲名 艺人」；酷狗对这首歌的默认查询改用自动取词的写法。 */
function keywordOf(query: LyricsQuery): { keyword: string; useDuration: boolean } {
  const manual = query.keywords?.trim();
  const automatic = [query.artists[0], query.title].filter(Boolean).join(' - ');
  const defaults = [
    [query.title, query.artists[0]].filter(Boolean).join(' '),
    [query.title, ...query.artists].filter(Boolean).join(' '),
    [query.title, query.artists.join(', ')].filter(Boolean).join(' '),
    automatic,
  ];
  const isDefault =
    !manual || defaults.some((value) => normalizeKeyword(value) === normalizeKeyword(manual));
  return {
    keyword: isDefault ? automatic : (manual ?? ''),
    useDuration: isDefault && query.durationMs > 0,
  };
}

/** 酷狗歌词库：按「艺人 - 曲名」与时长（毫秒）搜，下载 KRC 逐字词。 */
export function createKugouSource(host: LyricsHttpHost): LyricsSource {
  return {
    id: 'kugou',
    async search(query: LyricsQuery, signal?: AbortSignal) {
      // 用户给了歌曲 Hash：用 Hash 查候选，关键词与时长留空。Hash 常常只对应 UGC 歌词。
      const manual = query.id;
      if (manual?.source === 'kugou') {
        if (manual.kind !== 'kugouHash' || !manual.value.trim()) return [];
        const params = new URLSearchParams({
          ver: '1',
          man: 'yes',
          client: 'pc',
          keyword: '',
          duration: '',
          hash: manual.value.trim(),
          album_audio_id: '',
        });
        const answer = await lyricsGet(
          host,
          `${HASH_SEARCH_URL}?${params.toString()}`,
          undefined,
          signal,
        );
        const data = lyricsJson(answer);
        if (answer?.status !== 200 || asNumber(field(data, 'status')) !== 200) return 'failed';
        return asList(field(data, 'candidates')).flatMap(
          (item) => candidateOf(item, true) ?? [],
        );
      }
      const { keyword, useDuration } = keywordOf(query);
      // 手动关键词/ID 搜索允许 UGC；播放时的自动搜索仍过滤，避免挂错词的版本。
      const allowUgc = query.id !== undefined || query.keywords !== undefined;
      const params = new URLSearchParams({ ver: '1', man: 'yes', client: 'pc', keyword });
      // 酷狗搜索的 duration 是秒；发送毫秒会把 UGC 候选排到前面并让普通候选落选。
      if (useDuration) params.set('duration', String(Math.round(query.durationMs / 1000)));
      const answer = await lyricsGet(host, `${SEARCH_URL}?${params.toString()}`, undefined, signal);
      const data = lyricsJson(answer);
      if (answer?.status !== 200 || asNumber(field(data, 'status')) !== 200) return 'failed';
      return asList(field(data, 'candidates')).flatMap(
        (item) => candidateOf(item, allowUgc) ?? [],
      );
    },
    /**
     * 歌词接口不返回封面，改用歌搜索接口：按「曲名 艺人」搜，取首条的 `Image`（形如
     * `http://imge.kugou.com/stdmusic/{size}/….jpg`），把尺寸占位符换成 400。无匹配或失败答空串。
     */
    async cover(candidate, signal) {
      const keyword = [candidate.title, candidate.artists[0]].filter(Boolean).join(' ');
      if (!keyword) return '';
      const params = new URLSearchParams({ keyword, page: '1', pagesize: '1' });
      const answer = await lyricsGet(
        host,
        `${SONG_SEARCH_URL}?${params.toString()}`,
        undefined,
        signal,
      );
      const data = lyricsJson(answer);
      if (answer?.status !== 200) return '';
      const first = asList(field(field(data, 'data'), 'lists'))[0];
      const image = asText(field(first, 'Image'));
      // 歌搜索给的封面地址是 http，且带尺寸占位符；换成 400 并升到 https，交给上层下载。
      return image ? image.replace('{size}', '400').replace(/^http:/, 'https:') : '';
    },
    async fetch(candidate: LyricsCandidate, signal?: AbortSignal) {
      const [id = '', key = ''] = candidate.ref.split(':');
      const params = new URLSearchParams({
        ver: '1',
        client: 'pc',
        id,
        accesskey: key,
        fmt: 'krc',
        charset: 'utf8',
      });
      const answer = await lyricsGet(
        host,
        `${DOWNLOAD_URL}?${params.toString()}`,
        undefined,
        signal,
      );
      const data = lyricsJson(answer);
      if (answer?.status !== 200 || asNumber(field(data, 'status')) !== 200) return 'failed';
      const body = asText(field(data, 'content'));
      if (!body) return 'missing';
      const text = await decryptKrc(body);
      if (text === null) return 'failed';
      return syncedContent(parseKrc(text)) ?? 'missing';
    },
  };
}
