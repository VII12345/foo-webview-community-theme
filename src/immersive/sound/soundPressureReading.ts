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
import { headphoneRigAtom } from '../../playback/soundPressurePrefs.ts';
import {
  estimateSoundPressure,
  selectedRig,
  type AmpProfile,
  type HeadphoneProfile,
  type HeadphoneRig,
  type SoundPressureReading,
} from '../../playback/soundPressure.ts';
import { channelWeightSum } from '../gauges/loudnessMeter.ts';
import { liveLoudnessAtom } from '../gauges/liveLoudness.ts';

export type Dx52Reason =
  | 'unsupported'
  | 'unauthorized'
  | 'connecting'
  | 'busy'
  | 'error'
  | 'off'
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
  readonly auto: SoundPressureAuto;
}

const UNAVAILABLE: SoundPressureReading = {
  state: 'no-loudness',
  spl: null,
  powerMw: null,
  voltage: null,
  marginDb: null,
};

function autoReason(
  enabled: boolean,
  status: Dx52Status,
  state: Dx52State | null,
  output: Dx52OutputInfo | null,
): Dx52Reason | null {
  if (!enabled) return null;
  if (!state?.connected || !state.powered) {
    if (status.kind === 'unsupported' || status.kind === 'unauthorized' || status.kind === 'busy')
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

/** 沉浸组件用的组合：设备选择 + 当前 Short-term LUFS + 播放器音量/静音。 */
export const soundPressureViewAtom: Atom<SoundPressureView> = atom((get) => {
  const rig = get(headphoneRigAtom);
  const selected = selectedRig(rig);
  const { shortTerm, average, channels } = get(liveLoudnessAtom);
  const weightSum = channelWeightSum(channels);
  const channelGainDb = weightSum > 0 ? 10 * Math.log10(2 / weightSum) : 0;
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

  const shortLufs = enabled && !active ? null : shortTerm;
  const avgLufs = enabled && !active ? null : average;
  const isMuted = muted || (enabled && active ? (state?.muted ?? false) : false);
  const reading =
    enabled && !active
      ? UNAVAILABLE
      : estimateSoundPressure(
          { shortTermLufs: shortLufs, volumeDb, muted: isMuted, channelGainDb },
          effective.rig,
        );
  const averageReading =
    enabled && !active
      ? UNAVAILABLE
      : estimateSoundPressure(
          { shortTermLufs: avgLufs, volumeDb, muted: isMuted, channelGainDb },
          effective.rig,
        );

  return {
    rig,
    amp: effective.amp,
    headphone: selected.headphone,
    reading,
    averageReading,
    averageLufs: avgLufs,
    auto: { enabled, active, reason: decision.reason, output: decision.output, state },
  };
});
