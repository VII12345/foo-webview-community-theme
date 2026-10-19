/**
 * TOPPING DX5 II 的 HID 协议与声压模型映射。只读：只发连接、设置快照与心跳，不写设备设置。
 *
 * 协议来自 `TOPPING Home` 的 DX5II-HID 说明与官方前端常量：VID 0x152A、PID 0x8750，
 * 16 字节帧 `22 33 proto total cur cmdH cmdL D3 D2 D1 D0 crcH crcL 66 77 00`，
 * CRC-16/ARC 覆盖 proto..D0。WebHID 的 `inputreport` 可能带/不带 Report ID，解析两种布局。
 * 字段索引尚未在真机上逐项确认；设置页的 HID 诊断面板会保留原始帧，便于按实际设备修正。
 */

import type { AmpProfile } from './soundPressure.ts';

export const DX52_VENDOR_ID = 0x152a;
export const DX52_PRODUCT_ID = 0x8750;

export const DX52_COMMANDS = {
  power: 0x7101,
  volume: 0x7102,
  mute: 0x7103,
  input: 0x7104,
  output: 0x7105,
  getSettings: 0x710c,
  headphoneGain: 0x7117,
  volumeStep: 0x711e,
  connectState: 0x1101,
  sampleRate: 0x1107,
  heartbeat: 0x7134,
} as const;

/** 设备主动推送的单值命令；连接期间其余多帧应答都可当作设置快照。 */
export const DX52_PUSH_COMMANDS: ReadonlySet<number> = new Set([
  DX52_COMMANDS.power,
  DX52_COMMANDS.volume,
  DX52_COMMANDS.mute,
  DX52_COMMANDS.input,
  DX52_COMMANDS.output,
  DX52_COMMANDS.headphoneGain,
  DX52_COMMANDS.volumeStep,
  DX52_COMMANDS.sampleRate,
]);

export function isDx52PushCommand(cmd: number): boolean {
  return DX52_PUSH_COMMANDS.has(cmd);
}

/** 设置快照的字段数；来自 TOPPING Home 的前端常量，尚未在真机上逐字段确认。 */
export const DX52_SNAPSHOT_WORDS = 45;

export type Dx52Input = 'usb' | 'optical' | 'coaxial' | 'bluetooth' | 'unknown';
export type Dx52Route =
  | 'all'
  | 'hp_all'
  | 'line_all'
  | 'hp_single'
  | 'hp_balanced'
  | 'line_single'
  | 'line_balanced'
  | 'unknown';

export interface Dx52State {
  readonly connected: boolean;
  readonly powered: boolean;
  readonly deviceName: string;
  readonly volumeRaw: number;
  readonly volumeStepDb: 0.5 | 1;
  /** 设备音量，<= 0 dB；与 foobar 音量独立，两者都计入。 */
  readonly volumeDb: number;
  readonly muted: boolean;
  readonly input: Dx52Input;
  readonly route: Dx52Route;
  readonly highGain: boolean;
  readonly sampleRate: number | null;
  readonly lineMode: 'preamp' | 'dac' | 'unknown';
  readonly balanceDb: number;
  readonly updatedAtMs: number;
  /** 只收到部分关键字段；其余字段按 0 填充，展示与自动读数都要提示“读取不完整”。 */
  readonly partial: boolean;
}

export interface Dx52Frame {
  readonly proto: number;
  readonly total: number;
  readonly cur: number;
  readonly cmd: number;
  readonly data: number;
}

const INPUTS: readonly Dx52Input[] = ['usb', 'optical', 'coaxial', 'bluetooth'];
/** 真机快照里 USB 输入值是 6，不是数组下标 0。 */
function inputOf(value: number): Dx52Input {
  return value === 6 ? 'usb' : INPUTS[value] ?? 'unknown';
}

/** 真机：0 是线路输出，4 是 4.4mm 平衡耳机；3 仍是 6.35mm 单端。 */
const ROUTES: readonly Dx52Route[] = [
  'line_all',
  'hp_all',
  'all',
  'hp_single',
  'hp_balanced',
  'line_single',
  'line_balanced',
];

export function crc16(bytes: ArrayLike<number>): number {
  let value = 0xffff;
  for (let index = 0; index < bytes.length; index += 1) {
    value ^= bytes[index] ?? 0;
    for (let bit = 0; bit < 8; bit += 1)
      value = value & 1 ? (value >> 1) ^ 0xa001 : value >> 1;
  }
  return value & 0xffff;
}

export function buildDx52Frame(
  cmd: number,
  data = 0,
  proto = 0x10,
  total = 1,
  cur = 1,
): Uint8Array<ArrayBuffer> {
  const frame = new Uint8Array(16);
  frame[0] = 0x22;
  frame[1] = 0x33;
  frame[2] = proto;
  frame[3] = total;
  frame[4] = cur;
  frame[5] = (cmd >> 8) & 0xff;
  frame[6] = cmd & 0xff;
  frame[7] = (data >>> 24) & 0xff;
  frame[8] = (data >>> 16) & 0xff;
  frame[9] = (data >>> 8) & 0xff;
  frame[10] = data & 0xff;
  const crc = crc16(frame.subarray(2, 11));
  frame[11] = crc >> 8;
  frame[12] = crc & 0xff;
  frame[13] = 0x66;
  frame[14] = 0x77;
  return frame;
}

/** 解析 15/16 字节的输入报告；带 Report ID 时自动跳过首字节。 */
export function parseDx52Frame(data: Uint8Array): Dx52Frame | null {
  const offset = data[0] === 0x22 && data[1] === 0x33 ? 0 : data[1] === 0x22 ? 1 : -1;
  if (offset < 0 || data.length < offset + 15) return null;
  if (data[offset] !== 0x22 || data[offset + 1] !== 0x33) return null;
  if (data[offset + 13] !== 0x66 || data[offset + 14] !== 0x77) return null;
  if (crc16(data.subarray(offset + 2, offset + 11)) !== ((data[offset + 11]! << 8) | data[offset + 12]!))
    return null;
  return {
    proto: data[offset + 2] ?? 0,
    total: data[offset + 3] ?? 1,
    cur: data[offset + 4] ?? 1,
    cmd: ((data[offset + 5] ?? 0) << 8) | (data[offset + 6] ?? 0),
    data:
      (((data[offset + 7] ?? 0) << 24) |
        ((data[offset + 8] ?? 0) << 16) |
        ((data[offset + 9] ?? 0) << 8) |
        (data[offset + 10] ?? 0)) >>>
      0,
  };
}

function deviceNameOf(words: readonly number[]): string {
  const bytes: number[] = [];
  for (let index = 1; index <= 8; index += 1) {
    const word = words[index] ?? 0;
    bytes.push(word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff);
  }
  const text = new TextDecoder()
    .decode(new Uint8Array(bytes))
    .replace(/\0.*$/s, '')
    .trim();
  return text;
}

/** 用 `0x710C` 的多帧快照生成状态；字段不全时用安全默认。 */
export interface Dx52SnapshotOptions {
  readonly partial?: boolean;
}

export function readDx52Settings(
  words: readonly number[],
  now: number,
  snapshot: Dx52SnapshotOptions = {},
): Dx52State {
  const volumeStepDb: 0.5 | 1 = (words[32] ?? 0) === 1 ? 1 : 0.5;
  const volumeRaw = words[9] ?? 0;
  const balance = words[17] ?? 0;
  const rawRate = words[27] ?? 0;
  return {
    connected: true,
    powered: (words[0] ?? 0) === 1,
    deviceName: deviceNameOf(words),
    volumeRaw,
    volumeStepDb,
    volumeDb: Math.max(-99, Math.min(0, -(volumeRaw * volumeStepDb))),
    muted: (words[10] ?? 0) === 1,
    input: inputOf(words[11] ?? 0),
    route: ROUTES[words[12] ?? 0] ?? 'unknown',
    highGain: (words[13] ?? 0) === 1,
    // 真机快照的 word27 不是采样率（常见值是 1）；只有像采样率的值才采用，实际以 0x1107 推送为准。
    sampleRate: rawRate >= 8000 ? rawRate : null,
    lineMode: (words[19] ?? -1) === 0 ? 'preamp' : (words[19] ?? -1) === 1 ? 'dac' : 'unknown',
    balanceDb: (balance > 0x7fffffff ? balance - 0x100000000 : balance) / 10,
    updatedAtMs: now,
    partial: snapshot.partial === true,
  };
}

/** 设备主动推送的单值帧；不认识的命令返回 null。 */
export function applyDx52Push(state: Dx52State, frame: Dx52Frame, now: number): Dx52State | null {
  switch (frame.cmd) {
    case DX52_COMMANDS.power:
      return { ...state, powered: frame.data === 1, updatedAtMs: now };
    case DX52_COMMANDS.volume: {
      const volumeRaw = frame.data;
      return {
        ...state,
        volumeRaw,
        volumeDb: Math.max(-99, Math.min(0, -(volumeRaw * state.volumeStepDb))),
        updatedAtMs: now,
      };
    }
    case DX52_COMMANDS.mute:
      return { ...state, muted: frame.data === 1, updatedAtMs: now };
    case DX52_COMMANDS.input:
      return { ...state, input: inputOf(frame.data), updatedAtMs: now };
    case DX52_COMMANDS.output:
      return { ...state, route: ROUTES[frame.data] ?? 'unknown', updatedAtMs: now };
    case DX52_COMMANDS.sampleRate:
      return {
        ...state,
        sampleRate: frame.data > 0 ? frame.data : null,
        updatedAtMs: now,
      };
    case DX52_COMMANDS.headphoneGain:
      return { ...state, highGain: frame.data === 1, updatedAtMs: now };
    case DX52_COMMANDS.volumeStep: {
      const volumeStepDb: 0.5 | 1 = frame.data === 1 ? 1 : 0.5;
      return {
        ...state,
        volumeStepDb,
        volumeDb: Math.max(-99, Math.min(0, -(state.volumeRaw * volumeStepDb))),
        updatedAtMs: now,
      };
    }
    default:
      return null;
  }
}

export interface Dx52OutputInfo {
  readonly headphone: boolean;
  readonly balanced: boolean;
  readonly label: string;
  /** 该接口在高/低增益下的标称电压增益，dB（展示用；V0 用输出幅值表）。 */
  readonly gainDb: { readonly low: number; readonly high: number };
}

export type Dx52Jack = 'auto' | 'single' | 'balanced';

export function dx52OutputInfo(route: Dx52Route, jack: Dx52Jack = 'auto'): Dx52OutputInfo {
  if (route === 'hp_balanced') {
    return {
      headphone: true,
      balanced: true,
      label: '4.4mm XLR',
      gainDb: { low: 14.6, high: 24.7 },
    };
  }
  if (route === 'hp_single') {
    return {
      headphone: true,
      balanced: false,
      label: '6.35mm',
      gainDb: { low: 8.6, high: 18.7 },
    };
  }
  if (route === 'all' || route === 'hp_all') {
    const balanced = jack === 'balanced';
    return {
      headphone: true,
      balanced,
      label: jack === 'auto' ? 'HP (SE)' : balanced ? '4.4mm XLR' : '6.35mm',
      gainDb: balanced ? { low: 14.6, high: 24.7 } : { low: 8.6, high: 18.7 },
    };
  }
  if (route === 'line_all' || route === 'line_single' || route === 'line_balanced') {
    return {
      headphone: false,
      balanced: route === 'line_balanced',
      label: 'Line',
      gainDb: { low: 0, high: 0 },
    };
  }
  return { headphone: false, balanced: false, label: '—', gainDb: { low: 0, high: 0 } };
}

/** 6.35mm 与 4.4mm/XLR 在 0 dBFS、设备音量 0 dB 时的输出幅值（Vpp，USB 96 kHz）。 */
export function dx52OutputVpp(balanced: boolean, highGain: boolean): number {
  if (balanced) return highGain ? 48.0 : 15.0;
  return highGain ? 24.2 : 7.2;
}

export function dx52AmpProfile(
  state: Dx52State,
  jack: Dx52Jack = 'auto',
): { readonly amp: AmpProfile; readonly output: Dx52OutputInfo } | null {
  const output = dx52OutputInfo(state.route, jack);
  if (!output.headphone) return null;
  const vpp = dx52OutputVpp(output.balanced, state.highGain);
  return {
    output,
    amp: {
      id: 'dx52-auto',
      name: `TOPPING DX5 II · ${output.label} · ${state.highGain ? 'High' : 'Low'}`,
      vrmsAt0db: vpp / (2 * Math.SQRT2),
      gainDb: state.volumeDb,
    },
  };
}

export function isDx52ProductName(name: string): boolean {
  const normalized = name
    .normalize('NFKC')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
  return normalized.includes('DX5II') || normalized.includes('DX52') || normalized.includes('DX5');
}

// ---------------------------------------------------------------------------
// WebHID 的最小类型。TypeScript 的 DOM lib 没有 `navigator.hid`。

export interface Dx52HidReportItem {
  readonly reportSize?: number;
  readonly reportCount?: number;
}

export interface Dx52HidReportInfo {
  readonly reportId?: number;
  readonly items?: readonly Dx52HidReportItem[];
}

export interface Dx52HidCollectionInfo {
  readonly usagePage?: number;
  readonly usage?: number;
  readonly inputReports?: readonly Dx52HidReportInfo[];
  readonly outputReports?: readonly Dx52HidReportInfo[];
  readonly featureReports?: readonly Dx52HidReportInfo[];
  readonly children?: readonly Dx52HidCollectionInfo[];
}

export interface Dx52HidDevice extends EventTarget {
  readonly opened: boolean;
  readonly productName: string;
  readonly collections?: readonly Dx52HidCollectionInfo[];
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  sendFeatureReport?(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport?(reportId: number): Promise<DataView>;
}

export interface Dx52HidHost extends EventTarget {
  getDevices(): Promise<readonly Dx52HidDevice[]>;
  requestDevice(options: {
    filters: readonly { vendorId: number; productId: number }[];
  }): Promise<readonly Dx52HidDevice[]>;
}

export interface Dx52InputReportEvent extends Event {
  readonly data: DataView;
  readonly reportId?: number;
}

export interface Dx52DisconnectEvent extends Event {
  readonly device: Dx52HidDevice;
}

export interface Dx52ConnectEvent extends Event {
  readonly device: Dx52HidDevice;
}

export type Dx52ReportKind = 'input' | 'output' | 'feature';

export interface Dx52ReportDescriptor {
  readonly kind: Dx52ReportKind;
  readonly reportId: number;
  /** 描述符声明的字节数；发送前按它补零或截断。 */
  readonly length: number;
  readonly usagePage: number;
}

export interface Dx52DescriptorSummary {
  readonly available: boolean;
  readonly collectionCount: number;
  readonly inputs: readonly Dx52ReportDescriptor[];
  readonly outputs: readonly Dx52ReportDescriptor[];
  readonly features: readonly Dx52ReportDescriptor[];
}

/** HID report 的字节数 = 所有 item 的 reportSize × reportCount 之和，向上取整。 */
export function reportByteLength(report: Dx52HidReportInfo): number {
  const bits = (report.items ?? []).reduce(
    (total, item) =>
      total + Math.max(0, item.reportSize ?? 0) * Math.max(0, item.reportCount ?? 0),
    0,
  );
  return Math.ceil(bits / 8);
}

function reportPriority(report: Dx52ReportDescriptor): [number, number, number] {
  return [report.usagePage >= 0xff00 ? 0 : 1, report.reportId === 0 ? 0 : 1, report.reportId];
}

function sortReports(reports: readonly Dx52ReportDescriptor[]): Dx52ReportDescriptor[] {
  return [...reports].sort((left, right) => {
    const a = reportPriority(left);
    const b = reportPriority(right);
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  });
}

/** 递归读出 collections 里的 input/output/feature report；同 ID 取最长的那份。 */
export function summarizeDx52Descriptors(
  device: Pick<Dx52HidDevice, 'collections'>,
): Dx52DescriptorSummary {
  const collections = device.collections ?? [];
  const found = new Map<string, Dx52ReportDescriptor>();
  let collectionCount = 0;
  const visit = (items: readonly Dx52HidCollectionInfo[], inheritedUsagePage: number): void => {
    for (const collection of items) {
      collectionCount += 1;
      const usagePage = collection.usagePage ?? inheritedUsagePage;
      const add = (kind: Dx52ReportKind, report: Dx52HidReportInfo): void => {
        const length = reportByteLength(report);
        if (length <= 0) return;
        const reportId = report.reportId ?? 0;
        const key = `${kind}:${reportId}`;
        const previous = found.get(key);
        if (
          !previous ||
          length > previous.length ||
          (usagePage >= 0xff00 && previous.usagePage < 0xff00)
        ) {
          found.set(key, { kind, reportId, length, usagePage });
        }
      };
      for (const report of collection.inputReports ?? []) add('input', report);
      for (const report of collection.outputReports ?? []) add('output', report);
      for (const report of collection.featureReports ?? []) add('feature', report);
      if (collection.children?.length) visit(collection.children, usagePage);
    }
  };
  visit(collections, 0);
  const all = [...found.values()];
  return {
    available: collections.length > 0,
    collectionCount,
    inputs: sortReports(all.filter((report) => report.kind === 'input')),
    outputs: sortReports(all.filter((report) => report.kind === 'output')),
    features: sortReports(all.filter((report) => report.kind === 'feature')),
  };
}

/**
 * 发送候选：描述符可用时只试它声明的报告；描述符缺失时退回 16/64 字节的 report ID 0。
 * 长度小于 15 的报告塞不下整帧，直接跳过。
 */
export function dx52ReportCandidates(
  summary: Dx52DescriptorSummary,
  kind: 'output' | 'feature',
): readonly Dx52ReportDescriptor[] {
  const declared = (kind === 'output' ? summary.outputs : summary.features).filter(
    (report) => report.length >= 15,
  );
  if (declared.length > 0) return declared;
  if (summary.available) return [];
  return [
    { kind, reportId: 0, length: 16, usagePage: 0 },
    { kind, reportId: 0, length: 64, usagePage: 0 },
  ];
}

/** 按描述符长度补零或截断；小于 15 字节的 report 放不下整帧。 */
export function fitDx52Report(
  frame: Uint8Array<ArrayBuffer>,
  length: number,
): Uint8Array<ArrayBuffer> | null {
  if (!Number.isFinite(length) || length < 15) return null;
  if (length === frame.length) return frame;
  if (length < frame.length) return frame.slice(0, length);
  const padded = new Uint8Array(length);
  padded.set(frame);
  return padded;
}

/** 同名 HID 接口可能有多个；优先带 vendor output/feature 报告的那个。 */
export function dx52DeviceScore(device: Dx52HidDevice): number {
  const summary = summarizeDx52Descriptors(device);
  const vendor = (reports: readonly Dx52ReportDescriptor[]): boolean =>
    reports.some((report) => report.usagePage >= 0xff00);
  let score = 0;
  if (summary.outputs.length > 0) score += 8;
  if (summary.features.length > 0) score += 4;
  if (vendor(summary.outputs) || vendor(summary.features)) score += 4;
  if (
    summary.outputs.some((report) => report.length >= 16) ||
    summary.features.some((report) => report.length >= 16)
  )
    score += 2;
  return score;
}

export function pickDx52Device(
  devices: readonly Dx52HidDevice[],
): Dx52HidDevice | undefined {
  return devices
    .filter((device) => isDx52ProductName(device.productName))
    .sort((left, right) => dx52DeviceScore(right) - dx52DeviceScore(left))[0];
}

export function navigatorHid(): Dx52HidHost | null {
  if (typeof navigator === 'undefined') return null;
  const hid = (navigator as Navigator & { hid?: Dx52HidHost }).hid;
  return hid ?? null;
}
