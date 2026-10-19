import { expect, test } from '@playwright/test';
import { HEADPHONE_RIG_KEY } from '../../src/playback/soundPressure.ts';
import { openSidebar } from '../fixtures/sidebarPage.ts';

// “我的耳机”：展开态在媒体库与播放列表之间；图标态有耳机浮层；点一下立即切换，不导航、不确认。

const RIG = {
  version: 1,
  amps: [{ id: 'a1', name: 'Portable', vrmsAt0db: 2, gainDb: 0 }],
  headphones: [
    { id: 'h1', name: 'M1', impedanceOhm: 32, sensitivity: 100, sensitivityUnit: 'dbPerMw' },
    { id: 'h2', name: 'JT7', impedanceOhm: 300, sensitivity: 98, sensitivityUnit: 'dbPerMw' },
  ],
  selectedAmpId: 'a1',
  selectedHeadphoneId: 'h1',
} as const;

function selectedHeadphone(host: { config: { get(key: string): unknown } }): unknown {
  const rig = host.config.get(HEADPHONE_RIG_KEY) as { selectedHeadphoneId?: string } | undefined;
  return rig?.selectedHeadphoneId;
}

test('展开侧边栏在媒体库与播放列表之间切换耳机', async ({ page }) => {
  const env = await openSidebar(page, undefined, {
    config: { [HEADPHONE_RIG_KEY]: RIG },
  });
  const nav = env.nav;
  const group = nav.getByRole('group', { name: '我的耳机' });
  await expect(group).toBeVisible();
  await expect(nav.locator('[data-headphone-entry]')).toHaveCount(2);
  await expect(nav.locator('[data-headphone-entry="h1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(nav.locator('[data-headphone-entry="h2"]')).toHaveAttribute('aria-pressed', 'false');

  const currentBefore = await nav.locator('[aria-current="page"]').textContent();
  await nav.locator('[data-headphone-entry="h2"]').click();
  await expect(nav.locator('[data-headphone-entry="h2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(nav.locator('[data-headphone-entry="h1"]')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => selectedHeadphone(env.host)).toBe('h2');
  const rig = env.host.config.get(HEADPHONE_RIG_KEY) as { selectedAmpId?: string };
  expect(rig.selectedAmpId).toBe('a1');
  expect(await nav.locator('[aria-current="page"]').textContent()).toBe(currentBefore);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  const toggle = nav.getByRole('button', { name: '展开或收起「我的耳机」' });
  await toggle.click();
  await expect(nav.locator('[data-headphone-entry]')).toHaveCount(0);
  await toggle.click();
  await expect(nav.locator('[data-headphone-entry]')).toHaveCount(2);
  expect(env.errors).toEqual([]);
});

test('图标态的我的耳机入口弹出列表，选中后立即收起', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'default-theme.sidebar.v1',
      JSON.stringify({ rail: true, width: 260 }),
    );
  });
  const env = await openSidebar(page, [], {
    config: { [HEADPHONE_RIG_KEY]: RIG },
  });
  const rail = env.nav.locator('[data-headphone-rail]');
  await expect(rail).toBeVisible();
  await rail.click();
  const flyout = page.locator('[data-headphone-flyout]');
  await expect(flyout).toBeVisible();
  await expect(flyout.locator('[data-headphone-entry]')).toHaveCount(2);
  await expect(flyout.locator('[data-headphone-entry="h1"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await flyout.locator('[data-headphone-entry="h2"]').click();
  await expect(flyout).toHaveCount(0);
  await expect.poll(() => selectedHeadphone(env.host)).toBe('h2');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(env.errors).toEqual([]);
});
