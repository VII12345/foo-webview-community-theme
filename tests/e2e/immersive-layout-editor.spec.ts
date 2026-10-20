import { expect, test, type Page } from '@playwright/test';
import { enterSettings, openSettings } from '../fixtures/settingsPage.ts';

// 沉浸编排器：拖框挪位置、拖角改大小，改动写进存档、能恢复默认。

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
  await expect.poll(() => placementOf(page, 'right.header.title')).not.toBeNull();
  const placement = (await placementOf(page, 'right.header.title')) as { x: number };
  expect(placement.x).not.toBe(1000);

  // 刷新后还在（刷新回到首页，重新进设置页）。
  await page.reload();
  await enterSettings(page);
  await expect(page.locator('[data-layout-item="right.header.title"]')).toBeVisible();
  expect(await placementOf(page, 'right.header.title')).not.toBeNull();

  // 恢复默认后覆盖被清掉。
  await page.getByRole('button', { name: /恢复默认位置/ }).first().click();
  await expect.poll(() => placementOf(page, 'right.header.title')).toBeNull();
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

  await expect.poll(() => placementOf(page, 'right.spectrum')).not.toBeNull();
  const placement = (await placementOf(page, 'right.spectrum')) as { w: number };
  expect(placement.w).not.toBe(1020);
});
