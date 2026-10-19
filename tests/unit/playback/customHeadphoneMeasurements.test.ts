import { createStore } from 'jotai/vanilla';
import { describe, expect, it, onTestFinished } from 'vitest';
import {
  CUSTOM_MEASUREMENT_FILE,
  customMeasurementProfilesAtom,
  customMeasurementStatusAtom,
  startCustomHeadphoneMeasurements,
  type CustomMeasurementHost,
} from '../../../src/playback/customHeadphoneMeasurements.ts';
import { HUHIFI_LINK, huihifiPayload } from '../../fixtures/huihifiEvaluation.ts';
import { installFakeHost } from '../../fixtures/unitHost.ts';

function setup(read?: unknown) {
  const host = installFakeHost();
  host.answer('file.read', () =>
    read ?? { success: false, error: 'not found', code: 'NOT_FOUND' },
  );
  host.answer('http.get', () => ({
    success: true,
    status: 200,
    headers: {},
    body: JSON.stringify(huihifiPayload()),
  }));
  const writes: { path: string; content: string; atomic?: boolean }[] = [];
  host.answer('file.write', (params) => {
    writes.push({
      path: String(params['path']),
      content: String(params['content']),
      atomic: params['atomic'] as boolean | undefined,
    });
    return { success: true, bytesWritten: String(params['content']).length };
  });
  const store = createStore();
  const service = startCustomHeadphoneMeasurements(
    store,
    host.fb as unknown as CustomMeasurementHost,
  );
  onTestFinished(() => service.dispose());
  return { host, store, service, writes };
}

const storedFile = (profiles: unknown) => JSON.stringify({ version: 1, profiles });

describe('自定义测量档案', () => {
  it('文件不存在时为空，导入后写 profile 本地文件并可删除', async () => {
    const env = setup();
    await env.service.ready;
    expect(env.store.get(customMeasurementStatusAtom)).toEqual({ kind: 'empty' });
    expect(env.store.get(customMeasurementProfilesAtom)).toEqual([]);

    const preview = await env.service.preview(HUHIFI_LINK);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.value).toMatchObject({
      name: '飞傲 FT1',
      brand: '飞傲 FiiO',
      rawPointCounts: { frequencyResponse: 10, impedance: 7 },
    });
    const committed = await env.service.commit(preview.value);
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    expect(env.writes).toHaveLength(1);
    expect(
      env.writes[0]?.path.endsWith(`webview-ui-headphones\\${CUSTOM_MEASUREMENT_FILE}`),
    ).toBe(true);
    expect(env.writes[0]?.atomic).toBe(true);
    const saved = JSON.parse(env.writes[0]!.content);
    expect(saved).toMatchObject({
      version: 1,
      profiles: [
        {
          id: committed.value.id,
          uuid: '78a5551b-a960-48fe-a2b6-38ec21a7a513',
          name: '飞傲 FT1',
        },
      ],
    });
    expect(env.store.get(customMeasurementProfilesAtom)).toHaveLength(1);

    const removed = await env.service.remove(committed.value.id);
    expect(removed).toEqual({ ok: true, value: { removed: true } });
    expect(env.writes).toHaveLength(2);
    expect(JSON.parse(env.writes[1]!.content).profiles).toEqual([]);
  });

  it('同 UUID 重复导入覆盖同一条，不增加数量', async () => {
    const env = setup();
    await env.service.ready;
    const first = await env.service.preview(HUHIFI_LINK);
    if (!first.ok) return;
    await env.service.commit(first.value);
    const second = await env.service.preview(HUHIFI_LINK);
    if (!second.ok) return;
    expect(second.value.overwrite).toBe(true);
    const committed = await env.service.commit(second.value);
    expect(committed).toMatchObject({ ok: true, value: { replaced: true } });
    expect(env.store.get(customMeasurementProfilesAtom)).toHaveLength(1);
  });

  it('无效链接不请求宿主，有效链接只请求派生 API URL', async () => {
    const env = setup();
    await env.service.ready;
    expect(await env.service.preview('https://example.com/evaluation/x')).toEqual({
      ok: false,
      reason: 'invalid-url',
    });
    expect(env.host.callsTo('http.get')).toHaveLength(0);
    const preview = await env.service.preview(HUHIFI_LINK);
    expect(preview.ok).toBe(true);
    const calls = env.host.callsTo('http.get');
    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.['url'])).toBe(
      'https://huihifi.com/api/v1/evaluations/78a5551b-a960-48fe-a2b6-38ec21a7a513',
    );
  });

  it('读取已有文件、坏文件与权限拒绝', async () => {
    const valid = {
      success: true,
      content: storedFile([
        {
          id: 'huihifi-custom-78a5551b-a960-48fe-a2b6-38ec21a7a513',
          uuid: '78a5551b-a960-48fe-a2b6-38ec21a7a513',
          name: 'FT1',
          frequencyResponse: [[20, 0], [1000, 0]],
          impedance: [[20, 40], [1000, 37]],
        },
      ]),
    };
    const env = setup(valid);
    await env.service.ready;
    expect(env.store.get(customMeasurementStatusAtom)).toEqual({ kind: 'ready' });
    expect(env.store.get(customMeasurementProfilesAtom)[0]).toMatchObject({
      name: 'FT1',
      sourceUrl: HUHIFI_LINK,
    });

    const corrupt = setup({ success: true, content: '{' });
    await corrupt.service.ready;
    expect(corrupt.store.get(customMeasurementStatusAtom)).toEqual({ kind: 'corrupt' });

    const denied = setup({ success: false, code: 'PERMISSION_DENIED', error: 'denied' });
    await denied.service.ready;
    expect(denied.store.get(customMeasurementStatusAtom)).toEqual({ kind: 'denied' });
  });
});
