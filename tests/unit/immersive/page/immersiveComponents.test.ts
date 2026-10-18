import { createStore } from 'jotai/vanilla';
import { describe, expect, it } from 'vitest';
import {
  chooseImmersiveComponent,
  hiddenModulesFor,
  IMMERSIVE_COMPONENTS_KEY,
  immersiveComponentsAtom,
  loadImmersiveComponents,
  panelsFor,
  readImmersiveComponents,
} from '../../../../src/immersive/page/immersiveComponents.ts';

function memory(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

describe('沉浸组件可见性', () => {
  it('默认全部可见，未知存档与坏版本回默认', () => {
    expect(readImmersiveComponents(null)).toEqual({ version: 1, hidden: {} });
    expect(
      readImmersiveComponents(memory({ [IMMERSIVE_COMPONENTS_KEY]: '{' })),
    ).toEqual({ version: 1, hidden: {} });
    expect(
      readImmersiveComponents(
        memory({ [IMMERSIVE_COMPONENTS_KEY]: JSON.stringify({ version: 2, hidden: {} }) }),
      ),
    ).toEqual({ version: 1, hidden: {} });
  });

  it('逐组解析字符串数组、去重并保留未知模块', () => {
    const value = readImmersiveComponents(
      memory({
        [IMMERSIVE_COMPONENTS_KEY]: JSON.stringify({
          version: 1,
          hidden: {
            'paper/full': ['right.spectrum', 'right.spectrum', 'future.panel', 3],
            'paper/compact': 'bad',
          },
        }),
      }),
    );
    expect(hiddenModulesFor(value, 'paper', 'full')).toEqual(
      new Set(['right.spectrum', 'future.panel']),
    );
    expect(hiddenModulesFor(value, 'paper', 'compact')).toEqual(new Set());
  });

  it('切换只改当前视图/档位，空组删除，并写回存储', () => {
    const store = createStore();
    const storage = memory();
    const first = chooseImmersiveComponent(
      store,
      'paper',
      'full',
      'right.spectrum',
      false,
      storage,
    );
    expect(first).toBe(true);
    expect(hiddenModulesFor(store.get(immersiveComponentsAtom), 'paper', 'full')).toEqual(
      new Set(['right.spectrum']),
    );
    expect(hiddenModulesFor(store.get(immersiveComponentsAtom), 'paper', 'compact')).toEqual(
      new Set(),
    );
    chooseImmersiveComponent(store, 'paper', 'full', 'right.spectrum', true, storage);
    expect(JSON.parse(storage.values.get(IMMERSIVE_COMPONENTS_KEY) ?? '{}')).toEqual({
      version: 1,
      hidden: {},
    });
  });

  it('20 组按视图/档位给出可用模块；卡片只有 full 且不混入罗盘', () => {
    for (const scene of ['paper', 'focus', 'lyrics'] as const) {
      for (const tier of [
        'full',
        'compact',
        'narrow',
        'portrait',
        'portrait-compact',
        'portrait-narrow',
      ] as const) {
        expect(panelsFor(scene, tier).has('dial.cover')).toBe(true);
        expect(panelsFor(scene, tier).has('right.lyrics')).toBe(true);
        expect(panelsFor(scene, tier).has('dial.rings')).toBe(tier !== 'narrow');
      }
    }
    for (const scene of ['card', 'cardLyrics'] as const) {
      const panels = panelsFor(scene, 'full');
      expect(panels.has('card.cover')).toBe(true);
      expect(panels.has('card.title')).toBe(scene === 'cardLyrics');
      expect(panels.has('dial.cover')).toBe(false);
      expect(panels.has('right.header')).toBe(scene === 'card');
    }
    expect(panelsFor('paper', 'full').has('right.meter')).toBe(true);
    expect(panelsFor('paper', 'compact').has('right.meter')).toBe(false);
    expect(panelsFor('paper', 'narrow').has('right.spectrum')).toBe(true);
    expect(panelsFor('focus', 'narrow').has('right.fileInfo')).toBe(false);
    expect(panelsFor('paper', 'portrait').has('right.fileInfo')).toBe(true);
  });

  it('load 把存档读进 store', () => {
    const store = createStore();
    const storage = memory({
      [IMMERSIVE_COMPONENTS_KEY]: JSON.stringify({
        version: 1,
        hidden: { 'paper/full': ['right.waveform'] },
      }),
    });
    loadImmersiveComponents(store, storage);
    expect(hiddenModulesFor(store.get(immersiveComponentsAtom), 'paper', 'full')).toEqual(
      new Set(['right.waveform']),
    );
  });
});
