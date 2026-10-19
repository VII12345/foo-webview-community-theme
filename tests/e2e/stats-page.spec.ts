import { expect, test } from '@playwright/test';
import initSqlJs from 'sql.js/dist/sql-wasm-inline.js';
import { openPlayer } from '../fixtures/playerPage.ts';

// 侧边栏「播放统计」页：宿主替身答一个内存里造的小 SQLite 库，验证页面读出概览、Top 榜与趋势。

const PROFILE = 'E:/FB2K/foobar2000/profile';
const DB_PATH = `${PROFILE}\\foo_monthly_stats.db`;

async function statsDbBase64(trendDays = 1): Promise<string> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE monthly_count (
    ymd TEXT NOT NULL, track_crc TEXT NOT NULL, path TEXT NOT NULL DEFAULT '',
    title TEXT, artist TEXT, album TEXT, length_seconds REAL NOT NULL DEFAULT 0,
    playcount INTEGER NOT NULL DEFAULT 0, total_time_seconds REAL NOT NULL DEFAULT 0,
    PRIMARY KEY(ymd, track_crc));`);
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const ymd = `${month}-01`;
  db.run(
    `INSERT INTO monthly_count (ymd, track_crc, path, title, artist, playcount, total_time_seconds)
     VALUES ('${ymd}','c1','E:/Music/morning.flac','晨曲','甲、乙',3,1800),
            ('${ymd}','c2','E:/Music/night.flac','夜曲','丙',1,600);`,
  );
  for (let day = 2; day <= trendDays; day += 1) {
    db.run(
      `INSERT INTO monthly_count (ymd, track_crc, path, title, artist, playcount, total_time_seconds)
       VALUES ('${month}-${String(day).padStart(2, '0')}','d${day}','E:/Music/d${day}.flac','趋势${day}','丁',1,${day * 10})`,
    );
  }
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
      host.answer('file.read', (params) => {
        if (String(params['path'] ?? '').endsWith('loudness-v1.json'))
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
  await expect(topTracks.locator('[data-stats-cover] img')).toHaveCount(2);
  // 艺人榜：合唱曲的两位艺人都记完整时长。
  const topArtists = stats.locator('[data-stats-top-artists="month"]');
  await expect(topArtists.getByText('甲')).toBeVisible();
  await expect(topArtists.getByText('乙')).toBeVisible();
  // 趋势有柱子；只有一天时逐柱标时长。
  await expect(stats.locator('[data-stats-trend] [data-stats-bar]')).toHaveCount(1);
  await expect(stats.locator('[data-stats-bar-value]')).toHaveCount(1);
  await expect(stats.locator('[data-stats-bar-value]')).toHaveText('40:00');
  await expect(stats.locator('[data-stats-total-spl]')).toContainText('—');
  expect(env.errors).toEqual([]);
});

test('趋势点多时只标最高柱与首尾日期', async ({ page }) => {
  const base64 = await statsDbBase64(20);
  const env = await openPlayer(page, {
    onHost(host) {
      host.answer('file.exists', () => ({ success: true, path: DB_PATH, exists: true }));
      host.answer('file.read', (params) => {
        if (String(params['path'] ?? '').endsWith('loudness-v1.json'))
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
  await page.getByRole('navigation', { name: '侧边栏' }).getByRole('button', { name: '播放统计', exact: true }).click();
  const trend = page.locator('[data-stats-trend]');
  await expect(trend.locator('[data-stats-bar]')).toHaveCount(20);
  await expect(trend.locator('[data-stats-bar-value]')).toHaveCount(1);
  await expect(page.locator('[data-stats-trend-dates]')).toBeVisible();
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

function loudnessJson(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  return JSON.stringify({
    version: 1,
    days: {
      [ymd]: {
        'hp-1': { name: 'M1', seconds: 100, energy: 1e10 },
        'hp-2': { name: 'JT7', seconds: 50, energy: 5e9 },
      },
    },
  });
}

test('本周范围与耳机平均音量：按耳机与全部耳机展示', async ({ page }) => {
  const base64 = await statsDbBase64();
  const loudness = loudnessJson();
  const env = await openPlayer(page, {
    onHost(host) {
      host.answer('file.exists', () => ({ success: true, path: DB_PATH, exists: true }));
      host.answer('file.read', (params) => {
        const path = String(params['path'] ?? '');
        if (path.endsWith('loudness-v1.json'))
          return { success: true, content: loudness, size: loudness.length, encoding: 'utf8' };
        return { success: true, content: base64, size: base64.length, encoding: 'base64' };
      });
    },
  });
  await page
    .getByRole('navigation', { name: '侧边栏' })
    .getByRole('button', { name: '播放统计', exact: true })
    .click();
  await expect(page.locator('[data-stats-page]')).toBeVisible();
  await page.locator('[data-stats-scope="week"]').click();
  await expect(page.locator('[data-stats-scope="week"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const section = page.locator('[data-stats-headphone-spl]');
  await expect(section).toBeVisible();
  await expect(section).toContainText('耳机平均音量');
  await expect(section.locator('[data-stats-headphone]')).toHaveCount(2);
  await expect(section).toContainText('M1');
  await expect(section).toContainText('JT7');
  await expect(section).toContainText('80.0 dB SPL');
  await expect(section.locator('[data-stats-headphone-all]')).toContainText('全部耳机');
  await expect(page.locator('[data-stats-total-spl]')).toContainText('80.0 dB SPL');

  const loudnessReads = () =>
    env.host
      .callsTo('file.read')
      .filter((call) => String(call['path'] ?? '').endsWith('loudness-v1.json')).length;
  const beforeReads = loudnessReads();
  await page.getByRole('button', { name: '全部统计', exact: true }).click();
  await expect(page.locator('[data-stats-page]')).toHaveAttribute('data-stats-view', 'details');
  await expect(page.locator('[data-stats-detail-overview-row]')).toHaveCount(4);
  await expect(page.locator('[data-stats-detail-spl]')).toContainText('M1');
  await expect(page.locator('[data-stats-detail-spl]')).toContainText('JT7');
  await expect(page.locator('[data-stats-detail-headphone-all]')).toContainText('全部耳机');
  await expect(page.locator('[data-stats-detail-period]')).toHaveCount(4);
  expect(loudnessReads()).toBe(beforeReads);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('[data-stats-page]')).toHaveAttribute('data-stats-view', 'main');
  await expect(page.locator('[data-stats-scope="week"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(env.errors).toEqual([]);
});

test('统计库不存在时耳机音量仍独立显示', async ({ page }) => {
  const loudness = loudnessJson();
  const env = await openPlayer(page, {
    onHost(host) {
      host.answer('file.exists', () => ({ success: true, path: DB_PATH, exists: false }));
      host.answer('file.read', (params) => {
        if (String(params['path'] ?? '').endsWith('loudness-v1.json'))
          return { success: true, content: loudness, size: loudness.length, encoding: 'utf8' };
        return { success: false, error: 'not found', code: 'NOT_FOUND' };
      });
    },
  });
  await page
    .getByRole('navigation', { name: '侧边栏' })
    .getByRole('button', { name: '播放统计', exact: true })
    .click();
  await expect(page.locator('[data-stats-empty]')).toBeVisible();
  await expect(page.locator('[data-stats-headphone-spl]')).toBeVisible();
  await expect(page.locator('[data-stats-headphone-spl]')).toContainText('M1');
  expect(env.errors).toEqual([]);
});
