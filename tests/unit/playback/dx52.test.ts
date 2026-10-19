import { describe, expect, it } from 'vitest';
import {
  applyDx52Push,
  buildDx52Frame,
  dx52AmpProfile,
  dx52OutputInfo,
  DX52_COMMANDS,
  isDx52ProductName,
  parseDx52Frame,
  readDx52Settings,
  type Dx52Frame,
} from '../../../src/playback/dx52.ts';

function nameWords(name: string): number[] {
  const bytes = new TextEncoder().encode(name.padEnd(32, '\0'));
  const words: number[] = [];
  for (let index = 0; index < 32; index += 4)
    words.push(
      (bytes[index] ?? 0) |
        ((bytes[index + 1] ?? 0) << 8) |
        ((bytes[index + 2] ?? 0) << 16) |
        ((bytes[index + 3] ?? 0) << 24),
    );
  return words;
}

function settingsWords(): number[] {
  const words = new Array<number>(45).fill(0);
  words[0] = 1;
  nameWords('DX5 II').forEach((word, index) => {
    words[1 + index] = word;
  });
  words[9] = 120;
  words[11] = 0;
  words[12] = 3;
  words[13] = 0;
  words[19] = 0;
  words[27] = 96000;
  words[32] = 0;
  return words;
}

describe('DX5 II 协议', () => {
  it('构造与解析 16 字节帧，CRC 不对时丢弃', () => {
    const bytes = buildDx52Frame(DX52_COMMANDS.getSettings, 0, 0x10);
    expect(Array.from(bytes.subarray(0, 7))).toEqual([0x22, 0x33, 0x10, 1, 1, 0x71, 0x0c]);
    expect(Array.from(bytes.subarray(13, 16))).toEqual([0x66, 0x77, 0]);
    expect(parseDx52Frame(bytes)).toEqual({
      proto: 0x10,
      total: 1,
      cur: 1,
      cmd: DX52_COMMANDS.getSettings,
      data: 0,
    });
    const broken = bytes.slice();
    broken[10] = 1;
    expect(parseDx52Frame(broken)).toBeNull();
    const reportId = new Uint8Array(17);
    reportId.set(bytes, 1);
    expect(parseDx52Frame(reportId)?.cmd).toBe(DX52_COMMANDS.getSettings);
  });

  it('读快照字段：音量步进、静音、输入、路由、增益、采样率与设备名', () => {
    const state = readDx52Settings(settingsWords(), 123);
    expect(state).toMatchObject({
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
      updatedAtMs: 123,
      partial: false,
    });
    expect(readDx52Settings(settingsWords(), 1, { partial: true })).toMatchObject({
      partial: true,
      powered: true,
    });
    const oneDb = settingsWords();
    oneDb[9] = 99;
    oneDb[32] = 1;
    oneDb[10] = 1;
    oneDb[12] = 4;
    oneDb[13] = 1;
    expect(readDx52Settings(oneDb, 1)).toMatchObject({
      volumeDb: -99,
      muted: true,
      route: 'hp_balanced',
      highGain: true,
    });
  });

  it('推送帧更新音量、静音、输出、增益与步进', () => {
    const state = readDx52Settings(settingsWords(), 1);
    const frame = (cmd: number, data: number): Dx52Frame => ({
      proto: 0x11,
      total: 1,
      cur: 1,
      cmd,
      data,
    });
    expect(applyDx52Push(state, frame(DX52_COMMANDS.volume, 20), 2)).toMatchObject({
      volumeRaw: 20,
      volumeDb: -10,
      updatedAtMs: 2,
    });
    expect(applyDx52Push(state, frame(DX52_COMMANDS.mute, 1), 2)?.muted).toBe(true);
    expect(applyDx52Push(state, frame(DX52_COMMANDS.output, 4), 2)?.route).toBe('hp_balanced');
    expect(applyDx52Push(state, frame(DX52_COMMANDS.headphoneGain, 1), 2)?.highGain).toBe(true);
    expect(applyDx52Push(state, frame(DX52_COMMANDS.volumeStep, 1), 2)?.volumeDb).toBe(-99);
    expect(applyDx52Push(state, frame(0x1234, 0), 2)).toBeNull();
  });

  it('输出路由与 DX5 II 参数表映射成 V0 和设备音量', () => {
    const state = readDx52Settings(settingsWords(), 1);
    expect(dx52OutputInfo('hp_single')).toMatchObject({
      headphone: true,
      balanced: false,
      label: '6.35mm',
    });
    expect(dx52OutputInfo('hp_balanced')).toMatchObject({
      headphone: true,
      balanced: true,
      label: '4.4mm XLR',
    });
    expect(dx52OutputInfo('line_single').headphone).toBe(false);
    expect(dx52OutputInfo('all', 'balanced').balanced).toBe(true);

    const singleLow = dx52AmpProfile(state)!;
    expect(singleLow.output.label).toBe('6.35mm');
    expect(singleLow.amp.vrmsAt0db).toBeCloseTo(7.2 / (2 * Math.SQRT2), 6);
    expect(singleLow.amp.gainDb).toBe(-60);
    expect(singleLow.amp.name).toBe('TOPPING DX5 II · 6.35mm · Low');

    const balancedHigh = dx52AmpProfile({ ...state, route: 'hp_balanced', highGain: true })!;
    expect(balancedHigh.amp.vrmsAt0db).toBeCloseTo(48 / (2 * Math.SQRT2), 6);
    expect(balancedHigh.amp.name).toBe('TOPPING DX5 II · 4.4mm XLR · High');

    expect(dx52AmpProfile({ ...state, route: 'line_single' })).toBeNull();
  });

  it('按产品名识别 DX5 II', () => {
    expect(isDx52ProductName('TOPPING DX5 II')).toBe(true);
    expect(isDx52ProductName('DX52')).toBe(true);
    expect(isDx52ProductName('E50 II')).toBe(false);
  });
});
