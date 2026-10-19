import { atom, createStore } from 'jotai/vanilla';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  averageSpl,
  emptyLoudnessFile,
  flushLoudnessStats,
  loadLoudnessStats,
  loudnessStorageAtom,
  parseLoudnessFile,
  recordLoudness,
  startLoudnessStats,
  summarizeLoudness,
  summarizeLoudnessScopes,
  type LoudnessFile,
  type LoudnessPlaybackView,
  type LoudnessSampleView,
  type LoudnessStatsHost,
} from '../../../src/stats/loudnessStats.ts';
import { ymdOf } from '../../../src/stats/statsRange.ts';

const PROFILE = 'C:\\profile';

function fileOf(): LoudnessFile {
  return {
    version: 2,
    days: {
      '2026-10-13': {
        'hp-1': {
          name: 'M1',
          seconds: 100,
          energyA: 10 ** 8 * 100,
          energyK: 10 ** 8 * 100,
          energyZ: 10 ** 8 * 100,
        },
      },
      '2026-10-17': {
        'hp-1': {
          name: 'M1',
          seconds: 100,
          energyA: 10 ** 9 * 100,
          energyK: 10 ** 9 * 100,
          energyZ: 10 ** 9 * 100,
        },
        'hp-2': {
          name: 'JT7',
          seconds: 50,
          energyA: 10 ** 8 * 50,
          energyK: 10 ** 8 * 50,
          energyZ: 10 ** 8 * 50,
        },
      },
      '2026-09-20': {
        'hp-1': {
          name: 'M1',
          seconds: 10,
          energyA: 10 ** 7 * 10,
          energyK: 10 ** 7 * 10,
          energyZ: 10 ** 7 * 10,
        },
      },
    },
  };
}

function hostWith(
  read: unknown,
  writeAnswer?: (path: string, text: string) => unknown,
): {
  host: LoudnessStatsHost;
  writes: { path: string; text: string }[];
} {
  const writes: { path: string; text: string }[] = [];
  const host = {
    misc: {
      getProfilePath: async () => ({ success: true, path: PROFILE }),
    },
    file: {
      read: async () => read,
      write: async (path: string, text: string) => {
        writes.push({ path, text });
        return writeAnswer ? writeAnswer(path, text) : { success: true };
      },
    },
  } as unknown as LoudnessStatsHost;
  return { host, writes };
}

const NOT_FOUND = { success: false, error: 'not found', code: 'NOT_FOUND' };

describe('音量统计文件', () => {
  it('解析 v2 文件、迁移 v1 legacy、丢弃坏条目与坏版本', () => {
    expect(parseLoudnessFile(fileOf())).toEqual(fileOf());
    expect(parseLoudnessFile({ version: 3, days: {} })).toBeNull();
    expect(parseLoudnessFile({ version: 2, days: [] })).toBeNull();
    expect(
      parseLoudnessFile({
        version: 2,
        days: {
          '2026-10-17': {
            good: {
              name: '',
              seconds: 10,
              energyA: 1e9,
              energyK: 2e9,
              energyZ: 3e9,
            },
            bad: { name: 'x', seconds: -1, energyA: 1e9, energyK: 1e9, energyZ: 1e9 },
            badType: { name: 'x', seconds: '10', energyA: 1e9, energyK: 1e9, energyZ: 1e9 },
          },
        },
      }),
    ).toEqual({
      version: 2,
      days: {
        '2026-10-17': {
          good: { name: 'good', seconds: 10, energyA: 1e9, energyK: 2e9, energyZ: 3e9 },
        },
      },
    });
    expect(
      parseLoudnessFile({
        version: 1,
        days: { '2026-10-17': { old: { name: 'old', seconds: 10, energy: 1e9 } } },
      }),
    ).toEqual({
      version: 2,
      days: {
        '2026-10-17': {
          old: {
            name: 'old',
            seconds: 0,
            energyA: 0,
            energyK: 0,
            energyZ: 0,
            legacySeconds: 10,
            legacyEnergy: 1e9,
          },
        },
      },
    });
  });

  it('记一段后累加秒数与 A/K/Z 能量，平均用能量平均', () => {
    const file = emptyLoudnessFile();
    recordLoudness(file, '2026-10-17', 'hp-1', 'M1', 10, {
      A: 10 ** 8 * 10,
      K: 2e9,
      Z: 3e9,
    });
    recordLoudness(file, '2026-10-17', 'hp-1', 'M1', 10, {
      A: 10 ** 9 * 10,
      K: 2e10,
      Z: 3e10,
    });
    const bucket = file.days['2026-10-17']?.['hp-1'];
    expect(bucket).toEqual({
      name: 'M1',
      seconds: 20,
      energyA: 10 ** 8 * 10 + 10 ** 9 * 10,
      energyK: 2e9 + 2e10,
      energyZ: 3e9 + 3e10,
    });
    expect(averageSpl(bucket!, 'A')).toBeCloseTo(10 * Math.log10((10 ** 9 + 10 ** 10) / 20), 9);
    expect(averageSpl(bucket!, 'K')).toBeCloseTo(10 * Math.log10((2e9 + 2e10) / 20), 9);
    expect(
      averageSpl({ seconds: 0, energyA: 0, energyK: 0, energyZ: 0 }, 'A'),
    ).toBeNull();
  });

  it('按范围聚合每只耳机与全部耳机', () => {
    const now = new Date(2026, 9, 17);
    const week = summarizeLoudness(fileOf(), 'week', now);
    expect(week.perHeadphone.map((row) => row.id)).toEqual(['hp-1', 'hp-2']);
    expect(week.perHeadphone[0]).toMatchObject({ seconds: 200 });
    expect(week.perHeadphone[0]?.spl).toBeCloseTo(
      10 * Math.log10((10 ** 8 * 100 + 10 ** 9 * 100) / 200),
      9,
    );
    expect(week.perHeadphone[1]).toMatchObject({ seconds: 50, name: 'JT7' });
    expect(week.overall.seconds).toBe(250);
    expect(week.overall.spl).toBeCloseTo(
      10 * Math.log10((10 ** 8 * 100 + 10 ** 9 * 100 + 10 ** 8 * 50) / 250),
      9,
    );

    const month = summarizeLoudness(fileOf(), 'month', now);
    expect(month.overall.seconds).toBe(250);
    const year = summarizeLoudness(fileOf(), 'year', now);
    expect(year.overall.seconds).toBe(260);
  });

  it('一次算出四个范围，供顶部平均与详情页共用', () => {
    const now = new Date(2026, 9, 17);
    const scopes = summarizeLoudnessScopes(fileOf(), now);
    expect(Object.keys(scopes)).toEqual(['today', 'week', 'month', 'year']);
    expect(scopes.week.overall.seconds).toBe(250);
    expect(scopes.month.overall.seconds).toBe(250);
    expect(scopes.year.overall.seconds).toBe(260);
    expect(scopes.today.overall.seconds).toBe(150);
  });
});

describe('读写统计文件', () => {
  it('读到文件、文件不存在、权限被拒与损坏分别给出状态', async () => {
    expect(await loadLoudnessStats(hostWith({ success: true, content: JSON.stringify(fileOf()) }).host))
      .toMatchObject({ state: 'ready' });
    expect(await loadLoudnessStats(hostWith(NOT_FOUND).host)).toEqual({ state: 'empty' });
    expect(
      await loadLoudnessStats(
        hostWith({ success: false, error: 'denied', code: 'PERMISSION_DENIED' }).host,
      ),
    ).toEqual({ state: 'denied' });
    expect(await loadLoudnessStats(hostWith({ success: true, content: '{' }).host)).toEqual({
      state: 'corrupt',
    });
  });

  it('v2 不存在时回退读取 v1，并把旧数据迁成 legacy', async () => {
    const legacy = JSON.stringify({
      version: 1,
      days: { '2026-10-17': { 'hp-1': { name: 'M1', seconds: 10, energy: 1e9 } } },
    });
    const host = {
      misc: {
        getProfilePath: async () => ({ success: true, path: PROFILE }),
      },
      file: {
        read: async (path: string) =>
          path.endsWith('loudness-v1.json')
            ? { success: true, content: legacy }
            : NOT_FOUND,
        write: async () => ({ success: true }),
      },
    } as unknown as LoudnessStatsHost;
    const loaded = await loadLoudnessStats(host);
    expect(loaded).toMatchObject({
      state: 'ready',
      data: {
        version: 2,
        days: {
          '2026-10-17': {
            'hp-1': {
              seconds: 0,
              legacySeconds: 10,
              legacyEnergy: 1e9,
            },
          },
        },
      },
    });
  });

  it('记录器只累计 DX52 自动、播放中、已选耳机且读数新鲜的时间', async () => {
    vi.useFakeTimers();
    onTestFinished(() => vi.useRealTimers());
    const start = new Date(2026, 9, 17, 12, 0, 0);
    vi.setSystemTime(start);
    const store = createStore();
    const view = atom<LoudnessSampleView>({
      reading: { splA: 80, splK: 80, splZ: 80 },
      auto: { active: true, state: { updatedAtMs: start.getTime() } },
      headphone: { id: 'hp-1', name: 'M1' },
    });
    const playback = atom<LoudnessPlaybackView>({
      state: 'playing',
      position: 0,
      trackGeneration: 1,
    });
    const { host, writes } = hostWith(NOT_FOUND);
    const service = startLoudnessStats(store, {
      view,
      playback,
      host,
      document: null,
      intervalMs: 1000,
      debounceMs: 1000,
      now: () => Date.now(),
    });
    await service.ready;
    await vi.advanceTimersByTimeAsync(1000);
    await service.flush();
    expect(writes).toHaveLength(1);
    const saved = JSON.parse(writes[0]!.text) as LoudnessFile;
    expect(saved.days[ymdOf(start)]?.['hp-1']?.seconds).toBeCloseTo(1, 6);
    expect(saved.days[ymdOf(start)]?.['hp-1']?.energyA).toBeCloseTo(1e8, 6);
    expect(saved.days[ymdOf(start)]?.['hp-1']?.energyK).toBeCloseTo(1e8, 6);
    expect(saved.days[ymdOf(start)]?.['hp-1']?.energyZ).toBeCloseTo(1e8, 6);

    // 暂停、过期、无耳机都不再累计。
    store.set(playback, { state: 'paused', position: 1, trackGeneration: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    store.set(playback, { state: 'playing', position: 1, trackGeneration: 1 });
    store.set(view, {
      reading: { splA: 80, splK: 80, splZ: 80 },
      auto: { active: true, state: { updatedAtMs: start.getTime() - 10 * 60_000 } },
      headphone: { id: 'hp-1', name: 'M1' },
    });
    await vi.advanceTimersByTimeAsync(1000);
    store.set(view, {
      reading: { splA: 80, splK: 80, splZ: 80 },
      auto: { active: true, state: { updatedAtMs: Date.now() } },
      headphone: null,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await service.flush();
    const after = JSON.parse(writes.at(-1)!.text) as LoudnessFile;
    expect(after.days[ymdOf(start)]?.['hp-1']?.seconds).toBeCloseTo(1, 6);
    service.dispose();
  });

  it('按播放位置差累计；seek 大跳只按墙钟差补一小段', async () => {
    vi.useFakeTimers();
    onTestFinished(() => vi.useRealTimers());
    const start = new Date(2026, 9, 17, 12, 0, 0);
    vi.setSystemTime(start);
    const store = createStore();
    const view = atom<LoudnessSampleView>({
      reading: { splA: 90, splK: 90, splZ: 90 },
      auto: { active: true, state: { updatedAtMs: start.getTime() } },
      headphone: { id: 'hp-1', name: 'M1' },
    });
    const playback = atom<LoudnessPlaybackView>({
      state: 'playing',
      position: 10,
      trackGeneration: 1,
    });
    const { host, writes } = hostWith(NOT_FOUND);
    const service = startLoudnessStats(store, {
      view,
      playback,
      host,
      document: null,
      intervalMs: 1000,
      debounceMs: 1000,
      now: () => Date.now(),
    });
    await service.ready;
    store.set(playback, { state: 'playing', position: 12, trackGeneration: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    await service.flush();
    const first = JSON.parse(writes.at(-1)!.text) as LoudnessFile;
    expect(first.days[ymdOf(start)]?.['hp-1']?.seconds).toBeCloseTo(2, 6);

    store.set(playback, { state: 'playing', position: 112, trackGeneration: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    await service.flush();
    const second = JSON.parse(writes.at(-1)!.text) as LoudnessFile;
    expect(second.days[ymdOf(start)]?.['hp-1']?.seconds).toBeCloseTo(3, 6);
    service.dispose();
  });

  it('发布采样与写入状态；失败保留 dirty，下一次 flush 成功后清除', async () => {
    vi.useFakeTimers();
    onTestFinished(() => vi.useRealTimers());
    const start = new Date(2026, 9, 17, 12, 0, 0);
    vi.setSystemTime(start);
    const store = createStore();
    const view = atom<LoudnessSampleView>({
      reading: { splA: 80, splK: 80, splZ: 80 },
      auto: { active: true, state: { updatedAtMs: start.getTime() } },
      headphone: { id: 'hp-1', name: 'M1' },
    });
    const playback = atom<LoudnessPlaybackView>({
      state: 'playing',
      position: 0,
      trackGeneration: 1,
    });
    let fail = true;
    const { host, writes } = hostWith(NOT_FOUND, () =>
      fail
        ? { success: false, code: 'PERMISSION_DENIED', error: 'denied' }
        : { success: true },
    );
    const service = startLoudnessStats(store, {
      view,
      playback,
      host,
      document: null,
      intervalMs: 1000,
      debounceMs: 1000,
      now: () => Date.now(),
    });
    await service.ready;
    await vi.advanceTimersByTimeAsync(1000);
    await flushLoudnessStats();

    const failedState = store.get(loudnessStorageAtom);
    expect(failedState.lastSampleAtMs).toBe(start.getTime() + 1000);
    expect(failedState.lastFailure).toMatchObject({ code: 'PERMISSION_DENIED', win32: null });
    expect(failedState.lastWriteAtMs).toBeNull();

    fail = false;
    await service.flush();
    const saved = store.get(loudnessStorageAtom);
    expect(saved.lastFailure).toBeNull();
    expect(saved.lastWriteAtMs).not.toBeNull();
    const text = JSON.parse(writes.at(-1)!.text) as LoudnessFile;
    expect(text.days[ymdOf(start)]?.['hp-1']?.seconds).toBeCloseTo(1, 6);
    service.dispose();
  });
});
