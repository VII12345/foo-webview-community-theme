import { expect, test } from '@playwright/test';
import initSqlJs from 'sql.js/dist/sql-wasm-inline.js';
import { openPlayer } from '../fixtures/playerPage.ts';

// “全部统计”里的所有歌曲表：全部时间聚合、搜索、列头排序与分页。

const PROFILE = 'E:/FB2K/foobar2000/profile';
const DB_PATH = `${PROFILE}\\foo_monthly_stats.db`;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

async function allSongsDbBase64(count: number): Promise<string> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE monthly_count (
    ymd TEXT NOT NULL, track_crc TEXT NOT NULL, path TEXT NOT NULL DEFAULT '',
    title TEXT, artist TEXT, album TEXT, length_seconds REAL NOT NULL DEFAULT 0,
    playcount INTEGER NOT NULL DEFAULT 0, total_time_seconds REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (ymd, track_crc));`);
  const rows = Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const title = `歌曲${pad(number, 3)}`;
    const artist = number % 3 === 0 ? '甲' : number % 3 === 1 ? '乙' : '丙';
    const album = number % 2 === 0 ? '专辑A' : '专辑B';
    const ymd = number <= 90 ? `2024-${pad((number % 12) + 1, 2)}-${pad((number % 28) + 1, 2)}` : `2026-10-${pad((number % 28) + 1, 2)}`;
    const seconds = 10_000 - number * 10;
    const plays = (number % 7) + 1;
    return { ymd, crc: `crc-${pad(number, 3)}`, title, artist, album, seconds, plays };
  });
  const statement = db.prepare(
    `INSERT INTO monthly_count
      (ymd, track_crc, path, title, artist, album, playcount, total_time_seconds)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  for (const row of rows) {
    statement.run([
      row.ymd,
      row.crc,
      `E:/Music/${row.title}.flac`,
      row.title,
      row.artist,
      row.album,
      row.plays,
      row.seconds,
    ]);
  }
  statement.free();
  const bytes = db.export();
  db.close();
  return Buffer.from(bytes).toString('base64');
}

test('全部统计展示所有歌曲，并支持搜索、排序与分页', async ({ page }) => {
  const base64 = await allSongsDbBase64(105);
  const env = await openPlayer(page, {
    onHost(host) {
      host.answer('file.exists', () => ({ success: true, path: DB_PATH, exists: true }));
      host.answer('file.read', (params) => {
        if (String(params['path'] ?? '').endsWith('loudness-v2.json'))
          return { success: false, error: 'not found', code: 'NOT_FOUND' };
        return {
          success: true,
          content: base64,
          size: base64.length,
          encoding: 'base64',
        };
      });
    },
  });
  await page
    .getByRole('navigation', { name: '侧边栏' })
    .getByRole('button', { name: '播放统计', exact: true })
    .click();
  await page.getByRole('button', { name: '全部统计', exact: true }).click();

  const table = page.locator('[data-stats-songs-table]');
  await expect(table).toBeVisible();
  await expect(page.locator('[data-stats-songs-count]')).toContainText('105 首歌曲');
  await expect(page.locator('[data-stats-songs-row]')).toHaveCount(100);
  await expect(page.locator('[data-stats-songs-row] [data-stats-cover]')).toHaveCount(100);
  await expect(page.locator('[data-stats-songs-page]')).toContainText('第 1 / 2 页');

  await page.locator('[data-stats-songs-next]').click();
  await expect(page.locator('[data-stats-songs-row]')).toHaveCount(5);
  await expect(page.locator('[data-stats-songs-page]')).toContainText('第 2 / 2 页');
  await expect(page.locator('[data-stats-songs-next]')).toBeDisabled();

  await page.locator('[data-stats-songs-prev]').click();
  await expect(page.locator('[data-stats-songs-page]')).toContainText('第 1 / 2 页');

  const search = page.locator('[data-stats-songs-search]');
  await search.fill('歌曲105');
  await expect(page.locator('[data-stats-songs-row]')).toHaveCount(1);
  await expect(page.locator('[data-stats-songs-row]')).toContainText('歌曲105');
  await expect(page.locator('[data-stats-songs-count]')).toContainText('1 首歌曲');

  await search.fill('不存在');
  await expect(page.locator('[data-stats-songs-row]')).toHaveCount(0);
  await expect(page.locator('[data-stats-all-songs]')).toContainText('没有匹配的歌曲');

  await search.fill('');
  await page.locator('[data-stats-sort="title"]').click();
  await expect(page.locator('[data-stats-songs-table] thead th').first()).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  await expect(page.locator('[data-stats-songs-row]').first()).toContainText('歌曲001');
  await page.locator('[data-stats-sort="title"]').click();
  await expect(page.locator('[data-stats-songs-table] thead th').first()).toHaveAttribute(
    'aria-sort',
    'descending',
  );
  await expect(page.locator('[data-stats-songs-row]').first()).toContainText('歌曲105');

  await page.locator('[data-stats-sort="seconds"]').click();
  await expect(page.locator('[data-stats-songs-table] thead th').nth(3)).toHaveAttribute(
    'aria-sort',
    'descending',
  );
  await page.locator('[data-stats-sort="seconds"]').click();
  await expect(page.locator('[data-stats-songs-table] thead th').nth(3)).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  await expect(page.locator('[data-stats-songs-row]').first()).toContainText('歌曲105');

  expect(env.errors).toEqual([]);
});
