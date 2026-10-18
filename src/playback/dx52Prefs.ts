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
  navigatorHid,
  parseDx52Frame,
  readDx52Settings,
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
  | { readonly kind: 'connecting' }
  | { readonly kind: 'connected' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'error' };

/** 模块级 atom：声压读数、设置页和设备浮层共用同一份状态。 */
export const dx52StatusAtom = atom<Dx52Status>({ kind: 'off' });
export const dx52StateAtom = atom<Dx52State | null>(null);
export const dx52EnabledAtom: Atom<boolean> = AUTO_PREF.atom;
export const dx52JackAtom: Atom<Dx52Jack> = JACK_PREF.atom;

export interface Dx52Service {
  readonly ready: Promise<void>;
  readonly persistence: ConfigPersistence;
  readonly enabled: Atom<boolean>;
  readonly jack: Atom<Dx52Jack>;
  readonly status: Atom<Dx52Status>;
  readonly state: Atom<Dx52State | null>;
  /** 开关点击：先尝试弹设备选择（用户手势），再持久化。 */
  setEnabled(on: boolean): void;
  setJack(jack: Dx52Jack): void;
  /** 重新授权（按钮点击，用户手势）。 */
  authorize(): void;
  retry(): void;
  dispose(): void;
}

export const dx52Key = serviceKey<Dx52Service>('dx52');

const FILTERS = [{ vendorId: DX52_VENDOR_ID, productId: DX52_PRODUCT_ID }] as const;
const SNAPSHOT_TIMEOUT_MS = 2000;
const HEARTBEAT_MS = 5000;

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
  let device: Dx52HidDevice | null = null;
  let disposed = false;
  let connecting = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
  let frameWords = new Map<number, number>();
  let frameTotal = 0;
  let frameBase = 1;

  const setStatus = (next: Dx52Status) => store.set(statusAtom, next);
  const setState = (next: Dx52State | null) => store.set(stateAtom, next);

  function clearSnapshot(): void {
    frameWords = new Map();
    frameTotal = 0;
    frameBase = 1;
  }
  function stopTimers(): void {
    if (heartbeat) clearInterval(heartbeat);
    if (snapshotTimer) clearTimeout(snapshotTimer);
    heartbeat = null;
    snapshotTimer = null;
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
  function requestSnapshot(): void {
    clearSnapshot();
    if (snapshotTimer) clearTimeout(snapshotTimer);
    send(DX52_COMMANDS.connectState, 2, 0x20);
    snapshotTimer = setTimeout(() => {
      snapshotTimer = null;
      if (!store.get(stateAtom)) setStatus({ kind: 'error' });
    }, SNAPSHOT_TIMEOUT_MS);
    setTimeout(() => send(DX52_COMMANDS.getSettings, 0, 0x10), 80);
  }
  function onReport(event: Event): void {
    const report = event as Dx52InputReportEvent;
    const bytes = new Uint8Array(report.data.buffer, report.data.byteOffset, report.data.byteLength);
    const frame = parseDx52Frame(bytes);
    if (!frame) return;
    if (frame.cmd === DX52_COMMANDS.getSettings) {
      if (!frameTotal) {
        frameTotal = frame.total;
        frameBase = frame.cur === 1 ? 1 : 0;
      }
      const index = frame.cur - frameBase;
      if (index < 0 || index >= frameTotal) return;
      frameWords.set(index, frame.data);
      if (frameWords.size >= frameTotal) {
        const words = [...frameWords.entries()]
          .sort(([left], [right]) => left - right)
          .map(([, value]) => value);
        setState(readDx52Settings(words, now()));
        setStatus({ kind: 'connected' });
        clearSnapshot();
        startHeartbeat();
      }
      return;
    }
    const current = store.get(stateAtom);
    const next = current ? applyDx52Push(current, frame, now()) : null;
    if (next) setState(next);
  }
  function onDisconnect(): void {
    if (!device) return;
    stopTimers();
    device.removeEventListener('inputreport', onReport);
    device = null;
    setState(null);
    setStatus({ kind: 'unauthorized' });
  }
  async function close(): Promise<void> {
    const current = device;
    device = null;
    stopTimers();
    clearSnapshot();
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
    found.addEventListener('inputreport', onReport);
    setStatus({ kind: 'connecting' });
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
        setStatus({ kind: 'unauthorized' });
        return;
      }
      await close();
      if (!disposed) await open(found);
    } finally {
      connecting = false;
    }
  }

  hid?.addEventListener('disconnect', onDisconnect);
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
    setEnabled(on) {
      if (on) void connect(true);
      else void close().then(() => setStatus({ kind: 'off' }));
      void prefs.set(AUTO_PREF, on);
    },
    setJack(jack) {
      void prefs.set(JACK_PREF, jack);
    },
    authorize() {
      void connect(true);
    },
    retry() {
      if (!device) void connect(false);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hid?.removeEventListener('disconnect', onDisconnect);
      stopTimers();
      void close();
      prefs.dispose();
    },
  };
}
