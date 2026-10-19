import { describe, expect, it } from 'vitest';
import {
  applyDx52Push,
  buildDx52Frame,
  dx52AmpProfile,
  dx52DeviceScore,
  dx52OutputInfo,
  dx52ReportCandidates,
  DX52_COMMANDS,
  fitDx52Report,
  isDx52ProductName,
  parseDx52Frame,
  pickDx52Device,
  readDx52Settings,
  reportByteLength,
  summarizeDx52Descriptors,
  type Dx52Frame,
  type Dx52HidCollectionInfo,
  type Dx52HidDevice,
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

  it('读 HID 描述符：报告长度、递归 collections 与同 ID 去重', () => {
    expect(reportByteLength({ items: [{ reportSize: 8, reportCount: 64 }] })).toBe(64);
    expect(reportByteLength({ items: [{ reportSize: 16, reportCount: 8 }] })).toBe(16);
    expect(reportByteLength({})).toBe(0);

    const collections: Dx52HidCollectionInfo[] = [
      {
        usagePage: 0xff00,
        usage: 1,
        outputReports: [{ reportId: 0, items: [{ reportSize: 8, reportCount: 64 }] }],
        featureReports: [{ reportId: 4, items: [{ reportSize: 8, reportCount: 32 }] }],
        inputReports: [{ reportId: 1, items: [{ reportSize: 8, reportCount: 16 }] }],
        children: [
          {
            usagePage: 0xff01,
            featureReports: [{ reportId: 4, items: [{ reportSize: 8, reportCount: 64 }] }],
          },
        ],
      },
      {
        usagePage: 0x0001,
        outputReports: [{ reportId: 0, items: [{ reportSize: 8, reportCount: 16 }] }],
      },
    ];
    const summary = summarizeDx52Descriptors({ collections } as Dx52HidDevice);
    expect(summary).toMatchObject({
      available: true,
      collectionCount: 3,
    });
    expect(summary.outputs).toEqual([
      { kind: 'output', reportId: 0, length: 64, usagePage: 0xff00 },
    ]);
    expect(summary.features).toEqual([
      { kind: 'feature', reportId: 4, length: 64, usagePage: 0xff01 },
    ]);
    expect(summary.inputs[0]).toMatchObject({ reportId: 1, length: 16 });
  });

  it('发送候选优先 vendor 报告，描述符缺失时退回 16/64 字节', () => {
    const summary = summarizeDx52Descriptors({
      collections: [
        {
          usagePage: 0x0001,
          outputReports: [{ reportId: 2, items: [{ reportSize: 8, reportCount: 32 }] }],
        },
        {
          usagePage: 0xff00,
          outputReports: [{ reportId: 7, items: [{ reportSize: 8, reportCount: 64 }] }],
        },
      ],
    } as Dx52HidDevice);
    expect(dx52ReportCandidates(summary, 'output').map((report) => report.reportId)).toEqual([
      7, 2,
    ]);
    const missing = summarizeDx52Descriptors({ collections: [] } as Dx52HidDevice);
    expect(dx52ReportCandidates(missing, 'output').map((report) => report.length)).toEqual([
      16, 64,
    ]);
    expect(dx52ReportCandidates(summary, 'feature')).toEqual([]);
  });

  it('按描述符长度补零或截断帧', () => {
    const frame = buildDx52Frame(DX52_COMMANDS.getSettings, 0, 0x10);
    expect(fitDx52Report(frame, 64)).toHaveLength(64);
    expect(Array.from(fitDx52Report(frame, 64)!.subarray(0, 16))).toEqual(Array.from(frame));
    expect(fitDx52Report(frame, 15)).toHaveLength(15);
    expect(fitDx52Report(frame, 14)).toBeNull();
  });

  it('同名接口中优先带 vendor 报告的 HID collection', () => {
    const bare = { productName: 'TOPPING DX5 II' } as Dx52HidDevice;
    const full = {
      productName: 'TOPPING DX5 II',
      collections: [
        {
          usagePage: 0xff00,
          outputReports: [{ reportId: 0, items: [{ reportSize: 8, reportCount: 64 }] }],
        },
      ],
    } as Dx52HidDevice;
    expect(dx52DeviceScore(full)).toBeGreaterThan(dx52DeviceScore(bare));
    expect(pickDx52Device([bare, full])).toBe(full);
  });
});
