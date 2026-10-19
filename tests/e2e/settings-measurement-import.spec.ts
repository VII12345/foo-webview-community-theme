import { expect, test } from '@playwright/test';
import { HEADPHONE_RIG_KEY } from '../../src/playback/soundPressure.ts';
import {
  HUHIFI_LINK,
  HUHIFI_UUID,
  huihifiPayload,
} from '../fixtures/huihifiEvaluation.ts';
import { enterSettings, openSettings } from '../fixtures/settingsPage.ts';

const CUSTOM_ID = `huihifi-custom-${HUHIFI_UUID}`;

test('从 huihifi 链接导入测量档案、应用到耳机并持久化', async ({ page }) => {
  let stored: string | null = null;
  const writes: { path: string; content: string; atomic?: boolean }[] = [];
  const settings = await openSettings(page, {
    answers: {
      file: {
        read: (params) => {
          const path = String(params['path'] ?? '');
          if (path.endsWith('measurements-v1.json') && stored)
            return { success: true, content: stored, size: stored.length };
          return { success: false, error: 'not found', code: 'NOT_FOUND' };
        },
        write: (params) => {
          const content = String(params['content'] ?? '');
          stored = content;
          writes.push({
            path: String(params['path'] ?? ''),
            content,
            atomic: params['atomic'] as boolean | undefined,
          });
          return { success: true, bytesWritten: content.length };
        },
      },
      http: {
        get: () => ({
          success: true,
          status: 200,
          headers: {},
          body: JSON.stringify(huihifiPayload()),
        }),
      },
    },
  });
  const expander = settings.expander('耳机输出估算');
  await expander.getByRole('button', { name: '添加耳机', exact: true }).click();
  const form = expander.locator('[data-sound-pressure-form="headphone"]');
  await form.getByLabel('名称').fill('FT1');
  await form.getByLabel('阻抗（Ω）').fill('32');
  await form.getByRole('spinbutton', { name: '灵敏度', exact: true }).fill('98');

  await form.getByRole('button', { name: '从 huihifi 链接导入', exact: true }).click();
  const dialog = page.locator('[data-measurement-import-dialog]');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: '评测链接', exact: true }).fill('https://example.com/nope');
  await dialog.getByRole('button', { name: '获取档案', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('不是有效的 huihifi 评测链接');
  expect(settings.host.callsTo('http.get')).toHaveLength(0);

  await dialog
    .getByRole('textbox', { name: '评测链接', exact: true })
    .fill(HUHIFI_LINK);
  await dialog.getByRole('button', { name: '获取档案', exact: true }).click();
  await expect(dialog.locator('[data-measurement-import-preview]')).toContainText('飞傲 FT1');
  await expect(dialog).toContainText('频响点数');
  await expect(dialog).toContainText('阻抗点数');
  await dialog.getByRole('button', { name: '导入', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(form.getByRole('combobox', { name: '测量配置', exact: true })).toContainText(
    '飞傲 FT1',
  );
  expect(settings.host.callsTo('http.get')).toHaveLength(1);
  expect(writes).toHaveLength(1);
  expect(writes[0]?.path.endsWith('webview-ui-headphones\\measurements-v1.json')).toBe(true);
  expect(writes[0]?.atomic).toBe(true);
  expect(JSON.parse(writes[0]!.content).profiles).toHaveLength(1);

  // 导入只改 draft；保存后才写耳机配置。
  expect(settings.host.config.get(HEADPHONE_RIG_KEY)).toBeUndefined();
  await form.getByRole('button', { name: '保存', exact: true }).click();
  await expect
    .poll(() => settings.host.config.get(HEADPHONE_RIG_KEY))
    .toMatchObject({ headphones: [{ name: 'FT1', measurementProfileId: CUSTOM_ID }] });

  // 刷新后自定义档案仍在，并出现在自定义列表。
  await page.reload();
  await enterSettings(page);
  await settings.expand('耳机输出估算');
  await expect(settings.row('FT1')).toContainText('32 Ω');
  await expect(page.locator(`[data-custom-measurement-row="${CUSTOM_ID}"]`)).toHaveCount(1);

  const customRow = page.locator(`[data-custom-measurement-row="${CUSTOM_ID}"]`);
  const deleteButton = customRow.getByRole('button', {
    name: '删除自定义档案',
    exact: true,
  });
  await deleteButton.click();
  await deleteButton.click();
  await expect(customRow).toHaveCount(0);
  expect(writes).toHaveLength(2);
  expect(JSON.parse(writes[1]!.content).profiles).toEqual([]);
  expect(settings.errors).toEqual([]);
});
