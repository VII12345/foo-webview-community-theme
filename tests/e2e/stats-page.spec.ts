import { expect, test } from '@playwright/test';
import initSqlJs from 'sql.js/dist/sql-wasm-inline.js';
import { openPlayer } from '../fixtures/playerPage.ts';

// 侧边栏「播放统计」页：宿主替身答一个内存里造的小 SQLite 库，验证页面读出概览、Top 榜与趋势。

const PROFILE = 'E:/FB2K/foobar2000/profile';
const DB_PATH = `${PROFILE}\\foo_monthly_stats.db`;

async function statsDbBase64(): Promise<string> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE monthly_count (
    ymd TEXT NOT NULL, track_crc TEXT NOT NULL, path TEXT NOT NULL DEFAULT '',
    title TEXT, artist TEXT, album TEXT, length_seconds REAL NOT NULL DEFAULT 0,
    playcount INTEGER NOT NULL DEFAULT 0, total_time_seconds REAL NOT NULL DEFAULT 0,
    PRIMARY KEY(ymd, track_crc));`);
  const now = new Date();
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  db.run(
    `INSERT INTO monthly_count (ymd, track_crc, title, artist, playcount, total_time_seconds)
     VALUES ('${ymd}','c1','晨曲','甲、乙',3,1800),
            ('${ymd}','c2','夜曲','丙',1,600);`,
  );
  const bytes = db.export();
  db.close();
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

test('侧边栏打开播放统计页，读出概览、Top 榜与趋势', async ({ page }) => {
  const base64 = await statsDbBase64();
  const env = await openPlayer(page, {
    onHost(host) {
      host.answer('file.exists', () => ({ success: true, path: DB_PATH, exists: true }));
      host.answer('file.read', () => ({
        success: true,
        content: base64,
        size: base64.length,
        encoding: 'base64',
      }));
    },
  });
  const nav = page.getByRole('navigation', { name: '侧边栏' });
  await nav.getByRole('button', { name: '播放统计', exact: true }).click();
  const stats = page.locator('[data-stats-page]');
  await expect(stats).toBeVisible();
  // 概览：本月时长 2400s = 40 分、4 次播放。
  const totals = stats.locator('section, div').filter({ hasText: '收听时长' }).first();
  await expect(totals.getByText('40 分', { exact: true })).toBeVisible();
  await expect(totals.getByText('4', { exact: true })).toBeVisible();
  // Top 歌曲按收听时长降序。
  const topTracks = stats.locator('[data-stats-top-tracks="month"]');
  await expect(topTracks.getByText('晨曲')).toBeVisible();
  await expect(topTracks.getByText('夜曲')).toBeVisible();
  // 艺人榜：合唱曲的两位艺人都记完整时长。
  const topArtists = stats.locator('[data-stats-top-artists="month"]');
  await expect(topArtists.getByText('甲')).toBeVisible();
  await expect(topArtists.getByText('乙')).toBeVisible();
  // 趋势有柱子。
  await expect(stats.locator('[data-stats-trend] [data-stats-bar]')).toHaveCount(1);
  expect(env.errors).toEqual([]);
});

test('统计库不存在时页面显示空状态，不报错', async ({ page }) => {
  const env = await openPlayer(page, {
    onHost(host) {
      host.answer('file.exists', () => ({ success: true, path: DB_PATH, exists: false }));
    },
  });
  await page.getByRole('navigation', { name: '侧边栏' }).getByRole('button', { name: '播放统计', exact: true }).click();
  await expect(page.locator('[data-stats-empty]')).toBeVisible();
  expect(env.errors).toEqual([]);
});

test('宿主按路径安全拒读时写明原因，不显示成「没有统计」', async ({ page }) => {
  // 便携安装在 Program Files 下时 profile 被拒；要能分辨「没装插件」与「读不到」。
  const env = await openPlayer(page, {
    onHost(host) {
      host.answer('file.exists', () => ({
        success: false,
        path: DB_PATH,
        error: 'Access denied: protected system path',
        code: 'PERMISSION_DENIED',
      }));
    },
  });
  await page.getByRole('navigation', { name: '侧边栏' }).getByRole('button', { name: '播放统计', exact: true }).click();
  const empty = page.locator('[data-stats-empty]');
  await expect(empty).toBeVisible();
  await expect(empty).toHaveAttribute('data-stats-state', 'denied');
  await expect(empty).toContainText('路径安全');
  await expect(empty).not.toContainText('还没有播放统计');
  expect(env.errors).toEqual([]);
});
