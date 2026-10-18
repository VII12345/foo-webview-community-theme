import { createStore } from 'jotai/vanilla';
import { expect, it, onTestFinished, vi } from 'vitest';
import { startFoldersCovers } from '../../../../../src/library/folders/detail/foldersCovers.ts';
import { UnitHost } from '../../../../fixtures/unitHost.ts';

function setup() {
  const host = new UnitHost();
  const covers = startFoldersCovers(createStore(), host.fb);
  onTestFinished(() => {
    covers.dispose();
    host.dispose();
  });
  return { host, covers };
}
it('优先使用目录里的 cover/folder 图片，取不到再退回首曲内嵌图', async () => {
  const { host, covers } = setup();
  host.answer('artwork.getFolderImages', {
    success: true,
    images: [
      { name: 'other.png', path: 'E:\\Music\\other.png', size: 1 },
      { name: 'cover.jpg', path: 'E:\\Music\\cover.jpg', size: 2 },
    ],
  });
  host.answer('artwork.getFb2kUrlByPath', (params) => ({
    success: true,
    available: true,
    type: 'front',
    path: String(params.path),
    dataUrl:
      params.path === 'E:\\Music\\cover.jpg' ? 'fb2k://art/folder' : 'fb2k://art/track',
  }));
  const path = 'file://E:\\Music\\first.flac';
  expect(covers.coverOf(path, 64)).toBeUndefined();
  await vi.waitFor(() => expect(covers.coverOf(path, 64)?.url).toBe('fb2k://art/folder'));
  expect(host.callsTo('artwork.getFolderImages')[0]).toMatchObject({ directory: 'E:\\Music' });
  expect(host.callsTo('artwork.getFb2kUrlByPath')[0]).toMatchObject({
    path: 'E:\\Music\\cover.jpg',
  });
});

it('目录没有图片时退回实际首曲路径', async () => {
  const { host, covers } = setup();
  host.answer('artwork.getFolderImages', { success: true, images: [] });
  host.answer('artwork.getFb2kUrlByPath', {
    success: true,
    available: true,
    type: 'front',
    path: 'file://E:\\Music\\first.flac',
    dataUrl: 'fb2k://art/track',
  });
  const path = 'file://E:\\Music\\first.flac';
  covers.coverOf(path, 64);
  await vi.waitFor(() => expect(covers.coverOf(path, 64)?.url).toBe('fb2k://art/track'));
  expect(host.callsTo('artwork.getFb2kUrlByPath')[0]).toMatchObject({ path });
});

it('同一目录只请求一次目录图片，多首曲目共用结果', async () => {
  const { host, covers } = setup();
  host.answer('artwork.getFolderImages', { success: true, images: [] });
  host.answer('artwork.getFb2kUrlByPath', {
    success: true,
    available: true,
    type: 'front',
    path: 'x',
    dataUrl: 'fb2k://art/track',
  });
  const first = 'file://E:\\Music\\a.flac';
  const second = 'file://E:\\Music\\b.flac';
  covers.coverOf(first, 64);
  covers.coverOf(second, 64);
  await vi.waitFor(() => expect(covers.coverOf(first, 64)?.url).toBe('fb2k://art/track'));
  await vi.waitFor(() => expect(covers.coverOf(second, 64)?.url).toBe('fb2k://art/track'));
  expect(host.callsTo('artwork.getFolderImages')).toHaveLength(1);
});

it('直接读取首曲路径，缺少专辑元数据也能得到封面', async () => {
  const { host, covers } = setup();
  host.answer('artwork.getFb2kUrlByPath', {
    success: true,
    available: true,
    type: 'front',
    path: 'file://E:\\Music\\first.flac',
    dataUrl: 'fb2k://art/first',
  });
  const path = 'file://E:\\Music\\untagged.flac';
  expect(covers.coverOf(path, 64)).toBeUndefined();
  await vi.waitFor(() => expect(covers.coverOf(path, 64)?.url).toBe('fb2k://art/first'));
  expect(host.callsTo('artwork.getFb2kUrlByPath')[0]).toMatchObject({ path });
  expect(covers.acquire(path)).toBe(true);
  covers.settle(path, 'load');
  expect(covers.coverOf(path, 64)?.url).toBe('fb2k://art/first');
});
it('升档图片失败时保留已经显示的封面，不反复请求失败档位', async () => {
  const { host, covers } = setup();
  const path = 'file://E:\\Music\\first.flac';
  host.answer('artwork.getFb2kUrlByPath', {
    success: true,
    available: true,
    type: 'front',
    path: 'file://E:\\Music\\first.flac',
    dataUrl: 'fb2k://art/small',
  });
  covers.coverOf(path, 64);
  await vi.waitFor(() => expect(covers.coverOf(path, 64)?.url).toBe('fb2k://art/small'));
  covers.acquire(path);
  covers.settle(path, 'load');
  host.answer('artwork.getFb2kUrlByPath', {
    success: true,
    available: true,
    type: 'front',
    path: 'file://E:\\Music\\first.flac',
    dataUrl: 'fb2k://art/large',
  });
  covers.coverOf(path, 512);
  await vi.waitFor(() => expect(covers.coverOf(path, 512)?.url).toBe('fb2k://art/large'));
  covers.acquire(path);
  covers.settle(path, 'error');
  expect(covers.coverOf(path, 512)?.url).toBe('fb2k://art/small');
  expect(covers.acquire(path)).toBe(true);
  covers.settle(path, 'load');
  expect(covers.coverOf(path, 512)?.url).toBe('fb2k://art/small');
});
it('释放后晚到的封面地址不写回', async () => {
  const { host, covers } = setup();
  const held = host.hold('artwork.getFb2kUrlByPath');
  const path = 'file://E:\\Music\\late.flac';
  covers.coverOf(path, 64);
  await vi.waitFor(() => expect(host.callsTo('artwork.getFb2kUrlByPath')).toHaveLength(1));
  covers.dispose();
  held.respond(0, {
    success: true,
    available: true,
    type: 'front',
    path: 'file://E:\\Music\\first.flac',
    dataUrl: 'fb2k://art/late',
  });
  await Promise.resolve();
  expect(covers.coverOf(path, 64)).toBeUndefined();
});
