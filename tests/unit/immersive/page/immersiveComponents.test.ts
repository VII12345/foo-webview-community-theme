import { createStore } from 'jotai/vanilla';
import { describe, expect, it } from 'vitest';
import {
  chooseImmersiveComponent,
  groupVisible,
  hiddenModulesFor,
  IMMERSIVE_COMPONENTS_KEY,
  immersiveComponentsAtom,
  isLeafPanel,
  loadImmersiveComponents,
  moduleHidden,
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

  it('父 ID 继续隐藏整组，叶子只隐藏自己', () => {
    const parentHidden = new Set(['right.header']);
    expect(moduleHidden(parentHidden, 'right.header.from')).toBe(true);
    expect(moduleHidden(parentHidden, 'right.header.title')).toBe(true);
    expect(moduleHidden(parentHidden, 'right.meter.stereo')).toBe(false);

    const leafHidden = new Set(['right.header.from']);
    expect(moduleHidden(leafHidden, 'right.header.from')).toBe(true);
    expect(moduleHidden(leafHidden, 'right.header.title')).toBe(false);
    expect(groupVisible('paper', 'full', leafHidden, 'right.header')).toBe(true);
    expect(groupVisible('paper', 'full', parentHidden, 'right.header')).toBe(false);
  });

  it('父组只看可用子项：整组隐藏才让布局收起，单个叶子隐藏仍保留行', () => {
    const onlyOne = new Set([
      'right.meter.stereo',
      'right.meter.bpm',
      'right.meter.soundPressure',
      'right.meter.albumArtist',
    ]);
    expect(groupVisible('paper', 'full', onlyOne, 'right.meter')).toBe(true);
    const all = new Set([
      'right.meter.stereo',
      'right.meter.bpm',
      'right.meter.soundPressure',
      'right.meter.albumArtist',
      'right.meter.duration',
    ]);
    expect(groupVisible('paper', 'full', all, 'right.meter')).toBe(false);
    // 动画歌词场景里 right.lyrics 是叶子，没有可用的子项。
    expect(groupVisible('lyrics', 'full', new Set(['right.lyrics']), 'right.lyrics')).toBe(false);
    expect(groupVisible('lyrics', 'full', new Set(), 'right.lyrics')).toBe(true);
  });

  it('设置页只把叶子摆出来：父组有可用子项时不显示父开关', () => {
    expect(isLeafPanel('paper', 'full', 'right.header')).toBe(false);
    expect(isLeafPanel('paper', 'full', 'right.header.title')).toBe(true);
    expect(isLeafPanel('paper', 'full', 'right.lyrics')).toBe(false);
    expect(isLeafPanel('paper', 'full', 'right.lyrics.main')).toBe(true);
    expect(isLeafPanel('lyrics', 'full', 'right.lyrics')).toBe(true);
    expect(isLeafPanel('cardLyrics', 'full', 'card.title')).toBe(false);
    expect(isLeafPanel('cardLyrics', 'full', 'card.titleText')).toBe(true);
    expect(isLeafPanel('card', 'full', 'card.titleText')).toBe(false);
    expect(isLeafPanel('paper', 'compact', 'right.fileInfo.sampleRate')).toBe(false);
    expect(isLeafPanel('paper', 'portrait', 'right.fileInfo.sampleRate')).toBe(true);
  });

  it('新叶子按场景/档位出现在 panelsFor，父 ID 仍保留', () => {
    const paperFull = panelsFor('paper', 'full');
    for (const id of [
      'decor.grid',
      'decor.arcs',
      'right.header.from',
      'right.meter.duration',
      'right.gauges.loudness',
      'right.fileInfo.format',
      'dial.cell.date',
      'right.lyrics.sub',
    ] as const)
      expect(paperFull.has(id), id).toBe(true);
    const paperCompact = panelsFor('paper', 'compact');
    expect(paperCompact.has('right.meter')).toBe(false);
    expect(paperCompact.has('right.meta.year')).toBe(true);
    expect(paperCompact.has('dial.trackNo')).toBe(true);
    expect(paperCompact.has('dial.cell.date')).toBe(false);
    expect(panelsFor('cardLyrics', 'full').has('card.artist')).toBe(true);
    expect(panelsFor('card', 'full').has('card.artist')).toBe(false);
  });
});
