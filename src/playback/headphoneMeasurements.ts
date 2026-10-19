import raw from './headphoneMeasurements.json' with { type: 'json' };
import {
  curvePoints,
  impedancePoints,
  type HeadphoneMeasurement,
  type RawCurveRow,
} from './measurementCurves.ts';

export type {
  HeadphoneMeasurement,
  MeasurementCurvePoint,
  MeasurementImpedancePoint,
} from './measurementCurves.ts';
export {
  bandResponseDb,
  frDbAt,
  impedanceOhmAt,
  referenceImpedanceOhm,
} from './measurementCurves.ts';

interface RawProfile {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly sourceUrl: string;
  readonly uuid: string;
  readonly fetchedAt: string;
  readonly frReference: 'voltage' | 'power';
  readonly driveImpedanceOhm: number | null;
  readonly frequencyResponse: readonly RawCurveRow[];
  readonly impedance: readonly RawCurveRow[];
}

interface RawFile {
  readonly schema: number;
  readonly profiles: readonly RawProfile[];
}

const profiles: readonly HeadphoneMeasurement[] = ((raw as unknown as RawFile).profiles ?? []).map(
  (profile) => ({
    id: profile.id,
    name: profile.name,
    source: profile.source,
    sourceUrl: profile.sourceUrl,
    uuid: profile.uuid,
    fetchedAt: profile.fetchedAt,
    frReference: profile.frReference === 'power' ? 'power' : 'voltage',
    driveImpedanceOhm:
      typeof profile.driveImpedanceOhm === 'number' ? profile.driveImpedanceOhm : null,
    frequencyResponse: curvePoints(profile.frequencyResponse ?? []),
    impedance: impedancePoints(profile.impedance ?? []),
  }),
);

const byId = new Map(profiles.map((profile) => [profile.id, profile]));

export const HEADPHONE_MEASUREMENTS: readonly HeadphoneMeasurement[] = profiles;

/** 先查自定义档案，再查内置；未知/空 id 返回 null，调用方回退标称参数。 */
export function measurementProfileOf(
  id: string | null | undefined,
  custom: readonly HeadphoneMeasurement[] = [],
): HeadphoneMeasurement | null {
  if (!id) return null;
  return custom.find((profile) => profile.id === id) ?? byId.get(id) ?? null;
}
