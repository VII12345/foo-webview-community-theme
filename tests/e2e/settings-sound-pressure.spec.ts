import { expect, test } from '@playwright/test';
import { HEADPHONE_RIG_KEY } from '../../src/playback/soundPressure.ts';
import { SPL_WEIGHTING_KEY } from '../../src/playback/splWeighting.ts';
import { enterSettings, openSettings } from '../fixtures/settingsPage.ts';

// 「耳机」设置组：耳放与耳机分开维护，当前设备用下拉切换；改动写宿主 config，刷新后还在。

test('DX52 自动读取开关与提示', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hid', {
      configurable: true,
      value: {
        getDevices: async () => [],
        requestDevice: async () => [],
        addEventListener() {},
        removeEventListener() {},
      },
    });
  });
  const settings = await openSettings(page);
  const expander = settings.expander('耳机输出估算');
  const toggle = expander.getByRole('switch', { name: '自动读取解码/耳放信息', exact: true });
  await expect(toggle).toBeVisible();
  await toggle.hover();
  await expect(page.getByRole('tooltip')).toContainText('仅适用于拓品DX52');
  await toggle.click();
  await expect(expander.getByText(/未授权/)).toBeVisible();
  await expect(settings.select('输出接口')).toBeVisible();
  await expect(settings.select('当前耳放')).toBeDisabled();
  expect(settings.errors).toEqual([]);
});

test('声压加权默认 A，切换 K/Z 后持久化', async ({ page }) => {
  const settings = await openSettings(page);
  const expander = settings.expander('耳机输出估算');
  const select = settings.select('声压加权');
  await expect(select).toHaveText('A 加权');
  await select.click();
  await page.getByRole('option', { name: 'K 加权（BS.1770）', exact: true }).click();
  await expect
    .poll(() => settings.host.config.get(SPL_WEIGHTING_KEY))
    .toBe('K');
  await page.reload();
  await enterSettings(page);
  const reloaded = settings.expander('耳机输出估算');
  await expect(settings.select('声压加权')).toHaveText('K 加权（BS.1770）');
  await settings.select('声压加权').click();
  await page.getByRole('option', { name: 'Z 加权（平坦）', exact: true }).click();
  await expect
    .poll(() => settings.host.config.get(SPL_WEIGHTING_KEY))
    .toBe('Z');
  expect(reloaded).toBeVisible();
  expect(settings.errors).toEqual([]);
});

test('设置页增删改耳放与耳机，切换当前设备并持久化', async ({ page }) => {
  const settings = await openSettings(page);
  const nav = settings.nav.getByRole('button', { name: '耳机', exact: true });
  await expect(nav).toBeVisible();
  const expander = settings.expander('耳机输出估算');
  await expect(expander).toBeVisible();
  await expect(settings.row('当前耳放')).toBeVisible();
  await expect(settings.row('当前耳机')).toBeVisible();

  // 添加耳放。
  await expander.getByRole('button', { name: '添加耳放', exact: true }).click();
  const ampForm = expander.locator('[data-sound-pressure-form="amp"]');
  await ampForm.getByLabel('名称').fill('USB DAC');
  await ampForm.getByLabel('0 dBFS 输出（Vrms）').fill('2');
  await ampForm.getByLabel('增益（dB）').fill('-6');
  await ampForm.getByRole('button', { name: '保存', exact: true }).click();
  await expect(settings.row('USB DAC')).toBeVisible();
  await expect
    .poll(() => settings.host.config.get(HEADPHONE_RIG_KEY))
    .toMatchObject({ amps: [{ name: 'USB DAC', vrmsAt0db: 2, gainDb: -6 }] });

  // 添加耳机，单位先用 dB/mW，再切到 dB/V 检查换算后仍是同一灵敏度。
  await expander.getByRole('button', { name: '添加耳机', exact: true }).click();
  const hpForm = expander.locator('[data-sound-pressure-form="headphone"]');
  await hpForm.getByLabel('名称').fill('Open 300');
  await hpForm.getByLabel('阻抗（Ω）').fill('300');
  await hpForm.getByRole('spinbutton', { name: '灵敏度', exact: true }).fill('97');
  await hpForm.getByRole('button', { name: 'dB/V', exact: true }).click();
  await expect(hpForm.getByRole('spinbutton', { name: '灵敏度', exact: true })).toHaveValue(
    '102.23',
  );
  await hpForm.getByRole('combobox', { name: '测量配置', exact: true }).click();
  await page.getByRole('option', { name: /FiiO FT1/ }).click();
  await hpForm.getByRole('button', { name: '保存', exact: true }).click();
  await expect(settings.row('Open 300')).toBeVisible();
  await expect
    .poll(() => settings.host.config.get(HEADPHONE_RIG_KEY))
    .toMatchObject({
      headphones: [{ name: 'Open 300', measurementProfileId: 'huihifi-ft1' }],
    });

  // 切换当前设备。
  await settings.select('当前耳放').click();
  await page.getByRole('option', { name: /USB DAC/ }).click();
  await settings.select('当前耳机').click();
  await page.getByRole('option', { name: /Open 300/ }).click();
  await expect
    .poll(() => settings.host.config.get(HEADPHONE_RIG_KEY))
    .toMatchObject({
      selectedAmpId: expect.any(String),
      selectedHeadphoneId: expect.any(String),
    });

  // 刷新后还在：宿主 config 由 Node 侧的替身持有。
  await page.reload();
  await enterSettings(page);
  const ampRow = expander.locator('[data-settings-row]').filter({ hasText: 'Vrms ·' });
  const headphoneRow = expander.locator('[data-settings-row]').filter({ hasText: 'Ω ·' });
  await expect(ampRow).toContainText('USB DAC');
  await expect(headphoneRow).toContainText('Open 300');
  await expect(settings.select('当前耳放')).toHaveText('USB DAC');
  await expect(settings.select('当前耳机')).toHaveText('Open 300');

  // 编辑耳放。
  await expander.getByRole('button', { name: '编辑 USB DAC', exact: true }).click();
  const editForm = expander.locator('[data-sound-pressure-form="amp"]');
  await editForm.getByLabel('名称').fill('USB DAC 2');
  await editForm.getByRole('button', { name: '保存', exact: true }).click();
  await expect(ampRow).toContainText('USB DAC 2');
  await expect
    .poll(() => settings.host.config.get(HEADPHONE_RIG_KEY))
    .toMatchObject({ amps: [{ name: 'USB DAC 2' }] });

  // 删除耳放：第一次点击只进入确认态，第二次才删。
  await expander.getByRole('button', { name: '删除 USB DAC 2', exact: true }).click();
  await expander.getByRole('button', { name: '再次点击确认删除', exact: true }).click();
  await expect(ampRow).toHaveCount(0);
  await expect
    .poll(() => settings.host.config.get(HEADPHONE_RIG_KEY))
    .toMatchObject({ amps: [] });

  expect(settings.errors).toEqual([]);
});

test('设置页拒绝空名称，输入越界时夹回区间', async ({ page }) => {
  const settings = await openSettings(page);
  const expander = settings.expander('耳机输出估算');
  await expander.getByRole('button', { name: '添加耳放', exact: true }).click();
  const form = expander.locator('[data-sound-pressure-form="amp"]');
  await form.getByLabel('名称').fill('   ');
  await form.getByRole('button', { name: '保存', exact: true }).click();
  await expect(form.getByRole('alert')).toHaveText('保存失败');
  await form.getByLabel('名称').fill('Hot');
  await form.getByLabel('0 dBFS 输出（Vrms）').fill('99');
  await form.getByLabel('增益（dB）').fill('-99');
  await form.getByRole('button', { name: '保存', exact: true }).click();
  await expect(settings.row('Hot')).toBeVisible();
  await expect
    .poll(() => settings.host.config.get(HEADPHONE_RIG_KEY))
    .toMatchObject({ amps: [{ name: 'Hot', vrmsAt0db: 10, gainDb: -99 }] });
  expect(settings.errors).toEqual([]);
});
