import { expect, test, type Page } from '@playwright/test';
import { enterSettings, openSettings } from '../fixtures/settingsPage.ts';

// 沉浸编排器：拖框挪位置、拖角改大小、方向键微调，改动写进存档、能恢复默认。

const KEY = 'default-theme.immersive.layout.v1';

const placementOf = async (page: Page, id: string) =>
  page.evaluate(
    ([key, panel]) => {
      const raw = localStorage.getItem(key as string);
      if (!raw) return null;
      const groups = (JSON.parse(raw) as { groups?: Record<string, Record<string, unknown>> })
        .groups;
      return groups?.['paper/full']?.[panel as string] ?? null;
    },
    [KEY, id] as const,
  );

/** 编排器里当前视图/布局下某个组件的覆盖；没有就是 null。 */
const placement = (page: Page, id: string) => placementOf(page, id) as Promise<{
  dx: number;
  dy: number;
  sw: number;
  sh: number;
} | null>;

test('拖动一个组件：位置写进存档，恢复默认后清掉', async ({ page }) => {
  const settings = await openSettings(page);
  const item = page.locator('[data-layout-item="right.header.title"]');
  await expect(item).toBeVisible();
  await item.scrollIntoViewIfNeeded();

  const box = (await item.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 40, { steps: 8 });
  await page.mouse.up();

  // 存档是异步落盘的，等它写进去。
  await expect.poll(() => placement(page, 'right.header.title')).not.toBeNull();
  // 存的是相对默认盒子的偏移：默认左缘 1000，拖到 1060 就是 +60。
  expect((await placement(page, 'right.header.title'))!.dx).toBeGreaterThan(0);

  // 刷新后还在（刷新回到首页，重新进设置页）。
  await page.reload();
  await enterSettings(page);
  await expect(page.locator('[data-layout-item="right.header.title"]')).toBeVisible();
  expect(await placement(page, 'right.header.title')).not.toBeNull();

  // 恢复默认后覆盖被清掉。
  await page.getByRole('button', { name: /恢复默认位置/ }).first().click();
  await expect.poll(() => placement(page, 'right.header.title')).toBeNull();
  expect(settings.errors).toEqual([]);
});

test('拖右下角改大小：宽高写进存档', async ({ page }) => {
  await openSettings(page);
  const handle = page.locator('[data-layout-item="right.spectrum"] [data-layout-handle]');
  await expect(handle).toBeVisible();
  await handle.scrollIntoViewIfNeeded();

  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 20, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => placement(page, 'right.spectrum')).not.toBeNull();
  // 宽存的是相对默认宽的比例：默认 1020，拖宽一点就是大于 1。
  expect((await placement(page, 'right.spectrum'))!.sw).toBeGreaterThan(1);
});

test('方向键微调 1 像素，Shift 一次 8 像素，Alt 改宽高', async ({ page }) => {
  await openSettings(page);
  const item = page.locator('[data-layout-item="right.header.title"]');
  await expect(item).toBeVisible();
  await item.focus();

  // 标题行默认在 (1000, 108)、792 × 114。
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await placement(page, 'right.header.title'))?.dx ?? -1).toBe(1);

  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(async () => (await placement(page, 'right.header.title'))?.dy ?? -1).toBe(8);

  await page.keyboard.press('Alt+ArrowRight');
  await expect
    .poll(async () => (await placement(page, 'right.header.title'))?.sw ?? -1)
    .toBeCloseTo(793 / 792, 6);
});

test('按住方向键连发：每一下都挪一点', async ({ page }) => {
  await openSettings(page);
  const item = page.locator('[data-layout-item="right.header.title"]');
  await expect(item).toBeVisible();
  await item.focus();

  // 系统按住不放时连发 keydown，编排器每一下都挪一次。
  for (let at = 0; at < 5; at += 1) await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await placement(page, 'right.header.title'))?.dy ?? -1).toBe(5);
});

test('Esc 撤销本次键盘编辑', async ({ page }) => {
  await openSettings(page);
  const item = page.locator('[data-layout-item="right.header.title"]');
  await expect(item).toBeVisible();
  await item.focus();

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await placement(page, 'right.header.title'))?.dx ?? -1).toBe(2);

  await page.keyboard.press('Escape');
  await expect.poll(() => placement(page, 'right.header.title')).toBeNull();
});

test('预览边上写着操作提示，还有缩放档', async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('[data-layout-hint]')).toBeVisible();
  await expect(page.locator('[data-layout-hint]')).toContainText('方向键');
  await expect(page.getByRole('combobox', { name: '预览缩放', exact: true })).toBeVisible();
});

test('版心各档也能排：紧凑档里拖一个组件，存档写的是偏移量', async ({ page }) => {
  const settings = await openSettings(page);
  await settings.choose('当前布局', '紧凑');
  const item = page.locator('[data-layout-item="right.spectrum"]');
  await expect(item).toBeVisible();
  await item.scrollIntoViewIfNeeded();

  const box = (await item.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 50, box.y + 30, { steps: 6 });
  await page.mouse.up();

  // 版心各档的组键是 ${view}/${tier}。
  const stored = async () =>
    page.evaluate(() => {
      const raw = localStorage.getItem('default-theme.immersive.layout.v1');
      if (!raw) return null;
      const groups = (JSON.parse(raw) as { groups?: Record<string, Record<string, unknown>> })
        .groups;
      return (groups?.['paper/compact']?.['right.spectrum'] as { dx: number } | undefined) ?? null;
    });
  await expect.poll(stored).not.toBeNull();
  expect((await stored())!.dx).toBeGreaterThan(0);
});
