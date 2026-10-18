import { atom, type Atom } from 'jotai/vanilla';
import { mutedAtom, volumeDbAtom } from '../../playback/playback.ts';
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

export interface SoundPressureView {
  readonly rig: HeadphoneRig;
  readonly amp: AmpProfile | null;
  readonly headphone: HeadphoneProfile | null;
  readonly reading: SoundPressureReading;
  /** 曲首至今已播放片段的平均读数；没有足够数据时为 no-loudness。 */
  readonly averageReading: SoundPressureReading;
  readonly averageLufs: number | null;
}

/** 沉浸组件用的组合：设备选择 + 当前 Short-term LUFS + 播放器音量/静音。 */
export const soundPressureViewAtom: Atom<SoundPressureView> = atom((get) => {
  const rig = get(headphoneRigAtom);
  const { amp, headphone } = selectedRig(rig);
  const { shortTerm, average, channels } = get(liveLoudnessAtom);
  const weightSum = channelWeightSum(channels);
  const channelGainDb = weightSum > 0 ? 10 * Math.log10(2 / weightSum) : 0;
  const volumeDb = get(volumeDbAtom);
  const muted = get(mutedAtom);
  return {
    rig,
    amp,
    headphone,
    reading: estimateSoundPressure(
      { shortTermLufs: shortTerm, volumeDb, muted, channelGainDb },
      rig,
    ),
    averageReading: estimateSoundPressure(
      { shortTermLufs: average, volumeDb, muted, channelGainDb },
      rig,
    ),
    averageLufs: average,
  };
});
