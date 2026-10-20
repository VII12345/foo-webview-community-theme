import { createStore } from 'jotai/vanilla';
import { describe, expect, it } from 'vitest';
import {
  chooseImmersivePlacement,
  immersivePlacementsAtom,
  loadImmersivePlacements,
  placementKey,
  resetImmersivePlacement,
  resetImmersivePlacementGroup,
} from '../../../../src/immersive/layout/immersivePlacement.ts';
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

describe('沉浸组件摆放存档', () => {
  it('没存过时是空的：所有组件沿用默认盒子', () => {
    const store = createStore();
    loadImmersivePlacements(store, fakeStorage().storage);
    expect(store.get(immersivePlacementsAtom)).toEqual({ version: 1, groups: {} });
  });

  it('挪一个组件只写这一项，读回来还在', () => {
    const { storage, map } = fakeStorage();
    const store = createStore();
    loadImmersivePlacements(store, storage);
    chooseImmersivePlacement(store, 'paper', 'full', 'right.header.title', { x: 1200, y: 200 }, storage);
    expect(map.get('default-theme.immersive.layout.v1')).toContain('right.header.title');
    const again = createStore();
    loadImmersivePlacements(again, storage);
    expect(again.get(immersivePlacementsAtom).groups['paper/full']?.['right.header.title']).toEqual({
      x: 1200,
      y: 200,
    });
  });

  it('改大小与次序也存得下', () => {
    const { storage } = fakeStorage();
    const store = createStore();
    loadImmersivePlacements(store, storage);
    chooseImmersivePlacement(
      store,
      'paper',
      'full',
      'right.spectrum',
      { w: 800, h: 180, order: 2 },
      storage,
    );
    expect(
      store.get(immersivePlacementsAtom).groups['paper/full']?.['right.spectrum'],
    ).toEqual({ w: 800, h: 180, order: 2 });
  });

  it('单个恢复默认与整组恢复默认', () => {
    const { storage } = fakeStorage();
    const store = createStore();
    loadImmersivePlacements(store, storage);
    chooseImmersivePlacement(store, 'paper', 'full', 'right.spectrum', { x: 10 }, storage);
    chooseImmersivePlacement(store, 'paper', 'full', 'right.waveform', { x: 20 }, storage);
    resetImmersivePlacement(store, 'paper', 'full', 'right.spectrum', storage);
    expect(
      store.get(immersivePlacementsAtom).groups['paper/full']?.['right.spectrum'],
    ).toBeUndefined();
    expect(
      store.get(immersivePlacementsAtom).groups['paper/full']?.['right.waveform'],
    ).toEqual({ x: 20 });
    resetImmersivePlacementGroup(store, 'paper', 'full', storage);
    expect(store.get(immersivePlacementsAtom).groups['paper/full']).toBeUndefined();
  });

  it('卡片两档不分档位，一律记在 full 组下', () => {
    expect(placementKey('card', 'full')).toBe('card/full');
    expect(placementKey('cardLyrics', 'compact')).toBe('cardLyrics/full');
    expect(placementKey('paper', 'compact')).toBe('paper/compact');
  });

  it('坏存档回空：认不出的模块与不认得的版本都丢掉', () => {
    const store = createStore();
    loadImmersivePlacements(
      store,
      fakeStorage({
        'default-theme.immersive.layout.v1': JSON.stringify({
          version: 2,
          groups: { 'paper/full': { 'right.spectrum': { x: 1 } } },
        }),
      }).storage,
    );
    expect(store.get(immersivePlacementsAtom).groups).toEqual({});

    const other = createStore();
    loadImmersivePlacements(
      other,
      fakeStorage({
        'default-theme.immersive.layout.v1': JSON.stringify({
          version: 1,
          groups: { 'paper/full': { 'not.a.panel': { x: 1 }, 'right.spectrum': { x: 'no' } } },
        }),
      }).storage,
    );
    expect(other.get(immersivePlacementsAtom).groups).toEqual({});
  });
});
