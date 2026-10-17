import { createStore } from 'jotai/vanilla';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConfigWriter } from '../../../src/host/configWrite.ts';
import { playbackAtom, startPlayback } from '../../../src/playback/playback.ts';
import type { PlaybackService } from '../../../src/playback/playbackContract.ts';
import {
  POSITION_SAVE_MS,
  RECOVERY_KEY,
  parseRecoveryRecord,
  playbackRecoveryAtom,
  startPlaybackRecovery,
  type PlaybackRecoveryRecord,
} from '../../../src/playback/playbackRecovery.ts';
import { createMemoryDataWriter } from '../../fixtures/dataWriter.ts';
import { guidOf } from '../../fixtures/fakePlaylists.ts';
import { makeTrack } from '../../fixtures/tracks.ts';
import { installFakeHost, type UnitHost } from '../../fixtures/unitHost.ts';

afterEach(() => {
  vi.useRealTimers();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const FEATHER = makeTrack();
const LIST = guidOf(3);

const RECORD: PlaybackRecoveryRecord = {
  key: `${FEATHER.path}|0`,
  handle: FEATHER.handle,
  title: FEATHER.title,
  artist: FEATHER.artist,
  album: FEATHER.album,
  duration: FEATHER.duration,
  position: 73,
  playlistGuid: LIST,
  row: 4,
};

/** 一台正在播 `FEATHER` 的宿主，`getCurrentTrackIndex` 报原列表第 4 行。 */
function playingHost(options: { position?: number; state?: 'playing' | 'paused' } = {}): UnitHost {
  const host = installFakeHost();
  host.answer('playback.getState', {
    success: true,
    state: options.state ?? 'playing',
    canSeek: true,
    canPause: true,
  });
  host.answer('playback.getCurrentTrack', { success: true, found: true, track: FEATHER });
  host.answer('playback.getPosition', {
    success: true,
    hostTime: Date.now(),
    position: options.position ?? 10,
    duration: FEATHER.duration,
    subsong: 0,
    path: FEATHER.path,
  });
  host.answer('playback.getCurrentTrackIndex', {
    success: true,
    found: true,
    playlist: 0,
    playlistGuid: LIST,
    index: 4,
  });
  host.answer('playlist.getTracks', (params) => ({
    success: true,
    playlist: 0,
    playlistGuid: LIST,
    start: Number(params['start'] ?? 0),
    count: 1,
    total: 10,
    tracks: [{ handle: FEATHER.handle, index: Number(params['start'] ?? 0) }],
  }));
  return host;
}

async function start(host: UnitHost) {
  const store = createStore();
  const writer = createConfigWriter(host.fb, createMemoryDataWriter().writer);
  const playback: PlaybackService = startPlayback(store, host.fb);
  const recovery = startPlaybackRecovery(store, { playback: playbackAtom, writer, pollMs: 1 }, host.fb);
  playback.setPlayInterceptor(() => recovery.interceptPlay());
  await playback.ready;
  await recovery.ready;
  await settle();
  return {
    store,
    playback,
    recovery,
    state: () => store.get(playbackRecoveryAtom),
    dispose: () => {
      recovery.dispose();
      playback.dispose();
    },
  };
}

describe('parseRecoveryRecord', () => {
  it('收下完整记录；缺字段、类型不对、进度为负都当没存过', () => {
    expect(parseRecoveryRecord(RECORD)).toEqual(RECORD);
    expect(parseRecoveryRecord({ ...RECORD, position: -1 })).toBeUndefined();
    expect(parseRecoveryRecord({ ...RECORD, key: '' })).toBeUndefined();
    expect(parseRecoveryRecord({ ...RECORD, row: '4' })).toBeUndefined();
    expect(parseRecoveryRecord(null)).toBeUndefined();
    expect(parseRecoveryRecord([])).toBeUndefined();
  });
});

describe('startPlaybackRecovery', () => {
  it('换曲时记下曲目、原列表 GUID 与行、进度，并落盘', async () => {
    const host = playingHost({ position: 42 });
    const { dispose } = await start(host);
    try {
      // 宿主自己在播时不显示恢复栏；记录照常落盘。
      expect(host.config.get(RECOVERY_KEY)).toMatchObject({
        key: RECORD.key,
        handle: FEATHER.handle,
        playlistGuid: LIST,
        row: 4,
      });
    } finally {
      dispose();
    }
  });

  it('暂停与主动停止都不清记录；停止后播放栏照旧收掉，下次启动再从记录恢复', async () => {
    const host = playingHost();
    const { state, dispose } = await start(host);
    try {
      host.answer('playback.getState', { success: true, state: 'paused', canSeek: true, canPause: true });
      host.emit('playback:paused', { paused: true });
      await settle();
      // 暂停时当前曲目还在，仍由正常播放栏显示。
      expect(state().status).toBe('idle');
      host.answer('playback.getState', {
        success: true,
        state: 'stopped',
        canSeek: false,
        canPause: false,
      });
      host.answer('playback.getCurrentTrack', { success: true, found: false });
      host.emit('playback:stopped', { reason: 'user' });
      await settle();
      expect(host.callsTo('playback.playOrPause')).toEqual([]);
      expect(host.config.get(RECOVERY_KEY)).toMatchObject({ handle: FEATHER.handle });
    } finally {
      dispose();
    }
  });

  it('进度按最短间隔合并，最后一次仍会写到最新位置', async () => {
    const host = playingHost({ position: 10 });
    const { dispose } = await start(host);
    try {
      const writes = host.callsTo('config.set').length;
      for (const position of [12, 14, 16, 18]) {
        host.emit('playback:timeHighRes', { position, hostTime: Date.now() });
      }
      await settle();
      expect(host.callsTo('config.set').length).toBe(writes);
      await vi.waitFor(
        () =>
          expect((host.config.get(RECOVERY_KEY) as { position: number }).position).toBe(18),
        { timeout: POSITION_SAVE_MS + 2000 },
      );
    } finally {
      dispose();
    }
  }, 12_000);

  it('按 GUID 与原行核对后静音、播放、定位，再恢复静音', async () => {
    const host = installFakeHost({ config: { [RECOVERY_KEY]: RECORD } });
    host.answer('playback.getVolume', {
      success: true,
      volume: 80,
      volumeDb: -8,
      muted: false,
      isMuted: false,
    });
    // 起播前宿主没有当前曲目；playTrack 之后才装载。
    let loaded = false;
    host.answer('playback.getCurrentTrack', () =>
      loaded
        ? { success: true, found: true, track: FEATHER }
        : { success: true, found: false },
    );
    host.answer('playlist.playTrack', () => {
      loaded = true;
      return { success: true };
    });
    host.answer('playlist.getTracks', (params) => ({
      success: true,
      playlist: 0,
      playlistGuid: LIST,
      start: Number(params['start'] ?? 0),
      count: 1,
      total: 10,
      tracks: [{ handle: FEATHER.handle, index: 4 }],
    }));
    const { state, playback, dispose } = await start(host);
    try {
      expect(state()).toMatchObject({ status: 'pending' });
      // 播放键被恢复服务接手，不再发宿主的播放 / 暂停命令。
      void playback.playOrPause();
      await vi.waitFor(() => expect(host.callsTo('playback.setPosition').length).toBe(1));
      expect(host.callsTo('playback.playOrPause')).toEqual([]);
      expect(host.callsTo('playlist.playTrack').at(-1)).toMatchObject({
        playlistGuid: LIST,
        index: 4,
      });
      expect(host.callsTo('playback.mute').map((call) => call['muted'])).toEqual([true, false]);
      expect(host.callsTo('playback.setPosition').at(-1)).toMatchObject({ position: 73 });
      expect(state().status).toBe('idle');
    } finally {
      dispose();
    }
  });

  it('原行已换成别的曲目时答不可恢复，不播放也不改写列表', async () => {
    const host = installFakeHost({ config: { [RECOVERY_KEY]: RECORD } });
    host.answer('playlist.getTracks', (params) => ({
      success: true,
      playlist: 0,
      playlistGuid: LIST,
      start: Number(params['start'] ?? 0),
      count: 1,
      total: 10,
      tracks: [{ handle: 'E:/Music/other.flac', index: 4 }],
    }));
    const { state, playback, dispose } = await start(host);
    try {
      void playback.playOrPause();
      await vi.waitFor(() => expect(state().status).toBe('unavailable'));
      expect(state()).toMatchObject({ reason: 'rowChanged' });
      expect(host.callsTo('playlist.playTrack')).toEqual([]);
      expect(host.callsTo('playback.mute')).toEqual([]);
    } finally {
      dispose();
    }
  });

  it('没有原列表行时答不可恢复，不把歌加进列表', async () => {
    const host = installFakeHost({
      config: { [RECOVERY_KEY]: { ...RECORD, playlistGuid: '', row: -1 } },
    });
    const { state, playback, dispose } = await start(host);
    try {
      void playback.playOrPause();
      await vi.waitFor(() => expect(state().status).toBe('unavailable'));
      expect(state()).toMatchObject({ reason: 'noPlaylistRow' });
      expect(host.callsTo('playlist.playTrack')).toEqual([]);
      expect(host.callsTo('playback.playPath')).toEqual([]);
    } finally {
      dispose();
    }
  });

  it('宿主自己从头播放上次那首：第一次按播放先定位再继续', async () => {
    const host = installFakeHost({ config: { [RECOVERY_KEY]: RECORD } });
    host.answer('playback.getState', { success: true, state: 'paused', canSeek: true, canPause: true });
    host.answer('playback.getCurrentTrack', { success: true, found: true, track: FEATHER });
    host.answer('playback.getPosition', {
      success: true,
      hostTime: Date.now(),
      position: 3,
      duration: FEATHER.duration,
      subsong: 0,
      path: FEATHER.path,
    });
    const { playback, dispose } = await start(host);
    try {
      void playback.playOrPause();
      await vi.waitFor(() => expect(host.callsTo('playback.play').length).toBe(1));
      expect(host.callsTo('playback.setPosition').at(-1)).toMatchObject({ position: 73 });
      expect(host.callsTo('playback.playOrPause')).toEqual([]);
      // 只接手一次：第二次按播放照常发给宿主。
      void playback.playOrPause();
      await vi.waitFor(() => expect(host.callsTo('playback.playOrPause').length).toBe(1));
    } finally {
      dispose();
    }
  });
});
