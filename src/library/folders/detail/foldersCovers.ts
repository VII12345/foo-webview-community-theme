import { fb } from 'foo-webview-sdk/bridge';
import { atom } from 'jotai/vanilla';
import { artworkRequestSize } from '../../../host/artworkSize.ts';
import { settle } from '../../../host/hostCall.ts';
import type { Store } from '../../../kit/store.ts';
import { CoverGate, type CoverOutcome } from '../../../covers/coverGate.ts';
import { foldersTreeAtom } from '../tree/foldersTree.ts';

interface FolderCover {
  readonly url: string;
  readonly size: number;
  readonly previous?: string;
}
const IMAGE_FILE = /\.(?:jpe?g|png|gif|bmp|webp)$/i;
const IMAGE_NAME = /^(?:cover|folder|front|albumart)/i;

/** 目录封面接口要目录路径；首曲 path 可能带 file://。 */
export function folderDirectory(path: string): string {
  const clean = path.replace(/^file:\/\//i, '').replace(/\//g, '\\');
  const at = clean.lastIndexOf('\\');
  return at > 0 ? clean.slice(0, at) : '';
}

/** 目录里优先 cover/folder/front 命名，其次任意图片。 */
export function folderImagePath(
  images: readonly { readonly name: string; readonly path: string }[],
): string | undefined {
  return (
    images.find((image) => IMAGE_FILE.test(image.name) && IMAGE_NAME.test(image.name))?.path ??
    images.find((image) => IMAGE_FILE.test(image.name))?.path
  );
}
const versionAtom = atom(0);
export const foldersCoversVersionAtom = atom((get) => get(versionAtom));
export interface FoldersCoversService {
  coverOf(path: string, width: number): FolderCover | undefined;
  acquire(path: string): boolean;
  settle(path: string, outcome: CoverOutcome): void;
  wait(retry: () => void): () => void;
  dispose(): void;
}

/** 目录优先用目录里的 cover/folder 图片，取不到再退回实际首曲的内嵌图；图片加载名额与重试共用封面闸门。 */
export function startFoldersCovers(
  store: Store,
  host: Pick<typeof fb, 'artwork' | 'isAvailable'> = fb,
): FoldersCoversService {
  const cache = new Map<string, FolderCover>();
  const pending = new Set<string>();
  const declined = new Map<string, number>();
  /** 目录 → 目录封面文件路径；同一目录下的多首曲目共用一次 getFolderImages。 */
  const folderImages = new Map<string, string | undefined>();
  const folderRequests = new Map<string, Promise<string | undefined>>();
  let generation = store.get(foldersTreeAtom).generation;
  let serial = 0;
  let disposed = false;
  const bump = () => store.set(versionAtom, (value) => value + 1);
  const gate = new CoverGate({ limit: 24, retryDelays: [5000, 5000], onCooled: bump });
  function reset() {
    serial += 1;
    cache.clear();
    pending.clear();
    declined.clear();
    folderImages.clear();
    folderRequests.clear();
    gate.reset();
    bump();
  }
  const off = store.sub(foldersTreeAtom, () => {
    const next = store.get(foldersTreeAtom).generation;
    if (next !== generation) {
      generation = next;
      reset();
    }
  });
  function imageOf(directory: string): Promise<string | undefined> {
    if (folderImages.has(directory)) return Promise.resolve(folderImages.get(directory));
    const running = folderRequests.get(directory);
    if (running) return running;
    const request = (async () => {
      const answer = await settle(() => host.artwork.getFolderImages(directory));
      const images =
        answer && answer.success !== false && Array.isArray(answer.images) ? answer.images : [];
      const path = folderImagePath(images);
      folderImages.set(directory, path);
      folderRequests.delete(directory);
      return path;
    })();
    folderRequests.set(directory, request);
    return request;
  }
  async function load(path: string, size: number, mine: number) {
    const directory = folderDirectory(path);
    const imagePath = directory ? await imageOf(directory) : undefined;
    if (disposed || mine !== serial) return;
    let url = '';
    for (const candidate of [imagePath, path]) {
      if (!candidate) continue;
      const answer = await settle(() =>
        host.artwork.getFb2kUrlByPath(candidate, 'front', { maxSize: size }),
      );
      if (disposed || mine !== serial) return;
      if (answer && answer.success !== false && answer.available) {
        url = answer.dataUrl;
        break;
      }
    }
    pending.delete(path);
    const old = cache.get(path);
    if (!url && old?.url) {
      declined.set(path, size);
      return;
    }
    cache.set(path, {
      url,
      size,
      ...(old?.url && gate.isShown(path) ? { previous: old.url } : {}),
    });
    if (old) gate.refresh(path);
    // 目录墙不虚拟化；上限与专辑封面一致，避免大目录反复淘汰重载。
    if (cache.size > 2000) {
      for (const key of cache.keys()) {
        if (!pending.has(key) && key !== path) {
          cache.delete(key);
          declined.delete(key);
          break;
        }
      }
    }
    bump();
  }
  return {
    coverOf(path, width) {
      const size = artworkRequestSize(
        width,
        typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
      );
      const known = cache.get(path);
      if (
        !disposed &&
        host.isAvailable() &&
        !pending.has(path) &&
        path &&
        (!known || (known.url && size > known.size && size > (declined.get(path) ?? 0)))
      ) {
        pending.add(path);
        const mine = serial;
        queueMicrotask(() => {
          if (!disposed && mine === serial) void load(path, size, mine);
        });
      }
      if (!known?.url) return known;
      if (gate.blocked(path)) return undefined;
      const attempt = gate.attempt(path);
      return {
        ...known,
        url:
          attempt > 0
            ? `${known.url}${known.url.includes('?') ? '&' : '?'}retry=${attempt}`
            : known.url,
      };
    },
    acquire: (path) => !disposed && gate.acquire(path),
    settle(path, outcome) {
      if (disposed) return;
      const known = cache.get(path);
      if (outcome === 'error' && known?.previous) {
        declined.set(path, known.size);
        cache.set(path, { url: known.previous, size: known.size });
        gate.settle(path, 'abandon');
        gate.restore(path);
        bump();
        return;
      }
      const attempt = gate.attempt(path);
      const phase = gate.settle(path, outcome);
      if (known && phase === 'shown') {
        cache.set(path, {
          size: known.size,
          url:
            attempt > 0
              ? `${known.url}${known.url.includes('?') ? '&' : '?'}retry=${attempt}`
              : known.url,
        });
        if (attempt > 0 || known.previous) bump();
      }
      if (known && phase === 'failed') {
        cache.set(path, { url: '', size: known.size });
        bump();
      }
    },
    wait: (retry) => gate.wait(retry),
    dispose() {
      disposed = true;
      off();
      serial += 1;
      gate.reset();
      cache.clear();
      pending.clear();
      declined.clear();
    },
  };
}
