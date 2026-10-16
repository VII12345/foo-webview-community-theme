import { expect, test } from '@playwright/test';
import { openImmersive } from '../fixtures/immersivePage.ts';
import { PLAYING_TRACK } from '../fixtures/playerPage.ts';

// 正在播放全屏页的进出与舞台上的字：盖住整窗、曲目字段写出来，Esc 与胶囊都是后退。

test('歌词视图去掉白框与框内元素，只留歌词占原白框范围', async ({ page }) => {
  const { view, errors } = await openImmersive(page, {
    onHost(host) {
      host.answer('lyrics.get', {
        success: true,
        available: true,
        source: 'embedded',
        path: '',
        lyrics: '[00:40]沉浸歌词第一句\n[00:45]沉浸歌词第二句',
        synced: true,
      });
    },
  });
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '歌词视图', exact: true }).click();
  await expect(view.locator('[data-tier][data-scene="lyrics"]')).toBeVisible();
  // 白框外的场景元素保留。
  await expect(view.locator('[data-paper-content]')).toHaveCount(1);
  await expect(view.locator('[data-dial-cover]')).toBeVisible();
  await expect(view.locator('[data-field="title"]')).toBeVisible();
  await expect(view.locator('[data-field="artist"]')).toBeVisible();
  // 白框与框内信息全部去掉。
  await expect(view.locator('[data-pad]')).toHaveCount(0);
  await expect(view.locator('[data-field-slot="spectrum"]')).toHaveCount(0);
  await expect(view.locator('[data-field="genre"]')).toHaveCount(0);
  await expect(view.locator('[data-field="duration"]')).toHaveCount(0);
  await expect(view.locator('[data-field="loudness"]')).toBeHidden();
  // 歌词在，且占着原白框的位置（不是屏幕中央、也不是底部条）。
  const player = view.locator('.amll-lyric-player');
  await expect(player).toBeVisible();
  await expect(player).toContainText('沉浸歌词第一句');
  await expect(player).toContainText('沉浸歌词第二句');
  expect(errors).toStrictEqual([]);
});

test('歌词视图在紧凑档不铺满右栏、不盖住标题', async ({ page }) => {
  const { view, errors } = await openImmersive(page, {
    width: 1000,
    state: { track: { ...PLAYING_TRACK } },
    onHost(host) {
      host.answer('lyrics.get', {
        success: true,
        available: true,
        source: 'embedded',
        path: '',
        lyrics: '[00:40]紧凑档歌词一句\n[00:45]紧凑档歌词二句',
        synced: true,
      });
    },
  });
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '歌词视图', exact: true }).click();
  await expect(view.locator('[data-paper-content]')).toHaveCount(1);
  await expect(view.locator('[data-field="title"]')).toBeVisible();
  await expect(view.locator('.amll-lyric-player')).toBeVisible();
  // 播放器顶部不能高过标题底部——紧凑档里它是右栏下半，不盖标题。
  const title = await view.locator('[data-field="title"]').boundingBox();
  const player = await view.locator('.amll-lyric-player').boundingBox();
  expect(title && player && player.y >= title.y + title.height - 1).toBe(true);
  expect(errors).toStrictEqual([]);
});
test('右上角切换键鼠标点过不留焦点框，键盘聚焦才显示', async ({ page }) => {
  const { view, errors } = await openImmersive(page);
  const trigger = view.getByRole('button', { name: '沉浸视图', exact: true });
  await trigger.click();
  await page.getByRole('menuitemradio', { name: '聚焦视图', exact: true }).click();
  // 鼠标走完一圈后焦点回到触发键上，但不该有焦点框：outline-style 与 Fluent 的 ::after 环都不出现。
  const mouseRing = await trigger.evaluate((node) => ({
    outline: getComputedStyle(node).outlineStyle,
    after: getComputedStyle(node, '::after').display,
    keyVisible: node.matches(':focus-visible'),
  }));
  expect(mouseRing.keyVisible).toBe(false);
  expect(mouseRing.outline).toBe('none');
  expect(mouseRing.after).toBe('none');
  // 键盘聚焦时仍要能看到轴点。
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const keyRing = await trigger.evaluate((node) => ({
    outline: getComputedStyle(node).outlineStyle,
    keyVisible: node.matches(':focus-visible'),
  }));
  expect(keyRing.keyVisible).toBe(true);
  expect(keyRing.outline).not.toBe('none');
  expect(errors).toStrictEqual([]);
});
test('右上角可以切换聚焦视图，隐藏频谱并保持原图纸视图可恢复', async ({ page }) => {
  const { view, errors } = await openImmersive(page);
  await expect(view.locator('[data-tier][data-scene="paper"]')).toBeVisible();
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '聚焦视图', exact: true }).click();
  await expect(view.locator('[data-tier][data-scene="focus"]')).toBeVisible();
  await expect(view.locator('[data-field-slot="spectrum"]')).toHaveCount(0);
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '图纸舞台', exact: true }).click();
  await expect(view.locator('[data-tier][data-scene="paper"]')).toBeVisible();
  await expect(view.locator('[data-field-slot="spectrum"]')).toHaveCount(1);
  expect(errors).toStrictEqual([]);
});
test('走到正在播放：整窗盖住，舞台写出曲名与艺术家，焦点收进这一层', async ({ page }) => {
  const { view, errors } = await openImmersive(page);
  await expect(view.locator('[data-field="title"]')).toHaveText(PLAYING_TRACK.title);
  await expect(view.locator('[data-field="artist"]')).toHaveText(PLAYING_TRACK.artist);
  // 进场过渡由小放大，播完才是整窗大小。
  await expect
    .poll(() => view.boundingBox())
    .toStrictEqual({ x: 0, y: 0, width: 1280, height: 800 });
  await expect(view).toBeFocused();
  expect(errors).toStrictEqual([]);
});

test('canvas 件都挂上：山脊图、网格、转动层、声场图、频谱柱与整轨波形，挂载与首帧不报错', async ({
  page,
}) => {
  const { view, errors } = await openImmersive(page);
  await expect(view.locator('[data-terrain] canvas')).toHaveCount(1);
  // 网格、转动层、声场图、频谱柱、整轨波形各一块，山脊图一块，封面底色没有源图时不挂。
  await expect.poll(() => view.locator('canvas').count()).toBeGreaterThanOrEqual(6);
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
  expect(errors).toStrictEqual([]);
});

test('Esc 后退：这一层退场移走，回到进来前的页面', async ({ page }) => {
  const { view, errors } = await openImmersive(page);
  await page.keyboard.press('Escape');
  await expect(view).toHaveCount(0);
  await expect(page.locator('[data-page="albums"]')).toBeVisible();
  expect(errors).toStrictEqual([]);
});

test('右上的 Esc 胶囊与按 Esc 一样是后退', async ({ page }) => {
  const { view } = await openImmersive(page);
  await view.getByRole('button', { name: '退出沉浸' }).click();
  await expect(view).toHaveCount(0);
});

test('空格经命令登记处切一次播放 / 暂停', async ({ page }) => {
  const { calls } = await openImmersive(page);
  await page.keyboard.press(' ');
  await expect.poll(() => calls('playback.playOrPause').length).toBe(1);
  // 再走一轮到宿主的往返，同一次按键若被接手两次，第二次这时也到了。
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(calls('playback.playOrPause')).toHaveLength(1);
});

test('Tab 只在这一层里转，不落到底下被盖住的键上', async ({ page }) => {
  const { view } = await openImmersive(page);
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press('Tab');
    const inside = await view.evaluate((root) => root.contains(document.activeElement));
    expect(inside, `第 ${step + 1} 次 Tab`).toBe(true);
  }
});
