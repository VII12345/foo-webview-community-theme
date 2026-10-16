import { expect, test } from '@playwright/test';
import { openPlayer, PLAYING_TRACK } from '../fixtures/playerPage.ts';
import type { PageHost } from '../fixtures/pageHost.ts';

const pageRoot = (page: import('@playwright/test').Page) => page.locator('[data-player-page]');

test('侧栏入口只显示与窗口融合的封面', async ({ page }) => {
  let host: PageHost | undefined;
  const { errors } = await openPlayer(page, {
    onHost(value) {
      host = value;
      value.answer('artwork.getFb2kUrlByPath', (params) => ({
        success: true,
        available: true,
        dataUrl: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="teal"/></svg>')}`,
        path: String(params['path']),
      }));
    },
  });
  const nav = page.getByRole('navigation', { name: '侧边栏' });
  await nav.getByRole('button', { name: '正在播放', exact: true }).click();
  const player = pageRoot(page);
  await expect(player).toBeVisible();
  await expect(player.locator('[data-player-artwork] img')).toBeVisible();
  await expect(player.getByRole('heading')).toHaveCount(0);
  await expect(player.locator('[data-player-seek]')).toHaveCount(0);
  await expect(player.getByRole('button')).toHaveCount(0);
  await expect(player).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const card = page.locator('main [data-reading-surface]').locator('..');
  await expect(card).toHaveCSS('border-radius', '0px');
  await expect(card).toHaveCSS('box-shadow', 'none');
  await expect(card.locator('[data-reading-surface]')).toHaveCSS('display', 'none');
  expect(host?.callsTo('artwork.getFb2kUrlByPath').at(-1)?.['maxSize']).toBeGreaterThanOrEqual(512);
  expect(errors).toEqual([]);
});

test('窄窗保持封面居中且无页面滚动', async ({ page }) => {
  const { errors } = await openPlayer(page, {
    width: 700,
    state: { canSeek: false, track: { ...PLAYING_TRACK, duration: 0 } },
  });
  await page.getByRole('navigation', { name: '侧边栏' }).getByRole('button', { name: '正在播放', exact: true }).click();
  const player = pageRoot(page);
  await expect(player.locator('[data-player-artwork]')).toBeVisible();
  await expect(player.locator('[data-player-artwork]')).toHaveCSS('width', /.+/);
  expect(await player.evaluate((element) => element.scrollHeight)).toBeLessThanOrEqual(
    await player.evaluate((element) => element.clientHeight),
  );
  expect(errors).toEqual([]);
});

test('没有封面时显示可访问的占位状态', async ({ page }) => {
  await openPlayer(page, {
    onHost(host) {
      host.answer('artwork.getFb2kUrlByPath', () => ({ success: true, available: false }));
    },
  });
  await page.getByRole('navigation', { name: '侧边栏' }).getByRole('button', { name: '正在播放', exact: true }).click();
  await expect(pageRoot(page).locator('[data-player-artwork] [role="img"]')).toHaveAccessibleName('没有可用的专辑封面');
});
