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
  dx52ReportCandidates,
  DX52_COMMANDS,
  DX52_PRODUCT_ID,
  DX52_SNAPSHOT_WORDS,
  DX52_VENDOR_ID,
  fitDx52Report,
  isDx52ProductName,
  isDx52PushCommand,
  navigatorHid,
  parseDx52Frame,
  pickDx52Device,
  readDx52Settings,
  summarizeDx52Descriptors,
  type Dx52ConnectEvent,
  type Dx52DescriptorSummary,
  type Dx52DisconnectEvent,
  type Dx52Frame,
  type Dx52HidDevice,
  type Dx52HidHost,
  type Dx52InputReportEvent,
  type Dx52Jack,
  type Dx52ReportDescriptor,
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

export type Dx52ReportTransport = 'output' | 'feature' | 'inputreport';

export interface Dx52DiagnosticReport {
  readonly seq: number;
  readonly atMs: number;
  readonly direction: 'send' | 'receive';
  readonly transport: Dx52ReportTransport | null;
  readonly reportId: number | null;
  readonly length: number;
  readonly declaredLength?: number;
  readonly hex: string;
  readonly parsed: Dx52Frame | null;
  readonly ok?: boolean;
  readonly error?: string;
}

export interface Dx52TransportDiagnostics {
  readonly send: {
    readonly kind: 'output' | 'feature';
    readonly reportId: number;
    readonly length: number;
  } | null;
  readonly receive: {
    readonly kind: 'inputreport' | 'feature';
    readonly reportId: number | null;
  } | null;
  readonly locked: boolean;
  readonly attempts: readonly string[];
}

export interface Dx52SnapshotDiagnostics {
  readonly active: boolean;
  readonly expected: number;
  readonly total: number;
  readonly received: number;
  readonly missing: readonly number[];
  readonly words: readonly (number | null)[];
  readonly complete: boolean;
  readonly partial: boolean;
}

export interface Dx52Diagnostics {
  readonly startedAtMs: number;
  readonly reports: readonly Dx52DiagnosticReport[];
  readonly snapshot: Dx52SnapshotDiagnostics;
  readonly lastError: string | null;
  readonly updatedAtMs: number;
  readonly status: Dx52Status;
  readonly descriptor: Dx52DescriptorSummary | null;
  readonly transport: Dx52TransportDiagnostics;
}

export const DX52_DIAGNOSTICS_LIMIT = 200;

const emptySnapshotDiagnostics = (): Dx52SnapshotDiagnostics => ({
  active: false,
  expected: DX52_SNAPSHOT_WORDS,
  total: 0,
  received: 0,
  missing: Array.from({ length: DX52_SNAPSHOT_WORDS }, (_, index) => index),
  words: Array.from({ length: DX52_SNAPSHOT_WORDS }, () => null),
  complete: false,
  partial: false,
});

const EMPTY_TRANSPORT: Dx52TransportDiagnostics = {
  send: null,
  receive: null,
  locked: false,
  attempts: [],
};

const INITIAL_DIAGNOSTICS = {
  startedAtMs: 0,
  reports: [] as readonly Dx52DiagnosticReport[],
  snapshot: emptySnapshotDiagnostics(),
  lastError: null as string | null,
  updatedAtMs: 0,
  descriptor: null as Dx52DescriptorSummary | null,
  transport: EMPTY_TRANSPORT,
};

const diagnosticsBaseAtom = atom(INITIAL_DIAGNOSTICS);

export const dx52DiagnosticsAtom: Atom<Dx52Diagnostics> = atom((get) => ({
  ...get(diagnosticsBaseAtom),
  status: get(dx52StatusAtom),
}));

function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

function reportListText(reports: readonly Dx52ReportDescriptor[]): string {
  return reports.length
    ? reports
        .map(
          (report) =>
            `${report.reportId}@${report.length}${report.usagePage >= 0xff00 ? '/vendor' : ''}`,
        )
        .join(',')
    : '-';
}

/** 稳定、可复制的诊断文本；用户把它发回来就能看到原始帧与字段索引。 */
export function formatDx52Diagnostics(diagnostics: Dx52Diagnostics): string {
  const snapshot = diagnostics.snapshot;
  const words = snapshot.words
    .map((value, index) => (value === null ? null : `${index}=${value}`))
    .filter((value): value is string => value !== null)
    .join(' ');
  const descriptor = diagnostics.descriptor;
  const descriptorLine = descriptor
    ? `descriptor: available=${descriptor.available} collections=${descriptor.collectionCount} inputs=${reportListText(
        descriptor.inputs,
      )} outputs=${reportListText(descriptor.outputs)} features=${reportListText(
        descriptor.features,
      )}`
    : 'descriptor: unavailable';
  const send = diagnostics.transport.send;
  const receive = diagnostics.transport.receive;
  const transportLine = `transport: send=${
    send ? `${send.kind}#${send.reportId}@${send.length}` : '-'
  } receive=${receive ? `${receive.kind}#${receive.reportId ?? '-'}` : '-'} locked=${
    diagnostics.transport.locked
  }`;
  return [
    'DX52 HID diagnostics',
    `status: ${diagnostics.status.kind}`,
    `lastError: ${diagnostics.lastError ?? '-'}`,
    descriptorLine,
    transportLine,
    `transport attempts: ${diagnostics.transport.attempts.join('; ') || '-'}`,
    `snapshot: expected=${snapshot.expected} total=${snapshot.total} received=${snapshot.received} missing=${
      snapshot.missing.length ? snapshot.missing.join(',') : '-'
    } complete=${snapshot.complete} partial=${snapshot.partial}`,
    `words: ${words || '-'}`,
    'reports:',
    ...diagnostics.reports.map((report) => {
      const parsed = report.parsed
        ? ` parsed=proto=${report.parsed.proto} total=${report.parsed.total} cur=${report.parsed.cur} cmd=0x${report.parsed.cmd.toString(16)} data=${report.parsed.data}`
        : ' parsed=null';
      const extras = [
        report.transport ? `via=${report.transport}` : null,
        report.declaredLength !== undefined ? `declared=${report.declaredLength}` : null,
        report.ok !== undefined ? `ok=${report.ok}` : null,
        report.error ? `error=${report.error}` : null,
      ]
        .filter((value): value is string => value !== null)
        .join(' ');
      return `  #${report.seq} +${report.atMs - diagnostics.startedAtMs}ms ${report.direction} reportId=${
        report.reportId ?? '-'
      } len=${report.length}${extras ? ` ${extras}` : ''} hex=${report.hex}${parsed}`;
    }),
  ].join('\n');
}

export interface Dx52Service {
  readonly ready: Promise<void>;
  readonly persistence: ConfigPersistence;
  readonly enabled: Atom<boolean>;
  readonly jack: Atom<Dx52Jack>;
  readonly status: Atom<Dx52Status>;
  readonly state: Atom<Dx52State | null>;
  readonly failure: Atom<Dx52Failure | null>;
  readonly diagnostics: Atom<Dx52Diagnostics>;
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
/** 收到快照帧后静默这么久就收尾，不必等满 6 秒。 */
const SNAPSHOT_QUIET_MS = 1500;
/** `total <= 1` 是短应答/回声，不是 45 字段的设置快照。 */
const SNAPSHOT_MIN_FRAMES = 2;
const WAITING_RETRY_MS = 10_000;
const HEARTBEAT_MS = 5000;
/** Feature Report 不能收 interrupt IN；快照可能一帧一个报告，轮询要足够密。 */
const FEATURE_POLL_MS = 50;
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
  store.set(diagnosticsBaseAtom, {
    ...INITIAL_DIAGNOSTICS,
    startedAtMs: now(),
    updatedAtMs: now(),
  });
  let device: Dx52HidDevice | null = null;
  let disposed = false;
  let connecting = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let waitingTimer: ReturnType<typeof setInterval> | null = null;
  let snapshotTimers: ReturnType<typeof setTimeout>[] = [];
  let quietTimer: ReturnType<typeof setTimeout> | null = null;
  let frameWords = new Map<number, number>();
  let frameTotal = 0;
  let frameBase: 0 | 1 | null = null;
  let snapshotActive = false;
  let diagnosticsStartedAt = now();
  let diagnosticsSeq = 0;
  let diagnosticsReports: Dx52DiagnosticReport[] = [];
  let diagnosticsError: string | null = null;
  let diagnosticsSnapshot = emptySnapshotDiagnostics();
  type SendCandidate = Dx52ReportDescriptor & { readonly kind: 'output' | 'feature' };
  let descriptor: Dx52DescriptorSummary | null = null;
  let outputCandidates: readonly SendCandidate[] = [];
  let featureCandidates: readonly SendCandidate[] = [];
  let selectedSend: SendCandidate | null = null;
  let selectedReceive: Dx52TransportDiagnostics['receive'] = null;
  let transportLocked = false;
  let transportAttempts: string[] = [];
  let lastFeatureSend: SendCandidate | null = null;
  let featurePollTimer: ReturnType<typeof setTimeout> | null = null;
  let featureProbeTimers: ReturnType<typeof setTimeout>[] = [];
  let featurePolling = false;
  let featurePollBusy = false;
  const featureErrorReported = new Set<number>();
  let receivedAny = false;
  let pendingSampleRate: number | null = null;
  let sendQueue: Promise<void> = Promise.resolve();
  let snapshotGeneration = 0;
  const recentFrames = new Map<string, number>();

  const setStatus = (next: Dx52Status) => store.set(statusAtom, next);
  const setState = (next: Dx52State | null) => store.set(stateAtom, next);
  const clearFailureDismissed = () => store.set(failureDismissedAtom, false);

  function clearSnapshotTimers(): void {
    for (const timer of snapshotTimers) clearTimeout(timer);
    snapshotTimers = [];
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = null;
  }
  function resetFrames(): void {
    frameWords = new Map();
    frameTotal = 0;
    frameBase = null;
    snapshotActive = false;
  }
  function publishDiagnostics(): void {
    store.set(diagnosticsBaseAtom, {
      startedAtMs: diagnosticsStartedAt,
      reports: diagnosticsReports,
      snapshot: diagnosticsSnapshot,
      lastError: diagnosticsError,
      updatedAtMs: now(),
      descriptor,
      transport: {
        send: selectedSend,
        receive: selectedReceive,
        locked: transportLocked,
        attempts: transportAttempts,
      },
    });
  }
  function snapshotDiagnostics(active: boolean): Dx52SnapshotDiagnostics {
    const missing: number[] = [];
    const words: (number | null)[] = [];
    for (let index = 0; index < DX52_SNAPSHOT_WORDS; index += 1) {
      const value = frameWords.get(index);
      words.push(value === undefined ? null : value);
      if (value === undefined) missing.push(index);
    }
    return {
      active,
      expected: DX52_SNAPSHOT_WORDS,
      total: frameTotal,
      received: frameWords.size,
      missing,
      words,
      complete: isComplete(),
      partial: false,
    };
  }
  function publishSnapshot(active: boolean): void {
    if (active) diagnosticsSnapshot = snapshotDiagnostics(true);
    publishDiagnostics();
  }
  function recordReport(
    direction: 'send' | 'receive',
    bytes: Uint8Array,
    parsed: Dx52Frame | null,
    reportId: number | null,
    transport: Dx52ReportTransport | null,
    extra: { readonly declaredLength?: number; readonly ok?: boolean; readonly error?: string } = {},
  ): number {
    diagnosticsSeq += 1;
    diagnosticsReports = [
      ...diagnosticsReports,
      {
        seq: diagnosticsSeq,
        atMs: now(),
        direction,
        transport,
        reportId,
        length: bytes.length,
        declaredLength: extra.declaredLength,
        hex: hexOf(bytes),
        parsed,
        ok: extra.ok,
        error: extra.error,
      },
    ].slice(-DX52_DIAGNOSTICS_LIMIT);
    publishDiagnostics();
    return diagnosticsSeq;
  }
  function updateReport(
    seq: number,
    patch: { readonly ok?: boolean; readonly error?: string },
  ): void {
    diagnosticsReports = diagnosticsReports.map((report) =>
      report.seq === seq ? { ...report, ...patch } : report,
    );
    publishDiagnostics();
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
    clearFeatureProbes();
  }
  function errorText(error: unknown): string {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    return String(error);
  }
  function stopFeaturePolling(): void {
    featurePolling = false;
    featurePollBusy = false;
    if (featurePollTimer) clearTimeout(featurePollTimer);
    featurePollTimer = null;
  }
  function clearFeatureProbes(): void {
    for (const timer of featureProbeTimers) clearTimeout(timer);
    featureProbeTimers = [];
    stopFeaturePolling();
  }
  function resetTransport(): void {
    clearFeatureProbes();
    selectedSend = null;
    selectedReceive = null;
    transportLocked = false;
    lastFeatureSend = null;
    receivedAny = false;
    pendingSampleRate = null;
    recentFrames.clear();
    featureErrorReported.clear();
    transportAttempts = [];
    sendQueue = Promise.resolve();
  }
  function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
  function queueSend(
    candidate: SendCandidate,
    cmd: number,
    data: number,
    proto: number,
  ): Promise<boolean> {
    const frame = buildDx52Frame(cmd, data, proto);
    const bytes = fitDx52Report(frame, candidate.length);
    if (!bytes) {
      transportAttempts = [
        ...transportAttempts,
        `${candidate.kind}#${candidate.reportId}@${candidate.length}: frame does not fit`,
      ];
      publishDiagnostics();
      return Promise.resolve(false);
    }
    const seq = recordReport(
      'send',
      bytes,
      { proto, total: 1, cur: 1, cmd, data },
      candidate.reportId,
      candidate.kind,
      { declaredLength: candidate.length },
    );
    let result = false;
    const run = sendQueue.then(async () => {
      const current = device;
      if (!current?.opened) return;
      try {
        if (candidate.kind === 'feature') {
          if (!current.sendFeatureReport) throw new Error('sendFeatureReport unavailable');
          await current.sendFeatureReport(candidate.reportId, bytes);
        } else {
          await current.sendReport(candidate.reportId, bytes);
        }
        result = true;
        updateReport(seq, { ok: true });
        if (!selectedSend) selectedSend = candidate;
        publishDiagnostics();
      } catch (error) {
        const message = errorText(error);
        result = false;
        updateReport(seq, { ok: false, error: message });
        diagnosticsError = `send failed: ${message}`;
        transportAttempts = [
          ...transportAttempts,
          `${candidate.kind}#${candidate.reportId}: ${message}`,
        ];
        if (selectedSend === candidate) selectedSend = null;
        publishDiagnostics();
      }
    });
    sendQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run.then(() => result);
  }
  async function transmit(cmd: number, data: number, proto: number): Promise<boolean> {
    const candidates = selectedSend ? [selectedSend] : outputCandidates;
    for (const candidate of candidates) {
      if (await queueSend(candidate, cmd, data, proto)) return true;
    }
    if (selectedSend) return false;
    for (const candidate of featureCandidates) {
      lastFeatureSend = candidate;
      if (await queueSend(candidate, cmd, data, proto)) {
        startFeaturePolling(candidate.reportId);
        return true;
      }
    }
    return false;
  }
  function send(cmd: number, data = 0, proto = 0x10): void {
    if (!device?.opened) return;
    void transmit(cmd, data, proto);
  }
  function candidateText(candidates: readonly SendCandidate[]): string {
    return candidates.map((item) => `${item.kind}#${item.reportId}@${item.length}`).join(',') || '-';
  }
  function pollFeature(reportId: number): void {
    const current = device;
    const receive = current?.receiveFeatureReport;
    if (!current?.opened || !receive || featurePollBusy) return;
    featurePollBusy = true;
    void receive
      .call(current, reportId)
      .then((view) => {
        feedFrame(
          new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
          reportId,
          'feature',
        );
      })
      .catch((error) => {
        const name = error instanceof Error ? error.name : '';
        // NotFoundError 只表示这次轮询还没有数据，是等待过程中的正常现象。
        if (name !== 'NotFoundError' && !featureErrorReported.has(reportId)) {
          featureErrorReported.add(reportId);
          const message = errorText(error);
          transportAttempts = [...transportAttempts, `feature#${reportId}: ${message}`];
          diagnosticsError = `feature receive failed: ${message}`;
          publishDiagnostics();
        }
        // 报告 ID 无效或 API 不支持才停止；没有数据时继续轮询。
        if (name !== 'NotFoundError') stopFeaturePolling();
      })
      .finally(() => {
        featurePollBusy = false;
      });
  }
  function startFeaturePolling(reportId: number): void {
    if (featurePolling || !device?.receiveFeatureReport) return;
    featurePolling = true;
    pollFeature(reportId);
    const tick = () => {
      if (!featurePolling) return;
      pollFeature(reportId);
      featurePollTimer = setTimeout(tick, FEATURE_POLL_MS);
    };
    featurePollTimer = setTimeout(tick, FEATURE_POLL_MS);
  }
  async function probeFeatureCandidates(generation: number): Promise<void> {
    for (const candidate of featureCandidates.slice(0, 3)) {
      if (disposed || generation !== snapshotGeneration || !snapshotActive) return;
      if (receivedAny) return;
      lastFeatureSend = candidate;
      await queueSend(candidate, DX52_COMMANDS.connectState, 2, 0x20);
      await queueSend(candidate, DX52_COMMANDS.getSettings, 0, 0x10);
      startFeaturePolling(candidate.reportId);
      await wait(450);
      if (receivedAny) {
        if (selectedReceive?.kind === 'feature') startFeaturePolling(candidate.reportId);
        else stopFeaturePolling();
        return;
      }
      stopFeaturePolling();
      transportAttempts = [
        ...transportAttempts,
        `feature#${candidate.reportId}@${candidate.length}: no reply`,
      ];
      publishDiagnostics();
    }
  }
  function scheduleFeatureProbe(generation: number): void {
    if (!featureCandidates.length || !device?.receiveFeatureReport) return;
    featureProbeTimers.push(
      setTimeout(() => {
        if (disposed || generation !== snapshotGeneration || !snapshotActive || receivedAny) return;
        transportAttempts = [
          ...transportAttempts,
          `output ${candidateText(outputCandidates)}: no reply`,
        ];
        publishDiagnostics();
        void probeFeatureCandidates(generation);
      }, 700),
    );
  }
  function startHeartbeat(): void {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = setInterval(() => send(DX52_COMMANDS.heartbeat, 1, 0x20), HEARTBEAT_MS);
  }
  function isSnapshotFrame(frame: Dx52Frame): boolean {
    // 真机连接时还会推 0x7130/0x7131/0x7133 等多帧流；它们不是设置快照，不能拿来定 frameBase。
    if (frame.total < DX52_SNAPSHOT_WORDS) return false;
    return frame.cmd === DX52_COMMANDS.getSettings || !isDx52PushCommand(frame.cmd);
  }
  function isComplete(): boolean {
    if (frameTotal < DX52_SNAPSHOT_WORDS) return false;
    for (let index = 0; index < DX52_SNAPSHOT_WORDS; index += 1)
      if (!frameWords.has(index)) return false;
    return true;
  }
  function snapshotWords(): number[] {
    let size = DX52_SNAPSHOT_WORDS;
    if (frameTotal > size) size = frameTotal;
    for (const index of frameWords.keys()) if (index + 1 > size) size = index + 1;
    const words = new Array<number>(size).fill(0);
    for (const [index, value] of frameWords) words[index] = value;
    return words;
  }
  function acceptSnapshot(partial: boolean): void {
    snapshotActive = false;
    clearSnapshotTimers();
    const next = readDx52Settings(snapshotWords(), now(), { partial });
    setState(
      pendingSampleRate === null ? next : { ...next, sampleRate: pendingSampleRate },
    );
    setStatus({ kind: 'connected' });
    clearFailureDismissed();
    startHeartbeat();
    stopWaitingRetry();
    diagnosticsSnapshot = {
      ...snapshotDiagnostics(false),
      partial,
      complete: !partial,
    };
    publishDiagnostics();
    // 保留 frameWords 给诊断面板；下一次 requestSnapshot 再清。
  }
  function finishSnapshot(): void {
    if (!snapshotActive) return;
    snapshotActive = false;
    clearSnapshotTimers();
    if (isComplete()) {
      acceptSnapshot(false);
      return;
    }
    if (
      frameTotal >= SNAPSHOT_MIN_FRAMES &&
      CRITICAL_WORDS.every((index) => frameWords.has(index))
    ) {
      acceptSnapshot(true);
      return;
    }
    const missing = snapshotDiagnostics(false).missing;
    diagnosticsError = `snapshot incomplete: total=${frameTotal} received=${frameWords.size} missing=${missing.join(',')}`;
    diagnosticsSnapshot = { ...snapshotDiagnostics(false), active: false };
    publishDiagnostics();
    console.warn('[DX5 II] settings snapshot incomplete', {
      received: frameWords.size,
      total: frameTotal,
      missing,
    });
    setStatus({ kind: 'error' });
  }
  function scheduleQuietFinish(): void {
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      quietTimer = null;
      finishSnapshot();
    }, SNAPSHOT_QUIET_MS);
  }
  function requestSnapshot(): void {
    if (!device?.opened) return;
    clearSnapshotTimers();
    resetFrames();
    snapshotGeneration += 1;
    const generation = snapshotGeneration;
    receivedAny = false;
    recentFrames.clear();
    stopFeaturePolling();
    transportAttempts = [];
    snapshotActive = true;
    diagnosticsStartedAt = now();
    diagnosticsSeq = 0;
    diagnosticsReports = [];
    diagnosticsError = null;
    diagnosticsSnapshot = { ...emptySnapshotDiagnostics(), active: true };
    publishDiagnostics();
    clearFailureDismissed();
    setStatus({ kind: 'connecting' });
    send(DX52_COMMANDS.connectState, 2, 0x20);
    const ask = (withConnect: boolean) => {
      if (withConnect) send(DX52_COMMANDS.connectState, 2, 0x20);
      send(DX52_COMMANDS.getSettings, 0, 0x10);
    };
    snapshotTimers.push(setTimeout(() => ask(false), SNAPSHOT_INITIAL_DELAY_MS));
    SNAPSHOT_RETRY_MS.forEach((delay, index) =>
      snapshotTimers.push(setTimeout(() => ask(index >= 2), delay)),
    );
    scheduleFeatureProbe(generation);
    snapshotTimers.push(setTimeout(finishSnapshot, SNAPSHOT_DEADLINE_MS));
  }
  function feedFrame(
    bytes: Uint8Array,
    reportId: number | null,
    transport: 'inputreport' | 'feature',
  ): void {
    const hex = hexOf(bytes);
    const stamp = now();
    for (const [key, at] of recentFrames) if (stamp - at > 1000) recentFrames.delete(key);
    // inputreport 与 feature 轮询可能把同一帧送到两遍；短时间内的同一 hex 只处理一次。
    if (recentFrames.has(hex)) return;
    recentFrames.set(hex, stamp);
    const frame = parseDx52Frame(bytes);
    recordReport('receive', bytes, frame, reportId, transport);
    if (!frame) return;
    receivedAny = true;
    if (!transportLocked) {
      transportLocked = true;
      selectedReceive = { kind: transport, reportId };
      if (transport === 'feature' && lastFeatureSend) selectedSend = lastFeatureSend;
      publishDiagnostics();
    } else if (!selectedReceive) {
      selectedReceive = { kind: transport, reportId };
      publishDiagnostics();
    }
    if (snapshotActive && isSnapshotFrame(frame)) {
      if (frameBase === null) frameBase = frame.cur === 0 ? 0 : 1;
      // 先看到 1 基帧、后来真机的 0 基快照重发时，以 0 基重新收，避免整体错位一格。
      else if (frameBase === 1 && frame.cur === 0) {
        frameBase = 0;
        frameWords.clear();
        frameTotal = 0;
      }
      if (frame.total > frameTotal) frameTotal = frame.total;
      const index = frame.cur - frameBase;
      if (index < 0 || index >= DX52_SNAPSHOT_WORDS) {
        publishSnapshot(true);
        return;
      }
      // 重复帧按 index 覆盖，其他已收帧保留；不因重发第一帧清空整轮。
      frameWords.set(index, frame.data);
      scheduleQuietFinish();
      publishSnapshot(true);
      if (isComplete()) acceptSnapshot(false);
      return;
    }
    // 采样率推送常在快照之前到达；先记下来，快照接受时一起写入。
    if (frame.cmd === DX52_COMMANDS.sampleRate)
      pendingSampleRate = frame.data > 0 ? frame.data : null;
    const current = store.get(stateAtom);
    if (!current) return;
    const next = applyDx52Push(current, frame, now());
    if (next) {
      setState(next);
      return;
    }
    // 任何有效报告都证明设备还在；心跳回帧不一定带状态变化，但统计要据此判断读数不过期。
    if (stamp - current.updatedAtMs >= 1000) setState({ ...current, updatedAtMs: stamp });
  }
  function onReport(event: Event): void {
    const report = event as Dx52InputReportEvent;
    const bytes = new Uint8Array(report.data.buffer, report.data.byteOffset, report.data.byteLength);
    feedFrame(bytes, report.reportId ?? null, 'inputreport');
  }
  function onDisconnect(event: Event): void {
    const target = (event as Partial<Dx52DisconnectEvent>).device;
    if (target && device && target !== device) return;
    if (!device) return;
    stopTimers();
    device.removeEventListener('inputreport', onReport);
    device = null;
    const lastSnapshot = { ...snapshotDiagnostics(false), active: false };
    resetFrames();
    resetTransport();
    setState(null);
    setStatus({ kind: 'waiting' });
    diagnosticsSnapshot = lastSnapshot;
    diagnosticsError = 'device disconnected';
    publishDiagnostics();
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
    resetTransport();
    descriptor = null;
    outputCandidates = [];
    featureCandidates = [];
    current?.removeEventListener('inputreport', onReport);
    if (current?.opened) await settle(() => current.close());
    setState(null);
  }
  async function open(found: Dx52HidDevice): Promise<void> {
    try {
      if (!found.opened) await found.open();
    } catch {
      diagnosticsError = 'could not open device';
      diagnosticsSnapshot = { ...snapshotDiagnostics(false), active: false };
      publishDiagnostics();
      setStatus({ kind: 'busy' });
      return;
    }
    if (disposed) {
      await settle(() => found.close());
      return;
    }
    device = found;
    stopWaitingRetry();
    resetTransport();
    descriptor = summarizeDx52Descriptors(found);
    outputCandidates = dx52ReportCandidates(descriptor, 'output').filter(
      (report): report is SendCandidate => report.kind !== 'input',
    );
    featureCandidates = dx52ReportCandidates(descriptor, 'feature').filter(
      (report): report is SendCandidate => report.kind !== 'input',
    );
    publishDiagnostics();
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
        diagnosticsError = 'device request failed';
        publishDiagnostics();
        setStatus({ kind: 'unauthorized' });
        return;
      }
      const found = pickDx52Device(picked);
      if (!found) {
        diagnosticsError = request ? 'no device picked' : 'no authorized device found';
        publishDiagnostics();
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
    diagnostics: dx52DiagnosticsAtom,
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
