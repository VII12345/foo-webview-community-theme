import { createStore } from 'jotai/vanilla';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { createConfigWriter } from '../../../src/host/configWrite.ts';
import {
  buildDx52Frame,
  DX52_COMMANDS,
  type Dx52HidDevice,
  type Dx52HidHost,
} from '../../../src/playback/dx52.ts';
import {
  DX52_AUTO_KEY,
  startDx52,
  type Dx52Service,
} from '../../../src/playback/dx52Prefs.ts';
import { createMemoryDataWriter } from '../../fixtures/dataWriter.ts';
import { installFakeHost } from '../../fixtures/unitHost.ts';

class FakeDevice extends EventTarget implements Dx52HidDevice {
  opened = false;
  productName = 'TOPPING DX5 II';
  readonly sent: Uint8Array[] = [];
  failOpen = false;
  async open(): Promise<void> {
    if (this.failOpen) throw new Error('busy');
    this.opened = true;
  }
  async close(): Promise<void> {
    this.opened = false;
  }
  async sendReport(_reportId: number, data: BufferSource): Promise<void> {
    this.sent.push(
      data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data as ArrayBuffer),
    );
  }
  emit(frame: Uint8Array): void {
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    this.dispatchEvent(Object.assign(new Event('inputreport'), { data: view }));
  }
}

class FakeHid extends EventTarget implements Dx52HidHost {
  readonly devices: FakeDevice[] = [];
  async getDevices(): Promise<readonly Dx52HidDevice[]> {
    return this.devices;
  }
  async requestDevice(): Promise<readonly Dx52HidDevice[]> {
    return this.devices;
  }
}

function settingsWords(): number[] {
  const words = new Array<number>(45).fill(0);
  words[0] = 1;
  const name = new TextEncoder().encode('DX5 II'.padEnd(32, '\0'));
  for (let index = 0; index < 8; index += 1)
    words[1 + index] =
      (name[index * 4] ?? 0) |
      ((name[index * 4 + 1] ?? 0) << 8) |
      ((name[index * 4 + 2] ?? 0) << 16) |
      ((name[index * 4 + 3] ?? 0) << 24);
  words[9] = 120;
  words[12] = 3;
  words[27] = 96000;
  words[32] = 0;
  return words;
}

function emitSnapshot(device: FakeDevice, words: readonly number[]): void {
  words.forEach((word, index) => {
    device.emit(buildDx52Frame(DX52_COMMANDS.getSettings, word, 0x11, words.length, index + 1));
  });
}

function setup(failOpen = false) {
  vi.useFakeTimers();
  onTestFinished(() => vi.useRealTimers());
  const host = installFakeHost();
  const store = createStore();
  const writer = createConfigWriter(host.fb, createMemoryDataWriter().writer);
  const hid = new FakeHid();
  const device = new FakeDevice();
  device.failOpen = failOpen;
  hid.devices.push(device);
  const service = startDx52(store, writer, { configHost: host.fb, hid, now: () => 123 });
  onTestFinished(() => service.dispose());
  return { host, store, hid, device, service };
}

async function enable(service: Dx52Service): Promise<void> {
  await service.ready;
  service.setEnabled(true);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(80);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('DX5 II 自动读取服务', () => {
  it('开关开启后请求设备、收集快照并接受推送', async () => {
    const { host, store, device, service } = setup();
    await enable(service);
    expect(host.config.get(DX52_AUTO_KEY)).toBe(true);
    expect(device.opened).toBe(true);
    expect(device.sent.map((frame) => (frame[5]! << 8) | frame[6]!)).toEqual([
      DX52_COMMANDS.connectState,
      DX52_COMMANDS.getSettings,
    ]);

    emitSnapshot(device, settingsWords());
    expect(store.get(service.status)).toEqual({ kind: 'connected' });
    expect(store.get(service.state)).toMatchObject({
      deviceName: 'DX5 II',
      volumeRaw: 120,
      volumeDb: -60,
      route: 'hp_single',
      highGain: false,
      sampleRate: 96000,
    });

    device.emit(buildDx52Frame(DX52_COMMANDS.volume, 20, 0x11));
    expect(store.get(service.state)?.volumeDb).toBe(-10);
    device.emit(buildDx52Frame(DX52_COMMANDS.headphoneGain, 1, 0x11));
    expect(store.get(service.state)?.highGain).toBe(true);

    service.setEnabled(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(host.config.get(DX52_AUTO_KEY)).toBe(false);
    expect(store.get(service.status)).toEqual({ kind: 'off' });
    expect(store.get(service.state)).toBeNull();
  });

  it('没有 WebHID 时标记 unsupported，不崩溃', async () => {
    const host = installFakeHost();
    const store = createStore();
    const writer = createConfigWriter(host.fb, createMemoryDataWriter().writer);
    const service = startDx52(store, writer, { configHost: host.fb, hid: null });
    onTestFinished(() => service.dispose());
    await service.ready;
    service.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get(service.status)).toEqual({ kind: 'unsupported' });
  });

  it('用户取消授权或设备打不开时给出对应状态', async () => {
    const empty = new FakeHid();
    const host = installFakeHost();
    const store = createStore();
    const writer = createConfigWriter(host.fb, createMemoryDataWriter().writer);
    const service = startDx52(store, writer, { configHost: host.fb, hid: empty });
    onTestFinished(() => service.dispose());
    await service.ready;
    service.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get(service.status)).toEqual({ kind: 'unauthorized' });
    service.dispose();

    const busy = setup(true);
    await enable(busy.service);
    expect(busy.store.get(busy.service.status)).toEqual({ kind: 'busy' });
  });

  it('设备断开后清空读数并进入等待，开关仍保持开启', async () => {
    const { host, store, hid, device, service } = setup();
    await enable(service);
    emitSnapshot(device, settingsWords());
    expect(store.get(service.state)).not.toBeNull();
    hid.dispatchEvent(new Event('disconnect'));
    expect(store.get(service.state)).toBeNull();
    expect(store.get(service.status)).toEqual({ kind: 'waiting' });
    expect(host.config.get(DX52_AUTO_KEY)).toBe(true);
  });

  it('快照迟到时仍能在截止前连上', async () => {
    const { store, device, service } = setup();
    await enable(service);
    await vi.advanceTimersByTimeAsync(1000);
    emitSnapshot(device, settingsWords());
    expect(store.get(service.status)).toEqual({ kind: 'connected' });
  });

  it('部分快照含关键字段时按部分快照连接，一个字段都没有则报错', async () => {
    const partial = setup();
    await enable(partial.service);
    const words = settingsWords();
    for (const index of [0, 9, 11, 12, 13]) {
      partial.device.emit(
        buildDx52Frame(DX52_COMMANDS.getSettings, words[index]!, 0x11, words.length, index + 1),
      );
    }
    await vi.advanceTimersByTimeAsync(6000);
    expect(partial.store.get(partial.service.status)).toEqual({ kind: 'connected' });
    expect(partial.store.get(partial.service.state)).toMatchObject({
      powered: true,
      volumeDb: -60,
      route: 'hp_single',
    });

    const empty = setup();
    await enable(empty.service);
    await vi.advanceTimersByTimeAsync(6000);
    expect(empty.store.get(empty.service.status)).toEqual({ kind: 'error' });
    expect(empty.store.get(empty.service.failure)).toBe('error');
  });

  it('读取失败后重试重新请求快照，不弹设备选择器', async () => {
    const { store, device, service } = setup();
    await enable(service);
    await vi.advanceTimersByTimeAsync(6000);
    expect(store.get(service.status)).toEqual({ kind: 'error' });
    const requested = vi.spyOn(device, 'sendReport');
    const before = requested.mock.calls.length;
    service.retry();
    await vi.advanceTimersByTimeAsync(80);
    expect(requested.mock.calls.length).toBeGreaterThan(before);
    expect(store.get(service.status)).toEqual({ kind: 'connecting' });
  });

  it('失败提醒可关闭，重试后再次失败会重新出现', async () => {
    const { store, service } = setup();
    await enable(service);
    await vi.advanceTimersByTimeAsync(6000);
    expect(store.get(service.failure)).toBe('error');
    service.dismissFailure();
    expect(store.get(service.failure)).toBeNull();
    service.retry();
    await vi.advanceTimersByTimeAsync(6000);
    expect(store.get(service.failure)).toBe('error');
  });

  it('hid connect 事件在断开后自动重连', async () => {
    const { store, hid, device, service } = setup();
    await enable(service);
    emitSnapshot(device, settingsWords());
    hid.dispatchEvent(new Event('disconnect'));
    expect(store.get(service.status)).toEqual({ kind: 'waiting' });
    hid.dispatchEvent(Object.assign(new Event('connect'), { device }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(80);
    emitSnapshot(device, settingsWords());
    expect(store.get(service.status)).toEqual({ kind: 'connected' });
  });

  it('已开启但找不到已授权设备时进入等待而不是未授权', async () => {
    const host = installFakeHost();
    host.config.set(DX52_AUTO_KEY, true);
    const store = createStore();
    const writer = createConfigWriter(host.fb, createMemoryDataWriter().writer);
    const hid = new FakeHid();
    const service = startDx52(store, writer, { configHost: host.fb, hid });
    onTestFinished(() => service.dispose());
    await service.ready;
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get(service.status)).toEqual({ kind: 'waiting' });
  });

  it('已授权时启动只走 getDevices，不弹选择器', async () => {
    const host = installFakeHost();
    host.config.set(DX52_AUTO_KEY, true);
    const store = createStore();
    const writer = createConfigWriter(host.fb, createMemoryDataWriter().writer);
    const hid = new FakeHid();
    const device = new FakeDevice();
    hid.devices.push(device);
    const requested = vi.spyOn(hid, 'requestDevice');
    const service = startDx52(store, writer, { configHost: host.fb, hid });
    onTestFinished(() => service.dispose());
    await vi.advanceTimersByTimeAsync(0);
    await service.ready;
    await vi.advanceTimersByTimeAsync(80);
    expect(requested).not.toHaveBeenCalled();
    expect(device.opened).toBe(true);
  });
});
