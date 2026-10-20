import { expect, test, type Page } from '@playwright/test';
import { openImmersive } from '../fixtures/immersivePage.ts';

// 编排器里挪歌词。聚焦档的歌词日志与歌词/卡片/卡片歌词三档的动画歌词，
// 原先压根没接上摆放覆盖——预览里能拖，实际不动。这条盯住它们：挪了就得动。

const LYRICS = '[00:01]第一句\n[00:30]当前句\n[00:45]下一句';

/** 歌词件在舞台坐标里的左上角。舞台整幅缩放过，换算回舞台坐标。 */
const stageOffset = async (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const stage = document.querySelector('[data-paper-content]');
    const target = document.querySelector(sel);
    if (!(stage instanceof HTMLElement) || !(target instanceof HTMLElement)) return null;
    const stageBox = stage.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    const scale = stageBox.width / 1920;
    return {
      x: (targetBox.left - stageBox.left) / scale,
      y: (targetBox.top - stageBox.top) / scale,
    };
  }, selector);

async function open(page: Page, scene: string, dx: number) {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    'default-theme.immersive.scene.v1',
    scene,
  ] as const);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    'default-theme.immersive.layout.v1',
    JSON.stringify({
      version: 1,
      groups: { [`${scene}/full`]: { 'right.lyrics': { dx, dy: 0 } } },
    }),
  ] as const);
  return openImmersive(page, {
    onHost(host) {
      host.answer('lyrics.get', {
        success: true,
        available: true,
        source: 'embedded',
        path: '',
        lyrics: LYRICS,
        synced: true,
      });
    },
  });
}

const SCENES = [
  { scene: 'lyrics', selector: '[data-immersive-lyrics-player]', x: 1152 },
  { scene: 'card', selector: '[data-immersive-lyrics-player]', x: 1152 },
  { scene: 'cardLyrics', selector: '[data-immersive-lyrics-player]', x: 1152 },
  { scene: 'focus', selector: '[data-stage-lyrics-slot]', x: 760 },
] as const;

for (const { scene, selector, x } of SCENES) {
  test(`${scene} 视图里的歌词挪得动`, async ({ page }) => {
    const { view, errors } = await open(page, scene, 120);
    const lyrics = view.locator(selector);
    await expect(lyrics).toBeVisible();

    const at = await stageOffset(page, selector);
    expect(at).not.toBeNull();
    // 挪 120 舞台像素，歌词的左缘就跟着挪 120。
    expect(at!.x).toBeCloseTo(x + 120, 0);
    expect(errors).toStrictEqual([]);
  });
}

test('没写覆盖时歌词还在原来的位置上', async ({ page }) => {
  const { view, errors } = await open(page, 'lyrics', 0);
  const lyrics = view.locator('[data-immersive-lyrics-player]');
  await expect(lyrics).toBeVisible();

  const at = await stageOffset(page, '[data-immersive-lyrics-player]');
  expect(at).not.toBeNull();
  expect(at!.x).toBeCloseTo(1152, 0);
  expect(errors).toStrictEqual([]);
});
