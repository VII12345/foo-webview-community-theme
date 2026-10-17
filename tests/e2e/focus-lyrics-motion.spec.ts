import { expect, test } from '@playwright/test';
import { openImmersive } from '../fixtures/immersivePage.ts';

const LINES = Array.from({ length: 14 }, (_, index) => {
  const seconds = 10 + index * 10;
  const at = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return `[${at}]聚焦第 ${index + 1} 句`;
}).join('\n');

async function openFocus(page: Parameters<typeof openImmersive>[0]) {
  const result = await openImmersive(page, {
    onHost(host) {
      host.answer('lyrics.get', {
        success: true,
        available: true,
        source: 'embedded',
        path: '',
        lyrics: LINES,
        synced: true,
      });
    },
  });
  await result.view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '聚焦视图', exact: true }).click();
  await expect(result.view.locator('[data-tier][data-scene="focus"]')).toBeVisible();
  await expect(result.view.locator('[data-focus-lyrics]')).toContainText('聚焦第 4 句');
  return result;
}

test('聚焦歌词窗口滑动时多行一起连续移动，新行从滑动方向淡入', async ({ page }) => {
  const { view, host, errors } = await openFocus(page);
  await host.emit('playback:seeked', { position: 92, hostTime: Date.now() });
  await page.waitForTimeout(40);
  const motion = await view.locator('[data-focus-lyrics]').evaluate((root) => {
    const rows = [...root.querySelectorAll<HTMLElement>('[data-focus-lyric-id]')];
    return rows.map((row) => ({
      id: row.dataset.focusLyricId,
      animations: row.getAnimations().map((animation) => ({
        running: animation.playState === 'running',
        transform: animation.effect?.getKeyframes().some((frame) => 'transform' in frame) ?? false,
      })),
    }));
  });
  // 窗口前移后仍在场的那几行要有位移过渡，新进窗口的一行要有淡入。
  expect(
    motion.filter((row) => row.animations.some((a) => a.running && a.transform)).length,
  ).toBeGreaterThan(1);
  expect(
    motion.some((row) => row.animations.some((a) => a.running)),
  ).toBe(true);
  expect(errors).toStrictEqual([]);
});

test('减弱动效时聚焦歌词直接换窗口，不做移动过渡', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { view, host, errors } = await openFocus(page);
  await host.emit('playback:seeked', { position: 92, hostTime: Date.now() });
  await page.waitForTimeout(40);
  const animated = await view.locator('[data-focus-lyrics]').evaluate((root) =>
    [...root.querySelectorAll<HTMLElement>('[data-focus-lyric-id]')].some(
      (row) => row.getAnimations().length > 0,
    ),
  );
  expect(animated).toBe(false);
  expect(errors).toStrictEqual([]);
});
