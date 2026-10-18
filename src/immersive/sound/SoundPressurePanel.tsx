import { Button, Input, Tooltip } from '@fluentui/react-components';
import {
  Add16Regular,
  Delete16Regular,
  Dismiss16Regular,
  Edit16Regular,
} from '@fluentui/react-icons';
import { useAtomValueRawSync } from 'jotai/react';
import { useState, type PointerEventHandler, type Ref } from 'react';
import { translateAtom } from '../../i18n/locale.ts';
import { useService } from '../../kit/useService.ts';
import {
  AMP_GAIN_DEFAULT,
  AMP_GAIN_MAX,
  AMP_GAIN_MIN,
  AMP_VRMS_DEFAULT,
  AMP_VRMS_MAX,
  AMP_VRMS_MIN,
  convertSensitivity,
  formatSpl,
  HEADPHONE_IMPEDANCE_DEFAULT,
  HEADPHONE_IMPEDANCE_MAX,
  HEADPHONE_IMPEDANCE_MIN,
  HEADPHONE_SENS_DB_MW_MAX,
  HEADPHONE_SENS_DB_MW_MIN,
  HEADPHONE_SENS_DB_V_MAX,
  HEADPHONE_SENS_DB_V_MIN,
  HEADPHONE_SENS_DEFAULT,
  type HeadphoneRig,
  type SensitivityUnit,
  type SoundPressureReading,
} from '../../playback/soundPressure.ts';
import { soundPressureKey } from '../../playback/soundPressurePrefs.ts';
import styles from './SoundPressurePanel.module.css';

type AmpDraft = {
  readonly kind: 'amp';
  readonly id?: string;
  readonly name: string;
  readonly vrms: string;
  readonly gain: string;
};

type HeadphoneDraft = {
  readonly kind: 'headphone';
  readonly id?: string;
  readonly name: string;
  readonly impedance: string;
  readonly sensitivity: string;
  readonly unit: SensitivityUnit;
};

type Draft = AmpDraft | HeadphoneDraft;

const lufsText = (value: number | null): string =>
  value === null ? '—' : value.toFixed(1).replace('-', '−');

export interface SoundPressurePanelProps {
  readonly rig: HeadphoneRig;
  readonly reading: SoundPressureReading;
  readonly averageReading: SoundPressureReading;
  readonly averageLufs: number | null;
  readonly autoDetail?: string;
  readonly panelSide: 'below' | 'above';
  readonly variant: 'stage' | 'sheet';
  readonly onClose: () => void;
  readonly onPointerDownCapture?: PointerEventHandler<HTMLDivElement>;
  readonly panelRef?: Ref<HTMLDivElement>;
}

/**
 * 声压组件的设备浮层：耳放/耳机两页，选行立即生效；可新增、编辑、删除。
 * 面板用舞台内绝对定位，不用 Fluent Portal，才能跟着舞台缩放走。
 */
export function SoundPressurePanel({
  rig,
  reading,
  averageReading,
  averageLufs,
  autoDetail,
  panelSide,
  variant,
  onClose,
  onPointerDownCapture,
  panelRef,
}: SoundPressurePanelProps) {
  const t = useAtomValueRawSync(translateAtom);
  const service = useService(soundPressureKey);
  const [page, setPage] = useState<'amp' | 'headphone'>('amp');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const switchPage = (next: 'amp' | 'headphone') => {
    setPage(next);
    setDraft(null);
    setConfirm(null);
    setFailed(false);
  };
  const editAmp = (id?: string) => {
    const amp = id ? rig.amps.find((item) => item.id === id) : undefined;
    setDraft({
      kind: 'amp',
      ...(id ? { id } : {}),
      name: amp?.name ?? t('immersive.soundPressureNewAmp'),
      vrms: String(amp?.vrmsAt0db ?? AMP_VRMS_DEFAULT),
      gain: String(amp?.gainDb ?? AMP_GAIN_DEFAULT),
    });
    setConfirm(null);
    setFailed(false);
  };
  const editHeadphone = (id?: string) => {
    const item = id ? rig.headphones.find((headphone) => headphone.id === id) : undefined;
    setDraft({
      kind: 'headphone',
      ...(id ? { id } : {}),
      name: item?.name ?? t('immersive.soundPressureNewHeadphone'),
      impedance: String(item?.impedanceOhm ?? HEADPHONE_IMPEDANCE_DEFAULT),
      sensitivity: String(item?.sensitivity ?? HEADPHONE_SENS_DEFAULT),
      unit: item?.sensitivityUnit ?? 'dbPerMw',
    });
    setConfirm(null);
    setFailed(false);
  };
  const save = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setFailed(true);
      return;
    }
    if (draft.kind === 'amp') {
      const vrmsAt0db = Number(draft.vrms);
      const gainDb = Number(draft.gain);
      if (!Number.isFinite(vrmsAt0db) || !Number.isFinite(gainDb)) {
        setFailed(true);
        return;
      }
      const input = { name, vrmsAt0db, gainDb };
      if (draft.id) service.updateAmp(draft.id, input);
      else if (!service.addAmp(input)) {
        setFailed(true);
        return;
      }
    } else {
      const impedanceOhm = Number(draft.impedance);
      const sensitivity = Number(draft.sensitivity);
      if (!Number.isFinite(impedanceOhm) || !Number.isFinite(sensitivity)) {
        setFailed(true);
        return;
      }
      const input = { name, impedanceOhm, sensitivity, sensitivityUnit: draft.unit };
      if (draft.id) service.updateHeadphone(draft.id, input);
      else if (!service.addHeadphone(input)) {
        setFailed(true);
        return;
      }
    }
    setDraft(null);
    setFailed(false);
  };
  const changeUnit = (unit: SensitivityUnit) => {
    if (!draft || draft.kind !== 'headphone' || draft.unit === unit) return;
    const impedance = Number(draft.impedance);
    const sensitivity = Number(draft.sensitivity);
    if (!Number.isFinite(impedance) || !Number.isFinite(sensitivity)) {
      setDraft({ ...draft, unit });
      return;
    }
    setDraft({
      ...draft,
      unit,
      sensitivity: String(
        Number(convertSensitivity(sensitivity, draft.unit, unit, impedance).toFixed(2)),
      ),
    });
  };
  const deleteDevice = (kind: 'amp' | 'headphone', id: string) => {
    if (confirm !== id) {
      setConfirm(id);
      return;
    }
    if (kind === 'amp') service.removeAmp(id);
    else service.removeHeadphone(id);
    setConfirm(null);
  };
  const rows = page === 'amp' ? rig.amps : rig.headphones;
  return (
    <div
      ref={panelRef}
      className={[styles.panel, styles[variant], styles[panelSide]].join(' ')}
      role="dialog"
      aria-label={t('immersive.soundPressure')}
      data-sound-pressure-panel
      tabIndex={-1}
      onPointerDownCapture={onPointerDownCapture}
    >
      <div className={styles.head}>
        <strong>{t('immersive.soundPressure')}</strong>
        <Tooltip content={t('immersive.soundPressureClose')} relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<Dismiss16Regular />}
            aria-label={t('immersive.soundPressureClose')}
            onClick={onClose}
          />
        </Tooltip>
      </div>
      <div className={styles.tabs} role="tablist" aria-label={t('immersive.soundPressure')}>
        <button
          type="button"
          role="tab"
          aria-selected={page === 'amp'}
          className={styles.tab}
          onClick={() => switchPage('amp')}
        >
          {t('immersive.soundPressurePickAmp')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={page === 'headphone'}
          className={styles.tab}
          onClick={() => switchPage('headphone')}
        >
          {t('immersive.soundPressurePickHeadphone')}
        </button>
      </div>
      <div className={styles.readout} data-sound-pressure-readout>
        {autoDetail && (
          <span className={styles.auto} data-sound-pressure-auto>
            {autoDetail}
          </span>
        )}
        <span>
          {t('immersive.soundPressureCurrent')} {formatSpl(reading.spl)} dB SPL
        </span>
        <span title={t('immersive.soundPressureAverageHint')}>
          {t('immersive.soundPressureAverage')} {formatSpl(averageReading.spl)} dB SPL ·{' '}
          {lufsText(averageLufs)} LUFS
        </span>
      </div>
      {draft ? (
        <div className={styles.form} data-sound-pressure-form={draft.kind}>
          <label className={styles.field}>
            <span>{t('settings.deviceName')}</span>
            <Input
              size="small"
              value={draft.name}
              onChange={(_, data) => setDraft({ ...draft, name: data.value })}
            />
          </label>
          {draft.kind === 'amp' ? (
            <>
              <label className={styles.field}>
                <span>{t('settings.ampVrms')}</span>
                <Input
                  size="small"
                  type="number"
                  min={AMP_VRMS_MIN}
                  max={AMP_VRMS_MAX}
                  step={0.1}
                  value={draft.vrms}
                  onChange={(_, data) => setDraft({ ...draft, vrms: data.value })}
                />
              </label>
              <label className={styles.field}>
                <span>{t('settings.ampGain')}</span>
                <Input
                  size="small"
                  type="number"
                  min={AMP_GAIN_MIN}
                  max={AMP_GAIN_MAX}
                  step={1}
                  value={draft.gain}
                  onChange={(_, data) => setDraft({ ...draft, gain: data.value })}
                />
              </label>
            </>
          ) : (
            <>
              <label className={styles.field}>
                <span>{t('settings.impedance')}</span>
                <Input
                  size="small"
                  type="number"
                  min={HEADPHONE_IMPEDANCE_MIN}
                  max={HEADPHONE_IMPEDANCE_MAX}
                  step={1}
                  value={draft.impedance}
                  onChange={(_, data) => setDraft({ ...draft, impedance: data.value })}
                />
              </label>
              <label className={styles.field}>
                <span>{t('settings.sensitivity')}</span>
                <Input
                  size="small"
                  type="number"
                  min={
                    draft.unit === 'dbPerV'
                      ? HEADPHONE_SENS_DB_V_MIN
                      : HEADPHONE_SENS_DB_MW_MIN
                  }
                  max={
                    draft.unit === 'dbPerV'
                      ? HEADPHONE_SENS_DB_V_MAX
                      : HEADPHONE_SENS_DB_MW_MAX
                  }
                  step={0.1}
                  value={draft.sensitivity}
                  onChange={(_, data) => setDraft({ ...draft, sensitivity: data.value })}
                />
              </label>
              <div className={styles.units} role="group" aria-label={t('settings.sensitivity')}>
                <Button
                  size="small"
                  appearance={draft.unit === 'dbPerMw' ? 'primary' : 'subtle'}
                  onClick={() => changeUnit('dbPerMw')}
                >
                  dB/mW
                </Button>
                <Button
                  size="small"
                  appearance={draft.unit === 'dbPerV' ? 'primary' : 'subtle'}
                  onClick={() => changeUnit('dbPerV')}
                >
                  dB/V
                </Button>
              </div>
            </>
          )}
          {failed && <p className={styles.error} role="alert">{t('settings.saveFailed')}</p>}
          <div className={styles.actions}>
            <Button appearance="primary" size="small" onClick={save}>
              {t('settings.save')}
            </Button>
            <Button appearance="subtle" size="small" onClick={() => setDraft(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.list}>
            {rows.map((item) => {
              const selected =
                page === 'amp'
                  ? item.id === rig.selectedAmpId
                  : item.id === rig.selectedHeadphoneId;
              return (
                <div key={item.id} className={styles.row} data-selected={selected || undefined}>
                  <button
                    type="button"
                    className={styles.pick}
                    aria-pressed={selected}
                    onClick={() =>
                      page === 'amp'
                        ? service.selectAmp(item.id)
                        : service.selectHeadphone(item.id)
                    }
                  >
                    <span className={styles.name}>{item.name}</span>
                    <span className={styles.summary}>
                      {page === 'amp'
                        ? `${(item as { vrmsAt0db: number }).vrmsAt0db.toFixed(2)} Vrms · ${(item as { gainDb: number }).gainDb} dB`
                        : `${(item as { impedanceOhm: number }).impedanceOhm} Ω · ${(item as { sensitivity: number }).sensitivity} ${
                            (item as { sensitivityUnit: SensitivityUnit }).sensitivityUnit ===
                            'dbPerV'
                              ? 'dB/V'
                              : 'dB/mW'
                          }`}
                    </span>
                  </button>
                  <Tooltip content={t('immersive.soundPressureEdit')} relationship="label">
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<Edit16Regular />}
                      aria-label={t('immersive.soundPressureEdit')}
                      onClick={() => (page === 'amp' ? editAmp(item.id) : editHeadphone(item.id))}
                    />
                  </Tooltip>
                  <Tooltip
                    content={
                      confirm === item.id
                        ? t('immersive.soundPressureConfirmDelete')
                        : t('immersive.soundPressureDelete')
                    }
                    relationship="label"
                  >
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<Delete16Regular />}
                      aria-label={
                        confirm === item.id
                          ? t('immersive.soundPressureConfirmDelete')
                          : t('immersive.soundPressureDelete')
                      }
                      onClick={() => deleteDevice(page, item.id)}
                    />
                  </Tooltip>
                </div>
              );
            })}
            {rows.length === 0 && (
              <p className={styles.empty}>{t('settings.deviceEmpty')}</p>
            )}
          </div>
          <Button
            appearance="subtle"
            size="small"
            icon={<Add16Regular />}
            onClick={() => (page === 'amp' ? editAmp() : editHeadphone())}
          >
            {page === 'amp'
              ? t('immersive.soundPressureAddAmp')
              : t('immersive.soundPressureAddHeadphone')}
          </Button>
          <p className={styles.hint}>{t('immersive.soundPressureImmediate')}</p>
        </>
      )}
    </div>
  );
}
