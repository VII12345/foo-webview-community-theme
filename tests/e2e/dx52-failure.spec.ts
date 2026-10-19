import { expect, test } from '@playwright/test';
import { DX52_AUTO_KEY } from '../../src/playback/dx52Prefs.ts';
import { openImmersive } from '../fixtures/immersivePage.ts';

// 自动读取开启但设备不回答设置快照：截止时间后弹提醒，关闭一次不再弹，重试后再次失败会再弹。

test('DX5 II 读取失败时弹出提醒，可关闭与重试', async ({ page }) => {
  await page.addInitScript(() => {
    class FakeDevice extends EventTarget {
      opened = false;
      productName = 'TOPPING DX5 II';
      async open() {
        this.opened = true;
      }
      async close() {
        this.opened = false;
      }
      async sendReport() {
        // 故意不回答设置快照。
      }
    }
    const device = new FakeDevice();
    class FakeHid extends EventTarget {
      async getDevices() {
        return [device];
      }
      async requestDevice() {
        return [device];
      }
    }
    Object.defineProperty(navigator, 'hid', { configurable: true, value: new FakeHid() });
  });

  const { view, errors } = await openImmersive(page, {
    config: { [DX52_AUTO_KEY]: true },
  });
  await expect(view).toBeVisible();
  const dialog = page.locator('[data-dx52-failure-dialog]');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toContainText('读取 DX5 II 设置失败');
  await dialog.getByRole('button', { name: '重试', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // 重试仍失败，提醒再次出现；这次关闭，之后保持关闭。
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(dialog).toHaveCount(0);

  expect(errors).toStrictEqual([]);
});
