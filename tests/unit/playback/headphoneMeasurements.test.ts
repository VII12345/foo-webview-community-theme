import { describe, expect, it } from 'vitest';
import {
  bandResponseDb,
  frDbAt,
  impedanceOhmAt,
  measurementProfileOf,
  referenceImpedanceOhm,
} from '../../../src/playback/headphoneMeasurements.ts';
import { SPL_BAND_EDGES } from '../../../src/playback/splBands.ts';

describe('耳机测量档案', () => {
  it('按 id 取到三只耳机，未知 id 返回 null', () => {
    expect(measurementProfileOf('huihifi-ft1')?.name).toBe('FiiO FT1');
    expect(measurementProfileOf('huihifi-jt7')?.name).toBe('FiiO JT7');
    expect(measurementProfileOf('huihifi-mdr-m1')?.name).toBe('Sony MDR-M1');
    expect(measurementProfileOf('missing')).toBeNull();
    expect(measurementProfileOf(null)).toBeNull();
  });

  it('FR 在 1 kHz 附近归一到 0 dB，曲线外保持端点', () => {
    for (const id of ['huihifi-ft1', 'huihifi-jt7', 'huihifi-mdr-m1']) {
      const profile = measurementProfileOf(id)!;
      expect(Math.abs(frDbAt(profile, 1000))).toBeLessThan(0.2);
      expect(Number.isFinite(frDbAt(profile, 10))).toBe(true);
      expect(Number.isFinite(frDbAt(profile, 30000))).toBe(true);
    }
  });

  it('阻抗在 1 kHz 取测量值，没有档案时回退标称值', () => {
    expect(impedanceOhmAt(measurementProfileOf('huihifi-ft1'), 1000, 32)).toBeGreaterThan(30);
    expect(impedanceOhmAt(null, 1000, 32)).toBe(32);
    expect(
      referenceImpedanceOhm(measurementProfileOf('huihifi-jt7'), 18),
    ).toBeGreaterThan(10);
    expect(referenceImpedanceOhm(null, 300)).toBe(300);
  });

  it('先查自定义档案，再查内置；未知 id 回退 null', () => {
    const custom = {
      id: 'huihifi-custom-test',
      name: 'Custom',
      source: 'huihifi',
      sourceUrl: 'https://huihifi.com/evaluation/test',
      uuid: 'test',
      fetchedAt: '2026-10-20',
      frReference: 'voltage' as const,
      driveImpedanceOhm: null,
      frequencyResponse: [{ hz: 20, db: 0 }],
      impedance: [{ hz: 20, ohm: 32 }],
    };
    expect(measurementProfileOf(custom.id, [custom])).toBe(custom);
    expect(measurementProfileOf('huihifi-ft1', [custom])?.name).toBe('FiiO FT1');
    expect(measurementProfileOf('missing', [custom])).toBeNull();
  });

  it('每个 1/3 倍频程 band 都有有限响应', () => {
    for (const profile of [
      measurementProfileOf('huihifi-ft1'),
      measurementProfileOf('huihifi-jt7'),
      measurementProfileOf('huihifi-mdr-m1'),
      null,
    ]) {
      const response = bandResponseDb(profile, SPL_BAND_EDGES, 0.2, 32);
      expect(response).toHaveLength(SPL_BAND_EDGES.length - 1);
      expect([...response].every(Number.isFinite)).toBe(true);
    }
  });
});
