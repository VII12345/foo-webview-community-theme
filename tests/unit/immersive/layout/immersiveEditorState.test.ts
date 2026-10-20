import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EDITOR_STATE,
  IMMERSIVE_EDITOR_STATE_KEY,
  readImmersiveEditorState,
  writeImmersiveEditorState,
} from '../../../../src/immersive/layout/immersiveEditorState.ts';
import type { PrefStorage } from '../../../../src/kit/localPref.ts';

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  const storage: PrefStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
  return { storage, map };
}

describe('编排器的操作位置存档', () => {
  it('没存过时给缺省', () => {
    expect(readImmersiveEditorState(fakeStorage().storage)).toEqual(DEFAULT_EDITOR_STATE);
  });

  it('视图、布局、缩放与选中项都存得下，读回来还在', () => {
    const { storage, map } = fakeStorage();
    writeImmersiveEditorState(
      {
        version: 1,
        view: 'cardLyrics',
        layout: 'compact',
        zoom: '2',
        selected: 'right.lyrics',
      },
      storage,
    );
    expect(map.has(IMMERSIVE_EDITOR_STATE_KEY)).toBe(true);
    expect(readImmersiveEditorState(storage)).toEqual({
      version: 1,
      view: 'cardLyrics',
      layout: 'compact',
      zoom: '2',
      selected: 'right.lyrics',
    });
  });

  it('认不出的值按缺省读：旧场景名、旧档位名、不是组件的 id', () => {
    const { storage } = fakeStorage({
      [IMMERSIVE_EDITOR_STATE_KEY]: JSON.stringify({
        version: 1,
        view: 'oldScene',
        layout: 'huge',
        zoom: '3',
        selected: 'not.a.panel',
      }),
    });
    // 视图、档位、缩放认不出来就整份按缺省读。
    expect(readImmersiveEditorState(storage)).toEqual(DEFAULT_EDITOR_STATE);

    const partial = fakeStorage({
      [IMMERSIVE_EDITOR_STATE_KEY]: JSON.stringify({
        version: 1,
        view: 'lyrics',
        layout: 'portrait',
        zoom: 'fit',
        selected: 'not.a.panel',
      }),
    });
    // 其余认得出来时只把认不出的那项丢掉。
    expect(readImmersiveEditorState(partial.storage)).toEqual({
      version: 1,
      view: 'lyrics',
      layout: 'portrait',
      zoom: 'fit',
      selected: null,
    });
  });

  it('版本不对的存档整份不要', () => {
    const { storage } = fakeStorage({
      [IMMERSIVE_EDITOR_STATE_KEY]: JSON.stringify({
        version: 2,
        view: 'lyrics',
        layout: 'full',
        zoom: 'fit',
        selected: 'right.lyrics',
      }),
    });
    expect(readImmersiveEditorState(storage)).toEqual(DEFAULT_EDITOR_STATE);
  });

  it('不是 JSON 的存档按缺省读', () => {
    const { storage } = fakeStorage({ [IMMERSIVE_EDITOR_STATE_KEY]: 'not json' });
    expect(readImmersiveEditorState(storage)).toEqual(DEFAULT_EDITOR_STATE);
  });

  it('没有存储时只在内存里记，不抛', () => {
    expect(() =>
      writeImmersiveEditorState({ ...DEFAULT_EDITOR_STATE, view: 'focus' }, null),
    ).not.toThrow();
    expect(readImmersiveEditorState(null)).toEqual(DEFAULT_EDITOR_STATE);
  });
});
