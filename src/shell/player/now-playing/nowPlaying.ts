import type { Track } from 'foo-webview-sdk';
import { fb } from 'foo-webview-sdk/bridge';
import { atom, type Atom } from 'jotai/vanilla';
import { artworkRequestSize } from '../../../host/artworkSize.ts';
import { settle } from '../../../host/hostCall.ts';
import type { Store } from '../../../kit/store.ts';
import { trackDisplayTitle } from '../../../track/trackDisplayTitle.ts';
import { currentTrackAtom } from '../../../playback/playback.ts';
import { trackKeyOf } from '../../../playback/playbackContract.ts';
import {
  FORMAT_PATTERN,
  parseFormatDetail,
  type FormatReading,
} from '../../../track/trackFormat.ts';
import {
  parseRecoveryKey,
  recoveryViewAtom,
  type RecoveryView,
} from '../recoveryTrack.ts';
import { startTrackSwap } from './trackSwap.ts';

/** 播放栏里画封面的最大边长，CSS 像素：胶囊的圆形封面 48，标题栏的 44 也够用。 */
export const NOW_PLAYING_COVER_SIZE = 48;

export interface NowPlayingFace {
  artwork: Pick<typeof fb.artwork, 'getFb2kUrlByPath'>;
  titleformat: Pick<typeof fb.titleformat, 'eval'>;
}

export interface NowPlayingState {
  /** 这份状态属于哪一首，口径同 `trackKeyOf`；没有曲目时是空串。 */
  readonly key: string;
  /**
   * 封面地址；null 画占位图标。换曲后新地址到手之前留着上一首的，不先退成占位再换图；问不到地址时为
   * null。宿主只拼地址、不开文件，这一首有没有封面要等 `<img>` 加载出错才知道，由画它的组件自己退成占位。
   */
  readonly cover: string | null;
  readonly format: FormatReading;
}

const INITIAL: NowPlayingState = { key: '', cover: null, format: 'failed' };
const stateAtom = atom<NowPlayingState>(INITIAL);

export const nowPlayingAtom: Atom<NowPlayingState> = atom((get) => get(stateAtom));

export interface NowPlayingService {
  dispose(): void;
}

/** 播放栏上写的曲名：没有标题标签时用文件名（去掉扩展名），与 fb2k 的缺省显示一致。 */
export function displayTitle(track: Pick<Track, 'title' | 'path'>): string {
  return trackDisplayTitle(track);
}

function browserPixelRatio(): number {
  return typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
}

/**
 * 播放栏上显示那一首的封面地址与格式细节：有当前曲目时跟当前曲目，没有时跟恢复记录兜底；编辑标签、暂停不重取。
 * 换曲过渡要的那份记录（`trackSwap.ts`）仍只跟当前曲目：恢复记录出现不算一次换曲。
 *
 * 格式细节求的是宿主此刻正在播放的曲目，不带路径：`titleformat.eval` 不传路径时就是它，动态信息也在。
 * 恢复记录期间宿主没有活动曲目，不请求格式；恢复成功后同一首从恢复切到 live，即使身份键相同也要补一次。
 */
export function startNowPlaying(
  store: Store,
  host: NowPlayingFace = fb,
  pixelRatio: () => number = browserPixelRatio,
  recoveryAtom: Atom<RecoveryView | null> = recoveryViewAtom,
): NowPlayingService {
  store.set(stateAtom, INITIAL);
  let disposed = false;
  let generation = 0;
  let shownKey = '';
  let shownOrigin: 'live' | 'recovery' | null = null;

  const update = (mine: number, patch: Partial<NowPlayingState>) => {
    if (!disposed && mine === generation)
      store.set(stateAtom, { ...store.get(stateAtom), ...patch });
  };

  async function readCover(path: string, mine: number, fallback?: string): Promise<void> {
    const size = artworkRequestSize(NOW_PLAYING_COVER_SIZE, pixelRatio());
    const ask = async (candidate: string): Promise<string | null> => {
      if (!candidate) return null;
      const answer = await settle(() =>
        host.artwork.getFb2kUrlByPath(candidate, 'front', { maxSize: size }),
      );
      const url = answer && answer.success !== false && answer.available ? answer.dataUrl : '';
      return url || null;
    };
    let url = await ask(path);
    // 恢复记录的 handle 在 CUE/多轨文件上可能不被封面接口接受；用 key 里还原的纯路径再试一次。
    if (!url && fallback && fallback !== path) url = await ask(fallback);
    update(mine, { cover: url });
  }

  async function readFormat(mine: number): Promise<void> {
    const answer = await settle(() => host.titleformat.eval(FORMAT_PATTERN));
    const usable = answer !== null && answer.success !== false && answer.infoAvailable;
    update(mine, { format: usable ? parseFormatDetail(answer.result) : 'failed' });
  }

  /** 当前该显示哪一首：live 优先，恢复记录只兜底。 */
  function source():
    | { readonly origin: 'live'; readonly key: string; readonly track: Track }
    | { readonly origin: 'recovery'; readonly key: string; readonly record: RecoveryView['record'] }
    | null {
    const track = store.get(currentTrackAtom);
    if (track) return { origin: 'live', key: trackKeyOf(track), track };
    const view = store.get(recoveryAtom);
    return view ? { origin: 'recovery', key: view.record.key, record: view.record } : null;
  }

  function follow(): void {
    const next = source();
    if (!next) {
      shownKey = '';
      shownOrigin = null;
      if (store.get(stateAtom).key !== '' || store.get(stateAtom).cover !== null) {
        generation += 1;
        store.set(stateAtom, INITIAL);
      }
      return;
    }
    // 恢复栏每保存一次进度，recoveryViewAtom 都会给一个新对象；身份键与来源都没变就不重取。
    if (next.key === shownKey && next.origin === shownOrigin) return;
    shownKey = next.key;
    shownOrigin = next.origin;
    const mine = ++generation;
    const previous = store.get(stateAtom);
    if (next.origin === 'live') {
      store.set(stateAtom, { key: next.key, cover: previous.cover, format: 'pending' });
      void readCover(next.track.path, mine);
      void readFormat(mine);
      return;
    }
    store.set(stateAtom, { key: next.key, cover: previous.cover, format: 'failed' });
    const parsed = parseRecoveryKey(next.record.key);
    void readCover(next.record.handle, mine, parsed?.path);
  }

  const offLive = store.sub(currentTrackAtom, follow);
  const offRecovery = store.sub(recoveryAtom, follow);
  follow();
  const swaps = startTrackSwap(store);

  return {
    dispose() {
      disposed = true;
      generation += 1;
      offLive();
      offRecovery();
      swaps.dispose();
    },
  };
}
