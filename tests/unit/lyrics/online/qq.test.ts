import { encryptQrcHex } from '@applemusic-like-lyrics/lyric';
import { describe, expect, it } from 'vitest';
import { createQqSource } from '../../../../src/lyrics/online/qq.ts';
import type { LyricsCandidate, LyricsQuery } from '../../../../src/lyrics/online/lyricsSource.ts';
import { installLyricsHttp, json } from '../../../fixtures/lyricsHttp.ts';

const SEARCH = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp';
const LYRIC = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg';
const SONGID = 'https://u.y.qq.com/cgi-bin/musicu.fcg';

/** QRC 文本转接口返回的十六进制。 */
const hexOf = (text: string) =>
  [...new TextEncoder().encode(text)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

const query: LyricsQuery = {
  title: '晴天',
  artists: ['周杰伦'],
  album: '叶惠美',
  albumArtists: [],
  durationMs: 269_000,
};

const candidate: LyricsCandidate = {
  source: 'qq',
  ref: '0039MnYb0qxYhV',
  title: '晴天',
  artists: ['周杰伦'],
  album: '叶惠美',
  durationMs: 269_000,
  coverUrl: 'https://y.qq.com/music/photo_new/T002R300x300M000000MkMni19ClKG.jpg',
};

describe('QQ 音乐来源', () => {
  it('按曲名加艺人搜，带 Referer；候选取 songmid、艺人、专辑、秒换毫秒时长与专辑图', async () => {
    const http = installLyricsHttp({
      [SEARCH]: json({
        code: 0,
        data: {
          song: {
            list: [
              {
                songmid: '0039MnYb0qxYhV',
                songname: '晴天',
                albummid: '000MkMni19ClKG',
                albumname: '叶惠美',
                interval: 269,
                singer: [{ name: '周杰伦' }],
              },
              { songmid: '', songname: '缺 mid 的不要' },
            ],
          },
        },
      }),
    });
    expect(await createQqSource(http.host).search(query)).toEqual([candidate]);
    const [request] = http.requests();
    expect(request?.url.searchParams.get('w')).toBe('晴天 周杰伦');
    expect(request?.header('Referer')).toBe('https://y.qq.com/');
  });

  it('关键词搜索优先于曲名加艺人', async () => {
    const http = installLyricsHttp({ [SEARCH]: json({ code: 0, data: { song: { list: [] } } }) });
    await createQqSource(http.host).search({ ...query, keywords: '自定义关键词' });
    expect(http.requests()[0]?.url.searchParams.get('w')).toBe('自定义关键词');
  });

  it('取词把 LRC 与译文并进来；无词答没有、失败答失败', async () => {
    const http = installLyricsHttp({
      [LYRIC]: json({
        retcode: 0,
        lyric: '[00:40.00]第一句\n[00:45.00]第二句',
        trans: '[00:40.00]译文一\n[00:45.00]译文二',
      }),
    });
    expect(await createQqSource(http.host).fetch(candidate)).toMatchObject({
      kind: 'synced',
      lines: [
        { translatedLyric: '译文一', words: [{ word: '第一句' }] },
        { translatedLyric: '译文二', words: [{ word: '第二句' }] },
      ],
    });
    const params = http.requests()[0]?.url.searchParams;
    expect(params?.get('songmid')).toBe('0039MnYb0qxYhV');
    expect(params?.get('nobase64')).toBe('1');

    const empty = installLyricsHttp({ [LYRIC]: json({ retcode: 0, lyric: '', trans: '' }) });
    expect(await createQqSource(empty.host).fetch(candidate)).toBe('missing');
    const denied = installLyricsHttp({ [LYRIC]: json({ retcode: -1, lyric: '' }) });
    expect(await createQqSource(denied.host).fetch(candidate)).toBe('failed');
  });

  it('手动 MID 直接生成候选并沿用 songmid 取词', async () => {
    const [mid] = (await createQqSource(installLyricsHttp({}).host).search({
      ...query,
      id: { source: 'qq', kind: 'qqMid', value: '0039MnYb0qxYhV' },
    })) as LyricsCandidate[];
    expect(mid).toMatchObject({ source: 'qq', ref: '0039MnYb0qxYhV', idKind: 'mid' });
    const http = installLyricsHttp({
      [LYRIC]: json({ retcode: 0, lyric: '[00:01]手工 MID', trans: '' }),
    });
    expect(await createQqSource(http.host).fetch(mid!)).toMatchObject({
      kind: 'synced',
      lines: [{ words: [{ word: '手工 MID' }] }],
    });
    expect(http.requests()[0]?.url.searchParams.get('songmid')).toBe('0039MnYb0qxYhV');
  });

  it('手动数字 Song ID：POST PlayLyricInfo 取 QRC 逐字词', async () => {
    const qrc = '[1000,2000]风(0,500)到这里(500,1500)';
    const http = installLyricsHttp({
      [SONGID]: json({
        code: 0,
        'music.musichallSong.PlayLyricInfo.GetPlayLyricInfo': {
          code: 0,
          data: { lyric: hexOf(qrc) },
        },
      }),
    });
    const [songId] = (await createQqSource(http.host).search({
      ...query,
      id: { source: 'qq', kind: 'qqSongId', value: '2048982668' },
    })) as LyricsCandidate[];
    expect(songId).toMatchObject({ source: 'qq', ref: '2048982668', idKind: 'songId' });
    expect(await createQqSource(http.host).fetch(songId!)).toMatchObject({
      kind: 'synced',
      lines: [{ words: [{ word: '风' }, { word: '到这里' }] }],
    });
    expect(http.posts()[0]?.url.pathname).toBe('/cgi-bin/musicu.fcg');
    expect(http.posts()[0]?.async).toBe(false);
    expect(
      (http.posts()[0]?.body as Record<string, Record<string, { param: { songID: number } }>>)[
        'music.musichallSong.PlayLyricInfo.GetPlayLyricInfo'
      ]?.param.songID,
    ).toBe(2048982668);
  });

  it('搜索候选带 songid 时优先取 PlayLyricInfo 的加密 QRC，不落到逐行 LRC', async () => {
    const qrcXml =
      '<?xml version="1.0"?><QrcInfos><LyricInfo><Lyric_1 LyricType="1" LyricContent="[1000,2000]风(0,500)到这里(500,1500)"/></LyricInfo></QrcInfos>';
    const lyric = encryptQrcHex(qrcXml);
    const http = installLyricsHttp({
      [SEARCH]: json({
        code: 0,
        data: {
          song: {
            list: [
              {
                songmid: '000pegfy2hOiev',
                songid: 587372667,
                songname: '我饮人间一碗酒',
                albummid: '001VsUgt3GlqbV',
                albumname: '我饮人间一碗酒',
                interval: 214,
                singer: [{ name: '浅影阿' }],
              },
            ],
          },
        },
      }),
      [SONGID]: json({
        code: 0,
        'music.musichallSong.PlayLyricInfo.GetPlayLyricInfo': {
          code: 0,
          data: { lyric },
        },
      }),
      [LYRIC]: json({ retcode: 0, lyric: '[00:01]不该用的逐行', trans: '' }),
    });
    const source = createQqSource(http.host);
    const [found] = (await source.search(query)) as LyricsCandidate[];
    expect(found).toMatchObject({ ref: '000pegfy2hOiev', songId: 587372667 });
    expect(await source.fetch(found!)).toMatchObject({
      kind: 'synced',
      lines: [{ words: [{ word: '风' }, { word: '到这里' }] }],
    });
    expect(http.posts()[0]?.url.pathname).toBe('/cgi-bin/musicu.fcg');
    expect(http.posts()[0]?.async).toBe(false);
    expect(
      http.requests().some((request) => request.url.pathname.includes('fcg_query_lyric_new')),
    ).toBe(false);
  });

  it('搜索候选没有 songid 时，fetch 先解析 MID 再取 QRC', async () => {
    const qrcXml =
      '<?xml version="1.0"?><QrcInfos><LyricInfo><Lyric_1 LyricType="1" LyricContent="[1000,2000]风(0,500)到这里(500,1500)"/></LyricInfo></QrcInfos>';
    const http = installLyricsHttp({
      [SONGID]: json({
        req_0: {
          code: 0,
          data: {
            track_info: {
              id: 587372667,
              mid: '000pegfy2hOiev',
              name: '我饮人间一碗酒',
              singer: [{ name: '浅影阿' }],
              album: { name: '我饮人间一碗酒' },
              interval: 214,
            },
          },
        },
        'music.musichallSong.PlayLyricInfo.GetPlayLyricInfo': {
          code: 0,
          data: { lyric: encryptQrcHex(qrcXml) },
        },
      }),
      [LYRIC]: json({ retcode: 0, lyric: '[00:01]不该用的逐行', trans: '' }),
    });
    const source = createQqSource(http.host);
    const noId: LyricsCandidate = {
      source: 'qq',
      ref: '000pegfy2hOiev',
      title: '我饮人间一碗酒',
      artists: ['浅影阿'],
      album: '我饮人间一碗酒',
      durationMs: 214_000,
    };
    expect(await source.fetch(noId)).toMatchObject({
      kind: 'synced',
      lines: [{ words: [{ word: '风' }, { word: '到这里' }] }],
    });
    expect(http.posts()).toHaveLength(2);
    expect(http.posts().every((post) => post.async === false)).toBe(true);
  });

  it('手输 MID 先经 get_song_detail 解析成 Song ID，再取 QRC', async () => {
    const qrcXml =
      '<?xml version="1.0"?><QrcInfos><LyricInfo><Lyric_1 LyricType="1" LyricContent="[1000,2000]风(0,500)到这里(500,1500)"/></LyricInfo></QrcInfos>';
    const lyric = encryptQrcHex(qrcXml);
    const http = installLyricsHttp({
      [SONGID]: json({
        code: 0,
        req_0: {
          code: 0,
          data: {
            track_info: {
              id: 587372667,
              mid: '000pegfy2hOiev',
              name: '我饮人间一碗酒',
              singer: [{ name: '浅影阿' }],
              album: { name: '我饮人间一碗酒' },
              interval: 214,
            },
          },
        },
        'music.musichallSong.PlayLyricInfo.GetPlayLyricInfo': {
          code: 0,
          data: { lyric },
        },
      }),
    });
    const source = createQqSource(http.host);
    const [mid] = (await source.search({
      ...query,
      id: { source: 'qq', kind: 'qqMid', value: '000pegfy2hOiev' },
    })) as LyricsCandidate[];
    expect(mid).toMatchObject({
      ref: '000pegfy2hOiev',
      idKind: 'mid',
      songId: 587372667,
      title: '我饮人间一碗酒',
      artists: ['浅影阿'],
      album: '我饮人间一碗酒',
      durationMs: 214000,
    });
    expect(await source.fetch(mid!)).toMatchObject({
      kind: 'synced',
      lines: [{ words: [{ word: '风' }, { word: '到这里' }] }],
    });
    expect(http.posts()).toHaveLength(2);
  });

  it('QRC 失败或没有内容时，MID 候选回退到逐行 LRC', async () => {
    const failed = installLyricsHttp({
      [SONGID]: json({ code: -1 }),
      [LYRIC]: json({ retcode: 0, lyric: '[00:01]回退的逐行', trans: '' }),
    });
    const source = createQqSource(failed.host);
    const withId: LyricsCandidate = {
      ...candidate,
      songId: 587372667,
    };
    expect(await source.fetch(withId)).toMatchObject({
      kind: 'synced',
      lines: [{ words: [{ word: '回退的逐行' }] }],
    });

    const empty = installLyricsHttp({
      [SONGID]: json({
        code: 0,
        'music.musichallSong.PlayLyricInfo.GetPlayLyricInfo': { code: 0, data: { lyric: '' } },
      }),
      [LYRIC]: json({ retcode: 0, lyric: '[00:01]空 QRC 也回退', trans: '' }),
    });
    expect(await createQqSource(empty.host).fetch(withId)).toMatchObject({
      kind: 'synced',
      lines: [{ words: [{ word: '空 QRC 也回退' }] }],
    });
  });
});
