import {
  curvePoints,
  downsampleCurve,
  impedancePoints,
  logGrid,
  normalizeFrequencyResponse,
  type HeadphoneMeasurement,
} from './measurementCurves.ts';

export const HUHIHIFI_ORIGIN = 'https://huihifi.com';
export const HUHIHIFI_API_PREFIX = `${HUHIHIFI_ORIGIN}/api/v1/evaluations/`;
export const CUSTOM_MEASUREMENT_ID_PREFIX = 'huihifi-custom-';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DATAS = 64;
const MAX_ROWS = 10_000;
const FR_POINTS = 240;
const IMPEDANCE_POINTS = 180;

export type HuihifiParseFailure =
  | 'invalid-url'
  | 'payload'
  | 'too-large';

export type HuihifiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: HuihifiParseFailure };

export interface HuihifiEvaluationProfile extends HeadphoneMeasurement {
  readonly brand: string;
  readonly rawPointCounts: {
    readonly frequencyResponse: number;
    readonly impedance: number;
  };
}

export function parseHuihifiEvaluationLink(
  input: string,
): { readonly uuid: string; readonly canonicalUrl: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'huihifi.com' && host !== 'www.huihifi.com') return null;
  const match = /^\/evaluation\/([0-9a-f-]{36})\/?$/i.exec(url.pathname);
  if (!match?.[1] || !UUID_PATTERN.test(match[1])) return null;
  const uuid = match[1].toLowerCase();
  return { uuid, canonicalUrl: `${HUHIHIFI_ORIGIN}/evaluation/${uuid}` };
}

export function huihifiEvaluationApiUrl(uuid: string): string {
  return `${HUHIHIFI_API_PREFIX}${uuid}`;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 显式拒绝空串：Number('') === 0 会把表头/空单元格变成 0 Hz。 */
function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value: unknown, limit = 128): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function numericRows(value: unknown): number[][] {
  if (!Array.isArray(value) || value.length > MAX_ROWS) return [];
  const rows: number[][] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const hz = finiteNumber(row[0]);
    const amount = finiteNumber(row[1]);
    if (hz === null || amount === null) continue;
    rows.push([hz, amount]);
  }
  return rows;
}

function projectRows(data: Record<string, unknown>, code: string): number[][] | 'too-large' {
  const datas = Array.isArray(data['datas']) ? data['datas'] : [];
  if (datas.length > MAX_DATAS) return 'too-large';
  for (const entry of datas) {
    if (!record(entry)) continue;
    const project = entry['project'];
    if (!record(project) || project['code'] !== code) continue;
    const children = entry['children'];
    const child = Array.isArray(children) ? children[0] : undefined;
    if (!record(child)) return [];
    const rows = numericRows(child['dataSet']);
    return rows;
  }
  return [];
}

/** 解析 huihifi API 载荷；不联网、不写盘。 */
export function parseHuihifiEvaluationPayload(
  payload: unknown,
  expectedUuid: string,
): HuihifiResult<HuihifiEvaluationProfile> {
  if (!record(payload)) return { ok: false, reason: 'payload' };
  const code = payload['code'];
  if (code !== undefined && code !== 0) return { ok: false, reason: 'payload' };
  const data = payload['data'];
  if (!record(data)) return { ok: false, reason: 'payload' };
  const uuidValue = data['uuid'];
  if (uuidValue !== undefined) {
    if (typeof uuidValue !== 'string' || uuidValue.toLowerCase() !== expectedUuid) {
      return { ok: false, reason: 'payload' };
    }
  }
  const frRaw = projectRows(data, 'RAW_FR');
  if (frRaw === 'too-large') return { ok: false, reason: 'too-large' };
  const impedanceRaw = projectRows(data, 'IMPEDANCE');
  if (impedanceRaw === 'too-large') return { ok: false, reason: 'too-large' };
  const fr = curvePoints(frRaw);
  if (fr.length < 8) return { ok: false, reason: 'payload' };
  const low = fr[0]?.hz ?? 0;
  const high = fr[fr.length - 1]?.hz ?? 0;
  if (low > 100 || high < 10_000 || low > 1000 || high < 1000) {
    return { ok: false, reason: 'payload' };
  }
  const impedance = impedancePoints(impedanceRaw);
  const frGrid = logGrid(20, 20_000, FR_POINTS);
  const frPoints = downsampleCurve(
    normalizeFrequencyResponse(fr),
    frGrid,
    (point) => point.db,
  ).map(([hz, db]) => ({ hz, db }));
  const impedancePointsOut = impedance.length
    ? downsampleCurve(
        impedance,
        logGrid(20, 20_000, IMPEDANCE_POINTS),
        (point) => point.ohm,
      ).map(([hz, ohm]) => ({ hz, ohm }))
    : [];
  const brand = cleanText(record(data['brand']) ? data['brand']['title'] : '');
  const title = cleanText(data['title']);
  const name = title || brand || `huihifi-${expectedUuid.slice(0, 8)}`;
  const id = `${CUSTOM_MEASUREMENT_ID_PREFIX}${expectedUuid}`;
  return {
    ok: true,
    value: {
      id,
      uuid: expectedUuid,
      name,
      brand,
      source: 'huihifi',
      sourceUrl: `${HUHIHIFI_ORIGIN}/evaluation/${expectedUuid}`,
      fetchedAt: new Date().toISOString().slice(0, 10),
      frReference: 'voltage',
      driveImpedanceOhm: null,
      rawPointCounts: {
        frequencyResponse: frRaw.length,
        impedance: impedanceRaw.length,
      },
      frequencyResponse: frPoints,
      impedance: impedancePointsOut,
    },
  };
}
