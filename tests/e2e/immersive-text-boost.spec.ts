import { expect, test, type Page } from '@playwright/test';
import { openImmersive, type ImmersivePage } from '../fixtures/immersivePage.ts';
import { rgbaOf } from '../../src/immersive/frame/cssColor.ts';
import { luminanceOfSrgb } from '../../src/theme/luminance.ts';
import { contrastRatio } from '../../src/immersive/paper/textBoost.ts';

// 歌词视图按封面明暗做对比度修正；背景色不变；图纸视图不受影响；拉高滑杆不会降低对比度。

const DARK_COVER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAfElEQVR4nO3PsQkAIBDAQEew+ML9J3UIi0MIZIDL2nO+bnFBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjQwHvEycAH9hMAuanuPjwAAAABJRU5ErkJggg==';
const MID_COVER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAV0lEQVR4nO3PAQ0AAAjAIKMb3RjM7TRg9rnZ5wpoBbQCWgGtgFZAK6AV0ApoBbQCWgGtgFZAK6AV0ApoBbQCWgGtgFZAK6AV0ApoBbQCWgGtgFZAK7DYAR8+AWlhDFgjAAAAAElFTkSuQmCC';

function useCover(page: Page, cover: string, lyrics?: string): Promise<ImmersivePage> {
  return openImmersive(page, {
    onHost(host) {
      host.answer('artwork.getFb2kUrlByPath', () => ({
        success: true,
        available: true,
        type: 'front',
        path: '',
        dataUrl: cover,
      }));
      host.answer('artwork.getAvailableArtwork', () => ({
        success: true,
        available: true,
        artworks: [{ type: 'front', source: 'embedded' }],
        sources: ['embedded'],
      }));
      if (lyrics)
        host.answer('lyrics.get', {
          success: true,
          available: true,
          source: 'embedded',
          path: '',
          lyrics,
          synced: true,
        });
    },
  });
}

async function open(
  page: Page,
  scene: string,
  boost: number,
  cover = DARK_COVER,
  lyrics?: string,
): Promise<ImmersivePage> {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    'default-theme.immersive.scene.v1',
    scene,
  ] as const);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    'default-theme.immersive.textBoost.v1',
    String(boost),
  ] as const);
  await page.addInitScript(() => localStorage.setItem('default-theme.color-mode.v1', 'light'));
  return useCover(page, cover, lyrics);
}

const colorOf = (view: ImmersivePage['view'], field: string) =>
  view.locator(`[data-field="${field}"]`).first().evaluate((element) => getComputedStyle(element).color);
const paperOf = (view: ImmersivePage['view']) =>
  view.locator('[data-tier]').first().evaluate((element) => getComputedStyle(element).backgroundColor);
const lumaOf = (css: string): number => {
  const [red, green, blue] = rgbaOf(css);
  return luminanceOfSrgb(red, green, blue);
};
const contrastOf = (title: string, paper: string): number =>
  contrastRatio(lumaOf(title), lumaOf(paper));

test('深封面上歌词视图文字按设置修正，纸面背景不变', async ({ page, context }) => {
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
  expect(contrastOf(boostedTitle, boostedPaper)).toBeGreaterThanOrEqual(
    contrastOf(baseTitle, basePaper) - 1e-6,
  );
  expect(off.errors).toStrictEqual([]);
  expect(on.errors).toStrictEqual([]);
  await second.close();
});

test('中等亮度封面：拉高滑杆不会降低对比度', async ({ page, context }) => {
  const off = await open(page, 'lyrics', 0, MID_COVER);
  const baseTitle = await colorOf(off.view, 'title');
  const basePaper = await paperOf(off.view);

  const second = await context.newPage();
  const on = await open(second, 'lyrics', 100, MID_COVER);
  const boostedTitle = await colorOf(on.view, 'title');
  const boostedPaper = await paperOf(on.view);

  expect(boostedPaper).toBe(basePaper);
  expect(contrastOf(boostedTitle, boostedPaper)).toBeGreaterThanOrEqual(
    contrastOf(baseTitle, basePaper) - 1e-6,
  );
  expect(off.errors).toStrictEqual([]);
  expect(on.errors).toStrictEqual([]);
  await second.close();
});

test('当前歌词行的强调色也参与对比度修正', async ({ page, context }) => {
  const LYRICS = '[00:01]第一句\n[00:30]当前句\n[00:45]下一句';
  const active = (view: ImmersivePage['view']) =>
    view.locator('[class*="_lyricMainLine"][class*="_active"]').first();
  const off = await open(page, 'lyrics', 0, DARK_COVER, LYRICS);
  await expect(active(off.view)).toBeVisible();
  const baseColor = await active(off.view).evaluate((element) => getComputedStyle(element).color);
  const basePaper = await paperOf(off.view);

  const second = await context.newPage();
  const on = await open(second, 'lyrics', 100, DARK_COVER, LYRICS);
  await expect(active(on.view)).toBeVisible();
  const boostedColor = await active(on.view).evaluate(
    (element) => getComputedStyle(element).color,
  );
  const boostedPaper = await paperOf(on.view);

  expect(boostedPaper).toBe(basePaper);
  expect(contrastOf(boostedColor, boostedPaper)).toBeGreaterThanOrEqual(
    contrastOf(baseColor, basePaper) - 1e-6,
  );
  expect(off.errors).toStrictEqual([]);
  expect(on.errors).toStrictEqual([]);
  await second.close();
});

test('图纸视图即使深封面也不修正', async ({ page }) => {
  const { view, errors } = await open(page, 'paper', 100);
  await expect(view.locator('[data-tier]')).toBeVisible();
  await expect(view.locator('[data-tier]')).not.toHaveAttribute('data-text-boost', /.+/);
  expect(errors).toStrictEqual([]);
});

