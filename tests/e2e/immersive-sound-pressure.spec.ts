import { expect, test } from '@playwright/test';
import { DX52_AUTO_KEY } from '../../src/playback/dx52Prefs.ts';
import { HEADPHONE_RIG_KEY } from '../../src/playback/soundPressure.ts';
import { openImmersive } from '../fixtures/immersivePage.ts';

// 耳机声压：只替换图纸与聚焦视图里的 Genre；设备浮层选完立即生效，窄档不补。

const RIG = {
  version: 1,
  amps: [
    { id: 'a1', name: 'Desktop DAC', vrmsAt0db: 2, gainDb: 0 },
    { id: 'a2', name: 'Portable', vrmsAt0db: 1, gainDb: -6 },
  ],
  headphones: [
    { id: 'h1', name: 'Open 300', impedanceOhm: 300, sensitivity: 97, sensitivityUnit: 'dbPerMw' },
    { id: 'h2', name: 'IEM 32', impedanceOhm: 32, sensitivity: 108, sensitivityUnit: 'dbPerMw' },
  ],
  selectedAmpId: 'a1',
  selectedHeadphoneId: 'h1',
};

test('图纸与聚焦显示声压，歌词与卡片三档不显示；设备浮层可选、可 Esc 关闭并还焦点', async ({
  page,
}) => {
  const { view, host, errors } = await openImmersive(page, {
    config: { [HEADPHONE_RIG_KEY]: RIG },
  });
  const cell = view.locator('[data-field="soundPressure"]');
  await expect(cell).toBeVisible();
  await expect(cell).toHaveAttribute('data-state', 'no-loudness');
  await expect(cell).toContainText('Desktop DAC · Open 300');
  await expect(cell).toContainText('— dBA');
  await expect(cell.locator('[data-sound-pressure-average]')).toContainText('平均 — dBA');

  // 点开浮层：两页设备、当前选中项打勾；没有实时 PCM 时仍是等待响度。
  await cell.locator('button').first().click();
  const panel = view.locator('[data-sound-pressure-panel]');
  await expect(panel).toBeVisible();
  await expect(panel).toBeFocused();
  await expect(panel.locator('[data-sound-pressure-readout]')).toContainText('当前');
  await expect(panel.locator('[data-sound-pressure-readout]')).toContainText('平均');
  await expect(panel.getByRole('tab', { name: '耳放', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await panel.getByRole('button', { name: /Portable/ }).click();
  await expect(panel.getByRole('button', { name: /Portable/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(() => host.config.get(HEADPHONE_RIG_KEY))
    .toMatchObject({ selectedAmpId: 'a2' });
  await panel.getByRole('tab', { name: '耳机', exact: true }).click();
  await panel.getByRole('button', { name: /IEM 32/ }).click();
  await expect
    .poll(() => host.config.get(HEADPHONE_RIG_KEY))
    .toMatchObject({ selectedAmpId: 'a2', selectedHeadphoneId: 'h2' });
  await expect(cell).toContainText('Portable · IEM 32');

  // Esc 收起浮层，焦点回到触发块。
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(cell.locator('button').first()).toBeFocused();

  for (const label of ['歌词视图', '卡片视图', '卡片歌词']) {
    await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
    await page.getByRole('menuitemradio', { name: label, exact: true }).click();
    await expect(view.locator('[data-field="soundPressure"]')).toHaveCount(0);
  }
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '聚焦视图', exact: true }).click();
  await expect(view.locator('[data-field="soundPressure"]')).toBeVisible();
  expect(errors).toStrictEqual([]);
});

test('版心档的图纸与聚焦也有声压，窄档没有', async ({ page }) => {
  const { view, errors } = await openImmersive(page, {
    config: { [HEADPHONE_RIG_KEY]: RIG },
  });
  await page.setViewportSize({ width: 1200, height: 720 });
  await expect(view.locator('[data-tier]')).toHaveAttribute('data-tier', 'compact');
  const compact = view.locator('[data-field="soundPressure"]');
  await expect(compact).toBeVisible();
  await expect(compact.locator('[data-sound-pressure-average]')).toHaveCount(0);
  await compact.locator('button').first().click();
  const panel = view.locator('[data-sound-pressure-panel]');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 1200).toBe(true);
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 864, height: 1536 });
  await expect(view.locator('[data-tier]')).toHaveAttribute('data-tier', 'portrait');
  await expect(view.locator('[data-field="soundPressure"]')).toBeVisible();
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '聚焦视图', exact: true }).click();
  await expect(view.locator('[data-field="soundPressure"]')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 700 });
  await expect(view.locator('[data-tier]')).toHaveAttribute('data-tier', 'narrow');
  await expect(view.locator('[data-field="soundPressure"]')).toHaveCount(0);
  expect(errors).toStrictEqual([]);
});

test('DX5 II 自动模式下组件显示当前输出与设备音量', async ({ page }) => {
  await page.addInitScript(() => {
    const crc16 = (bytes: Uint8Array): number => {
      let value = 0xffff;
      for (const byte of bytes) {
        value ^= byte;
        for (let bit = 0; bit < 8; bit += 1)
          value = value & 1 ? (value >> 1) ^ 0xa001 : value >> 1;
      }
      return value & 0xffff;
    };
    const frame = (cmd: number, data: number, proto: number, total: number, cur: number) => {
      const bytes = new Uint8Array(16);
      bytes[0] = 0x22;
      bytes[1] = 0x33;
      bytes[2] = proto;
      bytes[3] = total;
      bytes[4] = cur;
      bytes[5] = (cmd >> 8) & 0xff;
      bytes[6] = cmd & 0xff;
      bytes[7] = (data >>> 24) & 0xff;
      bytes[8] = (data >>> 16) & 0xff;
      bytes[9] = (data >>> 8) & 0xff;
      bytes[10] = data & 0xff;
      const crc = crc16(bytes.subarray(2, 11));
      bytes[11] = crc >> 8;
      bytes[12] = crc & 0xff;
      bytes[13] = 0x66;
      bytes[14] = 0x77;
      return bytes;
    };
    class FakeDevice extends EventTarget {
      opened = false;
      productName = 'TOPPING DX5 II';
      async open() {
        this.opened = true;
      }
      async close() {
        this.opened = false;
      }
      async sendReport(_reportId: number, data: BufferSource) {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
        const cmd = ((bytes[5] ?? 0) << 8) | (bytes[6] ?? 0);
        if (cmd !== 0x710c) return;
        const words = new Array<number>(45).fill(0);
        words[0] = 1;
        words[9] = 20;
        words[12] = 3;
        words[27] = 96000;
        words.forEach((word, index) => {
          setTimeout(() => {
            const bytes = frame(0x710c, word, 0x11, words.length, index + 1);
            this.dispatchEvent(
              Object.assign(new Event('inputreport'), {
                data: new DataView(bytes.buffer),
              }),
            );
          }, 0);
        });
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
  const cell = view.locator('[data-field="soundPressure"]');
  await expect(cell).toContainText('DX5 II');
  await expect(cell).toContainText('6.35mm');
  expect(
    await cell
      .locator('button > span')
      .first()
      .evaluate((element) => element.scrollWidth > element.clientWidth + 1),
  ).toBe(false);
  await cell.locator('button').first().click();
  const panel = view.locator('[data-sound-pressure-panel]');
  await expect(panel.locator('[data-sound-pressure-auto]')).toContainText(
    '设备音量 -10.0 dB',
  );
  expect(errors).toStrictEqual([]);
});

test('没有设备时显示未配置，点击可以打开浮层添加设备', async ({ page }) => {
  const { view, host, errors } = await openImmersive(page);
  const cell = view.locator('[data-field="soundPressure"]');
  await expect(cell).toHaveAttribute('data-state', 'no-device');
  await expect(cell).toContainText('未配置');
  await cell.locator('button').first().click();
  const panel = view.locator('[data-sound-pressure-panel]');
  await expect(panel.getByText('还没有设备')).toBeVisible();
  await panel.getByRole('button', { name: '添加耳放', exact: true }).click();
  const form = panel.locator('[data-sound-pressure-form="amp"]');
  await form.getByLabel('名称').fill('USB Dongle');
  await form.getByLabel('0 dBFS 输出（Vrms）').fill('1');
  await form.getByLabel('增益（dB）').fill('-3');
  await form.getByRole('button', { name: '保存', exact: true }).click();
  await expect(panel.getByText('USB Dongle')).toBeVisible();
  await expect
    .poll(() => host.config.get(HEADPHONE_RIG_KEY))
    .toMatchObject({ amps: [{ name: 'USB Dongle', vrmsAt0db: 1, gainDb: -3 }] });
  expect(errors).toStrictEqual([]);
});
