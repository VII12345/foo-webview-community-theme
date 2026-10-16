import { describe, expect, it } from 'vitest';
import { createQqSource } from '../../../../src/lyrics/online/qq.ts';
import type { LyricsCandidate, LyricsQuery } from '../../../../src/lyrics/online/lyricsSource.ts';
import { installLyricsHttp, json } from '../../../fixtures/lyricsHttp.ts';

const SEARCH = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp';
const LYRIC = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg';

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
});
