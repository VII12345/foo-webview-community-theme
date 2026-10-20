// backgroundMode.ts — 窗口不可见时页面做多少事。
//
// 放在层 0：消费方横跨播放（层 1）、统计（层 2）、服务器（层 0）与装配（层 3），
// 只有层 0 能被所有层合法引用。可见性信号复用 windowActivityAtom（同一目录），
// 与沉浸视图、流动背景用的是同一份事实。

import { atom, type Atom } from 'jotai/vanilla';
import { choiceCodec, defineLocalPref, type PrefStorage } from '../kit/localPref.ts';
import type { Store } from '../kit/store.ts';
import { windowActivityAtom, type WindowActivityState } from './windowActivity.ts';

/** 正常：隐藏也照跑；节能：隐藏时画面停、定时器照跑；停止加载：隐藏即拆。 */
export const BACKGROUND_MODES = ['normal', 'eco', 'stop'] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

/** 默认"正常运行"：用户要的是一直跑；插件不在时页面也照常记录。 */
export const DEFAULT_BACKGROUND_MODE: BackgroundMode = 'normal';
export const BACKGROUND_MODE_STORAGE_KEY = 'default-theme.background-mode.v1';

const pref = defineLocalPref<BackgroundMode>({
  key: BACKGROUND_MODE_STORAGE_KEY,
  fallback: DEFAULT_BACKGROUND_MODE,
  ...choiceCodec(BACKGROUND_MODES),
});

export const backgroundModeAtom: Atom<BackgroundMode> = pref.atom;

export function loadBackgroundMode(store: Store, storage?: PrefStorage | null): BackgroundMode {
  return pref.load(store, storage);
}

/** 改档并写回；答改没改。 */
export function chooseBackgroundMode(
  store: Store,
  mode: BackgroundMode,
  storage?: PrefStorage | null,
): boolean {
  return pref.set(store, mode, storage);
}

/**
 * 窗口是不是不在眼前（最小化或隐藏到托盘）。
 * `minimized === null` 是宿主还没连上，不算隐藏——那时页面本来就该照常启动。
 */
export function isWindowHidden(activity: WindowActivityState): boolean {
  return !activity.documentVisible || activity.minimized === true;
}

export const windowHiddenAtom: Atom<boolean> = atom((get) =>
  isWindowHidden(get(windowActivityAtom)),
);

/** 选了"停止加载"且窗口不可见：所有后台活动都该拆掉。 */
export function isBackgroundSuspended(
  mode: BackgroundMode,
  activity: WindowActivityState,
): boolean {
  return mode === 'stop' && isWindowHidden(activity);
}

export const backgroundSuspendedAtom: Atom<boolean> = atom((get) =>
  isBackgroundSuspended(get(backgroundModeAtom), get(windowActivityAtom)),
);

/** 选了"正常运行"：隐藏时也保持数据管线。 */
export const backgroundNormalAtom: Atom<boolean> = atom(
  (get) => get(backgroundModeAtom) === 'normal',
);
