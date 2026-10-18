import { describe, expect, it } from 'vitest';
import { createKugouSource, decryptKrc, parseKrc } from '../../../../src/lyrics/online/kugou.ts';
import { rankCandidates } from '../../../../src/lyrics/online/lyricsMatch.ts';
import type { LyricsCandidate, LyricsQuery } from '../../../../src/lyrics/online/lyricsSource.ts';
import { installLyricsHttp, json } from '../../../fixtures/lyricsHttp.ts';

const SEARCH = 'https://lyrics.kugou.com/search';
const HASH_SEARCH = 'https://krcs.kugou.com/search';
const DOWNLOAD = 'https://lyrics.kugou.com/download';
const SONG_SEARCH = 'https://songsearch.kugou.com/song_search_v2';

const KEY = [
  0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69,
];

/** 照酷狗的做法加密：zlib 压缩、逐字节异或、前面加 `krc1`，再转 base64。 */
async function encryptKrc(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate'));
  const packed = new Uint8Array(await new Response(stream).arrayBuffer());
  const body = packed.map((byte, index) => byte ^ (KEY[index % KEY.length] ?? 0));
  const raw = new Uint8Array([...new TextEncoder().encode('krc1'), ...body]);
  return btoa(String.fromCharCode(...raw));
}

const languageTag = (content: unknown) =>
  `[language:${btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ content }))))}]`;

const KRC = [
  '[ar:林俊杰]',
  languageTag([{ type: 1, lyricContent: [['江南的译文'], ['第二行译文']] }]),
  '[1000,2000]<0,500,0>风<500,1500,0>到这里',
  '[3000,1000]<0,1000,0>就是粘',
].join('\n');

const query: LyricsQuery = {
  title: '江南',
  artists: ['林俊杰'],
  album: '',
  albumArtists: [],
  durationMs: 267_946,
};

const candidate: LyricsCandidate = {
  source: 'kugou',
  ref: '103868636:733CA696',
  title: '江南',
  artists: ['林俊杰'],
  album: '',
  durationMs: 267_946,
};

describe('KRC', () => {
  it('解密后解析成逐字行，字的时间换成绝对毫秒，[language:] 的译文按行序配上', async () => {
    const text = await decryptKrc(await encryptKrc(KRC));
    expect(text).toBe(KRC);
    expect(parseKrc(text ?? '')).toMatchObject([
      {
        startTime: 1000,
        endTime: 3000,
        translatedLyric: '江南的译文',
        words: [
          { startTime: 1000, endTime: 1500, word: '风' },
          { startTime: 1500, endTime: 3000, word: '到这里' },
        ],
      },
      { startTime: 3000, translatedLyric: '第二行译文' },
    ]);
  });

  it('不是 KRC 的正文解不出来答 null', async () => {
    expect(await decryptKrc('a3JjMQ==')).toBeNull();
    expect(await decryptKrc('不是 base64')).toBeNull();
  });
});

describe('酷狗来源', () => {
  it('按「艺人 - 曲名」与秒时长搜，自动搜索跳过用户上传，顿号连写的艺人拆开', async () => {
    const http = installLyricsHttp({
      [SEARCH]: json({
        status: 200,
        candidates: [
          {
            id: '103868636',
            accesskey: '733CA696',
            song: '江南',
            singer: '林俊杰',
            duration: 267_946,
          },
          { id: '9', accesskey: 'K', song: '江南', singer: '林俊杰', product_from: 'ugc' },
          { id: '10', accesskey: 'D', song: '江南', singer: '林俊杰、A-Lin', duration: 1 },
        ],
      }),
    });
    expect(await createKugouSource(http.host).search(query)).toEqual([
      candidate,
      { ...candidate, ref: '10:D', artists: ['林俊杰', 'A-Lin'], durationMs: 1000 },
    ]);
    const params = http.requests()[0]?.url.searchParams;
    expect(params?.get('keyword')).toBe('林俊杰 - 江南');
    expect(params?.get('duration')).toBe('268');
  });

  it('普通候选的 duration 是秒，自动搜索按毫秒比较并跳过 UGC', async () => {
    const http = installLyricsHttp({
      [SEARCH]: json({
        status: 200,
        candidates: [
          {
            id: '61386596',
            accesskey: 'D09F57F7',
            song: '离忧',
            singer: '司南',
            duration: 274,
            product_from: '不是ugc',
          },
          {
            id: '43426574',
            accesskey: '48793CBB',
            song: '离忧',
            singer: '司南',
            duration: 274320,
            product_from: 'ugc',
          },
        ],
      }),
    });
    const found = (await createKugouSource(http.host).search({
      ...query,
      title: '离忧',
      artists: ['司南'],
      durationMs: 274320,
    })) as LyricsCandidate[];
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ ref: '61386596:D09F57F7', durationMs: 274000 });
  });

  it('手动关键词与 Hash 搜索允许 UGC，数字 id 也转成字符串', async () => {
    const keywordHttp = installLyricsHttp({
      [SEARCH]: json({
        status: 200,
        candidates: [
          {
            id: 43426574,
            accesskey: 48793,
            song: '离忧',
            singer: '司南',
            duration: 274320,
            product_from: 'UGC',
          },
        ],
      }),
    });
    const manual = (await createKugouSource(keywordHttp.host).search({
      ...query,
      keywords: '离忧 司南',
    })) as LyricsCandidate[];
    expect(manual[0]).toMatchObject({ ref: '43426574:48793', durationMs: 274320 });

    const hashHttp = installLyricsHttp({
      [HASH_SEARCH]: json({
        status: 200,
        candidates: [
          {
            id: '43426574',
            accesskey: '48793CBB',
            song: '离忧',
            singer: '司南',
            duration: 274320,
            product_from: 'ugc',
          },
        ],
      }),
    });
    const hash = (await createKugouSource(hashHttp.host).search({
      ...query,
      id: { source: 'kugou', kind: 'kugouHash', value: '71c314341a3a20c6167fe2b8d66f1bd3' },
    })) as LyricsCandidate[];
    expect(hash[0]).toMatchObject({ ref: '43426574:48793CBB', durationMs: 274320 });
  });

  it('多艺人自动搜索用「全部艺人 - 曲名」，带回 244 秒官方词并过滤 UGC/伴奏', async () => {
    const official = {
      id: '586206065',
      accesskey: 'C1A389B98F927BD971B145EAD57D33AB',
      song: '天和山雨雪',
      singer: '银临、司南',
      duration: 244000,
      product_from: '官方推荐歌词',
      language: '国语',
    };
    const http = installLyricsHttp({
      [SEARCH]: json({
        status: 200,
        candidates: [
          {
            id: '549893601',
            accesskey: 'SHORT',
            song: '天和山雨雪',
            singer: '银临、司南',
            duration: 35000,
            product_from: '第三方歌词',
          },
          {
            id: '555988013',
            accesskey: 'CLIP',
            song: '天和山雨雪',
            singer: '银临、司南',
            duration: 124000,
            product_from: '第三方歌词',
          },
          official,
          { ...official, id: '555597381', accesskey: 'UGC', product_from: 'ugc' },
          { ...official, id: '550681244', accesskey: 'INST', language: '伴奏' },
          { ...official, id: '549019851', accesskey: 'SECOND' },
        ],
      }),
    });
    const songQuery: LyricsQuery = {
      ...query,
      title: '天和山雨雪',
      artists: ['银临', '司南'],
      durationMs: 244000,
    };
    const found = (await createKugouSource(http.host).search(songQuery)) as LyricsCandidate[];
    expect(http.requests()[0]?.url.searchParams.get('keyword')).toBe(
      '银临、司南 - 天和山雨雪',
    );
    expect(found.map((item) => item.ref)).toEqual([
      '549893601:SHORT',
      '555988013:CLIP',
      '586206065:C1A389B98F927BD971B145EAD57D33AB',
      '549019851:SECOND',
    ]);
    const ranked = rankCandidates(songQuery, found, 'high');
    expect(ranked[0]?.candidate.ref).toBe('586206065:C1A389B98F927BD971B145EAD57D33AB');
  });

  it('用户给的 28cdf Hash 能带回官方 244 秒候选', async () => {
    const http = installLyricsHttp({
      [HASH_SEARCH]: json({
        status: 200,
        candidates: [
          {
            id: '586206065',
            accesskey: 'C1A389B98F927BD971B145EAD57D33AB',
            song: '天和山雨雪',
            singer: '银临、司南',
            duration: 244000,
            product_from: '官方推荐歌词',
            language: '国语',
          },
        ],
      }),
    });
    const [found] = (await createKugouSource(http.host).search({
      ...query,
      title: '天和山雨雪',
      artists: ['银临', '司南'],
      durationMs: 244000,
      id: { source: 'kugou', kind: 'kugouHash', value: '28cdf25767acfa36c3d715c5e3b643f9' },
    })) as LyricsCandidate[];
    expect(found).toMatchObject({
      ref: '586206065:C1A389B98F927BD971B145EAD57D33AB',
      title: '天和山雨雪',
      artists: ['银临', '司南'],
      durationMs: 244000,
    });
    const params = http.requests()[0]?.url.searchParams;
    expect(params?.get('hash')).toBe('28cdf25767acfa36c3d715c5e3b643f9');
    expect(params?.get('keyword')).toBe('');
  });

  it('手动输入的默认写法换成全部艺人规范形式，规范关键词只有短片时回退合并', async () => {
    const canonical = installLyricsHttp({
      [SEARCH]: json({ status: 200, candidates: [] }),
    });
    await createKugouSource(canonical.host).search({
      ...query,
      title: '天和山雨雪',
      artists: ['银临', '司南'],
      durationMs: 244000,
      keywords: '天和山雨雪 银临/司南',
    });
    expect(canonical.requests()[0]?.url.searchParams.get('keyword')).toBe(
      '银临、司南 - 天和山雨雪',
    );
    expect(canonical.requests()[0]?.url.searchParams.get('duration')).toBe('244');

    const http = installLyricsHttp({
      [SEARCH]: (url) => {
        const keyword = url.searchParams.get('keyword');
        if (keyword === '银临、司南 - 天和山雨雪')
          return json({
            status: 200,
            candidates: [
              {
                id: '549893601',
                accesskey: 'SHORT',
                song: '天和山雨雪',
                singer: '银临、司南',
                duration: 35000,
              },
            ],
          });
        if (keyword === '天和山雨雪 银临')
          return json({
            status: 200,
            candidates: [
              {
                id: '586206065',
                accesskey: 'C1A389B98F927BD971B145EAD57D33AB',
                song: '天和山雨雪',
                singer: '银临、司南',
                duration: 244000,
                product_from: '官方推荐歌词',
              },
            ],
          });
        return json({ status: 200, candidates: [] });
      },
    });
    const found = (await createKugouSource(http.host).search({
      ...query,
      title: '天和山雨雪',
      artists: ['银临', '司南'],
      durationMs: 244000,
    })) as LyricsCandidate[];
    expect(found.map((item) => item.ref)).toEqual([
      '549893601:SHORT',
      '586206065:C1A389B98F927BD971B145EAD57D33AB',
    ]);
    expect(http.requests().map((request) => request.url.searchParams.get('keyword'))).toEqual([
      '银临、司南 - 天和山雨雪',
      '天和山雨雪 银临',
    ]);
  });

  it('按 ref 里的 id 与 accesskey 下载 KRC，解成逐字词', async () => {
    const content = await encryptKrc(KRC);
    const http = installLyricsHttp({ [DOWNLOAD]: json({ status: 200, content, fmt: 'krc' }) });
    expect(await createKugouSource(http.host).fetch(candidate)).toMatchObject({
      kind: 'synced',
      lines: [{ words: [{ word: '风' }, { word: '到这里' }] }, { words: [{ word: '就是粘' }] }],
    });
    const params = http.requests()[0]?.url.searchParams;
    expect(params?.get('id')).toBe('103868636');
    expect(params?.get('accesskey')).toBe('733CA696');
    expect(params?.get('fmt')).toBe('krc');
  });

  it('手动 Hash：用 krcs 的 hash 参数查候选，后续仍走 id/accesskey 下载', async () => {
    const http = installLyricsHttp({
      [HASH_SEARCH]: json({
        status: 200,
        candidates: [
          {
            id: '103868636',
            accesskey: '733CA696',
            song: '江南',
            singer: '林俊杰',
            duration: 267_946,
          },
        ],
      }),
    });
    const [found] = (await createKugouSource(http.host).search({
      ...query,
      id: { source: 'kugou', kind: 'kugouHash', value: 'ABC123' },
    })) as LyricsCandidate[];
    expect(found).toMatchObject({ source: 'kugou', ref: '103868636:733CA696' });
    const params = http.requests()[0]?.url.searchParams;
    expect(http.requests()[0]?.url.pathname).toBe('/search');
    expect(params?.get('hash')).toBe('ABC123');
    expect(params?.get('keyword')).toBe('');
    const content = await encryptKrc(KRC);
    const download = installLyricsHttp({
      [DOWNLOAD]: json({ status: 200, content, fmt: 'krc' }),
    });
    expect(await createKugouSource(download.host).fetch(found!)).toMatchObject({
      kind: 'synced',
    });
  });

  it('正文为空答没有；凭据不对（status 403）与解不开的正文答失败', async () => {
    const empty = installLyricsHttp({ [DOWNLOAD]: json({ status: 200, content: '' }) });
    expect(await createKugouSource(empty.host).fetch(candidate)).toBe('missing');
    const denied = installLyricsHttp({
      [DOWNLOAD]: json({ status: 403, info: 'Bad Accesskey', content: '' }),
    });
    expect(await createKugouSource(denied.host).fetch(candidate)).toBe('failed');
    const garbled = installLyricsHttp({ [DOWNLOAD]: json({ status: 200, content: 'a3JjMQ==' }) });
    expect(await createKugouSource(garbled.host).fetch(candidate)).toBe('failed');
  });

  it('封面走歌搜索的 Image 字段：尺寸占位符换 400、升到 https；无匹配答空串', async () => {
    const http = installLyricsHttp({
      [SONG_SEARCH]: json({
        data: {
          lists: [
            { Image: 'http://imge.kugou.com/stdmusic/{size}/20181219/20181219183350812690.jpg' },
          ],
        },
      }),
    });
    expect(await createKugouSource(http.host).cover(candidate)).toBe(
      'https://imge.kugou.com/stdmusic/400/20181219/20181219183350812690.jpg',
    );
    expect(http.requests()[0]?.url.searchParams.get('keyword')).toBe('江南 林俊杰');
    const empty = installLyricsHttp({ [SONG_SEARCH]: json({ data: { lists: [] } }) });
    expect(await createKugouSource(empty.host).cover(candidate)).toBe('');
  });
});
