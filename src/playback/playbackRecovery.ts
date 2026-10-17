import type { Track } from 'foo-webview-sdk';
import { fb } from 'foo-webview-sdk/bridge';
import { atom, type Atom } from 'jotai/vanilla';
import type { ConfigWriter } from '../host/configWrite.ts';
import { hostCommand, settle } from '../host/hostCall.ts';
import { playKeepingQueue } from '../host/queueCommands.ts';
import { waitForHost, type HostReadyFace } from '../host/waitForHost.ts';
import { serviceKey } from '../kit/serviceKey.ts';
import type { Store } from '../kit/store.ts';
import { trackKeyOf, type PlaybackState } from './playbackContract.ts';

/**
 * 上次播放的恢复记录：哪一首、在哪张播放列表的哪一行、播到第几秒。
 *
 * 退出时宿主只尽力通知一次 `app:beforeQuit`，不会等页面处理完，所以不能只在退出时写。这里跟着播放状态
 * 持续保存：换曲、暂停 / 停止、跳转时立即写，进度事件合并到最多每 `POSITION_SAVE_MS` 一次。暂停与主动
 * 停止都不清除记录：用户关掉软件再打开，仍能从这里接着播。
 *
 * 恢复只认原位置：原 GUID 与原行必须仍然对应同一个 handle，否则答失败，不搜相似行、不改写任何列表或
 * 队列。点击恢复时临时静音、按原行起播、定位，最后恢复原静音状态；即使中途失败也一定恢复。
 */
export const RECOVERY_KEY = 'defaultTheme.playback.recovery';
/** 进度合并保存的最短间隔，毫秒。 */
export const POSITION_SAVE_MS = 5000;
/** 恢复时等宿主把新曲目装载起来的时限，毫秒。 */
export const RESTORE_LOAD_MS = 5000;
/** 与记录位置相差超过这么多秒，才把这次播放当作「从头开始」，需要先定位，秒。 */
export const RESTORE_POSITION_TOLERANCE_S = 2;

/** 写成 type 而不是 interface：要直接存进 config，interface 没有隐式的索引签名。 */
export type PlaybackRecoveryRecord = {
  /** 曲目身份，路径加 subsong；与 `trackKeyOf` 同口径。 */
  readonly key: string;
  /** 曲目句柄，校验原行时用。 */
  readonly handle: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly duration: number;
  /** 秒。 */
  readonly position: number;
  /** 原播放列表的 GUID；没有列表位置时为空串。 */
  readonly playlistGuid: string;
  /** 原行号；没有列表位置时为 -1。 */
  readonly row: number;
};

export type RecoveryState =
  | { readonly status: 'idle' }
  | { readonly status: 'pending'; readonly record: PlaybackRecoveryRecord }
  | { readonly status: 'restoring'; readonly record: PlaybackRecoveryRecord }
  | {
      readonly status: 'unavailable';
      readonly record: PlaybackRecoveryRecord;
      readonly reason: 'noPlaylistRow' | 'rowChanged' | 'missingPlaylist' | 'loadFailed';
    }
  | { readonly status: 'failed'; readonly record: PlaybackRecoveryRecord };

export interface PlaybackRecoveryFace extends HostReadyFace {
  on: typeof fb.on;
  player: Pick<
    typeof fb.player,
    | 'getState'
    | 'getCurrentTrack'
    | 'getPosition'
    | 'getCurrentTrackIndex'
    | 'getVolume'
    | 'mute'
    | 'play'
    | 'seek'
  >;
  playlist: Pick<typeof fb.playlist, 'getAll' | 'getTracks' | 'playTrack'>;
  queue: Pick<typeof fb.queue, 'getCount' | 'insertNext' | 'playNow'>;
  config: Pick<typeof fb.config, 'get'>;
}

export interface PlaybackRecoveryService {
  /** 连上宿主、读回存档并订上事件时兑现，不会拒绝。 */
  readonly ready: Promise<void>;
  readonly state: Atom<RecoveryState>;
  /**
   * 播放键的拦截：有可恢复的记录时接手，返回真。没有记录或记录不可用时返回假，调用方照常发播放命令。
   * 不在这里等恢复完成。
   */
  interceptPlay(): boolean;
  /** 重新尝试恢复当前记录；不可用与失败都能重试。 */
  retry(): void;
  dispose(): void;
}

export const playbackRecoveryKey = serviceKey<PlaybackRecoveryService>('playbackRecovery');

const IDLE: RecoveryState = { status: 'idle' };
const recoveryAtom = atom<RecoveryState>(IDLE);
export const playbackRecoveryAtom: Atom<RecoveryState> = atom((get) => get(recoveryAtom));

/** 存档是外部数据：字段类型不对、值越界就当没有存过。 */
export function parseRecoveryRecord(raw: unknown): PlaybackRecoveryRecord | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const field = (key: string): unknown => Reflect.get(raw, key);
  const text = (key: string): string | undefined => {
    const value = field(key);
    return typeof value === 'string' ? value : undefined;
  };
  const finite = (key: string, min: number): number | undefined => {
    const value = field(key);
    return typeof value === 'number' && Number.isFinite(value) && value >= min ? value : undefined;
  };
  const key = text('key');
  const handle = text('handle');
  const playlistGuid = text('playlistGuid');
  const row = finite('row', -1);
  const position = finite('position', 0);
  const duration = finite('duration', 0);
  if (
    key === undefined ||
    !key ||
    handle === undefined ||
    !handle ||
    playlistGuid === undefined ||
    row === undefined ||
    position === undefined ||
    duration === undefined
  )
    return undefined;
  return {
    key,
    handle,
    title: text('title') ?? '',
    artist: text('artist') ?? '',
    album: text('album') ?? '',
    duration,
    position,
    playlistGuid,
    row,
  };
}

export interface PlaybackRecoveryDeps {
  /** 当前播放状态；直接订 atom，不重读宿主。 */
  readonly playback: Atom<PlaybackState>;
  readonly writer: Pick<ConfigWriter, 'set'>;
  /** 恢复时等新曲目装载完成的轮询间隔，毫秒；测试可缩短。 */
  readonly pollMs?: number;
  readonly now?: () => number;
}

function recordOf(
  track: Track,
  position: number,
  duration: number,
  playlistGuid: string,
  row: number,
): PlaybackRecoveryRecord {
  return {
    key: trackKeyOf(track),
    handle: track.handle,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: duration > 0 ? duration : track.duration,
    position: Math.max(0, position),
    playlistGuid,
    row,
  };
}

/**
 * 启动恢复服务。记录里只有播放列表位置，不含列表内容：列表由 foobar2000 自己保存，这里只记 GUID 与行。
 * 换曲时读一次当前位置（`playback.getCurrentTrackIndex`），没有列表位置时仍记下曲目与进度，恢复时答
 * 「无法恢复」而不是擅自把歌加进列表。
 */
export function startPlaybackRecovery(
  store: Store,
  deps: PlaybackRecoveryDeps,
  host: PlaybackRecoveryFace = fb,
): PlaybackRecoveryService {
  store.set(recoveryAtom, IDLE);
  let disposed = false;
  let connected = false;
  let saved: PlaybackRecoveryRecord | null = null;
  /** 最近一次看到的记录（含还没落盘的进度）；节流到点时写它。 */
  let latest: PlaybackRecoveryRecord | null = null;
  /** 启动时读回的记录：宿主若把它从头开始放，第一次按播放先定位到这里；用过一次或用户拖过进度就清掉。 */
  let startupTarget: PlaybackRecoveryRecord | null = null;
  let writable = false;
  let restoring = false;
  /** 这一轮启动里已经恢复过或已经问过记录位置；不再重复拦截播放键。 */
  let consumed = false;
  let lastWrite = 0;
  let lastState: PlaybackState['state'] | null = null;
  let lastPosition = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  const waiter = waitForHost(host);
  const lifetime = new AbortController();
  const offs: (() => void)[] = [];
  const now = deps.now ?? Date.now;
  const pollMs = deps.pollMs ?? 100;

  const state = () => store.get(recoveryAtom);
  const set = (next: RecoveryState) => {
    if (!disposed) store.set(recoveryAtom, next);
  };

  function persist(record: PlaybackRecoveryRecord, immediate: boolean): void {
    if (!connected || !writable) return;
    latest = record;
    const at = now();
    if (!immediate && at - lastWrite < POSITION_SAVE_MS) {
      if (timer === undefined) {
        timer = setTimeout(
          () => {
            timer = undefined;
            if (latest) persist(latest, true);
          },
          Math.max(0, POSITION_SAVE_MS - (at - lastWrite)),
        );
      }
      return;
    }
    lastWrite = at;
    saved = record;
    // 写失败不拦播放：下一次换曲、暂停或退出前还会再写。写入在写锁里按发起顺序执行，最后一份最新。
    void deps.writer.set(RECOVERY_KEY, record, lifetime.signal);
    const current = state();
    // 宿主已经开始放另一首：启动时亮着的恢复栏让位给正常播放栏；同一首则只更新记录。
    if (current.status === 'pending') {
      set(current.record.key === record.key ? { status: 'pending', record } : { status: 'idle' });
    }
  }  /** 读一次宿主的当前曲目与所在列表行，拼成一份记录。 */
  async function snapshot(): Promise<PlaybackRecoveryRecord | null> {
    const live = store.get(deps.playback);
    const track = live.track;
    if (!track) return null;
    const position = live.position;
    const duration = live.duration > 0 ? live.duration : track.duration;
    const index = await settle(() => host.player.getCurrentTrackIndex());
    if (disposed || !index || index.success === false)
      return recordOf(track, position, duration, '', -1);
    const guid = index.found && index.playlistGuid ? index.playlistGuid : '';
    const row = index.found && typeof index.index === 'number' ? index.index : -1;
    return recordOf(track, position, duration, guid, row);
  }

  /** 播放状态变了：换曲、暂停 / 停止、跳转时立即写，其余进度合并。 */
  function follow(force = false): void {
    if (disposed || !connected || restoring) return;
    const live = store.get(deps.playback);
    if (!live.track) return;
    if (startupTarget && startupTarget.key !== trackKeyOf(live.track)) startupTarget = null;
    const changedTrack = saved === null || saved.key !== trackKeyOf(live.track);
    const changedState = lastState !== live.state;
    lastState = live.state;
    lastPosition = live.position;
    if (changedTrack) {
      const mine = ++generation;
      void snapshot().then((record) => {
        if (disposed || mine !== generation || !record) return;
        persist(record, true);
      });
      return;
    }
    const base = latest ?? saved;
    if (base) persist({ ...base, position: live.position }, force || changedState);
  }

  /** 等宿主报出要恢复的那一首（`playback.getCurrentTrack` 与记录的 handle 对上）。 */
  async function waitForTrack(record: PlaybackRecoveryRecord, mine: number): Promise<boolean> {
    const deadline = now() + RESTORE_LOAD_MS;
    while (!disposed && mine === generation && now() < deadline) {
      const answer = await settle(() => host.player.getCurrentTrack());
      if (disposed || mine !== generation) return false;
      if (answer && answer.success !== false && answer.found && answer.track?.handle === record.handle)
        return true;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    return false;
  }

  async function restore(record: PlaybackRecoveryRecord): Promise<void> {
    if (disposed || restoring) return;
    restoring = true;
    const mine = ++generation;
    set({ status: 'restoring', record });
    const fail = (reason: 'noPlaylistRow' | 'rowChanged' | 'missingPlaylist' | 'loadFailed') => {
      if (!disposed && mine === generation) set({ status: 'unavailable', record, reason });
    };
    // 没有原列表行：不擅自把歌加进任何列表，直接告诉用户恢复不了。
    if (!record.playlistGuid || record.row < 0) {
      restoring = false;
      fail('noPlaylistRow');
      return;
    }
    const page = await settle(() =>
      host.playlist.getTracks(record.playlistGuid, record.row, 1, undefined, ['handle']),
    );
    if (disposed || mine !== generation) return;
    if (!page || page.success === false) {
      restoring = false;
      fail('missingPlaylist');
      return;
    }
    const row = page.tracks[0];
    if (!row || row.handle !== record.handle) {
      restoring = false;
      fail('rowChanged');
      return;
    }
    // 先静音再起播，避免听到歌曲开头的一小段；结束后不管成败都恢复原静音状态。
    const volume = await settle(() => host.player.getVolume());
    if (disposed || mine !== generation) return;
    const wasMuted = volume && volume.success !== false ? volume.muted : false;
    const muted = await hostCommand(() => host.player.mute(true));
    if (!muted) {
      restoring = false;
      fail('loadFailed');
      return;
    }
    try {
      const played = await playKeepingQueue(
        host,
        record.playlistGuid,
        record.row,
        record.handle,
      );
      if (!played) {
        fail('loadFailed');
        return;
      }
      const loaded = await waitForTrack(record, mine);
      if (disposed || mine !== generation) return;
      if (!loaded) {
        fail('loadFailed');
        return;
      }
      const seeked = await hostCommand(() => host.player.seek(record.position));
      if (!seeked) {
        fail('loadFailed');
        return;
      }
      if (!disposed && mine === generation) {
        consumed = true;
        set({ status: 'idle' });
      }
    } finally {
      if (!wasMuted) await hostCommand(() => host.player.mute(false));
      restoring = false;
    }
  }

  /**
   * 宿主自己从头播放了上次那首：第一次按播放时先定位到记录位置再继续。只在这一轮启动里做一次；
   * 已经在记录位置附近、暂停在别处（用户自己拖过）都不抢。
   */
  async function resumeAtRecord(record: PlaybackRecoveryRecord): Promise<void> {
    consumed = true;
    const seeked = await hostCommand(() => host.player.seek(record.position));
    if (seeked) await hostCommand(() => host.player.play());
  }

  function interceptPlay(): boolean {
    const current = state();
    if (disposed || restoring) return false;
    const live = store.get(deps.playback);
    // 宿主已经装着曲目：只接同一首「从头开始」的那一次，别的一律照常交给播放服务。
    if (live.track) {
      if (!startupTarget || startupTarget.key !== trackKeyOf(live.track)) return false;
      if (live.state === 'playing') return false;
      if (
        !consumed &&
        live.state === 'paused' &&
        Math.abs(live.position - startupTarget.position) > RESTORE_POSITION_TOLERANCE_S
      ) {
        const record = startupTarget;
        startupTarget = null;
        void resumeAtRecord(record);
        return true;
      }
      return false;
    }
    // 停止后没有任何当前曲目：恢复栏的播放键按原列表行恢复。
    if (current.status === 'pending' || current.status === 'unavailable' || current.status === 'failed') {
      void restore(current.record);
      return true;
    }
    return false;
  }

  async function restoreSaved(): Promise<void> {
    if (disposed) return;
    const answer = await settle(() => host.config.get(RECOVERY_KEY));
    if (disposed || !answer || answer.success === false) return;
    writable = true;
    const record = answer.found ? parseRecoveryRecord(answer.value) : undefined;
    if (!record) return;
    saved = record;
    latest = record;
    // 没有原列表行：不用等用户点播放，先把「无法恢复」写出来。
    if (!record.playlistGuid || record.row < 0) {
      set({ status: 'unavailable', record, reason: 'noPlaylistRow' });
      return;
    }
    // 宿主自己在播时恢复栏也让位给正常播放栏；播放键的「定位到记录」只在暂停且位置不符时接手。
    if (!store.get(deps.playback).track) set({ status: 'pending', record });
    else if (!consumed) {
      startupTarget = record;
      set({ status: 'pending', record });
    }
  }

  const off = store.sub(deps.playback, follow);
  let markReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  void (async () => {
    const arrived = await waiter.done;
    if (disposed || !arrived) {
      markReady();
      return;
    }
    connected = true;
    await restoreSaved();
    if (disposed) {
      markReady();
      return;
    }
    offs.push(
      host.on('playback:trackChanged', () => follow(true)),
      host.on('playback:paused', () => follow(true)),
      host.on('playback:stopped', () => follow(true)),
      host.on('playback:seeked', () => {
        // 用户拖过进度：启动时读回的位置不再是要恢复的目标。
        startupTarget = null;
        follow(true);
      }),
      host.on('app:beforeQuit', () => {
        const record = startupTarget ?? latest ?? saved;
        if (record) void deps.writer.set(RECOVERY_KEY, record, lifetime.signal);
      }),
    );
    follow();
    markReady();
  })();

  return {
    ready,
    state: playbackRecoveryAtom,
    interceptPlay,
    retry() {
      const current = state();
      if (current.status === 'unavailable' || current.status === 'failed')
        void restore(current.record);
    },
    dispose() {
      disposed = true;
      generation += 1;
      waiter.cancel();
      clearTimeout(timer);
      off();
      for (const stop of offs.splice(0)) stop();
    },
  };
}
