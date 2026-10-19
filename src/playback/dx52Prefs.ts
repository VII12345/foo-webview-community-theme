import { atom, type Atom } from 'jotai/vanilla';
import {
  defineConfigPref,
  startConfigPrefs,
  type ConfigPersistence,
  type ConfigPrefFace,
} from '../host/configPref.ts';
import type { ConfigWriter } from '../host/configWrite.ts';
import { settle } from '../host/hostCall.ts';
import { serviceKey } from '../kit/serviceKey.ts';
import type { Store } from '../kit/store.ts';
import {
  applyDx52Push,
  buildDx52Frame,
  DX52_COMMANDS,
  DX52_PRODUCT_ID,
  DX52_VENDOR_ID,
  isDx52ProductName,
  isDx52PushCommand,
  navigatorHid,
  parseDx52Frame,
  readDx52Settings,
  type Dx52ConnectEvent,
  type Dx52DisconnectEvent,
  type Dx52HidDevice,
  type Dx52HidHost,
  type Dx52InputReportEvent,
  type Dx52Jack,
  type Dx52State,
} from './dx52.ts';

export const DX52_AUTO_KEY = 'defaultTheme.playback.dx52Auto';
export const DX52_JACK_KEY = 'defaultTheme.playback.dx52Jack';

const AUTO_PREF = defineConfigPref<boolean>(
  DX52_AUTO_KEY,
  false,
  (value) => (typeof value === 'boolean' ? value : undefined),
);
const JACK_PREF = defineConfigPref<Dx52Jack>(
  DX52_JACK_KEY,
  'auto',
  (value) => (value === 'auto' || value === 'single' || value === 'balanced' ? value : undefined),
);

export type Dx52Status =
  | { readonly kind: 'off' }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'connecting' }
  | { readonly kind: 'connected' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'error' };

export type Dx52Failure = 'error' | 'busy';

/** 模块级 atom：声压读数、设置页和设备浮层共用同一份状态。 */
export const dx52StatusAtom = atom<Dx52Status>({ kind: 'off' });
export const dx52StateAtom = atom<Dx52State | null>(null);
export const dx52EnabledAtom: Atom<boolean> = AUTO_PREF.atom;
export const dx52JackAtom: Atom<Dx52Jack> = JACK_PREF.atom;

/** 本次失败提醒是否已被用户关掉；重试/重新授权/连上后清零。 */
const failureDismissedAtom = atom(false);

/**
 * 自动读取开启且读取失败时要弹的提醒。`error` 是快照超时，`busy` 是设备打不开；
 * 未授权与等待设备不在弹窗范围，设置页里仍有状态与操作。
 */
export const dx52FailureNoticeAtom: Atom<Dx52Failure | null> = atom((get) => {
  if (!get(AUTO_PREF.atom) || get(failureDismissedAtom)) return null;
  const kind = get(dx52StatusAtom).kind;
  return kind === 'error' || kind === 'busy' ? kind : null;
});

export interface Dx52Service {
  readonly ready: Promise<void>;
  readonly persistence: ConfigPersistence;
  readonly enabled: Atom<boolean>;
  readonly jack: Atom<Dx52Jack>;
  readonly status: Atom<Dx52Status>;
  readonly state: Atom<Dx52State | null>;
  readonly failure: Atom<Dx52Failure | null>;
  /** 开关点击：先尝试弹设备选择（用户手势），再持久化。 */
  setEnabled(on: boolean): void;
  setJack(jack: Dx52Jack): void;
  /** 重新授权（按钮点击，用户手势）。 */
  authorize(): void;
  /** 重新读取快照；设备没打开时重新找已授权设备。 */
  retry(): void;
  /** 关掉本次失败提醒；状态本身不变。 */
  dismissFailure(): void;
  dispose(): void;
}

export const dx52Key = serviceKey<Dx52Service>('dx52');

const FILTERS = [{ vendorId: DX52_VENDOR_ID, productId: DX52_PRODUCT_ID }] as const;
const SNAPSHOT_INITIAL_DELAY_MS = 80;
/** 快照重发时刻（相对首次请求的毫秒数）；总截止时间比最后一次重发晚 2 秒。 */
const SNAPSHOT_RETRY_MS = [400, 900, 1600, 2500, 4000] as const;
const SNAPSHOT_DEADLINE_MS = 6000;
const WAITING_RETRY_MS = 10_000;
const HEARTBEAT_MS = 5000;
/** 部分快照能安全使用至少需要这些字：电源、音量原始值、输入、输出路由、耳机增益。 */
const CRITICAL_WORDS = [0, 9, 11, 12, 13] as const;

export function startDx52(
  store: Store,
  writer?: Pick<ConfigWriter, 'set'>,
  options: {
    readonly configHost?: ConfigPrefFace;
    /** `null` 表示测试里显式没有 WebHID；`undefined` 时现读 navigator.hid。 */
    readonly hid?: Dx52HidHost | null;
    readonly now?: () => number;
  } = {},
): Dx52Service {
  const prefs = startConfigPrefs(store, [AUTO_PREF, JACK_PREF], options.configHost, writer);
  const hid = options.hid === undefined ? navigatorHid() : options.hid;
  const now = options.now ?? Date.now;
  const statusAtom = dx52StatusAtom;
  const stateAtom = dx52StateAtom;
  store.set(statusAtom, { kind: 'off' });
  store.set(stateAtom, null);
  store.set(failureDismissedAtom, false);
  let device: Dx52HidDevice | null = null;
  let disposed = false;
  let connecting = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let waitingTimer: ReturnType<typeof setInterval> | null = null;
  let snapshotTimers: ReturnType<typeof setTimeout>[] = [];
  let frameWords = new Map<number, number>();
  let frameTotal = 0;
  let frameBase = 1;
  let snapshotActive = false;

  const setStatus = (next: Dx52Status) => store.set(statusAtom, next);
  const setState = (next: Dx52State | null) => store.set(stateAtom, next);
  const clearFailureDismissed = () => store.set(failureDismissedAtom, false);

  function clearSnapshotTimers(): void {
    for (const timer of snapshotTimers) clearTimeout(timer);
    snapshotTimers = [];
  }
  function resetFrames(): void {
    frameWords = new Map();
    frameTotal = 0;
    frameBase = 1;
    snapshotActive = false;
  }
  function stopWaitingRetry(): void {
    if (waitingTimer) clearInterval(waitingTimer);
    waitingTimer = null;
  }
  function startWaitingRetry(): void {
    if (waitingTimer || disposed) return;
    waitingTimer = setInterval(() => {
      if (disposed || connecting || device || !store.get(AUTO_PREF.atom)) return;
      void connect(false);
    }, WAITING_RETRY_MS);
  }
  function stopTimers(): void {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    clearSnapshotTimers();
    stopWaitingRetry();
  }
  function send(cmd: number, data = 0, proto = 0x10): void {
    const current = device;
    if (!current?.opened) return;
    void settle(() => current.sendReport(0, buildDx52Frame(cmd, data, proto)));
  }
  function startHeartbeat(): void {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = setInterval(() => send(DX52_COMMANDS.heartbeat, 1, 0x20), HEARTBEAT_MS);
  }
  function snapshotWords(): number[] {
    let size = 45;
    if (frameTotal > size) size = frameTotal;
    for (const index of frameWords.keys()) if (index + 1 > size) size = index + 1;
    const words = new Array<number>(size).fill(0);
    for (const [index, value] of frameWords) words[index] = value;
    return words;
  }
  function acceptSnapshot(): void {
    snapshotActive = false;
    clearSnapshotTimers();
    setState(readDx52Settings(snapshotWords(), now()));
    setStatus({ kind: 'connected' });
    clearFailureDismissed();
    startHeartbeat();
    stopWaitingRetry();
    resetFrames();
  }
  function completeSnapshot(): void {
    if (!snapshotActive || frameTotal <= 0) return;
    acceptSnapshot();
  }
  function finishSnapshot(): void {
    if (!snapshotActive) return;
    if (CRITICAL_WORDS.every((index) => frameWords.has(index))) {
      acceptSnapshot();
      return;
    }
    snapshotActive = false;
    clearSnapshotTimers();
    console.warn('[DX5 II] settings snapshot incomplete', {
      received: frameWords.size,
      total: frameTotal,
    });
    setStatus({ kind: 'error' });
    resetFrames();
  }
  function requestSnapshot(): void {
    if (!device?.opened) return;
    clearSnapshotTimers();
    resetFrames();
    snapshotActive = true;
    clearFailureDismissed();
    setStatus({ kind: 'connecting' });
    send(DX52_COMMANDS.connectState, 2, 0x20);
    const ask = () => send(DX52_COMMANDS.getSettings, 0, 0x10);
    snapshotTimers.push(setTimeout(ask, SNAPSHOT_INITIAL_DELAY_MS));
    for (const delay of SNAPSHOT_RETRY_MS) snapshotTimers.push(setTimeout(ask, delay));
    snapshotTimers.push(setTimeout(finishSnapshot, SNAPSHOT_DEADLINE_MS));
  }
  function onReport(event: Event): void {
    const report = event as Dx52InputReportEvent;
    const bytes = new Uint8Array(report.data.buffer, report.data.byteOffset, report.data.byteLength);
    const frame = parseDx52Frame(bytes);
    if (!frame) return;
    if (
      snapshotActive &&
      (frame.cmd === DX52_COMMANDS.getSettings ||
        (frame.total > 1 && !isDx52PushCommand(frame.cmd)))
    ) {
      if (frame.total <= 0) return;
      // 设备重发快照时从第一帧重新开始；别把上一轮的半份与这一轮混在一起。
      if (!frameTotal || frame.total !== frameTotal || (frameWords.size > 0 && frame.cur === frameBase)) {
        frameWords = new Map();
        frameTotal = frame.total;
        frameBase = frame.cur === 1 ? 1 : 0;
      }
      const index = frame.cur - frameBase;
      if (index < 0 || index >= frameTotal) return;
      frameWords.set(index, frame.data);
      if (frameWords.size >= frameTotal) completeSnapshot();
      return;
    }
    const current = store.get(stateAtom);
    if (!current) return;
    const next = applyDx52Push(current, frame, now());
    if (next) {
      setState(next);
      return;
    }
    // 任何有效报告都证明设备还在；心跳回帧不一定带状态变化，但统计要据此判断读数不过期。
    const stamp = now();
    if (stamp - current.updatedAtMs >= 1000) setState({ ...current, updatedAtMs: stamp });
  }
  function onDisconnect(event: Event): void {
    const target = (event as Partial<Dx52DisconnectEvent>).device;
    if (target && device && target !== device) return;
    if (!device) return;
    stopTimers();
    device.removeEventListener('inputreport', onReport);
    device = null;
    resetFrames();
    setState(null);
    setStatus({ kind: 'waiting' });
    if (store.get(AUTO_PREF.atom)) startWaitingRetry();
  }
  function onConnect(event: Event): void {
    if (disposed || connecting || device || !store.get(AUTO_PREF.atom)) return;
    const target = (event as Partial<Dx52ConnectEvent>).device;
    if (target && !isDx52ProductName(target.productName)) return;
    void connect(false);
  }
  async function close(): Promise<void> {
    const current = device;
    device = null;
    stopTimers();
    resetFrames();
    current?.removeEventListener('inputreport', onReport);
    if (current?.opened) await settle(() => current.close());
    setState(null);
  }
  async function open(found: Dx52HidDevice): Promise<void> {
    try {
      if (!found.opened) await found.open();
    } catch {
      setStatus({ kind: 'busy' });
      return;
    }
    if (disposed) {
      await settle(() => found.close());
      return;
    }
    device = found;
    stopWaitingRetry();
    found.addEventListener('inputreport', onReport);
    requestSnapshot();
  }
  async function connect(request: boolean): Promise<void> {
    if (disposed || connecting) return;
    if (!hid) {
      setStatus({ kind: 'unsupported' });
      return;
    }
    connecting = true;
    try {
      let picked: readonly Dx52HidDevice[] = [];
      try {
        picked = request
          ? await hid.requestDevice({ filters: FILTERS })
          : await hid.getDevices();
      } catch {
        setStatus({ kind: 'unauthorized' });
        return;
      }
      const found = picked.find((candidate) => isDx52ProductName(candidate.productName));
      if (!found) {
        if (request) {
          setStatus({ kind: 'unauthorized' });
        } else {
          setStatus({ kind: 'waiting' });
          if (store.get(AUTO_PREF.atom)) startWaitingRetry();
        }
        return;
      }
      await close();
      if (!disposed) await open(found);
    } finally {
      connecting = false;
    }
  }

  hid?.addEventListener('disconnect', onDisconnect);
  hid?.addEventListener('connect', onConnect);
  void prefs.ready.then(() => {
    if (!disposed && store.get(AUTO_PREF.atom)) void connect(false);
  });

  return {
    ready: prefs.ready,
    persistence: prefs,
    enabled: AUTO_PREF.atom,
    jack: JACK_PREF.atom,
    status: statusAtom,
    state: stateAtom,
    failure: dx52FailureNoticeAtom,
    setEnabled(on) {
      clearFailureDismissed();
      if (on) void connect(true);
      else {
        stopWaitingRetry();
        void close().then(() => {
          if (!disposed) setStatus({ kind: 'off' });
        });
      }
      void prefs.set(AUTO_PREF, on);
    },
    setJack(jack) {
      void prefs.set(JACK_PREF, jack);
    },
    authorize() {
      clearFailureDismissed();
      void connect(true);
    },
    retry() {
      clearFailureDismissed();
      if (device?.opened) requestSnapshot();
      else void connect(false);
    },
    dismissFailure() {
      store.set(failureDismissedAtom, true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hid?.removeEventListener('disconnect', onDisconnect);
      hid?.removeEventListener('connect', onConnect);
      stopTimers();
      void close();
      prefs.dispose();
    },
  };
}
