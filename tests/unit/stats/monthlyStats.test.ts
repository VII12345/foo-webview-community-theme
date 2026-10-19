import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js/dist/sql-wasm-inline.js';
import {
  artistsFromRows,
  loadStats,
  queryStats,
  splitArtists,
  type StatsHostFace,
} from '../../../src/stats/monthlyStats.ts';

const PROFILE = 'C:\\Program Files\\foobar2000\\profile';

/** 只搭 `loadStats` 用到的那几项；每一项给一个应答，未给的按不会走到处理。 */
function statsHost(answers: {
  readonly profilePath?: string | null;
  readonly exists?: unknown;
  readonly read?: unknown;
}): StatsHostFace {
  return {
    config: {
      getVersionInfo: (() =>
        Promise.resolve({
          success: true,
          profilePath: answers.profilePath === undefined ? PROFILE : answers.profilePath,
        })) as StatsHostFace['config']['getVersionInfo'],
    },
    file: {
      exists: (() => Promise.resolve(answers.exists)) as StatsHostFace['file']['exists'],
      read: (() => Promise.resolve(answers.read)) as StatsHostFace['file']['read'],
    },
  };
}

/** 造一个临时的 monthly_count 库：`row(ymd, title, artist, seconds, plays)`。 */
async function buildDb(
  rows: readonly [string, string, string, number, number][],
): Promise<Uint8Array> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE monthly_count (
    ymd TEXT NOT NULL, track_crc TEXT NOT NULL, path TEXT NOT NULL DEFAULT '',
    title TEXT, artist TEXT, album TEXT, length_seconds REAL NOT NULL DEFAULT 0,
    playcount INTEGER NOT NULL DEFAULT 0, total_time_seconds REAL NOT NULL DEFAULT 0,
    PRIMARY KEY(ymd, track_crc));`);
  const statement = db.prepare(
    'INSERT INTO monthly_count (ymd, track_crc, path, title, artist, playcount, total_time_seconds) VALUES (?,?,?,?,?,?,?)',
  );
  rows.forEach(([ymd, title, artist, seconds, plays], index) => {
    statement.run([
      ymd,
      `crc-${index}`,
      `E:/Music/${title}.flac`,
      title,
      artist,
      plays,
      seconds,
    ]);
  });
  statement.free();
  const bytes = db.export();
  db.close();
  return bytes;
}

describe('拆艺人', () => {
  it('按顿号、斜杠、分号、逗号、feat. 拆开并去重', () => {
    expect(splitArtists('A、B/B；C, D feat. E')).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(splitArtists('周杰伦')).toEqual(['周杰伦']);
    expect(splitArtists('')).toEqual([]);
  });
});

describe('艺人榜', () => {
  it('一首多艺人的歌，每位艺人都记完整时长与次数', () => {
    const artists = artistsFromRows([
      { title: '合唱', artist: 'A、B、C', seconds: 180, plays: 1 },
      { title: '独唱', artist: 'A', seconds: 120, plays: 2 },
    ]);
    const find = (name: string) => artists.find((row) => row.artist === name);
    expect(find('A')).toEqual({ artist: 'A', seconds: 300, plays: 3 });
    expect(find('B')).toEqual({ artist: 'B', seconds: 180, plays: 1 });
    expect(find('C')).toEqual({ artist: 'C', seconds: 180, plays: 1 });
  });
});

describe('统计查询', () => {
  it('按天/月/年分期算总时长、次数、曲目数与环比', async () => {
    // 今天 2026-10-17；本期（本月/今年）与上一期（上月/去年）各放几行。
    const bytes = await buildDb([
      ['2026-10-17', '今天听', 'A', 100, 1],
      ['2026-10-13', '本周听', 'D', 150, 1],
      ['2026-10-05', '上周听', 'B', 200, 3],
      ['2026-09-20', '上月听', 'A', 500, 4],
      ['2026-03-01', '今年听', 'C', 900, 6],
      ['2025-12-01', '去年听', 'C', 1000, 5],
    ]);
    const data = await queryStats(bytes, new Date(2026, 9, 17));
    expect(data.today.label).toBe('today');
    expect(data.today.totals).toEqual({ seconds: 100, plays: 1, tracks: 1 });
    expect(data.week.totals).toEqual({ seconds: 250, plays: 2, tracks: 2 });
    expect(data.week.previous.seconds).toBe(200);
    expect(data.week.trend.map((point) => point.ymd)).toEqual(['2026-10-13', '2026-10-17']);
    expect(data.month.totals).toEqual({ seconds: 450, plays: 5, tracks: 3 });
    expect(data.month.previous.seconds).toBe(500);
    expect(data.year.totals.seconds).toBe(1850);
    expect(data.year.previous.seconds).toBe(1000);
    // 趋势按天给点。
    expect(data.month.trend.map((point) => point.ymd)).toEqual([
      '2026-10-05',
      '2026-10-13',
      '2026-10-17',
    ]);
    // Top 歌曲按月时长降序。
    expect(data.month.tracks.map((row) => row.title)).toEqual(['上周听', '本周听', '今天听']);
    expect(data.month.tracks[1]?.path).toBe('E:/Music/本周听.flac');
    // 全部歌曲跨全部时间聚合，按总时长降序。
    expect(data.songs.map((row) => row.title)).toEqual([
      '去年听',
      '今年听',
      '上月听',
      '上周听',
      '本周听',
      '今天听',
    ]);
    expect(data.songs[0]).toMatchObject({ firstYmd: '2025-12-01', lastYmd: '2025-12-01' });
  });

  it('全部歌曲按 track_crc 跨天合并，并保留首末日期', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(`CREATE TABLE monthly_count (
      ymd TEXT NOT NULL, track_crc TEXT NOT NULL, path TEXT NOT NULL DEFAULT '',
      title TEXT, artist TEXT, album TEXT, length_seconds REAL NOT NULL DEFAULT 0,
      playcount INTEGER NOT NULL DEFAULT 0, total_time_seconds REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (ymd, track_crc));`);
    db.run(`INSERT INTO monthly_count
      (ymd, track_crc, path, title, artist, album, playcount, total_time_seconds)
      VALUES ('2026-09-01','same','E:/Music/same.flac','同一首','A','专辑',1,60),
             ('2026-10-03','same','E:/Music/same.flac','同一首','A','专辑',2,120),
             ('2026-10-04','other','E:/Music/other.flac','另一首','B','别的',1,30);`);
    const bytes = db.export();
    db.close();
    const data = await queryStats(bytes, new Date(2026, 9, 17));
    expect(data.songs.find((row) => row.crc === 'same')).toEqual({
      crc: 'same',
      title: '同一首',
      artist: 'A',
      album: '专辑',
      path: 'E:/Music/same.flac',
      seconds: 180,
      plays: 3,
      firstYmd: '2026-09-01',
      lastYmd: '2026-10-03',
    });
  });

  it('库为空时各期都是零', async () => {
    const bytes = await buildDb([]);
    const data = await queryStats(bytes, new Date(2026, 9, 17));
    expect(data.month.totals).toEqual({ seconds: 0, plays: 0, tracks: 0 });
    expect(data.month.tracks).toEqual([]);
    expect(data.month.artists).toEqual([]);
    expect(data.month.trend).toEqual([]);
    expect(data.songs).toEqual([]);
  });

  it('老库没有 path 列时仍能读统计，封面路径为空', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(`CREATE TABLE monthly_count (
      ymd TEXT NOT NULL, track_crc TEXT NOT NULL, title TEXT, artist TEXT,
      playcount INTEGER NOT NULL DEFAULT 0, total_time_seconds REAL NOT NULL DEFAULT 0,
      PRIMARY KEY(ymd, track_crc));`);
    db.run(
      `INSERT INTO monthly_count (ymd, track_crc, title, artist, playcount, total_time_seconds)
       VALUES ('2026-10-17','old','老库','A',1,60)`,
    );
    const bytes = db.export();
    db.close();
    const data = await queryStats(bytes, new Date(2026, 9, 17));
    expect(data.month.tracks[0]).toMatchObject({ title: '老库', path: '' });
    expect(data.songs[0]).toMatchObject({
      crc: 'old',
      title: '老库',
      artist: 'A',
      album: '',
      path: '',
      seconds: 60,
      plays: 1,
      firstYmd: '2026-10-17',
      lastYmd: '2026-10-17',
    });
  });

  it('老库连 playcount 与 total_time_seconds 都没有时仍能读，数值按 0', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(`CREATE TABLE monthly_count (
      ymd TEXT NOT NULL, track_crc TEXT NOT NULL, title TEXT, artist TEXT,
      PRIMARY KEY (ymd, track_crc));`);
    db.run(
      `INSERT INTO monthly_count (ymd, track_crc, title, artist)
       VALUES ('2026-10-17','bare','只有标题','A')`,
    );
    const bytes = db.export();
    db.close();
    const data = await queryStats(bytes, new Date(2026, 9, 17));
    expect(data.month.totals).toEqual({ seconds: 0, plays: 0, tracks: 1 });
    expect(data.songs[0]).toMatchObject({
      crc: 'bare',
      title: '只有标题',
      album: '',
      path: '',
      seconds: 0,
      plays: 0,
    });
  });
});

describe('读统计的状态', () => {
  const bytes = async () =>
    Buffer.from(await buildDb([['2026-10-17', '今天听', 'A', 100, 1]])).toString('base64');

  it('读到库时算出各期数据', async () => {
    const loaded = await loadStats(
      statsHost({ exists: { success: true, exists: true }, read: { success: true, content: await bytes() } }),
      new Date(2026, 9, 17),
    );
    expect(loaded.state).toBe('ready');
    if (loaded.state === 'ready') expect(loaded.data.today.totals.seconds).toBe(100);
  });

  it('库不存在时答「没有统计」', async () => {
    const loaded = await loadStats(
      statsHost({ exists: { success: true, exists: false } }),
      new Date(2026, 9, 17),
    );
    expect(loaded.state).toBe('empty');
  });

  it('宿主按路径安全拒绝时答「被拒」，不是「没有统计」', async () => {
    // 便携安装在 Program Files 下时 profile 会被旧版宿主拒掉；要能分辨这两种。
    const loaded = await loadStats(
      statsHost({ exists: { success: false, error: 'denied', code: 'PERMISSION_DENIED' } }),
      new Date(2026, 9, 17),
    );
    expect(loaded.state).toBe('denied');
  });

  it('存在检查放行但读取被拒时同样答「被拒」', async () => {
    const loaded = await loadStats(
      statsHost({
        exists: { success: true, exists: true },
        read: { success: false, error: 'denied', code: 'PERMISSION_DENIED' },
      }),
      new Date(2026, 9, 17),
    );
    expect(loaded.state).toBe('denied');
  });

  it('profile 路径取不到时答「没有统计」', async () => {
    const loaded = await loadStats(statsHost({ profilePath: null }), new Date(2026, 9, 17));
    expect(loaded.state).toBe('empty');
  });

  it('读到内容但不是库时答失败', async () => {
    const loaded = await loadStats(
      statsHost({
        exists: { success: true, exists: true },
        read: { success: true, content: 'bm90LWEtZGI=' }, // "not-a-db"
      }),
      new Date(2026, 9, 17),
    );
    expect(loaded.state).toBe('failed');
  });
});
