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
import { liveLoudnessAtom } from '../gauges/liveLoudness.ts';

export interface SoundPressureView {
  readonly rig: HeadphoneRig;
  readonly amp: AmpProfile | null;
  readonly headphone: HeadphoneProfile | null;
  readonly reading: SoundPressureReading;
}

/** 沉浸组件用的组合：设备选择 + 当前 Short-term LUFS + 播放器音量/静音。 */
export const soundPressureViewAtom: Atom<SoundPressureView> = atom((get) => {
  const rig = get(headphoneRigAtom);
  const { amp, headphone } = selectedRig(rig);
  const { shortTerm } = get(liveLoudnessAtom);
  return {
    rig,
    amp,
    headphone,
    reading: estimateSoundPressure(
      { shortTermLufs: shortTerm, volumeDb: get(volumeDbAtom), muted: get(mutedAtom) },
      rig,
    ),
  };
});
