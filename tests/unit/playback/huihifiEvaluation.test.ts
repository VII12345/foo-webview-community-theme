import { describe, expect, it } from 'vitest';
import {
  huihifiEvaluationApiUrl,
  parseHuihifiEvaluationLink,
  parseHuihifiEvaluationPayload,
} from '../../../src/playback/huihifiEvaluation.ts';
import { HUHIFI_LINK, HUHIFI_UUID, huihifiPayload } from '../../fixtures/huihifiEvaluation.ts';

describe('huihifi 链接', () => {
  it('接受 apex/www、尾斜杠与大小写 UUID，规范化为小写', () => {
    expect(parseHuihifiEvaluationLink(HUHIFI_LINK)).toEqual({
      uuid: HUHIFI_UUID,
      canonicalUrl: HUHIFI_LINK,
    });
    expect(
      parseHuihifiEvaluationLink(`https://www.huihifi.com/evaluation/${HUHIFI_UUID}/`),
    ).toMatchObject({ uuid: HUHIFI_UUID });
    expect(
      parseHuihifiEvaluationLink(`https://huihifi.com/evaluation/${HUHIFI_UUID.toUpperCase()}`),
    ).toMatchObject({ uuid: HUHIFI_UUID });
  });

  it('拒绝非 https、其它 host、端口、userinfo、额外路径与坏 UUID', () => {
    for (const url of [
      `http://huihifi.com/evaluation/${HUHIFI_UUID}`,
      `https://example.com/evaluation/${HUHIFI_UUID}`,
      `https://sub.huihifi.com/evaluation/${HUHIFI_UUID}`,
      `https://huihifi.com:8443/evaluation/${HUHIFI_UUID}`,
      `https://user@huihifi.com/evaluation/${HUHIFI_UUID}`,
      `https://huihifi.com/evaluation/${HUHIFI_UUID}/extra`,
      'https://huihifi.com/evaluation/not-a-uuid',
      'javascript:alert(1)',
    ]) {
      expect(parseHuihifiEvaluationLink(url), url).toBeNull();
    }
  });

  it('API URL 只由 UUID 派生', () => {
    expect(huihifiEvaluationApiUrl(HUHIFI_UUID)).toBe(
      `https://huihifi.com/api/v1/evaluations/${HUHIFI_UUID}`,
    );
  });
});

describe('huihifi 载荷', () => {
  it('解析 FR/阻抗，1 kHz 归一化，阻抗升序', () => {
    const parsed = parseHuihifiEvaluationPayload(huihifiPayload(), HUHIFI_UUID);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toMatchObject({
      id: `huihifi-custom-${HUHIFI_UUID}`,
      uuid: HUHIFI_UUID,
      name: '飞傲 FT1',
      brand: '飞傲 FiiO',
      rawPointCounts: { frequencyResponse: 10, impedance: 7 },
    });
    expect(parsed.value.frequencyResponse.length).toBe(240);
    expect(parsed.value.impedance.length).toBe(180);
    expect(parsed.value.impedance[0]!.hz).toBeLessThan(
      parsed.value.impedance[parsed.value.impedance.length - 1]!.hz,
    );
    const at1k = parsed.value.frequencyResponse.reduce((best, point) =>
      Math.abs(Math.log(point.hz / 1000)) < Math.abs(Math.log(best.hz / 1000)) ? point : best,
    );
    expect(Math.abs(at1k.db)).toBeLessThan(0.2);
  });

  it('缺 RAW_FR、坏 code、UUID 不一致、FR 太少都报 payload', () => {
    const missing = huihifiPayload() as any;
    missing.data.datas = missing.data.datas.filter(
      (item: any) => item.project.code !== 'RAW_FR',
    );
    expect(parseHuihifiEvaluationPayload(missing, HUHIFI_UUID)).toEqual({
      ok: false,
      reason: 'payload',
    });
    const badCode = huihifiPayload() as any;
    badCode.code = 1;
    expect(parseHuihifiEvaluationPayload(badCode, HUHIFI_UUID).ok).toBe(false);
    expect(parseHuihifiEvaluationPayload(huihifiPayload(), '00000000-0000-0000-0000-000000000000').ok).toBe(false);
    const short = huihifiPayload() as any;
    short.data.datas[0].children[0].dataSet = [
      ['Freq(Hz)', 'SPL(dB)'],
      ['1000', '100'],
    ];
    expect(parseHuihifiEvaluationPayload(short, HUHIFI_UUID).ok).toBe(false);
  });

  it('缺阻抗仍可导入，raw 阻抗点数为 0', () => {
    const payload = huihifiPayload() as any;
    payload.data.datas = payload.data.datas.filter(
      (item: any) => item.project.code !== 'IMPEDANCE',
    );
    const parsed = parseHuihifiEvaluationPayload(payload, HUHIFI_UUID);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.rawPointCounts.impedance).toBe(0);
      expect(parsed.value.impedance).toEqual([]);
    }
  });

  it('datas 超限报 too-large', () => {
    const payload = huihifiPayload() as any;
    payload.data.datas = Array.from({ length: 65 }, () => payload.data.datas[0]);
    expect(parseHuihifiEvaluationPayload(payload, HUHIFI_UUID)).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });
});
