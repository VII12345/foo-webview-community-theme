import { describe, expect, it } from 'vitest';
import type { Dx52State } from '../../../../src/playback/dx52.ts';
import { dx52Reading } from '../../../../src/immersive/sound/soundPressureReading.ts';

const state: Dx52State = {
  connected: true,
  powered: true,
  deviceName: 'DX5 II',
  volumeRaw: 120,
  volumeStepDb: 0.5,
  volumeDb: -60,
  muted: false,
  input: 'usb',
  route: 'hp_single',
  highGain: false,
  sampleRate: 96000,
  lineMode: 'preamp',
  balanceDb: 0,
  updatedAtMs: 1,
  partial: false,
};

const connected = { kind: 'connected' } as const;

describe('DX5 II 自动读数', () => {
  it('开关关闭时不碰自动逻辑', () => {
    expect(dx52Reading(false, { kind: 'off' }, null, 'auto')).toMatchObject({
      reason: null,
      active: false,
      output: null,
      amp: null,
    });
  });

  it('WebHID 不可用、未授权、等待设备、关机分别给出原因', () => {
    expect(dx52Reading(true, { kind: 'unsupported' }, null, 'auto').reason).toBe(
      'unsupported',
    );
    expect(dx52Reading(true, { kind: 'unauthorized' }, null, 'auto').reason).toBe(
      'unauthorized',
    );
    expect(dx52Reading(true, { kind: 'waiting' }, null, 'auto').reason).toBe('waiting');
    expect(
      dx52Reading(true, connected, { ...state, powered: false }, 'auto').reason,
    ).toBe('off');
    expect(
      dx52Reading(true, connected, { ...state, powered: false, partial: true }, 'auto').reason,
    ).toBe('partial');
    expect(
      dx52Reading(true, connected, { ...state, partial: true }, 'auto').active,
    ).toBe(true);
  });

  it('USB、耳机输出且当前 foobar 输出名不匹配时也生效', () => {
    const reading = dx52Reading(true, connected, state, 'auto');
    expect(reading.active).toBe(true);
    expect(reading.reason).toBeNull();
    expect(reading.output?.label).toBe('6.35mm');
    expect(reading.amp?.vrmsAt0db).toBeCloseTo(7.2 / (2 * Math.SQRT2), 6);
    expect(reading.amp?.gainDb).toBe(-60);
  });

  it('线路输出、非 USB 时不生效', () => {
    expect(
      dx52Reading(true, connected, { ...state, route: 'line_single' }, 'auto').reason,
    ).toBe('line');
    expect(
      dx52Reading(true, connected, { ...state, input: 'optical' }, 'auto').reason,
    ).toBe('not-usb');
  });

  it('hp_all 时按用户选择的接口消歧，平衡高增益用 48 Vpp', () => {
    const reading = dx52Reading(
      true,
      connected,
      { ...state, route: 'hp_all', highGain: true },
      'balanced',
    );
    expect(reading.active).toBe(true);
    expect(reading.output).toMatchObject({ balanced: true, label: '4.4mm XLR' });
    expect(reading.amp?.vrmsAt0db).toBeCloseTo(48 / (2 * Math.SQRT2), 6);
    expect(reading.amp?.name).toBe('TOPPING DX5 II · 4.4mm XLR · High');
  });
});
