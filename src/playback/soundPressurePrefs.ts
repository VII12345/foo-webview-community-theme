import type { ConfigWriter } from '../host/configWrite.ts';
import type { Atom } from 'jotai/vanilla';
import {
  defineConfigPref,
  startConfigPrefs,
  type ConfigPersistence,
  type ConfigPrefFace,
} from '../host/configPref.ts';
import { serviceKey } from '../kit/serviceKey.ts';
import type { Store } from '../kit/store.ts';
import {
  emptyRig,
  HEADPHONE_RIG_KEY,
  normalizeAmp,
  normalizeHeadphone,
  parseHeadphoneRig,
  RIG_DEVICE_LIMIT,
  type AmpProfile,
  type HeadphoneProfile,
  type HeadphoneRig,
} from './soundPressure.ts';
import {
  parseSplWeighting,
  SPL_WEIGHTING_DEFAULT,
  SPL_WEIGHTING_KEY,
  type SplWeighting,
} from './splWeighting.ts';

const RIG_PREF = defineConfigPref<HeadphoneRig>(
  HEADPHONE_RIG_KEY,
  emptyRig(),
  (raw) => parseHeadphoneRig(raw),
);

const WEIGHTING_PREF = defineConfigPref<SplWeighting>(
  SPL_WEIGHTING_KEY,
  SPL_WEIGHTING_DEFAULT,
  parseSplWeighting,
);

export const headphoneRigAtom: Atom<HeadphoneRig> = RIG_PREF.atom;
export const splWeightingAtom: Atom<SplWeighting> = WEIGHTING_PREF.atom;

export interface SoundPressureService {
  readonly ready: Promise<void>;
  readonly persistence: ConfigPersistence;
  readonly rig: Atom<HeadphoneRig>;
  readonly weighting: Atom<SplWeighting>;
  /** 新增并返回 id；到达上限或参数非法时答 null。 */
  addAmp(input: Omit<AmpProfile, 'id'>): string | null;
  updateAmp(id: string, input: Omit<AmpProfile, 'id'>): void;
  removeAmp(id: string): void;
  addHeadphone(input: Omit<HeadphoneProfile, 'id'>): string | null;
  updateHeadphone(id: string, input: Omit<HeadphoneProfile, 'id'>): void;
  removeHeadphone(id: string): void;
  selectAmp(id: string | null): void;
  selectHeadphone(id: string | null): void;
  setWeighting(value: SplWeighting): void;
  dispose(): void;
}

export const soundPressureKey = serviceKey<SoundPressureService>('soundPressure');

let fallbackCounter = 0;
function defaultId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  fallbackCounter += 1;
  return `rig-${Date.now()}-${fallbackCounter}`;
}

/**
 * 耳放与耳机分开维护、分开选择，组合成当前的一套。存宿主 config，随 profile 跨重启保留；
 * 设置页与沉浸浮层共用这一个服务，任意一边改动即时同步。
 */
export function startSoundPressure(
  store: Store,
  writer?: Pick<ConfigWriter, 'set'>,
  host: ConfigPrefFace | undefined = undefined,
  newId: () => string = defaultId,
): SoundPressureService {
  const prefs = startConfigPrefs(store, [RIG_PREF, WEIGHTING_PREF], host, writer);
  const read = () => store.get(RIG_PREF.atom);
  const write = (next: HeadphoneRig) => {
    void prefs.set(RIG_PREF, next);
  };
  const addAmp = (input: Omit<AmpProfile, 'id'>): string | null => {
    const current = read();
    if (current.amps.length >= RIG_DEVICE_LIMIT) return null;
    const id = newId();
    const amp = normalizeAmp({ ...input, id });
    if (!amp) return null;
    write({ ...current, amps: [...current.amps, amp] });
    return id;
  };
  const updateAmp = (id: string, input: Omit<AmpProfile, 'id'>) => {
    const current = read();
    if (!current.amps.some((amp) => amp.id === id)) return;
    const amp = normalizeAmp({ ...input, id });
    if (!amp) return;
    write({
      ...current,
      amps: current.amps.map((item) => (item.id === id ? amp : item)),
    });
  };
  const removeAmp = (id: string) => {
    const current = read();
    if (!current.amps.some((amp) => amp.id === id)) return;
    write({
      ...current,
      amps: current.amps.filter((amp) => amp.id !== id),
      selectedAmpId: current.selectedAmpId === id ? null : current.selectedAmpId,
    });
  };
  const addHeadphone = (input: Omit<HeadphoneProfile, 'id'>): string | null => {
    const current = read();
    if (current.headphones.length >= RIG_DEVICE_LIMIT) return null;
    const id = newId();
    const headphone = normalizeHeadphone({ ...input, id });
    if (!headphone) return null;
    write({ ...current, headphones: [...current.headphones, headphone] });
    return id;
  };
  const updateHeadphone = (id: string, input: Omit<HeadphoneProfile, 'id'>) => {
    const current = read();
    if (!current.headphones.some((item) => item.id === id)) return;
    const headphone = normalizeHeadphone({ ...input, id });
    if (!headphone) return;
    write({
      ...current,
      headphones: current.headphones.map((item) => (item.id === id ? headphone : item)),
    });
  };
  const removeHeadphone = (id: string) => {
    const current = read();
    if (!current.headphones.some((item) => item.id === id)) return;
    write({
      ...current,
      headphones: current.headphones.filter((item) => item.id !== id),
      selectedHeadphoneId:
        current.selectedHeadphoneId === id ? null : current.selectedHeadphoneId,
    });
  };
  return {
    ready: prefs.ready,
    persistence: prefs,
    rig: RIG_PREF.atom,
    weighting: WEIGHTING_PREF.atom,
    addAmp,
    updateAmp,
    removeAmp,
    addHeadphone,
    updateHeadphone,
    removeHeadphone,
    selectAmp(id) {
      const current = read();
      if (id !== null && !current.amps.some((amp) => amp.id === id)) return;
      write({ ...current, selectedAmpId: id });
    },
    selectHeadphone(id) {
      const current = read();
      if (id !== null && !current.headphones.some((item) => item.id === id)) return;
      write({ ...current, selectedHeadphoneId: id });
    },
    setWeighting(value) {
      void prefs.set(WEIGHTING_PREF, value);
    },
    dispose: prefs.dispose,
  };
}
