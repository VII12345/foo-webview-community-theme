import { expect, test } from '@playwright/test';
import { openImmersive } from '../fixtures/immersivePage.ts';

const KEY = 'default-theme.immersive.components.v1';
const setHidden = (page: import('@playwright/test').Page, hidden: Record<string, string[]>) =>
  page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: KEY, value: { version: 1, hidden } },
  );
const stageTop = (locator: import('@playwright/test').Locator) =>
  locator.evaluate((element) => {
    const stage = element.closest('[data-paper-content]');
    if (!stage) throw new Error('不在舞台上');
    const stageRect = stage.getBoundingClientRect();
    const scale = stageRect.width / 1920;
    return Math.round((element.getBoundingClientRect().top - stageRect.top) / scale);
  });

test('full 图纸隐藏频谱后波形上移，隐藏四行字后仪表行上移', async ({ page }) => {
  await setHidden(page, { 'paper/full': ['right.spectrum'] });
  const { view, errors } = await openImmersive(page);
  await expect(view.locator('[data-field-slot="spectrum"]')).toHaveCount(0);
  await expect(view.locator('[data-field="playhead"]')).toBeVisible();
  expect(await stageTop(view.locator('[data-field="playhead"]'))).toBeLessThan(650);
  expect(errors).toStrictEqual([]);
});

test('full 图纸隐藏 header 后仪表行从 296 上移到 82', async ({ page }) => {
  await setHidden(page, { 'paper/full': ['right.header'] });
  const { view, errors } = await openImmersive(page);
  await expect(view.locator('[data-field="title"]')).toHaveCount(0);
  expect(await stageTop(view.locator('[data-field="duration"]'))).toBeLessThan(200);
  expect(errors).toStrictEqual([]);
});

test('卡片隐藏封面后进度条从 766 上移到 286', async ({ page }) => {
  await setHidden(page, { 'card/full': ['card.cover'] });
  const { view, errors } = await openImmersive(page);
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '卡片视图', exact: true }).click();
  await expect(view.locator('[data-dial-cover]')).toHaveCount(0);
  expect(
    await view.locator('[data-card-seek]').evaluate((element) => {
      const stage = element.closest('[data-paper-content]');
      if (!stage) throw new Error('不在舞台上');
      const stageRect = stage.getBoundingClientRect();
      const scale = stageRect.width / 1920;
      return Math.round((element.getBoundingClientRect().top - stageRect.top) / scale);
    }),
  ).toBe(286);
  expect(errors).toStrictEqual([]);
});

test('隐藏背景装饰、罗盘传输键与歌词卡后其余内容仍在', async ({ page }) => {
  await setHidden(page, {
    'paper/full': ['pad', 'marks', 'right.lyrics', 'dial.transport'],
  });
  const { view, errors } = await openImmersive(page, {
    onHost(host) {
      host.answer('lyrics.get', {
        success: true,
        available: true,
        source: 'embedded',
        path: '',
        lyrics: '[00:01]一句\n[00:02]二句',
        synced: true,
      });
    },
  });
  await expect(view.locator('[data-pad]')).toHaveCount(0);
  await expect(view.locator('[data-field="lyric-card"]')).toHaveCount(0);
  await expect(view.getByRole('group', { name: '播放控制' })).toHaveCount(0);
  await expect(view.locator('[data-dial-cover]')).toBeVisible();
  await expect(view.locator('[data-field-slot="spectrum"]')).toBeVisible();
  expect(errors).toStrictEqual([]);
});

test('版心档隐藏 meta 后 Year 消失，频谱仍在', async ({ page }) => {
  await setHidden(page, { 'paper/compact': ['right.meta'] });
  const { view, errors } = await openImmersive(page, { width: 1200, height: 720 });
  await expect(view.locator('[data-tier]')).toHaveAttribute('data-tier', 'compact');
  await expect(view.locator('[data-field="year"]')).toHaveCount(0);
  await expect(view.locator('[data-field-slot="spectrum"]')).toBeVisible();
  expect(errors).toStrictEqual([]);
});
