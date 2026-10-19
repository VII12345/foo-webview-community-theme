import { atom, type Atom } from 'jotai/vanilla';
import { mutedAtom, volumeDbAtom } from '../../playback/playback.ts';
import {
  dx52AmpProfile,
  dx52OutputInfo,
  type Dx52Jack,
  type Dx52OutputInfo,
  type Dx52State,
} from '../../playback/dx52.ts';
import {
  dx52EnabledAtom,
  dx52JackAtom,
  dx52StateAtom,
  dx52StatusAtom,
  type Dx52Status,
} from '../../playback/dx52Prefs.ts';
import { headphoneRigAtom, splWeightingAtom } from '../../playback/soundPressurePrefs.ts';
import {
  bandResponseDb,
  measurementProfileOf,
  referenceImpedanceOhm,
} from '../../playback/headphoneMeasurements.ts';
import { customMeasurementProfilesAtom } from '../../playback/customHeadphoneMeasurements.ts';
import {
  estimateSoundPressure,
  estimateSoundPressureFromBands,
  estimateSoundPressureFromRms,
  selectedRig,
  type AmpProfile,
  type HeadphoneProfile,
  type HeadphoneRig,
  type SoundPressureReading,
} from '../../playback/soundPressure.ts';
import { SPL_BAND_EDGES } from '../../playback/splBands.ts';
import type { SplWeighting } from '../../playback/splWeighting.ts';
import { channelWeightSum } from '../gauges/loudnessMeter.ts';
import { liveLoudnessAtom } from '../gauges/liveLoudness.ts';
import { liveBandPowerAtom } from '../spectrum/liveBandPower.ts';
import { weightTables } from './splWeightingCurves.ts';

export type Dx52Reason =
  | 'unsupported'
  | 'unauthorized'
  | 'waiting'
  | 'connecting'
  | 'busy'
  | 'error'
  | 'off'
  | 'partial'
  | 'line'
  | 'not-usb';

export interface SoundPressureAuto {
  readonly enabled: boolean;
  readonly active: boolean;
  readonly reason: Dx52Reason | null;
  readonly output: Dx52OutputInfo | null;
  readonly state: Dx52State | null;
}

export interface SoundPressureView {
  readonly rig: HeadphoneRig;
  readonly amp: AmpProfile | null;
  readonly headphone: HeadphoneProfile | null;
  readonly reading: SoundPressureReading;
  /** 曲首至今已播放片段的平均读数；没有足够数据时为 no-loudness。 */
  readonly averageReading: SoundPressureReading;
  readonly averageLufs: number | null;
  readonly weighting: SplWeighting;
  readonly auto: SoundPressureAuto;
}

const UNAVAILABLE: SoundPressureReading = {
  state: 'no-loudness',
  spl: null,
  splA: null,
  splK: null,
  splZ: null,
  powerMw: null,
  voltage: null,
  marginDb: null,
  method: 'none',
};

function autoReason(
  enabled: boolean,
  status: Dx52Status,
  state: Dx52State | null,
  output: Dx52OutputInfo | null,
): Dx52Reason | null {
  if (!enabled) return null;
  if (!state?.connected || !state.powered) {
    if (state?.partial) return 'partial';
    if (
      status.kind === 'unsupported' ||
      status.kind === 'unauthorized' ||
      status.kind === 'waiting' ||
      status.kind === 'busy'
    )
      return status.kind;
    if (status.kind === 'connecting') return 'connecting';
    if (status.kind === 'error') return 'error';
    return 'off';
  }
  if (state.input !== 'usb') return 'not-usb';
  if (!output?.headphone) return 'line';
  return null;
}

export interface Dx52Reading {
  readonly reason: Dx52Reason | null;
  readonly active: boolean;
  readonly output: Dx52OutputInfo | null;
  readonly amp: AmpProfile | null;
}

/** 自动模式是否可用：开关、连接/电源/输入/路由逐项判断；不检查 foobar 当前输出设备名。 */
export function dx52Reading(
  enabled: boolean,
  status: Dx52Status,
  state: Dx52State | null,
  jack: Dx52Jack,
): Dx52Reading {
  const output = state ? dx52OutputInfo(state.route, jack) : null;
  const profile = state ? dx52AmpProfile(state, jack) : null;
  const reason = autoReason(enabled, status, state, output);
  return {
    reason,
    active: enabled && reason === null && profile !== null,
    output,
    amp: profile?.amp ?? null,
  };
}

/** DX52 自动读数可用且选好了耳机：全局实时响度据此在离开沉浸页后继续为播放统计取样。 */
export const soundPressureAutoActiveAtom: Atom<boolean> = atom((get) => {
  const decision = dx52Reading(
    get(dx52EnabledAtom),
    get(dx52StatusAtom),
    get(dx52StateAtom),
    get(dx52JackAtom),
  );
  if (!decision.active) return false;
  return selectedRig(get(headphoneRigAtom)).headphone !== null;
});

/** 沉浸组件用的组合：设备选择 + 当前频谱/RMS + 播放器音量/静音。 */
export const soundPressureViewAtom: Atom<SoundPressureView> = atom((get) => {
  const rig = get(headphoneRigAtom);
  const selected = selectedRig(rig);
  const live = get(liveLoudnessAtom);
  const bands = get(liveBandPowerAtom);
  const weighting = get(splWeightingAtom);
  const volumeDb = get(volumeDbAtom);
  const muted = get(mutedAtom);
  const enabled = get(dx52EnabledAtom);
  const state = get(dx52StateAtom);
  const status = get(dx52StatusAtom);
  const jack = get(dx52JackAtom);
  const decision = dx52Reading(enabled, status, state, jack);
  const active = decision.active;

  const effective =
    active && decision.amp
      ? {
          rig: { ...rig, amps: [decision.amp], selectedAmpId: decision.amp.id },
          amp: decision.amp,
        }
      : { rig, amp: selected.amp };

  const headphone = selected.headphone;
  const customMeasurements = get(customMeasurementProfilesAtom);
  const profile = measurementProfileOf(headphone?.measurementProfileId, customMeasurements);
  const edges = bands.edges.length ? bands.edges : SPL_BAND_EDGES;
  const referenceOhm = headphone
    ? referenceImpedanceOhm(profile, headphone.impedanceOhm)
    : 0;
  const ampOutputImpedanceOhm = active ? 0.2 : 0;
  const responseDb = headphone
    ? bandResponseDb(profile, edges, ampOutputImpedanceOhm, headphone.impedanceOhm)
    : new Float64Array(Math.max(0, edges.length - 1));
  const weights = weightTables(edges, bands.sampleRate || 48000);
  const shortLufs = enabled && !active ? null : live.shortTerm;
  const avgLufs = enabled && !active ? null : live.average;
  const isMuted = muted || (enabled && active ? (state?.muted ?? false) : false);
  const weightSum = channelWeightSum(live.channels);
  const channelGainDb = weightSum > 0 ? 10 * Math.log10(2 / weightSum) : 0;

  const sharesFor = (
    rms: readonly number[] | null,
    left: Float32Array | null,
    right: Float32Array | null,
  ): readonly (ArrayLike<number> | null)[] | null => {
    if (!rms || !left || left.length === 0) return null;
    if (rms.length > 2) return null;
    if (bands.channels <= 1 || !right || right.length !== left.length)
      return Array.from({ length: rms.length }, () => left);
    return rms.length >= 2 ? [left, right] : [left];
  };

  const estimate = (
    rms: readonly number[] | null,
    left: Float32Array | null,
    right: Float32Array | null,
    lufs: number | null,
  ): SoundPressureReading => {
    if (enabled && !active) return UNAVAILABLE;
    const shares = sharesFor(rms, left, right);
    if (shares && !bands.failed) {
      return estimateSoundPressureFromBands(
        {
          sharesByChannel: shares,
          rmsDbfsByChannel: rms,
          bandResponseDb: responseDb,
          bandWeightDb: weights,
          volumeDb,
          muted: isMuted,
          weighting,
          referenceImpedanceOhm: referenceOhm,
          ampOutputImpedanceOhm,
        },
        effective.rig,
      );
    }
    if (rms) {
      return estimateSoundPressureFromRms(
        {
          rmsDbfsByChannel: rms,
          volumeDb,
          muted: isMuted,
          weighting,
          referenceImpedanceOhm: referenceOhm,
          ampOutputImpedanceOhm,
        },
        effective.rig,
      );
    }
    return estimateSoundPressure(
      { shortTermLufs: lufs, volumeDb, muted: isMuted, channelGainDb },
      effective.rig,
    );
  };

  const reading = estimate(
    enabled && !active ? null : live.rmsDbfsByChannel,
    bands.shortTermLeft,
    bands.shortTermRight,
    shortLufs,
  );
  const averageReading = estimate(
    enabled && !active ? null : live.averageRmsDbfsByChannel,
    bands.averageLeft,
    bands.averageRight,
    avgLufs,
  );

  return {
    rig,
    amp: effective.amp,
    headphone,
    reading,
    averageReading,
    averageLufs: avgLufs,
    weighting,
    auto: { enabled, active, reason: decision.reason, output: decision.output, state },
  };
});
