import { expect, test } from '@playwright/test';
import { DX52_AUTO_KEY } from '../../src/playback/dx52Prefs.ts';
import { openSettings } from '../fixtures/settingsPage.ts';

// DX52 诊断：短应答/部分快照不会误报已关机；设置页能复制原始 HID 帧。

const FAKE_HID = (mode: 'short' | 'partial') => `
  (() => {
    const crc16 = (bytes) => {
      let value = 0xffff;
      for (const byte of bytes) {
        value ^= byte;
        for (let bit = 0; bit < 8; bit += 1)
          value = value & 1 ? (value >> 1) ^ 0xa001 : value >> 1;
      }
      return value & 0xffff;
    };
    const frame = (cmd, data, proto, total, cur) => {
      const bytes = new Uint8Array(16);
      bytes[0] = 0x22; bytes[1] = 0x33; bytes[2] = proto;
      bytes[3] = total; bytes[4] = cur;
      bytes[5] = (cmd >> 8) & 0xff; bytes[6] = cmd & 0xff;
      bytes[7] = (data >>> 24) & 0xff; bytes[8] = (data >>> 16) & 0xff;
      bytes[9] = (data >>> 8) & 0xff; bytes[10] = data & 0xff;
      const crc = crc16(bytes.subarray(2, 11));
      bytes[11] = crc >> 8; bytes[12] = crc & 0xff;
      bytes[13] = 0x66; bytes[14] = 0x77;
      return bytes;
    };
    class FakeDevice extends EventTarget {
      opened = false;
      productName = 'TOPPING DX5 II';
      async open() { this.opened = true; }
      async close() { this.opened = false; }
      async sendReport(_reportId, data) {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        const cmd = ((bytes[5] ?? 0) << 8) | (bytes[6] ?? 0);
        if (cmd !== 0x710c) return;
        const words = new Array(45).fill(0);
        words[0] = 1; words[9] = 20; words[12] = 3;
        if ('${mode}' === 'short') {
          setTimeout(() => this.dispatchEvent(Object.assign(new Event('inputreport'), {
            data: new DataView(frame(0x710c, 0, 0x11, 1, 1).buffer),
            reportId: 0,
          })), 0);
          return;
        }
        for (const index of [0, 9, 11, 12, 13]) {
          setTimeout(() => this.dispatchEvent(Object.assign(new Event('inputreport'), {
            data: new DataView(frame(0x710c, words[index], 0x11, 45, index + 1).buffer),
            reportId: 0,
          })), 0);
        }
      }
    }
    const device = new FakeDevice();
    class FakeHid extends EventTarget {
      async getDevices() { return [device]; }
      async requestDevice() { return [device]; }
    }
    Object.defineProperty(navigator, 'hid', { configurable: true, value: new FakeHid() });
  })();
`;

test('短应答不会被当成设置快照；诊断面板记录并复制原始帧', async ({ page }) => {
  await page.addInitScript(FAKE_HID('short'));
  const settings = await openSettings(page, { config: { [DX52_AUTO_KEY]: true } });
  await settings.expand('耳机输出估算');
  const diagnostics = page.locator('[data-dx52-diagnostics]');
  await expect(diagnostics).toBeVisible();
  const summary = diagnostics.locator('[data-dx52-diag-status]');
  await expect(summary).toHaveAttribute('data-dx52-diag-status', 'error', {
    timeout: 10_000,
  });
  const log = diagnostics.locator('[data-dx52-diag-log]');
  await expect(log).toContainText('cmd=0x710c');
  await expect(log).toContainText('hex=');
  await expect(summary).toHaveAttribute('data-dx52-diag-missing', /0/);
  await expect(settings.expander('耳机输出估算')).not.toContainText('已关机');

  await diagnostics.getByRole('button', { name: '复制诊断', exact: true }).click();
  await expect(diagnostics.getByRole('button', { name: '已复制', exact: true })).toBeVisible();
  const written = settings.host.callsTo('clipboard.write');
  expect(
    written.some((call) => String(call['text'] ?? '').includes('DX52 HID diagnostics')),
  ).toBe(true);

  await diagnostics.getByRole('button', { name: '重新读取', exact: true }).click();
  await expect(log).toContainText('cmd=0x710c');
  expect(settings.errors).toEqual([]);
});

test('只收到关键字段时显示“设置读取不完整”，不显示已关机', async ({ page }) => {
  await page.addInitScript(FAKE_HID('partial'));
  const settings = await openSettings(page, { config: { [DX52_AUTO_KEY]: true } });
  await settings.expand('耳机输出估算');
  await expect(settings.expander('耳机输出估算')).toContainText('设置读取不完整', {
    timeout: 10_000,
  });
  await expect(settings.expander('耳机输出估算')).not.toContainText('已关机');
  const diagnostics = page.locator('[data-dx52-diagnostics]');
  await expect(diagnostics).toBeVisible();
  await expect(diagnostics.locator('[data-dx52-diag-status]')).toHaveAttribute(
    'data-dx52-diag-snapshot',
    /total=45/,
  );
  expect(settings.errors).toEqual([]);
});
