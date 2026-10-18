import { describe, expect, it } from 'vitest';
import {
  convertSensitivity,
  emptyRig,
  estimateSoundPressure,
  formatMargin,
  formatPower,
  formatSpl,
  formatVoltage,
  normalizeAmp,
  normalizeHeadphone,
  parseHeadphoneRig,
  selectedRig,
  sensitivityDbPerMw,
  sensitivityDbPerV,
  type HeadphoneProfile,
  type HeadphoneRig,
} from '../../../src/playback/soundPressure.ts';

const AMP = { id: 'amp', name: 'Amp', vrmsAt0db: 2, gainDb: 0 };
const HEADPHONE = {
  id: 'hp',
  name: 'Headphones',
  impedanceOhm: 300,
  sensitivity: 97,
  sensitivityUnit: 'dbPerMw' as const,
};

function rig(overrides: Partial<HeadphoneRig> = {}): HeadphoneRig {
  return {
    ...emptyRig(),
    amps: [AMP],
    headphones: [HEADPHONE],
    selectedAmpId: 'amp',
    selectedHeadphoneId: 'hp',
    ...overrides,
  };
}

describe('耳机声压估算', () => {
  it('按 dB/mW 灵敏度算出电压、功率、SPL 与安全余量', () => {
    const reading = estimateSoundPressure(
      { shortTermLufs: -20, volumeDb: 0, muted: false },
      rig(),
    );
    expect(reading.state).toBe('over');
    expect(reading.voltage).toBeCloseTo(0.2166, 4);
    expect(reading.powerMw).toBeCloseTo(0.1563, 4);
    expect(reading.spl).toBeCloseTo(88.94, 2);
    expect(reading.marginDb).toBeCloseTo(-8.94, 2);
  });

  it('dB/V 与 dB/mW 两种灵敏度给出同一个 SPL', () => {
    const perVolt: HeadphoneProfile = {
      ...HEADPHONE,
      sensitivity: 102.23,
      sensitivityUnit: 'dbPerV',
    };
    const input = { shortTermLufs: -20, volumeDb: 0, muted: false };
    const a = estimateSoundPressure(input, rig({ headphones: [perVolt] }));
    const b = estimateSoundPressure(input, rig());
    expect(a.spl).toBeCloseTo(b.spl ?? 0, 2);
  });

  it('音量降 20 dB，SPL 与余量同降 20 dB', () => {
    const loud = estimateSoundPressure(
      { shortTermLufs: -20, volumeDb: 0, muted: false },
      rig(),
    );
    const quiet = estimateSoundPressure(
      { shortTermLufs: -20, volumeDb: -20, muted: false },
      rig(),
    );
    expect((loud.spl ?? 0) - (quiet.spl ?? 0)).toBeCloseTo(20, 6);
    expect((quiet.marginDb ?? 0) - (loud.marginDb ?? 0)).toBeCloseTo(20, 6);
  });

  it('负的耳放增益从数字电平上扣除', () => {
    const withGain = estimateSoundPressure(
      { shortTermLufs: -20, volumeDb: 0, muted: false },
      rig({ amps: [{ ...AMP, gainDb: -6 }] }),
    );
    const plain = estimateSoundPressure(
      { shortTermLufs: -20, volumeDb: 0, muted: false },
      rig(),
    );
    expect((withGain.spl ?? 0) - (plain.spl ?? 0)).toBeCloseTo(-6, 6);
  });

  it('静音、无响度、未选设备分别给出各自的状态', () => {
    expect(
      estimateSoundPressure({ shortTermLufs: -20, volumeDb: 0, muted: true }, rig()),
    ).toMatchObject({ state: 'muted', spl: null, powerMw: 0, voltage: 0, marginDb: 80 });
    expect(
      estimateSoundPressure({ shortTermLufs: null, volumeDb: 0, muted: false }, rig()),
    ).toMatchObject({ state: 'no-loudness', spl: null });
    expect(
      estimateSoundPressure(
        { shortTermLufs: -20, volumeDb: 0, muted: false },
        emptyRig(),
      ).state,
    ).toBe('no-device');
    expect(
      estimateSoundPressure(
        { shortTermLufs: -20, volumeDb: 0, muted: false },
        rig({ selectedAmpId: null }),
      ).state,
    ).toBe('no-amp');
    expect(
      estimateSoundPressure(
        { shortTermLufs: -20, volumeDb: 0, muted: false },
        rig({ selectedHeadphoneId: null }),
      ).state,
    ).toBe('no-headphone');
  });

  it('超过显示上限只写 >140，余量仍按实际值算', () => {
    const reading = estimateSoundPressure(
      { shortTermLufs: -3, volumeDb: 30, muted: false },
      rig({ amps: [{ ...AMP, vrmsAt0db: 10 }] }),
    );
    expect(formatSpl(reading.spl)).toBe('>140');
    expect(reading.marginDb).toBeLessThan(-60);
  });

  it('灵敏度换算保持同一个物理灵敏度', () => {
    const dbV = convertSensitivity(97, 'dbPerMw', 'dbPerV', 300);
    expect(dbV).toBeCloseTo(102.228, 2);
    expect(convertSensitivity(dbV, 'dbPerV', 'dbPerMw', 300)).toBeCloseTo(97, 6);
    expect(sensitivityDbPerV(HEADPHONE)).toBeCloseTo(dbV, 6);
    expect(
      sensitivityDbPerMw({ ...HEADPHONE, sensitivity: dbV, sensitivityUnit: 'dbPerV' }),
    ).toBeCloseTo(97, 6);
  });

  it('格式化功率、电压与余量', () => {
    expect(formatPower(1530)).toBe('1.53 W');
    expect(formatPower(153)).toBe('153.0 mW');
    expect(formatPower(0.153)).toBe('0.153 mW');
    expect(formatPower(0.000153)).toBe('0.2 µW');
    expect(formatPower(null)).toBe('—');
    expect(formatVoltage(1.98)).toBe('1.98 V');
    expect(formatVoltage(0.2166)).toBe('217 mV');
    expect(formatVoltage(0)).toBe('0 V');
    expect(formatMargin(12.3)).toBe('+12.3');
    expect(formatMargin(-8.94)).toBe('−8.9');
    expect(formatMargin(null)).toBe('—');
  });

  it('选中项不存在时退回 null', () => {
    expect(selectedRig(rig({ selectedAmpId: 'missing' }))).toEqual({
      amp: null,
      headphone: expect.objectContaining({ id: 'hp' }),
    });
  });
});

describe('耳机设备的校验', () => {
  it('越界参数夹回区间，非法条目丢弃', () => {
    expect(normalizeAmp({ id: 'a', name: '  Amp  ', vrmsAt0db: 50, gainDb: -99 })).toEqual({
      id: 'a',
      name: 'Amp',
      vrmsAt0db: 10,
      gainDb: -99,
    });
    expect(normalizeHeadphone({ id: 'h', name: 'HP', impedanceOhm: 1, sensitivity: 999 })).toEqual({
      id: 'h',
      name: 'HP',
      impedanceOhm: 8,
      sensitivity: 140,
      sensitivityUnit: 'dbPerMw',
    });
    expect(normalizeAmp({ id: '', name: 'Amp' })).toBeUndefined();
    expect(normalizeHeadphone({ id: 'h', name: '   ' })).toBeUndefined();
  });

  it('读存档时拒绝未来版本、去重 id、清掉悬空的选择', () => {
    expect(parseHeadphoneRig({ version: 2, amps: [], headphones: [] })).toBeUndefined();
    const parsed = parseHeadphoneRig({
      version: 1,
      amps: [
        { id: 'a', name: 'First', vrmsAt0db: 2, gainDb: 0 },
        { id: 'a', name: 'Second', vrmsAt0db: 1, gainDb: 0 },
      ],
      headphones: [{ id: 'h', name: 'HP', impedanceOhm: 300, sensitivity: 100 }],
      selectedAmpId: 'missing',
      selectedHeadphoneId: 'h',
    });
    expect(parsed?.amps).toHaveLength(1);
    expect(parsed?.amps[0]?.name).toBe('First');
    expect(parsed?.selectedAmpId).toBeNull();
    expect(parsed?.selectedHeadphoneId).toBe('h');
  });
});
