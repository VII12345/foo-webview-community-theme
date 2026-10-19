import type { fb } from 'foo-webview-sdk/bridge';
import { settle } from '../host/hostCall.ts';
import initSqlJs from 'sql.js/dist/sql-wasm-inline.js';
import {
  previousRangeForScope,
  rangeForScope,
  rangeWhere,
  type StatsScope,
} from './statsRange.ts';

/**
 * `foo_monthly_stats` 的统计读取：这个组件没有任何 API，唯一可读的是它在 profile 目录下的 SQLite 库
 * `<profile>\foo_monthly_stats.db`（表 `monthly_count` 与 `play_log`）。这里用 sql.js 只读打开它，
 * 算出概览、Top 榜、时间趋势与环比。全程不改文件、不依赖插件的任何导出。
 *
 * 时长口径用 `total_time_seconds`（插件记录的**实际收听秒数**，暂停/拖动不算）。艺人榜把 `artist`
 * 列按常见分隔符拆开，一首多艺人的歌**每位艺人都记完整时长**。
 */
export const STATS_DB_NAME = 'foo_monthly_stats.db';
export const STATS_COMPONENT = 'foo_monthly_stats.dll';

export interface StatsHostFace {
  config: { getVersionInfo(): ReturnType<typeof fb.config.getVersionInfo> };
  file: {
    exists(path: string): ReturnType<typeof fb.file.exists>;
    read(path: string, opts?: { encoding?: string }): ReturnType<typeof fb.file.read>;
  };
  configComponents?: { getComponents(): ReturnType<typeof fb.config.getComponents> };
}

export type StatsLoad =
  | { readonly state: 'ready'; readonly data: StatsData }
  /** 插件没装、库不存在，或还没听过歌。 */
  | { readonly state: 'empty' }
  /** 库在那儿，但宿主按路径安全策略拒了：便携安装落在受保护目录下时会这样。 */
  | { readonly state: 'denied' }
  /** 能读到宿主但读取/解析失败。 */
  | { readonly state: 'failed' };

export interface StatsTotals {
  readonly seconds: number;
  readonly plays: number;
  readonly tracks: number;
}

export interface StatsTrackRow {
  readonly title: string;
  readonly artist: string;
  /** 统计库有 path 列时带上，用来取封面；旧库没有这一列时为空串。 */
  readonly path: string;
  readonly seconds: number;
  readonly plays: number;
}

export interface StatsArtistRow {
  readonly artist: string;
  readonly seconds: number;
  readonly plays: number;
}

export interface StatsTrendPoint {
  /** `YYYY-MM-DD`。 */
  readonly ymd: string;
  readonly seconds: number;
  readonly plays: number;
}

export interface StatsPeriod {
  readonly label: string;
  readonly totals: StatsTotals;
  readonly tracks: readonly StatsTrackRow[];
  readonly artists: readonly StatsArtistRow[];
  /** 按天/月的趋势点。 */
  readonly trend: readonly StatsTrendPoint[];
  /** 与上一期的对比（本期与上一期的差值，秒与次）。 */
  readonly previous: StatsTotals;
}

export interface StatsData {
  readonly today: StatsPeriod;
  readonly week: StatsPeriod;
  readonly month: StatsPeriod;
  readonly year: StatsPeriod;
}

/** 一张曲目表一行：时长、次数、标题、艺人。 */
interface CategoryRow {
  readonly seconds: number;
  readonly plays: number;
  readonly title: string;
  readonly artist: string;
}

/** 每期都要给的几条查询；`where` 是 `ymd` 的闭区间条件，按 ISO 文本比较。 */
const PERIOD_QUERIES = {
  totals: (where: string) =>
    `SELECT COALESCE(SUM(total_time_seconds),0) AS seconds, COALESCE(SUM(playcount),0) AS plays,
            COUNT(DISTINCT track_crc) AS tracks
     FROM monthly_count WHERE ${where}`,
  tracks: (where: string, hasPath: boolean) =>
    `SELECT title, artist, ${hasPath ? 'MAX(path)' : "''"} AS path,
            SUM(total_time_seconds) AS seconds, SUM(playcount) AS plays
     FROM monthly_count WHERE ${where}
     GROUP BY track_crc ORDER BY seconds DESC, plays DESC LIMIT 20`,
  trend: (where: string) =>
    `SELECT ymd, SUM(total_time_seconds) AS seconds, SUM(playcount) AS plays
     FROM monthly_count WHERE ${where} GROUP BY ymd ORDER BY ymd`,
} as const;

/** 拆艺人：顿号、斜杠、分号、`feat.` 之类的常见写法；结果去重、去空。 */
export function splitArtists(artist: string): string[] {
  const parts = artist
    .split(/[、/;；&]|\s*(?:,|，)\s*|\s+(?:feat|ft|with|vs)\.?\s+/i)
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(parts)];
}

/**
 * 把一张按曲目分组的表聚成艺人榜：一首多艺人的歌，**每位艺人都记完整时长**。
 * 例：合唱 3:00、三位艺人，每位 +3:00、+1 次。
 */
export function artistsFromRows(rows: readonly CategoryRow[]): StatsArtistRow[] {
  const map = new Map<string, { seconds: number; plays: number }>();
  for (const row of rows) {
    for (const artist of splitArtists(row.artist)) {
      const entry = map.get(artist) ?? { seconds: 0, plays: 0 };
      entry.seconds += row.seconds;
      entry.plays += row.plays;
      map.set(artist, entry);
    }
  }
  return [...map.entries()]
    .map(([artist, value]) => ({ artist, ...value }))
    .sort((a, b) => b.seconds - a.seconds || b.plays - a.plays);
}

interface SqlDatabase {
  exec(sql: string): { columns: string[]; values: unknown[][] }[];
  prepare(sql: string): {
    bind(values?: readonly unknown[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  };
  close(): void;
}

const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value) || 0);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function firstRow(db: SqlDatabase, sql: string): Record<string, unknown> {
  const result = db.exec(sql);
  const row = result[0]?.values[0];
  if (!row) return {};
  const columns = result[0]?.columns ?? [];
  return Object.fromEntries(columns.map((column, index) => [column, row[index]]));
}

function rows(db: SqlDatabase, sql: string): Record<string, unknown>[] {
  const result = db.exec(sql);
  const first = result[0];
  if (!first) return [];
  return first.values.map((row) => Object.fromEntries(first.columns.map((c, i) => [c, row[i]])));
}

function periodOf(
  db: SqlDatabase,
  scope: StatsScope,
  now: Date,
  hasPath: boolean,
): StatsPeriod {
  const where = rangeWhere(rangeForScope(scope, now));
  const previousWhere = rangeWhere(previousRangeForScope(scope, now));
  const totals = firstRow(db, PERIOD_QUERIES.totals(where));
  const previous = firstRow(db, PERIOD_QUERIES.totals(previousWhere));
  const rawTracks = rows(db, PERIOD_QUERIES.tracks(where, hasPath)).map((row) => ({
    title: text(row['title']),
    artist: text(row['artist']),
    path: text(row['path']),
    seconds: num(row['seconds']),
    plays: num(row['plays']),
  }));
  const trend = rows(db, PERIOD_QUERIES.trend(where)).map((row) => ({
    ymd: text(row['ymd']),
    seconds: num(row['seconds']),
    plays: num(row['plays']),
  }));
  return {
    label: scope,
    totals: {
      seconds: num(totals['seconds']),
      plays: num(totals['plays']),
      tracks: num(totals['tracks']),
    },
    tracks: rawTracks,
    artists: artistsFromRows(rawTracks).slice(0, 20),
    trend,
    previous: {
      seconds: num(previous['seconds']),
      plays: num(previous['plays']),
      tracks: num(previous['tracks']),
    },
  };
}

/** 打开内存里的库、算出四期数据。`bytes` 是 `foo_monthly_stats.db` 的字节。 */
export async function queryStats(bytes: Uint8Array, now: Date): Promise<StatsData> {
  const SQL = await initSqlJs();
  const db = new SQL.Database(bytes) as unknown as SqlDatabase;
  // 老版插件的库没有 path 列；直接 SELECT 会让整页 failed，先探测再决定查询。
  const hasPath = rows(db, 'PRAGMA table_info(monthly_count)').some(
    (column) => text(column['name']) === 'path',
  );
  try {
    return {
      today: periodOf(db, 'today', now, hasPath),
      week: periodOf(db, 'week', now, hasPath),
      month: periodOf(db, 'month', now, hasPath),
      year: periodOf(db, 'year', now, hasPath),
    };
  } finally {
    db.close();
  }
}

/** Base64 → 字节。宿主 `file.read` 二进制模式返回的是 base64。 */
function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * 读统计：先问 profile 路径（拼出库文件），没有插件或库就答空；宿主拒了答 `denied`；
 * 读不到、解不开答失败。只读，不写文件。`now` 由调用方传入，方便测试。
 */
export async function loadStats(host: StatsHostFace, now: Date = new Date()): Promise<StatsLoad> {
  const version = await settle(() => host.config.getVersionInfo());
  if (!version || version.success === false) return { state: 'failed' };
  const profile = version.profilePath?.replace(/[\\/]+$/, '');
  if (!profile) return { state: 'empty' };
  const path = `${profile}\\${STATS_DB_NAME}`;
  const exists = await settle(() => host.file.exists(path));
  // 路径安全拒读与「文件不存在」要分开：前者说明库在那儿、用户也确实在记，改路径或
  // 提权能解决，提示成「没有统计」只会让人以为插件没工作。
  if (exists && exists.success === false && exists.code === 'PERMISSION_DENIED')
    return { state: 'denied' };
  if (!exists || exists.success === false || !exists.exists) return { state: 'empty' };
  const read = await settle(() => host.file.read(path, { encoding: 'binary' }));
  if (read && read.success === false && read.code === 'PERMISSION_DENIED')
    return { state: 'denied' };
  // 二进制读把字节以 base64 放在 `content` 里（不带 `base64:` 前缀）。
  const body = read && read.success !== false ? read.content : undefined;
  if (typeof body !== 'string' || !body) return { state: 'failed' };
  const base64 = body.startsWith('base64:') ? body.slice('base64:'.length) : body;
  try {
    return { state: 'ready', data: await queryStats(decodeBase64(base64), now) };
  } catch {
    return { state: 'failed' };
  }
}
