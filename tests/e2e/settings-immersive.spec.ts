import { expect, test } from '@playwright/test';
import { openSettings, enterSettings } from '../fixtures/settingsPage.ts';

test('组件显示按视图与布局保存，只列当前档位可用的模块', async ({ page }) => {
  const settings = await openSettings(page);
  await settings.expand('组件显示');
  await expect(settings.select('视图')).toHaveText('图纸舞台');
  await expect(settings.select('布局')).toHaveText('完整舞台');
  await expect(page.getByRole('switch', { name: '频谱', exact: true })).toBeVisible();

  await settings.choose('视图', '聚焦视图');
  await expect(page.getByRole('switch', { name: '频谱', exact: true })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: '采样率', exact: true })).toBeVisible();
  await settings.choose('布局', '紧凑');
  await expect(page.getByRole('switch', { name: '采样率', exact: true })).toHaveCount(0);

  await settings.choose('视图', '卡片视图');
  await expect(settings.select('布局')).toHaveText('完整舞台');
  await expect(page.getByRole('switch', { name: '曲名与艺人', exact: true })).toHaveCount(0);

  await settings.choose('视图', '图纸舞台');
  await settings.choose('布局', '完整舞台');
  const spectrum = page.getByRole('switch', { name: '频谱', exact: true });
  await spectrum.click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('default-theme.immersive.components.v1')))
    .toBe(JSON.stringify({ version: 1, hidden: { 'paper/full': ['right.spectrum'] } }));

  await page.reload();
  await enterSettings(page);
  await settings.expand('组件显示');
  await expect(page.getByRole('switch', { name: '频谱', exact: true })).not.toBeChecked();
  expect(settings.errors).toEqual([]);
});

test('文字提亮滑杆保存并回读', async ({ page }) => {
  const settings = await openSettings(page);
  await settings.expand('背景');
  const slider = page.getByRole('slider', { name: '歌词与卡片文字提亮' });
  await expect(slider).toHaveValue('50');
  await slider.fill('80');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('default-theme.immersive.textBoost.v1')))
    .toBe('80');
  await page.reload();
  await enterSettings(page);
  await settings.expand('背景');
  await expect(page.getByRole('slider', { name: '歌词与卡片文字提亮' })).toHaveValue('80');
  expect(settings.errors).toEqual([]);
});

test('进入设置先读沉浸偏好，修改可保存且不启动可视化服务', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('default-theme.immersive.wash.v1') === null) {
      localStorage.setItem('default-theme.immersive.wash.v1', 'static');
      localStorage.setItem('default-theme.immersive.fpsCap.v1', '60');
    }
  });
  const settings = await openSettings(page);
  await expect(page.getByRole('switch', { name: '进入时全屏', exact: true })).toBeVisible();
  await settings.expand('背景');
  await expect(settings.select('封面底色')).toHaveText('静态');
  await settings.choose('封面底色', '不显示');
  await settings.expand('性能');
  await expect(settings.select('帧率上限')).toHaveText('60 fps');
  await settings.choose('帧率上限', '30 fps');
  await page.getByRole('switch', { name: '性能小窗', exact: true }).check();
  for (const method of [
    'audio.subscribeSpectrum',
    'audio.subscribeStream',
    'audio.generateFullWaveform',
    'window.setFullscreen',
  ] as const)
    expect(settings.host.callsTo(method)).toEqual([]);
  await page.reload();
  await enterSettings(page);
  await settings.expand('背景');
  await settings.expand('性能');
  await expect(settings.select('封面底色')).toHaveText('不显示');
  await expect(settings.select('帧率上限')).toHaveText('30 fps');
  await expect(page.getByRole('switch', { name: '性能小窗', exact: true })).toBeChecked();
  expect(settings.errors).toEqual([]);
});
