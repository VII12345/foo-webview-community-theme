import type { Track } from 'foo-webview-sdk';
import { atom, type Atom } from 'jotai/vanilla';
import type { MessageKey } from '../../i18n/en.ts';
import {
  playbackRecoveryAtom,
  type PlaybackRecoveryRecord,
  type RecoveryState,
} from '../../playback/playbackRecovery.ts';

/** 恢复栏亮着的时候：没有当前曲目、但有上次播放的记录可接着播。 */
export type RecoveryView = {
  readonly status: 'pending' | 'restoring' | 'unavailable' | 'failed';
  readonly record: PlaybackRecoveryRecord;
  readonly reason?: 'noPlaylistRow' | 'rowChanged' | 'missingPlaylist' | 'loadFailed';
};

/** 播放栏三种形态共读：要不要换成恢复栏、恢复栏写哪一首。 */
export const recoveryViewAtom: Atom<RecoveryView | null> = atom((get) => {
  const state: RecoveryState = get(playbackRecoveryAtom);
  if (state.status === 'idle') return null;
  return {
    status: state.status,
    record: state.record,
    ...(state.status === 'unavailable' ? { reason: state.reason } : {}),
  };
});

/**
 * 恢复记录拼成播放栏能用的曲目行：只有标题、艺人、专辑、时长与句柄有意义，其余字段留空。
 * 播放栏里的封面、评分与菜单都按「正在播放」那一首取，没有当前曲目时自然不亮。
 */
export function recoveryTrack(record: PlaybackRecoveryRecord): Track {
  return {
    handle: record.handle,
    path: record.handle,
    absolutePath: record.handle,
    subsong: 0,
    title: record.title,
    artist: record.artist,
    artists: record.artist ? [record.artist] : [],
    album: record.album,
    albumArtist: '',
    albumArtists: [],
    genre: '',
    date: '',
    trackNumber: 0,
    discNumber: 0,
    duration: record.duration,
    fileSize: -1,
    bitrate: 0,
    sampleRate: 0,
    channels: 0,
    codec: '',
    rating: 0,
  };
}

/** 恢复不可用时给用户看的原因。 */
export function recoveryNoticeKey(view: RecoveryView): MessageKey | null {
  if (view.status === 'restoring') return 'recovery.restoring';
  if (view.status !== 'unavailable' && view.status !== 'failed') return null;
  switch (view.reason) {
    case 'noPlaylistRow':
      return 'recovery.noPlaylistRow';
    case 'rowChanged':
      return 'recovery.rowChanged';
    case 'missingPlaylist':
      return 'recovery.missingPlaylist';
    default:
      return 'recovery.failed';
  }
}
