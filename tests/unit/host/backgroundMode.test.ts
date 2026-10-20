import { createStore } from 'jotai/vanilla';
import { describe, expect, it } from 'vitest';
import {
  backgroundModeAtom,
  chooseBackgroundMode,
  DEFAULT_BACKGROUND_MODE,
  isBackgroundSuspended,
  isWindowHidden,
  loadBackgroundMode,
  type BackgroundMode,
} from '../../../src/host/backgroundMode.ts';
import type { PrefStorage } from '../../../src/kit/localPref.ts';

const visible = { documentVisible: true, minimized: false, focused: true };
const minimized = { documentVisible: true, minimized: true, focused: false };
const hiddenToTray = { documentVisible: false, minimized: true, focused: false };
const hostUnknown = { documentVisible: false, minimized: null, focused: false };

describe('backgroundMode', () => {
  it('缺省是"正常运行"：用户要的一直跑', () => {
    expect(DEFAULT_BACKGROUND_MODE).toBe('normal');
    const store = createStore();
    expect(store.get(backgroundModeAtom)).toBe('normal');
    expect(loadBackgroundMode(store, null)).toBe('normal');
  });

  it('读存档只认三档，认不出或存储出错都回到缺省', () => {
    const read = (storage: PrefStorage | null) => {
      const store = createStore();
      loadBackgroundMode(store, storage);
      return store.get(backgroundModeAtom);
    };
    const storage = (value: string | null) => ({ getItem: () => value, setItem: () => {} });
    expect(read(storage('eco'))).toBe('eco');
    expect(read(storage('stop'))).toBe('stop');
    expect(read(storage('normal'))).toBe('normal');
    expect(read(storage('turbo'))).toBe('normal');
    const broken = {
      getItem(): string | null {
        throw new Error('storage disabled');
      },
      setItem(): void {},
    };
    expect(read(broken)).toBe('normal');
  });

  it('改档会写回存档；同值不算改', () => {
    const saved: string[] = [];
    const storage: PrefStorage = {
      getItem: () => null,
      setItem: (key, value) => saved.push(`${key}=${value}`),
    };
    const store = createStore();
    expect(chooseBackgroundMode(store, 'eco', storage)).toBe(true);
    expect(store.get(backgroundModeAtom)).toBe('eco');
    expect(chooseBackgroundMode(store, 'eco', storage)).toBe(false);
    expect(saved).toEqual(['default-theme.background-mode.v1=eco']);
  });

  it('隐藏 = 文档不可见或最小化；宿主没连上（minimized 为 null）不算隐藏', () => {
    expect(isWindowHidden(visible)).toBe(false);
    expect(isWindowHidden(minimized)).toBe(true);
    expect(isWindowHidden(hiddenToTray)).toBe(true);
    expect(isWindowHidden(hostUnknown)).toBe(true);
    expect(isWindowHidden({ ...hostUnknown, documentVisible: true })).toBe(false);
  });

  it('只有"停止加载"且隐藏才挂起；正常与节能从不挂起', () => {
    const modes: BackgroundMode[] = ['normal', 'eco', 'stop'];
    for (const mode of modes) {
      expect(isBackgroundSuspended(mode, visible)).toBe(false);
      expect(isBackgroundSuspended(mode, minimized)).toBe(mode === 'stop');
      expect(isBackgroundSuspended(mode, hiddenToTray)).toBe(mode === 'stop');
    }
  });
});
