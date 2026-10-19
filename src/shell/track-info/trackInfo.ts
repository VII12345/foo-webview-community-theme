import type { Track } from 'foo-webview-sdk';
import { fb } from 'foo-webview-sdk/bridge';
import { atom, type Atom } from 'jotai/vanilla';
import { knownCommandsOf, readContextTree, runContextCommand } from '../../host/contextMenu.ts';
import { hostCommand, settle } from '../../host/hostCall.ts';
import { normalizeHostPath } from '../../host/hostPath.ts';
import { trackPathOf } from '../../host/libraryContract.ts';
import { hasPlaycountComponent } from '../../host/playcountComponent.ts';
import { waitForHost } from '../../host/waitForHost.ts';
import type { Translate } from '../../i18n/translate.ts';
import type { Store } from '../../kit/store.ts';
import { createTagWrites } from '../../track/tagWrites.ts';
import { copyInfoFields } from './trackInfoRows.ts';
import {
  copyInfoTags,
  emptyTrackInfo,
  infoFilePath,
  infoMediaKind,
  infoTags,
  INITIAL_INFO_SECTIONS,
  INFO_SECTIONS,
  type InfoRead,
  type InfoSection,
  type TrackInfoState,
} from './trackInfoModel.ts';

export interface TrackInfoDeps {
  readonly track: Atom<Track | null>;
  readonly active: Atom<boolean>;
}

export type TrackInfoHost = Pick<
  typeof fb,
  | 'metadata'
  | 'titleformat'
  | 'file'
  | 'config'
  | 'playcount'
  | 'replaygain'
  | 'rating'
  | 'clipboard'
  | 'shell'
  | 'menu'
  | 'on'
  | 'isAvailable'
  | 'ready'
>;

/** 一次标签改动：`null` 删除这个标签，数组按顺序整份替换它的值。 */
export interface TagChange {
  readonly name: string;
  readonly values: readonly string[] | null;
}

export interface TrackInfoService {
  readonly state: Atom<TrackInfoState>;
  readonly sections: Atom<readonly InfoSection[]>;
  readonly ready: Promise<void>;
  setSections(sections: readonly InfoSection[]): void;
  refresh(): void;
  copy(text: string): Promise<boolean>;
  copyTags(): Promise<boolean>;
  copyAll(t: Translate, locale: string): Promise<boolean>;
  openFolder(): Promise<boolean>;
  /** 调宿主的文件操作「移动到…」；流媒体、没有当前曲目或宿主菜单里认不出命令时答 false。 */
  moveTo(locale?: string): Promise<boolean>;
  /** 写标签；派发后等完成事件并重读确认。流媒体与没有当前曲目时答 false。 */
  writeTags(changes: readonly TagChange[]): Promise<boolean>;
  dispose(): void;
}

const AUDIO_FIELDS = { bitDepth: '%__bitspersample%', encoding: '%__encoding%' };
const formattedValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' && value !== '?' ? value : undefined;

function failedRead(answer: { code?: string } | null): InfoRead<never> {
  return {
    status:
      answer?.code === 'NOT_SUPPORTED' || answer?.code === 'METHOD_NOT_FOUND'
        ? 'unavailable'
        : 'failed',
  };
}

export function startTrackInfo(
  store: Store,
  deps: TrackInfoDeps,
  host: TrackInfoHost = fb,
): TrackInfoService {
  const state = atom(emptyTrackInfo(store.get(deps.track)));
  const sections = atom<readonly InfoSection[]>(INITIAL_INFO_SECTIONS);
  const waiter = waitForHost(host);
  let disposed = false;
  let connected = false;
  let generation = 0;
  let active = false;
  let track: Track | null = null;
  let reads: Promise<void>[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let components: Promise<Awaited<ReturnType<typeof host.config.getComponents>> | null> | undefined;
  const offs: (() => void)[] = [];
  const writes = createTagWrites(15_000);

  const valid = (id: number) => !disposed && active && id === generation;
  function update(id: number, patch: Partial<TrackInfoState>) {
    if (valid(id)) store.set(state, (current) => ({ ...current, ...patch }));
  }

  async function loadMetadata(target: Track, id: number, raw: boolean) {
    const answer = await settle(() =>
      raw ? host.metadata.readRaw(target.handle) : host.metadata.read(target.handle),
    );
    update(id, {
      metadata: answer?.success === true ? { status: 'ready', value: answer } : failedRead(answer),
      tagSource: raw ? 'file' : 'host',
    });
  }

  async function loadAudio(target: Track, id: number) {
    const answer = await settle(() => host.titleformat.evalFields(target.handle, AUDIO_FIELDS));
    update(id, {
      audio:
        answer?.success === true && answer.infoAvailable !== false
          ? {
              status: 'ready',
              value: {
                bitDepth: formattedValue(answer['bitDepth']),
                encoding: formattedValue(answer['encoding']),
              },
            }
          : failedRead(answer?.success === false ? answer : null),
    });
  }

  async function loadRating(target: Track, id: number) {
    const answer = await settle(() => host.rating.get(target.handle));
    update(id, {
      rating: answer?.success === true ? { status: 'ready', value: answer } : failedRead(answer),
    });
  }

  async function loadFile(target: Track, id: number) {
    const path = infoFilePath(target);
    if (!path) {
      update(id, { file: { status: 'notApplicable' } });
      return;
    }
    const answer = await settle(() => host.file.getInfo(path));
    update(id, {
      file: answer?.success === true ? { status: 'ready', value: answer } : failedRead(answer),
    });
  }

  async function loadStatistics(target: Track, id: number) {
    components ??= settle(() => host.config.getComponents());
    const installed = await components;
    if (!valid(id)) return;
    if (!installed || installed.success === false) {
      components = undefined;
      update(id, { statistics: failedRead(installed) });
      return;
    }
    const available = hasPlaycountComponent(installed.components);
    if (!available) {
      update(id, { statistics: { status: 'unavailable' } });
      return;
    }
    const answer = await settle(() => host.playcount.get(target.handle));
    const row = answer?.success === true ? answer.results[0] : undefined;
    update(id, {
      statistics: row?.success
        ? { status: 'ready', value: row }
        : failedRead(answer?.success === false ? answer : null),
    });
  }

  async function loadReplayGain(target: Track, id: number) {
    const answer = await settle(() => host.replaygain.get(target.handle));
    const row = answer?.success === true ? answer.results[0] : undefined;
    update(id, {
      replayGain: row?.success
        ? { status: 'ready', value: row }
        : failedRead(answer?.success === false ? answer : null),
    });
  }

  function loadSections(requested = store.get(sections)) {
    if (!connected || !active || !track || disposed || infoMediaKind(track) === 'stream') return;
    const target = track;
    const id = generation;
    const loaders = { file: loadFile, statistics: loadStatistics, replayGain: loadReplayGain };
    for (const key of ['file', 'statistics', 'replayGain'] as const) {
      if (!requested.includes(key) || store.get(state)[key].status !== 'idle') continue;
      update(id, { [key]: { status: 'loading' } });
      reads.push(loaders[key](target, id));
    }
  }

  function load(raw: boolean) {
    generation += 1;
    reads = [];
    const id = generation;
    store.set(state, emptyTrackInfo(track));
    if (!connected || !active || !track || disposed) return;
    // 网络流不能交给同步打开文件的端点，否则网络超时会阻塞宿主主线程。
    if (infoMediaKind(track) === 'stream') {
      const skipped = { status: 'notApplicable' } as const;
      update(id, {
        metadata: skipped,
        audio: skipped,
        file: skipped,
        statistics: skipped,
        replayGain: skipped,
        rating: skipped,
      });
      return;
    }
    update(id, {
      metadata: { status: 'loading' },
      audio: { status: 'loading' },
      rating: { status: 'loading' },
    });
    reads.push(loadMetadata(track, id, raw), loadAudio(track, id), loadRating(track, id));
    loadSections();
  }

  function follow() {
    if (disposed) return;
    const next = store.get(deps.track);
    const visible = store.get(deps.active);
    if (next === track && active === visible) return;
    track = next;
    active = visible;
    clearTimeout(timer);
    load(false);
  }

  function invalidate() {
    if (!active || disposed) return;
    clearTimeout(timer);
    timer = setTimeout(() => load(false), 60);
  }

  async function copy(text: string): Promise<boolean> {
    if (disposed) return false;
    const id = generation;
    const success = await hostCommand(() => host.clipboard.write(text));
    update(id, { action: success ? 'copied' : 'copyFailed' });
    return success;
  }

  offs.push(store.sub(deps.track, follow), store.sub(deps.active, follow));
  follow();
  const ready = (async () => {
    if (!(await waiter.done) || disposed) return;
    connected = true;
    offs.push(
      host.on('metadb:changed', (event) => {
        if (
          track &&
          (event.count > event.tracks.length ||
            event.tracks.some((item) => item.handle === track?.handle))
        )
          invalidate();
      }),
      host.on('metadata:writeComplete', (event) => {
        writes.deliver(event);
        if (
          event.success &&
          track &&
          event.subsong === track.subsong &&
          [track.handle, track.path, track.absolutePath].includes(event.path)
        )
          invalidate();
      }),
    );
    load(false);
  })();

  return {
    state,
    sections,
    ready,
    setSections(value) {
      if (disposed) return;
      store.set(sections, value);
      loadSections();
    },
    refresh() {
      if (!disposed) {
        clearTimeout(timer);
        load(true);
      }
    },
    copy,
    copyTags() {
      const data = store.get(state).metadata;
      return data.status === 'ready'
        ? copy(copyInfoTags(infoTags(data.value.tags)))
        : Promise.resolve(false);
    },
    async copyAll(t, locale) {
      const id = generation;
      if (!valid(id) || !connected || !track || store.get(state).action === 'copying') return false;
      update(id, { action: 'copying' });
      loadSections(INFO_SECTIONS);
      await Promise.all(reads);
      if (!valid(id)) return false;
      return copy(copyInfoFields(store.get(state), t, locale));
    },
    async openFolder() {
      const path = track && infoFilePath(track);
      if (disposed || !path) return false;
      const id = generation;
      const success = await hostCommand(() => host.shell.showInExplorer(path));
      update(id, { action: success ? 'idle' : 'openFailed' });
      return success;
    },
    async moveTo(locale) {
      const target = track;
      if (
        disposed ||
        !active ||
        !connected ||
        !target ||
        infoMediaKind(target) === 'stream' ||
        store.get(state).action === 'moving'
      )
        return false;
      const id = generation;
      const tree = await readContextTree(
        host,
        { mode: 'handles', handles: [target.handle] },
        locale,
      );
      if (!valid(id)) return false;
      const command = knownCommandsOf(tree).moveTo;
      if (!command) {
        update(id, { action: 'moveFailed' });
        return false;
      }
      update(id, { action: 'moving' });
      const success = await runContextCommand(host, tree, command);
      update(id, { action: success ? 'idle' : 'moveFailed' });
      return success;
    },
    async writeTags(changes) {
      const target = track;
      if (disposed || !active || !connected || !target) return false;
      if (infoMediaKind(target) === 'stream') return false;
      // 空串不是合法值：当作删掉这一项；整份空了就删除标签。
      const normalized = changes.flatMap((change) => {
        const name = change.name.trim();
        if (!name) return [];
        const values = change.values?.filter((value) => value !== '') ?? null;
        return [{ name: name.toUpperCase(), values: values && values.length ? values : null }];
      });
      if (!normalized.length) return false;
      const path = trackPathOf(target);
      const tags: Record<string, string[] | null> = {};
      for (const change of normalized) tags[change.name] = change.values ? [...change.values] : null;
      store.set(state, (current) => ({ ...current, saving: true, saveFailed: false }));
      const wait = writes.expect(normalizeHostPath(path), target.subsong, async () => {
        const read = await settle(() =>
          host.metadata.readRaw(path, { cueIndex: target.subsong }),
        );
        if (!read || read.success === false) return null;
        return normalized.every((change) => {
          const actual = Object.entries(read.tags).find(
            ([name]) => name.toUpperCase() === change.name,
          )?.[1];
          if (change.values === null)
            return actual === undefined || (Array.isArray(actual) && actual.length === 0);
          const list = Array.isArray(actual) ? actual : typeof actual === 'string' ? [actual] : [];
          return (
            list.length === change.values.length &&
            list.every((value, index) => value === change.values?.[index])
          );
        });
      });
      const answer = await settle(() =>
        host.metadata.write(path, tags, { cueIndex: target.subsong }),
      );
      let ok = false;
      if (!answer || answer.success === false) wait.cancel();
      else if (answer.dispatched !== true) ok = true;
      else ok = (await wait.done) === true;
      if (!disposed) {
        store.set(state, (current) => ({ ...current, saving: false, saveFailed: !ok }));
        if (ok) {
          clearTimeout(timer);
          void load(false);
        }
      }
      return ok && !disposed;
    },
    dispose() {
      disposed = true;
      generation += 1;
      waiter.cancel();
      clearTimeout(timer);
      writes.dispose();
      for (const off of offs.splice(0)) off();
    },
  };
}
