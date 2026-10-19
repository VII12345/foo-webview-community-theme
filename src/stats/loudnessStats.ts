import type { fb } from 'foo-webview-sdk/bridge';
import { atom, type Atom } from 'jotai/vanilla';
import { settle } from '../host/hostCall.ts';
import type { Store } from '../kit/store.ts';
import {
  previousRangeForScope,
  rangeForScope,
  ymdOfMs,
  type StatsScope,
} from './statsRange.ts';
import type { SplWeighting } from '../playback/splWeighting.ts';

/**
 * 耳机平均音量的本地统计：只记 DX52 自动读数生效、正在播放且未静音的时间，按天 × 当前耳机
 * 累计 `seconds` 与能量 `10^(SPL/10) × seconds`。平均 SPL 用能量平均，绝不直接平均 dB。
 *
 * 文件在 profile 下：`<profile>\webview-ui-stats\loudness-v2.json`。v1 旧文件只作为 legacy 读取；
 * 内存是真相，定时防抖落盘；
 * 读不到按空开始，权限被拒时不覆盖。
 */
export interface LoudnessBucket {
  name: string;
  /** v2 新方法的累计收听秒数。 */
  seconds: number;
  energyA: number;
  energyK: number;
  energyZ: number;
  /** v1 旧 K-LUFS 估算的时长/能量；只计时长，不参与 A/K/Z 平均。 */
  legacySeconds?: number;
  legacyEnergy?: number;
}

export interface LoudnessFile {
  version: 2;
  days: Record<string, Record<string, LoudnessBucket>>;
}

export type LoudnessLoad =
  | { readonly state: 'ready'; readonly data: LoudnessFile }
  | { readonly state: 'empty' }
  | { readonly state: 'denied' }
  | { readonly state: 'failed' }
  | { readonly state: 'corrupt' };

export interface LoudnessHeadphoneSummary {
  readonly id: string;
  readonly name: string;
  /** v2 新方法累计时长。 */
  readonly seconds: number;
  /** v1 旧口径时长，只用于总时长显示。 */
  readonly legacySeconds: number;
  /** 按当前加权计算的能量平均 SPL；没有 v2 有效时长时为 null。 */
  readonly spl: number | null;
}

export interface LoudnessSummary {
  readonly perHeadphone: readonly LoudnessHeadphoneSummary[];
  readonly overall: {
    readonly seconds: number;
    readonly legacySeconds: number;
    readonly spl: number | null;
  };
}

export const LOUDNESS_STATS_DIRECTORY = 'webview-ui-stats';
export const LOUDNESS_STATS_FILE = 'loudness-v2.json';
export const LEGACY_LOUDNESS_STATS_FILE = 'loudness-v1.json';

export function emptyLoudnessFile(): LoudnessFile {
  return { version: 2, days: {} };
}

const finitePositive = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

export function parseLoudnessFile(raw: unknown): LoudnessFile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const version = Reflect.get(raw, 'version');
  if (version !== 1 && version !== 2) return null;
  const daysRaw = Reflect.get(raw, 'days');
  if (!daysRaw || typeof daysRaw !== 'object' || Array.isArray(daysRaw)) return null;
  const days: Record<string, Record<string, LoudnessBucket>> = {};
  for (const [ymd, dayRaw] of Object.entries(daysRaw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
    if (!dayRaw || typeof dayRaw !== 'object' || Array.isArray(dayRaw)) continue;
    const day: Record<string, LoudnessBucket> = {};
    for (const [id, bucketRaw] of Object.entries(dayRaw)) {
      if (!id || !bucketRaw || typeof bucketRaw !== 'object' || Array.isArray(bucketRaw))
        continue;
      const seconds = finitePositive(Reflect.get(bucketRaw, 'seconds'));
      const nameRaw = Reflect.get(bucketRaw, 'name');
      const name = typeof nameRaw === 'string' && nameRaw ? nameRaw : id;
      if (version === 1) {
        const energy = finitePositive(Reflect.get(bucketRaw, 'energy'));
        if (seconds === undefined || energy === undefined) continue;
        day[id] = {
          name,
          seconds: 0,
          energyA: 0,
          energyK: 0,
          energyZ: 0,
          legacySeconds: seconds,
          legacyEnergy: energy,
        };
        continue;
      }
      const energyA = finitePositive(Reflect.get(bucketRaw, 'energyA'));
      const energyK = finitePositive(Reflect.get(bucketRaw, 'energyK'));
      const energyZ = finitePositive(Reflect.get(bucketRaw, 'energyZ'));
      if (
        seconds === undefined ||
        energyA === undefined ||
        energyK === undefined ||
        energyZ === undefined
      )
        continue;
      const legacySeconds = finitePositive(Reflect.get(bucketRaw, 'legacySeconds'));
      const legacyEnergy = finitePositive(Reflect.get(bucketRaw, 'legacyEnergy'));
      day[id] = {
        name,
        seconds,
        energyA,
        energyK,
        energyZ,
        ...(legacySeconds !== undefined ? { legacySeconds } : {}),
        ...(legacyEnergy !== undefined ? { legacyEnergy } : {}),
      };
    }
    if (Object.keys(day).length > 0) days[ymd] = day;
  }
  return { version: 2, days };
}

/** 记一段 A/K/Z 三份能量；直接改传入的文件（记录器自己持有）。 */
export function recordLoudness(
  file: LoudnessFile,
  ymd: string,
  headphoneId: string,
  name: string,
  seconds: number,
  energies: { readonly A: number; readonly K: number; readonly Z: number },
): LoudnessFile {
  if (
    !(seconds > 0) ||
    ![energies.A, energies.K, energies.Z].every(
      (energy) => Number.isFinite(energy) && energy >= 0,
    )
  )
    return file;
  const day = file.days[ymd] ?? (file.days[ymd] = {});
  const bucket =
    day[headphoneId] ??
    (day[headphoneId] = {
      name,
      seconds: 0,
      energyA: 0,
      energyK: 0,
      energyZ: 0,
    });
  bucket.name = name || bucket.name;
  bucket.seconds += seconds;
  bucket.energyA += energies.A;
  bucket.energyK += energies.K;
  bucket.energyZ += energies.Z;
  return file;
}

export function averageSpl(
  bucket: Pick<LoudnessBucket, 'seconds' | 'energyA' | 'energyK' | 'energyZ'>,
  weighting: SplWeighting,
): number | null {
  const energy =
    weighting === 'A' ? bucket.energyA : weighting === 'K' ? bucket.energyK : bucket.energyZ;
  if (!(bucket.seconds > 0) || !(energy > 0)) return null;
  return 10 * Math.log10(energy / bucket.seconds);
}

export function summarizeLoudness(
  file: LoudnessFile,
  scope: StatsScope,
  now: Date,
  weighting: SplWeighting = 'A',
): LoudnessSummary {
  const range = rangeForScope(scope, now);
  const totals = new Map<
    string,
    { name: string; seconds: number; legacySeconds: number; energy: number }
  >();
  let totalSeconds = 0;
  let totalLegacySeconds = 0;
  let totalEnergy = 0;
  for (const [ymd, day] of Object.entries(file.days)) {
    if (ymd < range.start || ymd > range.end) continue;
    for (const [id, bucket] of Object.entries(day)) {
      const energy =
        weighting === 'A'
          ? bucket.energyA
          : weighting === 'K'
            ? bucket.energyK
            : bucket.energyZ;
      const legacySeconds = bucket.legacySeconds ?? 0;
      const entry =
        totals.get(id) ?? { name: bucket.name, seconds: 0, legacySeconds: 0, energy: 0 };
      entry.name = bucket.name || entry.name;
      entry.seconds += bucket.seconds;
      entry.legacySeconds += legacySeconds;
      entry.energy += energy;
      totals.set(id, entry);
      totalSeconds += bucket.seconds;
      totalLegacySeconds += legacySeconds;
      totalEnergy += energy;
    }
  }
  const perHeadphone = [...totals.entries()]
    .map(([id, entry]) => ({
      id,
      name: entry.name,
      seconds: entry.seconds,
      legacySeconds: entry.legacySeconds,
      spl: averageSpl(
        {
          seconds: entry.seconds,
          energyA: entry.energy,
          energyK: entry.energy,
          energyZ: entry.energy,
        },
        weighting,
      ),
    }))
    .sort(
      (left, right) =>
        right.seconds + right.legacySeconds - (left.seconds + left.legacySeconds) ||
        left.name.localeCompare(right.name),
    );
  return {
    perHeadphone,
    overall: {
      seconds: totalSeconds,
      legacySeconds: totalLegacySeconds,
      spl: averageSpl(
        {
          seconds: totalSeconds,
          energyA: totalEnergy,
          energyK: totalEnergy,
          energyZ: totalEnergy,
        },
        weighting,
      ),
    },
  };
}

/** 一次算出统计页需要的四个范围，避免详情页重复遍历。 */
export function summarizeLoudnessScopes(
  file: LoudnessFile,
  now: Date,
  weighting: SplWeighting = 'A',
): Record<StatsScope, LoudnessSummary> {
  return {
    today: summarizeLoudness(file, 'today', now, weighting),
    week: summarizeLoudness(file, 'week', now, weighting),
    month: summarizeLoudness(file, 'month', now, weighting),
    year: summarizeLoudness(file, 'year', now, weighting),
  };
}

export interface LoudnessStatsHost {
  readonly misc: Pick<typeof fb.misc, 'getProfilePath'>;
  readonly file: Pick<typeof fb.file, 'read' | 'write'>;
}

export function loudnessStatsPath(
  profilePath: string,
  file: string = LOUDNESS_STATS_FILE,
): string {
  return `${profilePath.replace(/[\\/]+$/, '')}\\${LOUDNESS_STATS_DIRECTORY}\\${file}`;
}

async function profilePathOf(host: LoudnessStatsHost): Promise<string | null> {
  const answer = await settle(() => host.misc.getProfilePath());
  if (!answer || answer.success === false) return null;
  return typeof answer.path === 'string' && answer.path ? answer.path : null;
}

export async function loadLoudnessStats(host: LoudnessStatsHost): Promise<LoudnessLoad> {
  const profile = await profilePathOf(host);
  if (!profile) return { state: 'failed' };
  let answer = await settle(() => host.file.read(loudnessStatsPath(profile)));
  if (!answer) return { state: 'failed' };
  if (answer.success === false && answer.code === 'NOT_FOUND') {
    answer = await settle(() =>
      host.file.read(loudnessStatsPath(profile, LEGACY_LOUDNESS_STATS_FILE)),
    );
    if (!answer) return { state: 'failed' };
  }
  if (answer.success === false) {
    if (answer.code === 'NOT_FOUND') return { state: 'empty' };
    if (answer.code === 'PERMISSION_DENIED') return { state: 'denied' };
    return { state: 'failed' };
  }
  try {
    const data = parseLoudnessFile(JSON.parse(answer.content));
    return data ? { state: 'ready', data } : { state: 'corrupt' };
  } catch {
    return { state: 'corrupt' };
  }
}

export async function writeLoudnessStats(
  host: LoudnessStatsHost,
  filePath: string,
  text: string,
): Promise<boolean> {
  const answer = await settle(() => host.file.write(filePath, text, { atomic: true }));
  return answer?.success === true;
}

/** 记录器只依赖这几个字段；由装配层把 `soundPressureViewAtom` 与 `playbackAtom` 传进来。 */
export interface LoudnessSampleView {
  readonly reading: {
    readonly splA: number | null;
    readonly splK: number | null;
    readonly splZ: number | null;
  };
  readonly auto: {
    readonly active: boolean;
    readonly state: { readonly updatedAtMs: number } | null;
  } | null;
  readonly headphone: { readonly id: string; readonly name: string } | null;
}

export interface LoudnessPlaybackView {
  readonly state: string;
  readonly position: number;
  readonly trackGeneration: number;
}

export interface LoudnessStatsDeps {
  readonly view: Atom<LoudnessSampleView>;
  readonly playback: Atom<LoudnessPlaybackView>;
  readonly host?: LoudnessStatsHost;
  readonly now?: () => number;
  readonly intervalMs?: number;
  readonly debounceMs?: number;
  readonly document?: Pick<
    Document,
    'visibilityState' | 'addEventListener' | 'removeEventListener'
  > | null;
  /** 读取 DX52 读数的新鲜度上限；超过就当设备状态过期。 */
  readonly staleMs?: number;
}

export interface LoudnessStatsService {
  readonly ready: Promise<void>;
  /** 立即落盘（测试与退出前用）。 */
  flush(): Promise<void>;
  dispose(): void;
}

export function startLoudnessStats(
  store: Store,
  deps: LoudnessStatsDeps,
): LoudnessStatsService {
  const statsHost = deps.host;
  if (!statsHost) {
    return { ready: Promise.resolve(), flush: async () => {}, dispose: () => {} };
  }
  const host: LoudnessStatsHost = statsHost;
  const now = deps.now ?? Date.now;
  const intervalMs = deps.intervalMs ?? 1000;
  const debounceMs = deps.debounceMs ?? 20_000;
  const staleMs = deps.staleMs ?? 5 * 60_000;
  const documentRef = deps.document === undefined ? document : deps.document;
  let file = emptyLoudnessFile();
  let filePath: string | null = null;
  let canWrite = true;
  let dirty = false;
  let disposed = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let saving = Promise.resolve();
  let lastTick = now();
  let lastPosition = store.get(deps.playback).position;
  let lastGeneration = store.get(deps.playback).trackGeneration;
  let lastPlaybackState = store.get(deps.playback).state;

  function scheduleSave(): void {
    if (saveTimer || disposed) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void flush();
    }, debounceMs);
  }

  function flush(): Promise<void> {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (!dirty || !filePath || !canWrite) return saving;
    dirty = false;
    const path = filePath;
    const text = JSON.stringify(file);
    saving = saving.then(async () => {
      const ok = await writeLoudnessStats(host, path, text);
      if (!ok) dirty = true;
    });
    return saving;
  }

  function tick(): void {
    if (disposed) return;
    const stamp = now();
    const wallDelta = Math.max(0, (stamp - lastTick) / 1000);
    lastTick = stamp;
    const playback = store.get(deps.playback);
    const view = store.get(deps.view);
    const positionDelta = playback.position - lastPosition;
    const sameTrack = playback.trackGeneration === lastGeneration;
    lastPosition = playback.position;
    lastGeneration = playback.trackGeneration;
    const auto = view.auto;
    const headphone = view.headphone;
    const { splA, splK, splZ } = view.reading;
    if (
      playback.state !== 'playing' ||
      !auto?.active ||
      !auto.state ||
      !headphone ||
      splA === null ||
      splK === null ||
      splZ === null ||
      ![splA, splK, splZ].every(Number.isFinite) ||
      stamp - auto.state.updatedAtMs > staleMs
    )
      return;
    const maxDelta = Math.max(2, wallDelta * 2 + 1);
    const seconds =
      sameTrack && positionDelta > 0 && positionDelta <= maxDelta
        ? positionDelta
        : Math.min(2, wallDelta);
    if (!(seconds > 0)) return;
    recordLoudness(file, ymdOfMs(stamp), headphone.id, headphone.name, seconds, {
      A: 10 ** (splA / 10) * seconds,
      K: 10 ** (splK / 10) * seconds,
      Z: 10 ** (splZ / 10) * seconds,
    });
    dirty = true;
    scheduleSave();
  }

  const onVisibility = () => {
    if (documentRef?.visibilityState === 'hidden') void flush();
  };
  const offPlayback = store.sub(deps.playback, () => {
    const next = store.get(deps.playback);
    if (next.state !== lastPlaybackState || next.trackGeneration !== lastGeneration) {
      lastPlaybackState = next.state;
      lastPosition = next.position;
      lastGeneration = next.trackGeneration;
      void flush();
    }
  });

  const ready = (async () => {
    const load = await loadLoudnessStats(host);
    if (disposed) return;
    if (load.state === 'ready') file = load.data;
    else if (load.state === 'denied') canWrite = false;
    const profile = await profilePathOf(host);
    if (!disposed && profile) filePath = loudnessStatsPath(profile);
    if (disposed) return;
    lastTick = now();
    timer = setInterval(tick, intervalMs);
    documentRef?.addEventListener('visibilitychange', onVisibility);
  })();

  return {
    ready,
    flush,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer) clearInterval(timer);
      timer = null;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      offPlayback();
      documentRef?.removeEventListener('visibilitychange', onVisibility);
      void flush();
    },
  };
}
