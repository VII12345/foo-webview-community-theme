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
};

const connected = { kind: 'connected' } as const;

describe('DX5 II 自动读数', () => {
  it('开关关闭时不碰自动逻辑', () => {
    expect(dx52Reading(false, { kind: 'off' }, null, undefined, 'auto')).toMatchObject({
      reason: null,
      active: false,
      output: null,
      amp: null,
    });
  });

  it('WebHID 不可用、未授权、关机分别给出原因', () => {
    expect(dx52Reading(true, { kind: 'unsupported' }, null, undefined, 'auto').reason).toBe(
      'unsupported',
    );
    expect(dx52Reading(true, { kind: 'unauthorized' }, null, undefined, 'auto').reason).toBe(
      'unauthorized',
    );
    expect(
      dx52Reading(true, connected, { ...state, powered: false }, 'TOPPING DX5 II', 'auto').reason,
    ).toBe('off');
  });

  it('USB、耳机输出且当前 foobar 输出匹配时生效', () => {
    const reading = dx52Reading(
      true,
      connected,
      state,
      'Speakers (TOPPING DX5 II)',
      'auto',
    );
    expect(reading.active).toBe(true);
    expect(reading.reason).toBeNull();
    expect(reading.output?.label).toBe('6.35mm');
    expect(reading.amp?.vrmsAt0db).toBeCloseTo(7.2 / (2 * Math.SQRT2), 6);
    expect(reading.amp?.gainDb).toBe(-60);
  });

  it('线路输出、非 USB、输出设备不匹配时不生效', () => {
    expect(
      dx52Reading(true, connected, { ...state, route: 'line_single' }, 'TOPPING DX5 II', 'auto')
        .reason,
    ).toBe('line');
    expect(
      dx52Reading(true, connected, { ...state, input: 'optical' }, 'TOPPING DX5 II', 'auto')
        .reason,
    ).toBe('not-usb');
    expect(dx52Reading(true, connected, state, 'Speakers (Realtek)', 'auto').reason).toBe(
      'wrong-output',
    );
  });

  it('hp_all 时按用户选择的接口消歧，平衡高增益用 48 Vpp', () => {
    const reading = dx52Reading(
      true,
      connected,
      { ...state, route: 'hp_all', highGain: true },
      'TOPPING DX5 II',
      'balanced',
    );
    expect(reading.active).toBe(true);
    expect(reading.output).toMatchObject({ balanced: true, label: '4.4mm XLR' });
    expect(reading.amp?.vrmsAt0db).toBeCloseTo(48 / (2 * Math.SQRT2), 6);
    expect(reading.amp?.name).toBe('TOPPING DX5 II · 4.4mm XLR · High');
  });
});
