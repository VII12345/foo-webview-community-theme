import { expect, test, type Page } from '@playwright/test';
import { openImmersive, type ImmersivePage } from '../fixtures/immersivePage.ts';

// 歌词视图在深封面上按设置提亮文字；背景色不变；图纸视图不受影响。

const DARK_COVER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAfElEQVR4nO3PsQkAIBDAQEew+ML9J3UIi0MIZIDL2nO+bnFBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjQwHvEycAH9hMAuanuPjwAAAABJRU5ErkJggg==';

function useDarkCover(page: Page): Promise<ImmersivePage> {
  return openImmersive(page, {
    onHost(host) {
      host.answer('artwork.getFb2kUrlByPath', () => ({
        success: true,
        available: true,
        type: 'front',
        path: '',
        dataUrl: DARK_COVER,
      }));
      host.answer('artwork.getAvailableArtwork', () => ({
        success: true,
        available: true,
        artworks: [{ type: 'front', source: 'embedded' }],
        sources: ['embedded'],
      }));
    },
  });
}

async function open(page: Page, scene: string, boost: number): Promise<ImmersivePage> {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    'default-theme.immersive.scene.v1',
    scene,
  ] as const);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    'default-theme.immersive.textBoost.v1',
    String(boost),
  ] as const);
  await page.addInitScript(() => localStorage.setItem('default-theme.color-mode.v1', 'light'));
  return useDarkCover(page);
}

const colorOf = (view: ImmersivePage['view'], field: string) =>
  view.locator(`[data-field="${field}"]`).first().evaluate((element) => getComputedStyle(element).color);
const paperOf = (view: ImmersivePage['view']) =>
  view.locator('[data-tier]').first().evaluate((element) => getComputedStyle(element).backgroundColor);

test('深封面上歌词视图文字按设置提亮，纸面背景不变', async ({ page, context }) => {
  const off = await open(page, 'lyrics', 0);
  const baseTitle = await colorOf(off.view, 'title');
  const basePaper = await paperOf(off.view);

  const second = await context.newPage();
  const on = await open(second, 'lyrics', 100);
  await expect(on.view.locator('[data-tier]')).toHaveAttribute('data-text-boost', /.+/);
  const boostedTitle = await colorOf(on.view, 'title');
  const boostedPaper = await paperOf(on.view);

  expect(boostedTitle).not.toBe(baseTitle);
  expect(boostedPaper).toBe(basePaper);
  expect(off.errors).toStrictEqual([]);
  expect(on.errors).toStrictEqual([]);
  await second.close();
});

test('图纸视图即使深封面也不提亮', async ({ page }) => {
  const { view, errors } = await open(page, 'paper', 100);
  await expect(view.locator('[data-tier]')).toBeVisible();
  await expect(view.locator('[data-tier]')).not.toHaveAttribute('data-text-boost', /.+/);
  expect(errors).toStrictEqual([]);
});
