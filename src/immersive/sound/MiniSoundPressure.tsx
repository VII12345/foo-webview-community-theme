import { useAtomValueRawSync } from 'jotai/react';
import { translateAtom } from '../../i18n/locale.ts';
import { formatMargin, formatSpl } from '../../playback/soundPressure.ts';
import { splUnit } from '../../playback/splWeighting.ts';
import { autoHint, stateHint } from './soundPressureHints.ts';
import { soundPressureViewAtom } from './soundPressureReading.ts';
import styles from './MiniSoundPressure.module.css';

/**
 * 迷你播放器上的瞬时声压读数：一行 `72.4 dBA`，放在底部进度行右侧。
 *
 * 自己订阅读数原子（约 20 Hz 更新），所以必须保持独立小组件：内联进 MiniPlayer
 * 会让整个迷你播放器跟着 20 Hz 重渲染。
 */
export function MiniSoundPressure() {
  const t = useAtomValueRawSync(translateAtom);
  const { reading, weighting, auto } = useAtomValueRawSync(soundPressureViewAtom);
  const hint = auto.enabled && !auto.active ? autoHint(auto) : stateHint(reading);
  const text =
    reading.spl === null ? '—' : `${formatSpl(reading.spl)} ${splUnit(weighting)}`;
  const margin =
    reading.marginDb === null
      ? null
      : reading.marginDb >= 0
        ? `${t('immersive.soundPressureMargin')} ${formatMargin(reading.marginDb)} dB`
        : `${t('immersive.soundPressureOverLimit')} ${Math.abs(reading.marginDb).toFixed(1)} dB`;
  const title = hint ? t(hint) : (margin ?? t('immersive.soundPressure'));
  return (
    <span
      className={styles.value}
      data-mini-spl
      title={title}
      aria-label={`${t('immersive.soundPressure')}: ${text}`}
    >
      {text}
    </span>
  );
}
