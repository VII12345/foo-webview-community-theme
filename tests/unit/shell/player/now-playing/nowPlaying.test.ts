import type { Track } from 'foo-webview-sdk';
import { atom, createStore, type Atom } from 'jotai/vanilla';
import { describe, expect, it } from 'vitest';
import {
  displayTitle,
  nowPlayingAtom,
  startNowPlaying,
} from '../../../../../src/shell/player/now-playing/nowPlaying.ts';
import type { RecoveryView } from '../../../../../src/shell/player/recoveryTrack.ts';
import { startPlayback } from '../../../../../src/playback/playback.ts';
import { FORMAT_PATTERN } from '../../../../../src/track/trackFormat.ts';
import { hostFailure } from '../../../../fixtures/hostAnswers.ts';
import { makeTrack } from '../../../../fixtures/tracks.ts';
import { installFakeHost, type UnitHost } from '../../../../fixtures/unitHost.ts';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const FEATHER = makeTrack();
const LUV = makeTrack({
  path: 'file://E:/Music/Nujabes/Modal Soul/04 Luv (sic).flac',
  title: 'Luv (sic) Part 3',
});

function cover(path: string) {
  return {
    success: true as const,
    available: true,
    type: 'front',
    path,
    dataUrl: `fb2k://artwork/?path=${encodeURIComponent(path)}`,
  };
}

function evaluated(result: string, infoAvailable = true) {
  return { success: true as const, path: '', pattern: FORMAT_PATTERN, result, infoAvailable };
}

async function start(host: UnitHost, ratio = 1, recovery?: Atom<RecoveryView | null>) {
  const store = createStore();
  const playback = startPlayback(store, host.fb);
  const nowPlaying = startNowPlaying(store, host.fb, () => ratio, recovery);
  await playback.ready;
  await settle();
  const play = async (track: Track) => {
    host.emit('playback:trackChanged', track);
    await settle();
  };
  return { store, play, nowPlaying, state: () => store.get(nowPlayingAtom) };
}

const RECORD = {
  key: `${FEATHER.path}|0`,
  handle: FEATHER.handle,
  title: FEATHER.title,
  artist: FEATHER.artist,
  album: FEATHER.album,
  duration: FEATHER.duration,
  position: 42,
  playlistGuid: '{00000000-0000-0000-0000-000000000001}',
  row: 0,
};

const recoveryView = (status: RecoveryView['status'] = 'pending'): RecoveryView => ({
  status,
  record: RECORD,
});

describe('displayTitle', () => {
  it('有标题写标题，没有时写去掉扩展名的文件名', () => {
    expect(displayTitle(FEATHER)).toBe('Feather');
    expect(displayTitle({ title: '', path: 'file://E:/Music/Nujabes/02 Ordinary Joe.flac' })).toBe(
      '02 Ordinary Joe',
    );
    expect(displayTitle({ title: '', path: 'http://radio.example/stream' })).toBe('stream');
  });
});

describe('startNowPlaying', () => {
  it('换曲时按像素比取一次封面、求一次格式；编辑同一首不重取', async () => {
    const host = installFakeHost();
    host.answer('artwork.getFb2kUrlByPath', (params) => cover(String(params['path'])));
    host.answer('titleformat.eval', evaluated('lossless|24'));
    const { play, state } = await start(host, 3);
    await play(FEATHER);
    expect(host.callsTo('artwork.getFb2kUrlByPath')).toEqual([
      { path: FEATHER.path, type: 'front', maxSize: 256 },
    ]);
    expect(host.callsTo('titleformat.eval')).toEqual([{ pattern: FORMAT_PATTERN }]);
    expect(state()).toEqual({
      key: `${FEATHER.path}|0`,
      cover: cover(FEATHER.path).dataUrl,
      format: { lossless: true, bits: 24 },
    });

    host.emit('playback:edited', { ...FEATHER, title: 'Feather (edit)' });
    await settle();
    expect(host.callsTo('artwork.getFb2kUrlByPath')).toHaveLength(1);
    expect(host.callsTo('titleformat.eval')).toHaveLength(1);
  });

  it('换曲后新封面到手之前留着上一首的，格式先报还在取', async () => {
    const host = installFakeHost();
    host.answer('artwork.getFb2kUrlByPath', (params) => cover(String(params['path'])));
    host.answer('titleformat.eval', evaluated('lossless|16'));
    const { play, state } = await start(host);
    await play(FEATHER);
    const covers = host.hold('artwork.getFb2kUrlByPath');
    const formats = host.hold('titleformat.eval');
    await play(LUV);
    expect(state()).toEqual({
      key: `${LUV.path}|0`,
      cover: cover(FEATHER.path).dataUrl,
      format: 'pending',
    });
    covers.release();
    formats.release();
    await settle();
    expect(state().cover).toBe(cover(LUV.path).dataUrl);
  });

  it('上一首的应答晚到一律丢掉', async () => {
    const host = installFakeHost();
    const covers = host.hold('artwork.getFb2kUrlByPath');
    const formats = host.hold('titleformat.eval');
    const { play, state } = await start(host);
    await play(FEATHER);
    await play(LUV);
    expect(covers.pending).toHaveLength(2);
    covers.respond(1, cover(LUV.path));
    formats.respond(1, evaluated('lossy|16'));
    await settle();
    covers.respond(0, cover(FEATHER.path));
    formats.respond(0, evaluated('lossless|24'));
    await settle();
    expect(state()).toEqual({
      key: `${LUV.path}|0`,
      cover: cover(LUV.path).dataUrl,
      format: { lossless: false, bits: 16 },
    });
  });

  it('取地址失败、求值失败或信息不可信时，封面退成占位、格式记为取不到', async () => {
    const host = installFakeHost();
    host.answer('artwork.getFb2kUrlByPath', hostFailure('INVALID_PARAMS'));
    host.answer('titleformat.eval', hostFailure('NO_ACTIVE_ITEM'));
    const { play, state } = await start(host);
    await play(FEATHER);
    expect(state()).toMatchObject({ cover: null, format: 'failed' });

    host.answer('titleformat.eval', evaluated('lossless|16', false));
    await play(LUV);
    expect(state().format).toBe('failed');
  });

  it('停止后回到没有曲目，路上的应答也不再落下', async () => {
    const host = installFakeHost();
    const { play, state } = await start(host);
    const covers = host.hold('artwork.getFb2kUrlByPath');
    await play(FEATHER);
    host.emit('playback:stopped', { reason: 'user' });
    await settle();
    covers.respond(0, cover(FEATHER.path));
    await settle();
    expect(state()).toEqual({ key: '', cover: null, format: 'failed' });
  });

  it('释放之后应答晚到也不写状态', async () => {
    const host = installFakeHost();
    const covers = host.hold('artwork.getFb2kUrlByPath');
    const { play, state, nowPlaying } = await start(host);
    await play(FEATHER);
    nowPlaying.dispose();
    covers.respond(0, cover(FEATHER.path));
    await settle();
    expect(state().cover).toBeNull();
  });

  it('没有当前曲目但有恢复记录：按记录 handle 取封面，不向宿主求格式', async () => {
    const host = installFakeHost();
    host.answer('artwork.getFb2kUrlByPath', (params) => cover(String(params['path'])));
    const recovery = atom<RecoveryView | null>(recoveryView());
    const { state } = await start(host, 2, recovery);
    expect(host.callsTo('artwork.getFb2kUrlByPath')).toEqual([
      { path: RECORD.handle, type: 'front', maxSize: 256 },
    ]);
    expect(host.callsTo('titleformat.eval')).toEqual([]);
    expect(state()).toEqual({
      key: RECORD.key,
      cover: cover(RECORD.handle).dataUrl,
      format: 'failed',
    });
  });

  it('恢复记录 handle 取不到封面时，用 key 里还原的路径重试', async () => {
    const host = installFakeHost();
    host.answer('artwork.getFb2kUrlByPath', (params) =>
      String(params['path']) === RECORD.handle ? hostFailure('NOT_FOUND') : cover(String(params['path'])),
    );
    const recovery = atom<RecoveryView | null>(recoveryView());
    const { state } = await start(host, 1, recovery);
    expect(host.callsTo('artwork.getFb2kUrlByPath').map((call) => call['path'])).toEqual([
      RECORD.handle,
      FEATHER.path,
    ]);
    expect(state().cover).toBe(cover(FEATHER.path).dataUrl);
  });

  it('恢复后同一首变成 live：补一次格式，封面不退回占位', async () => {
    const host = installFakeHost();
    host.answer('artwork.getFb2kUrlByPath', (params) => cover(String(params['path'])));
    host.answer('titleformat.eval', evaluated('lossless|24'));
    const recovery = atom<RecoveryView | null>(recoveryView());
    const { play, state } = await start(host, 1, recovery);
    expect(state().format).toBe('failed');
    await play(FEATHER);
    expect(host.callsTo('titleformat.eval')).toEqual([{ pattern: FORMAT_PATTERN }]);
    expect(state()).toMatchObject({
      key: RECORD.key,
      cover: cover(FEATHER.path).dataUrl,
      format: { lossless: true, bits: 24 },
    });
  });

  it('恢复记录离开后回到初始状态', async () => {
    const host = installFakeHost();
    host.answer('artwork.getFb2kUrlByPath', (params) => cover(String(params['path'])));
    const recovery = atom<RecoveryView | null>(recoveryView());
    const { store, state } = await start(host, 1, recovery);
    expect(state().key).toBe(RECORD.key);
    store.set(recovery, null);
    await settle();
    expect(state()).toEqual({ key: '', cover: null, format: 'failed' });
  });
});
