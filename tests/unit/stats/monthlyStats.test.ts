import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js/dist/sql-wasm-inline.js';
import { artistsFromRows, queryStats, splitArtists } from '../../../src/stats/monthlyStats.ts';

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
    'INSERT INTO monthly_count (ymd, track_crc, title, artist, playcount, total_time_seconds) VALUES (?,?,?,?,?,?)',
  );
  rows.forEach(([ymd, title, artist, seconds, plays], index) => {
    statement.run([ymd, `crc-${index}`, title, artist, plays, seconds]);
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
      ['2026-10-05', '本月听', 'B', 200, 3],
      ['2026-09-20', '上月听', 'A', 500, 4],
      ['2026-03-01', '今年听', 'C', 900, 6],
      ['2025-12-01', '去年听', 'C', 1000, 5],
    ]);
    const data = await queryStats(bytes, new Date(2026, 9, 17));
    expect(data.today.label).toBe('2026-10-17');
    expect(data.today.totals).toEqual({ seconds: 100, plays: 1, tracks: 1 });
    expect(data.month.totals).toEqual({ seconds: 300, plays: 4, tracks: 2 });
    expect(data.month.previous.seconds).toBe(500);
    expect(data.year.totals.seconds).toBe(1700);
    expect(data.year.previous.seconds).toBe(1000);
    // 趋势按天给点。
    expect(data.month.trend.map((point) => point.ymd)).toEqual(['2026-10-05', '2026-10-17']);
    // Top 歌曲按月时长降序。
    expect(data.month.tracks.map((row) => row.title)).toEqual(['本月听', '今天听']);
  });

  it('库为空时各期都是零', async () => {
    const bytes = await buildDb([]);
    const data = await queryStats(bytes, new Date(2026, 9, 17));
    expect(data.month.totals).toEqual({ seconds: 0, plays: 0, tracks: 0 });
    expect(data.month.tracks).toEqual([]);
    expect(data.month.artists).toEqual([]);
    expect(data.month.trend).toEqual([]);
  });
});
