import { useAtomValueRawSync } from 'jotai/react';
import { useEffect, useRef, useState } from 'react';
import { translateAtom } from '../../i18n/locale.ts';
import type { MessageKey } from '../../i18n/en.ts';
import { useLightDismiss } from '../../nav/useLightDismiss.ts';
import {
  formatMargin,
  formatPower,
  formatSpl,
  formatVoltage,
  type SoundPressureReading,
} from '../../playback/soundPressure.ts';
import { soundPressureViewAtom, type SoundPressureAuto } from './soundPressureReading.ts';
import { SoundPressurePanel } from './SoundPressurePanel.tsx';
import styles from './SoundPressureCell.module.css';

export interface SoundPressureCellProps {
  /** `stage` 是 1920 × 1080 舞台上的三行；`sheet` 是版心档右栏里的一格。 */
  readonly variant: 'stage' | 'sheet';
}

function stateHint(reading: SoundPressureReading): MessageKey | null {
  switch (reading.state) {
    case 'no-device':
      return 'immersive.soundPressureNoDevice';
    case 'no-amp':
      return 'immersive.soundPressureNoAmp';
    case 'no-headphone':
      return 'immersive.soundPressureNoHeadphone';
    case 'no-loudness':
      return 'immersive.soundPressureNoLoudness';
    default:
      return null;
  }
}

function autoHint(auto: SoundPressureAuto): MessageKey | null {
  switch (auto.reason) {
    case 'unsupported':
      return 'settings.dx52Unsupported';
    case 'unauthorized':
      return 'settings.dx52Unauthorized';
    case 'connecting':
      return 'settings.dx52Connecting';
    case 'busy':
      return 'settings.dx52Busy';
    case 'error':
      return 'settings.dx52Error';
    case 'not-usb':
      return 'settings.dx52NotUsb';
    case 'line':
      return 'settings.dx52LineOutput';
    case 'wrong-output':
      return 'settings.dx52WrongOutput';
    case 'off':
      return 'settings.dx52PoweredOff';
    default:
      return null;
  }
}

/** 平均 LUFS 的显示：负数用排版减号，与余量一致。 */
const lufsText = (value: number | null): string =>
  value === null ? '—' : value.toFixed(1).replace('-', '−');

/**
 * 右栏里的耳机输出声压：SPL、功率、电压与到 80 dB 的安全余量，实时跟着 Short-term LUFS 与音量走。
 * 只在图纸与聚焦视图替换 Genre 的位置；点开是设备浮层，选择立即生效。
 */
export function SoundPressureCell({ variant }: SoundPressureCellProps) {
  const t = useAtomValueRawSync(translateAtom);
  const { rig, amp, headphone, reading, averageReading, averageLufs, auto } =
    useAtomValueRawSync(soundPressureViewAtom);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const markInside = useLightDismiss({
    id: 'immersive-sound-pressure',
    open,
    panel,
    exempt: (target) => trigger.current?.contains(target) ?? false,
    onDismiss: (escape) => {
      setOpen(false);
      if (escape) requestAnimationFrame(() => trigger.current?.focus());
    },
  });
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const autoTitle = auto.state
    ? `${auto.state.deviceName || 'TOPPING DX5 II'}${auto.output ? ` · ${auto.output.label}` : ''}`
    : 'TOPPING DX5 II';
  const device = auto.enabled
    ? auto.active
      ? amp && headphone
        ? `${amp.name} · ${headphone.name}`
        : autoTitle
      : autoTitle
    : amp && headphone
      ? `${amp.name} · ${headphone.name}`
      : null;
  const hint = auto.enabled && !auto.active ? autoHint(auto) : stateHint(reading);
  const margin =
    reading.marginDb === null
      ? null
      : reading.marginDb >= 0
        ? `${t('immersive.soundPressureMargin')} ${formatMargin(reading.marginDb)} dB`
        : `${t('immersive.soundPressureOverLimit')} ${Math.abs(reading.marginDb).toFixed(1)} dB`;
  const detail =
    reading.powerMw !== null && reading.voltage !== null && margin !== null
      ? `${formatPower(reading.powerMw)} · ${formatVoltage(reading.voltage)} · ${margin}`
      : hint
        ? t(hint)
        : '—';
  const title = device ? `SPL · ${device}` : `SPL · ${t('immersive.soundPressureUnset')}`;
  const rate =
    auto.state?.sampleRate && auto.state.sampleRate >= 1000
      ? ` · ${Math.round(auto.state.sampleRate / 1000)} kHz`
      : '';
  const autoDetail = auto.enabled
    ? auto.active && auto.state && auto.output
      ? `${t('immersive.dx52Auto')} · ${auto.state.deviceName || 'TOPPING DX5 II'} · ${auto.output.label} · ${
          auto.state.highGain ? t('settings.dx52HighGain') : t('settings.dx52LowGain')
        } · ${t('immersive.dx52DeviceVolume')} ${auto.state.volumeDb.toFixed(1)} dB${rate}`
      : hint
        ? t(hint)
        : ''
    : '';
  return (
    <div className={styles.cell} data-variant={variant} data-state={reading.state} data-field="soundPressure">
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t('immersive.soundPressure')}: ${title}, ${formatSpl(reading.spl)} dB SPL`}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className={styles.key} title={title}>
          {title}
        </span>
        <span className={styles.value} data-sound-pressure-spl>
          {formatSpl(reading.spl)} dB SPL
        </span>
        <span className={styles.detail}>{detail}</span>
        {variant === 'stage' && (
          <span
            className={styles.average}
            data-sound-pressure-average
            title={t('immersive.soundPressureAverageHint')}
          >
            {t('immersive.soundPressureAverage')} {formatSpl(averageReading.spl)} dB SPL ·{' '}
            {lufsText(averageLufs)} LUFS
          </span>
        )}
      </button>
      {open && (
        <SoundPressurePanel
          rig={rig}
          reading={reading}
          averageReading={averageReading}
          averageLufs={averageLufs}
          autoDetail={autoDetail}
          panelSide="below"
          variant={variant}
          onClose={close}
          onPointerDownCapture={markInside}
          panelRef={panel}
        />
      )}
    </div>
  );
}
