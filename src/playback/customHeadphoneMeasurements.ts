import type { fb } from 'foo-webview-sdk/bridge';
import { atom, type Atom } from 'jotai/vanilla';
import { APP_USER_AGENT } from '../host/appIdentity.ts';
import { writeTextFile } from '../host/fileWrite.ts';
import { settle } from '../host/hostCall.ts';
import { waitForHost, type HostReadyFace } from '../host/waitForHost.ts';
import { serviceKey } from '../kit/serviceKey.ts';
import type { Store } from '../kit/store.ts';
import {
  curvePoints,
  impedancePoints,
  type HeadphoneMeasurement,
} from './measurementCurves.ts';
import { bundledMeasurementOptionByUuid } from './headphoneMeasurementOptions.ts';
import {
  CUSTOM_MEASUREMENT_ID_PREFIX,
  huihifiEvaluationApiUrl,
  parseHuihifiEvaluationLink,
  parseHuihifiEvaluationPayload,
} from './huihifiEvaluation.ts';

export const CUSTOM_MEASUREMENT_DIRECTORY = 'webview-ui-headphones';
export const CUSTOM_MEASUREMENT_FILE = 'measurements-v1.json';
export const CUSTOM_MEASUREMENT_LIMIT = 64;
export const CUSTOM_MEASUREMENT_MAX_BYTES = 2_000_000;
const MAX_CURVE_POINTS = 1024;
const MAX_BODY_BYTES = 4_000_000;
const HTTP_TIMEOUT_MS = 15_000;

export interface CustomHeadphoneMeasurement extends HeadphoneMeasurement {
  readonly brand: string;
  readonly importedAt: string;
  readonly rawPointCounts: {
    readonly frequencyResponse: number;
    readonly impedance: number;
  };
}

export type CustomMeasurementStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'corrupt' }
  | { readonly kind: 'denied'; readonly code?: string }
  | { readonly kind: 'failed'; readonly code?: string }
  | { readonly kind: 'unavailable'; readonly code?: string };

export type MeasurementImportFailure =
  | 'invalid-url'
  | 'network'
  | 'not-found'
  | 'http'
  | 'payload'
  | 'too-large'
  | 'limit'
  | 'storage'
  | 'denied'
  | 'unavailable'
  | 'cancelled';

export type MeasurementResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason: MeasurementImportFailure;
      /** 宿主返回的原始错误码，供界面显示与排查。 */
      readonly code?: string;
    };

export interface MeasurementImportPreview {
  readonly id: string;
  readonly uuid: string;
  readonly name: string;
  readonly brand: string;
  readonly sourceUrl: string;
  readonly rawPointCounts: {
    readonly frequencyResponse: number;
    readonly impedance: number;
  };
  readonly frequencyResponse: CustomHeadphoneMeasurement['frequencyResponse'];
  readonly impedance: CustomHeadphoneMeasurement['impedance'];
  readonly overwrite: boolean;
  readonly bundledDuplicate: boolean;
}

export interface CustomMeasurementHost extends HostReadyFace {
  readonly misc: Pick<typeof fb.misc, 'getProfilePath'>;
  readonly file: Pick<typeof fb.file, 'read' | 'write'>;
  readonly http: Pick<typeof fb.http, 'request'>;
}

export interface CustomHeadphoneMeasurementsService {
  readonly ready: Promise<void>;
  readonly profiles: Atom<readonly CustomHeadphoneMeasurement[]>;
  readonly status: Atom<CustomMeasurementStatus>;
  preview(url: string, signal?: AbortSignal): Promise<MeasurementResult<MeasurementImportPreview>>;
  commit(
    preview: MeasurementImportPreview,
  ): Promise<MeasurementResult<{ readonly id: string; readonly replaced: boolean }>>;
  remove(id: string): Promise<MeasurementResult<{ readonly removed: boolean }>>;
  dispose(): void;
}

export const customHeadphoneMeasurementsKey =
  serviceKey<CustomHeadphoneMeasurementsService>('customHeadphoneMeasurements');

const profilesAtom = atom<readonly CustomHeadphoneMeasurement[]>([]);
const statusAtom = atom<CustomMeasurementStatus>({ kind: 'loading' });
export const customMeasurementProfilesAtom: Atom<readonly CustomHeadphoneMeasurement[]> =
  atom((get) => get(profilesAtom));
export const customMeasurementStatusAtom: Atom<CustomMeasurementStatus> = atom((get) =>
  get(statusAtom),
);

export function customMeasurementPath(profilePath: string): string {
  const base = profilePath.replace(/[\\/]+$/, '');
  return `${base}\\${CUSTOM_MEASUREMENT_DIRECTORY}\\${CUSTOM_MEASUREMENT_FILE}`;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function text(value: unknown, limit = 128): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function storedRows(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) =>
    Array.isArray(row) && row.length >= 2
      ? ([[Number(row[0]), Number(row[1])]] as [number, number][])
      : [],
  );
}

function sanitizeProfile(raw: unknown): CustomHeadphoneMeasurement | null {
  if (!record(raw)) return null;
  const uuid = typeof raw['uuid'] === 'string' ? raw['uuid'].toLowerCase() : '';
  if (!UUID_PATTERN.test(uuid)) return null;
  const expectedId = `${CUSTOM_MEASUREMENT_ID_PREFIX}${uuid}`;
  if (raw['id'] !== expectedId) return null;
  const fr = curvePoints(storedRows(raw['frequencyResponse']));
  if (fr.length < 2 || fr.length > MAX_CURVE_POINTS) return null;
  const impedance = impedancePoints(storedRows(raw['impedance'])).slice(0, MAX_CURVE_POINTS);
  const rawCounts = record(raw['rawPointCounts']) ? raw['rawPointCounts'] : {};
  const name = text(raw['name']) || `huihifi-${uuid.slice(0, 8)}`;
  return {
    id: expectedId,
    uuid,
    name,
    brand: text(raw['brand']),
    source: 'huihifi',
    sourceUrl: `https://huihifi.com/evaluation/${uuid}`,
    fetchedAt: text(raw['fetchedAt'], 32) || new Date().toISOString().slice(0, 10),
    frReference: raw['frReference'] === 'power' ? 'power' : 'voltage',
    driveImpedanceOhm:
      typeof raw['driveImpedanceOhm'] === 'number' && Number.isFinite(raw['driveImpedanceOhm'])
        ? raw['driveImpedanceOhm']
        : null,
    rawPointCounts: {
      frequencyResponse:
        typeof rawCounts['frequencyResponse'] === 'number'
          ? rawCounts['frequencyResponse']
          : fr.length,
      impedance:
        typeof rawCounts['impedance'] === 'number' ? rawCounts['impedance'] : impedance.length,
    },
    importedAt: text(raw['importedAt'], 40) || new Date().toISOString(),
    frequencyResponse: fr,
    impedance,
  };
}

function parseFile(content: string): CustomHeadphoneMeasurement[] | null {
  if (content.length > CUSTOM_MEASUREMENT_MAX_BYTES) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  if (!record(raw) || raw['version'] !== 1 || !Array.isArray(raw['profiles'])) return null;
  const seen = new Set<string>();
  const profiles: CustomHeadphoneMeasurement[] = [];
  for (const item of raw['profiles'].slice(0, CUSTOM_MEASUREMENT_LIMIT)) {
    const profile = sanitizeProfile(item);
    if (!profile || seen.has(profile.id)) continue;
    seen.add(profile.id);
    profiles.push(profile);
  }
  return profiles;
}

function toStored(profile: CustomHeadphoneMeasurement): unknown {
  return {
    id: profile.id,
    uuid: profile.uuid,
    name: profile.name,
    brand: profile.brand,
    source: profile.source,
    sourceUrl: profile.sourceUrl,
    fetchedAt: profile.fetchedAt,
    importedAt: profile.importedAt,
    frReference: profile.frReference,
    driveImpedanceOhm: profile.driveImpedanceOhm,
    rawPointCounts: profile.rawPointCounts,
    frequencyResponse: profile.frequencyResponse.map((point) => [point.hz, point.db]),
    impedance: profile.impedance.map((point) => [point.hz, point.ohm]),
  };
}

function storedText(profiles: readonly CustomHeadphoneMeasurement[]): string {
  return JSON.stringify({ version: 1, profiles: profiles.map(toStored) });
}

export function startCustomHeadphoneMeasurements(
  store: Store,
  host: CustomMeasurementHost,
  options: { readonly now?: () => number } = {},
): CustomHeadphoneMeasurementsService {
  const waiter = waitForHost(host);
  let disposed = false;
  let filePath: string | null = null;
  let loaded = false;
  let queue: Promise<void> = Promise.resolve();
  const now = options.now ?? Date.now;

  const publish = (
    profiles: readonly CustomHeadphoneMeasurement[],
    status: CustomMeasurementStatus,
  ) => {
    store.set(profilesAtom, profiles);
    store.set(statusAtom, status);
  };

  const ready = (async () => {
    const arrived = await waiter.done;
    if (disposed) return;
    if (!arrived) {
      publish([], { kind: 'unavailable' });
      loaded = true;
      return;
    }
    const profile = await settle(() => host.misc.getProfilePath());
    if (disposed) return;
    if (!profile) {
      publish([], { kind: 'failed' });
      loaded = true;
      return;
    }
    if (profile.success === false) {
      publish([], { kind: 'failed', code: profile.code });
      loaded = true;
      return;
    }
    if (!profile.path) {
      publish([], { kind: 'failed' });
      loaded = true;
      return;
    }
    filePath = customMeasurementPath(profile.path);
    const answer = await settle(() => host.file.read(filePath!));
    if (disposed) return;
    if (!answer) {
      publish([], { kind: 'failed' });
      loaded = true;
      return;
    }
    if (answer.success === false) {
      if (answer.code === 'NOT_FOUND') {
        publish([], { kind: 'empty' });
      } else {
        publish([], {
          kind: answer.code === 'PERMISSION_DENIED' ? 'denied' : 'failed',
          code: answer.code,
        });
      }
      loaded = true;
      return;
    }
    const profiles = parseFile(answer.content);
    publish(profiles ?? [], profiles ? (profiles.length ? { kind: 'ready' } : { kind: 'empty' }) : { kind: 'corrupt' });
    loaded = true;
  })();

  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const run = queue.then(work, work);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  type StoreOutcome =
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: MeasurementImportFailure; readonly code?: string };

  const writeAll = async (
    profiles: readonly CustomHeadphoneMeasurement[],
  ): Promise<StoreOutcome> => {
    if (!filePath) return { ok: false, reason: 'storage' };
    const text = storedText(profiles);
    if (text.length > CUSTOM_MEASUREMENT_MAX_BYTES) return { ok: false, reason: 'too-large' };
    const answer = await writeTextFile(host.file, filePath, text);
    if (answer.ok) return { ok: true };
    return {
      ok: false,
      reason:
        answer.code === 'PERMISSION_DENIED'
          ? 'denied'
          : answer.code === 'NOT_SUPPORTED'
            ? 'unavailable'
            : 'storage',
      ...(answer.code ? { code: answer.code } : {}),
    };
  };

  return {
    ready,
    profiles: profilesAtom,
    status: statusAtom,
    async preview(url, signal) {
      await ready;
      if (signal?.aborted) return { ok: false, reason: 'cancelled' };
      const link = parseHuihifiEvaluationLink(url);
      if (!link) return { ok: false, reason: 'invalid-url' };
      const answer = await settle(() =>
        host.http.request(huihifiEvaluationApiUrl(link.uuid), {
          timeout: HTTP_TIMEOUT_MS,
          headers: { 'User-Agent': APP_USER_AGENT, Accept: 'application/json' },
          redirect: 'error',
        }),
      );
      if (signal?.aborted) return { ok: false, reason: 'cancelled' };
      if (!answer) return { ok: false, reason: 'network' };
      if (answer.status === 404) return { ok: false, reason: 'not-found' };
      if (answer.status !== 200) return { ok: false, reason: 'http' };
      if (typeof answer.body !== 'string' || answer.body.length > MAX_BODY_BYTES) {
        return { ok: false, reason: 'too-large' };
      }
      let payload: unknown;
      try {
        payload = JSON.parse(answer.body);
      } catch {
        return { ok: false, reason: 'payload' };
      }
      const parsed = parseHuihifiEvaluationPayload(payload, link.uuid);
      if (!parsed.ok) {
        return {
          ok: false,
          reason: parsed.reason === 'too-large' ? 'too-large' : 'payload',
        };
      }
      const current = store.get(profilesAtom);
      return {
        ok: true,
        value: {
          ...parsed.value,
          overwrite: current.some((profile) => profile.uuid === link.uuid),
          bundledDuplicate: bundledMeasurementOptionByUuid(link.uuid) !== undefined,
        },
      };
    },
    commit(preview) {
      return exclusive(async () => {
        await ready;
        if (!loaded || !filePath) {
          const status = store.get(statusAtom);
          const code =
            status.kind === 'denied' || status.kind === 'failed' || status.kind === 'unavailable'
              ? status.code
              : undefined;
          return {
            ok: false,
            reason:
              status.kind === 'denied'
                ? 'denied'
                : status.kind === 'unavailable'
                  ? 'unavailable'
                  : 'storage',
            ...(code ? { code } : {}),
          };
        }
        const uuid = preview.uuid.toLowerCase();
        if (!UUID_PATTERN.test(uuid)) return { ok: false, reason: 'payload' };
        const id = `${CUSTOM_MEASUREMENT_ID_PREFIX}${uuid}`;
        const candidate = sanitizeProfile({
          ...preview,
          id,
          uuid,
          importedAt: new Date(now()).toISOString(),
          frequencyResponse: preview.frequencyResponse.map((point) => [point.hz, point.db]),
          impedance: preview.impedance.map((point) => [point.hz, point.ohm]),
        });
        if (!candidate) return { ok: false, reason: 'payload' };
        const current = store.get(profilesAtom);
        const replaced = current.some((profile) => profile.id === id);
        if (!replaced && current.length >= CUSTOM_MEASUREMENT_LIMIT) {
          return { ok: false, reason: 'limit' };
        }
        const next = replaced
          ? current.map((profile) => (profile.id === id ? candidate : profile))
          : [...current, candidate];
        const stored = await writeAll(next);
        if (!stored.ok) return stored;
        publish(next, next.length ? { kind: 'ready' } : { kind: 'empty' });
        return { ok: true, value: { id, replaced } };
      });
    },
    remove(id) {
      return exclusive(async () => {
        await ready;
        if (!id.startsWith(CUSTOM_MEASUREMENT_ID_PREFIX)) {
          return { ok: true, value: { removed: false } };
        }
        const current = store.get(profilesAtom);
        if (!current.some((profile) => profile.id === id)) {
          return { ok: true, value: { removed: false } };
        }
        if (!filePath) return { ok: false, reason: 'storage' };
        const next = current.filter((profile) => profile.id !== id);
        const stored = await writeAll(next);
        if (!stored.ok) return stored;
        publish(next, next.length ? { kind: 'ready' } : { kind: 'empty' });
        return { ok: true, value: { removed: true } };
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      waiter.cancel();
    },
  };
}
