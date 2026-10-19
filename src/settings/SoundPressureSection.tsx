import { Button, Input, Switch, Tooltip } from '@fluentui/react-components';
import {
  Add16Regular,
  ArrowClockwise16Regular,
  Copy16Regular,
  Delete16Regular,
  Edit16Regular,
  Headphones20Regular,
} from '@fluentui/react-icons';
import { useAtomValueRawSync } from 'jotai/react';
import { useId, useState } from 'react';
import { useService } from '../kit/useService.ts';
import { translateAtom } from '../i18n/locale.ts';
import {
  AMP_GAIN_DEFAULT,
  AMP_GAIN_MAX,
  AMP_GAIN_MIN,
  AMP_VRMS_DEFAULT,
  AMP_VRMS_MAX,
  AMP_VRMS_MIN,
  convertSensitivity,
  HEADPHONE_IMPEDANCE_DEFAULT,
  HEADPHONE_IMPEDANCE_MAX,
  HEADPHONE_IMPEDANCE_MIN,
  HEADPHONE_RIG_KEY,
  HEADPHONE_SENS_DB_MW_MAX,
  HEADPHONE_SENS_DB_MW_MIN,
  HEADPHONE_SENS_DB_V_MAX,
  HEADPHONE_SENS_DB_V_MIN,
  HEADPHONE_SENS_DEFAULT,
  type SensitivityUnit,
} from '../playback/soundPressure.ts';
import { soundPressureKey } from '../playback/soundPressurePrefs.ts';
import {
  dx52OutputInfo,
  type Dx52Jack,
} from '../playback/dx52.ts';
import { DX52_AUTO_KEY, DX52_JACK_KEY, dx52Key, formatDx52Diagnostics } from '../playback/dx52Prefs.ts';
import { copyText } from './hostActions.ts';
import { SettingsExpander } from './SettingsExpander.tsx';
import { SettingsRow } from './SettingsRow.tsx';
import { SettingsSaveNotice } from './SettingsSaveNotice.tsx';
import { SettingsSelect } from './SettingsSelect.tsx';
import styles from './SoundPressureSection.module.css';

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

function AmpForm({
  draft,
  failed,
  onChange,
  onSave,
  onCancel,
}: {
  readonly draft: AmpDraft;
  readonly failed: boolean;
  readonly onChange: (draft: AmpDraft) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}) {
  const t = useAtomValueRawSync(translateAtom);
  return (
    <div className={styles.form} data-sound-pressure-form="amp">
      <label className={`${styles.field} ${styles.wide}`}>
        <span>{t('settings.deviceName')}</span>
        <Input
          value={draft.name}
          onChange={(_, data) => onChange({ ...draft, name: data.value })}
        />
      </label>
      <label className={styles.field}>
        <span>{t('settings.ampVrms')}</span>
        <Input
          type="number"
          min={AMP_VRMS_MIN}
          max={AMP_VRMS_MAX}
          step={0.1}
          value={draft.vrms}
          onChange={(_, data) => onChange({ ...draft, vrms: data.value })}
        />
      </label>
      <label className={styles.field}>
        <span>{t('settings.ampGain')}</span>
        <Input
          type="number"
          min={AMP_GAIN_MIN}
          max={AMP_GAIN_MAX}
          step={1}
          value={draft.gain}
          onChange={(_, data) => onChange({ ...draft, gain: data.value })}
        />
      </label>
      {failed && <p className={styles.error} role="alert">{t('settings.saveFailed')}</p>}
      <div className={`${styles.actions} ${styles.wide}`}>
        <Button appearance="primary" onClick={onSave}>
          {t('settings.save')}
        </Button>
        <Button appearance="subtle" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

function HeadphoneForm({
  draft,
  failed,
  onChange,
  onSave,
  onCancel,
}: {
  readonly draft: HeadphoneDraft;
  readonly failed: boolean;
  readonly onChange: (draft: HeadphoneDraft) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}) {
  const t = useAtomValueRawSync(translateAtom);
  const unitId = useId();
  const changeUnit = (unit: SensitivityUnit) => {
    if (unit === draft.unit) return;
    const impedance = Number(draft.impedance);
    const sensitivity = Number(draft.sensitivity);
    onChange({
      ...draft,
      unit,
      sensitivity:
        Number.isFinite(impedance) && Number.isFinite(sensitivity)
          ? String(
              Number(
                convertSensitivity(sensitivity, draft.unit, unit, impedance).toFixed(2),
              ),
            )
          : draft.sensitivity,
    });
  };
  return (
    <div className={styles.form} data-sound-pressure-form="headphone">
      <label className={`${styles.field} ${styles.wide}`}>
        <span>{t('settings.deviceName')}</span>
        <Input
          value={draft.name}
          onChange={(_, data) => onChange({ ...draft, name: data.value })}
        />
      </label>
      <label className={styles.field}>
        <span>{t('settings.impedance')}</span>
        <Input
          type="number"
          min={HEADPHONE_IMPEDANCE_MIN}
          max={HEADPHONE_IMPEDANCE_MAX}
          step={1}
          value={draft.impedance}
          onChange={(_, data) => onChange({ ...draft, impedance: data.value })}
        />
      </label>
      <label className={styles.field}>
        <span id={unitId}>{t('settings.sensitivity')}</span>
        <Input
          type="number"
          min={draft.unit === 'dbPerV' ? HEADPHONE_SENS_DB_V_MIN : HEADPHONE_SENS_DB_MW_MIN}
          max={draft.unit === 'dbPerV' ? HEADPHONE_SENS_DB_V_MAX : HEADPHONE_SENS_DB_MW_MAX}
          step={0.1}
          value={draft.sensitivity}
          onChange={(_, data) => onChange({ ...draft, sensitivity: data.value })}
        />
      </label>
      <div className={`${styles.field} ${styles.wide}`} role="group" aria-labelledby={unitId}>
        <span>{t('settings.sensitivityUnit')}</span>
        <div className={styles.units}>
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
      </div>
      {failed && <p className={styles.error} role="alert">{t('settings.saveFailed')}</p>}
      <div className={`${styles.actions} ${styles.wide}`}>
        <Button appearance="primary" onClick={onSave}>
          {t('settings.save')}
        </Button>
        <Button appearance="subtle" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

/** 「耳机」组：耳放与耳机分开维护，当前设备用下拉切换；改动写宿主 config，设置页与沉浸浮层共用。 */
/** 真机诊断面板默认隐藏；排查时改成 true 即可恢复，记录与复制代码保留。 */
const SHOW_DX52_DIAGNOSTICS = false;

export function SoundPressureSection() {
  const t = useAtomValueRawSync(translateAtom);
  const service = useService(soundPressureKey);
  const dx52 = useService(dx52Key);
  const rig = useAtomValueRawSync(service.rig);
  const dx52Enabled = useAtomValueRawSync(dx52.enabled);
  const dx52Jack = useAtomValueRawSync(dx52.jack);
  const dx52Status = useAtomValueRawSync(dx52.status);
  const dx52State = useAtomValueRawSync(dx52.state);
  const dx52Diagnostics = useAtomValueRawSync(dx52.diagnostics);
  const descriptor = dx52Diagnostics.descriptor;
  const reportList = (reports: readonly { reportId: number; length: number }[]): string =>
    reports.length ? reports.map((report) => `${report.reportId}@${report.length}`).join(',') : '—';
  const descriptorText = descriptor
    ? `collections=${descriptor.collectionCount} input=${reportList(
        descriptor.inputs,
      )} output=${reportList(descriptor.outputs)} feature=${reportList(descriptor.features)}`
    : 'unavailable';
  const transport = dx52Diagnostics.transport;
  const transportText = `send=${
    transport.send ? `${transport.send.kind}#${transport.send.reportId}@${transport.send.length}` : '—'
  } receive=${
    transport.receive
      ? `${transport.receive.kind}#${transport.receive.reportId ?? '—'}`
      : '—'
  } locked=${transport.locked}`;
  const [copied, setCopied] = useState(false);
  const copyDiagnostics = async () => {
    if (!(await copyText(formatDx52Diagnostics(dx52Diagnostics)))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const openAmp = (id?: string) => {
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
  const openHeadphone = (id?: string) => {
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
  const remove = (kind: 'amp' | 'headphone', id: string) => {
    if (confirm !== id) {
      setConfirm(id);
      return;
    }
    if (kind === 'amp') service.removeAmp(id);
    else service.removeHeadphone(id);
    setConfirm(null);
  };
  const none = { value: '', label: t('settings.noDevice') };
  const ampOptions = [
    none,
    ...rig.amps.map((amp) => ({
      value: amp.id,
      label: amp.name,
      description: `${amp.vrmsAt0db.toFixed(2)} Vrms · ${amp.gainDb} dB`,
    })),
  ];
  const headphoneOptions = [
    none,
    ...rig.headphones.map((headphone) => ({
      value: headphone.id,
      label: headphone.name,
      description: `${headphone.impedanceOhm} Ω · ${headphone.sensitivity} ${
        headphone.sensitivityUnit === 'dbPerV' ? 'dB/V' : 'dB/mW'
      }`,
    })),
  ];
  const jackOptions = [
    { value: 'auto', label: t('settings.dx52JackAuto') },
    { value: 'single', label: t('settings.dx52JackSingle') },
    { value: 'balanced', label: t('settings.dx52JackBalanced') },
  ];
  const dx52Description = (() => {
    if (!dx52Enabled) return t('settings.dx52OffHint');
    if (dx52Status.kind === 'unsupported') return t('settings.dx52Unsupported');
    if (dx52Status.kind === 'unauthorized') return t('settings.dx52Unauthorized');
    if (dx52Status.kind === 'waiting') return t('settings.dx52Waiting');
    if (dx52Status.kind === 'connecting') return t('settings.dx52Connecting');
    if (dx52Status.kind === 'busy') return t('settings.dx52Busy');
    if (dx52Status.kind === 'error') return t('settings.dx52Error');
    if (!dx52State) return t('settings.dx52Connecting');
    if (dx52State.partial) return t('settings.dx52Partial');
    if (!dx52State.powered) return t('settings.dx52PoweredOff');
    if (dx52State.input !== 'usb') return t('settings.dx52NotUsb');
    const output = dx52OutputInfo(dx52State.route, dx52Jack);
    if (!output.headphone) return t('settings.dx52LineOutput');
    const gain = dx52State.highGain ? t('settings.dx52HighGain') : t('settings.dx52LowGain');
    const rate =
      dx52State.sampleRate && dx52State.sampleRate >= 1000
        ? ` · ${Math.round(dx52State.sampleRate / 1000)} kHz`
        : '';
    return `${dx52State.deviceName || 'TOPPING DX5 II'} · ${output.label} · ${gain} · ${dx52State.volumeDb.toFixed(1)} dB${rate}`;
  })();
  const dx52Action: {
    readonly label: 'settings.dx52Authorize' | 'settings.dx52Retry';
    run(): void;
  } | null = !dx52Enabled
    ? null
    : dx52Status.kind === 'unauthorized' || dx52Status.kind === 'waiting'
      ? { label: 'settings.dx52Authorize', run: () => dx52.authorize() }
      : dx52Status.kind === 'error' || dx52Status.kind === 'busy'
        ? { label: 'settings.dx52Retry', run: () => dx52.retry() }
        : null;
  return (
    <SettingsExpander
      icon={<Headphones20Regular />}
      title={t('settings.soundPressure')}
      description={t('settings.soundPressureHint')}
      feedback={
        <>
          <SettingsSaveNotice
            persistence={service.persistence}
            keys={[HEADPHONE_RIG_KEY]}
          />
          <SettingsSaveNotice
            persistence={dx52.persistence}
            keys={[DX52_AUTO_KEY, DX52_JACK_KEY]}
          />
        </>
      }
    >
      <SettingsRow title={t('settings.dx52Auto')} description={dx52Description} field>
        {(ids) => (
          <div className={styles.dx52Actions}>
            <Tooltip content={t('settings.dx52AutoHint')} relationship="description">
              <Switch
                aria-labelledby={ids.labelId}
                aria-describedby={ids.descriptionId}
                checked={dx52Enabled}
                onChange={(_, data) => dx52.setEnabled(data.checked)}
              />
            </Tooltip>
            {dx52Action && (
              <Button size="small" onClick={() => dx52Action.run()}>
                {t(dx52Action.label)}
              </Button>
            )}
          </div>
        )}
      </SettingsRow>
      {dx52Enabled && (
        <SettingsRow title={t('settings.dx52Jack')} field>
          {(ids) => (
            <SettingsSelect
              {...ids}
              options={jackOptions}
              value={dx52Jack}
              onChange={(value) => dx52.setJack(value as Dx52Jack)}
            />
          )}
        </SettingsRow>
      )}
      <SettingsRow title={t('settings.currentAmp')} field>
        {(ids) => (
          <SettingsSelect
            {...ids}
            disabled={dx52Enabled}
            options={ampOptions}
            value={rig.selectedAmpId ?? ''}
            onChange={(value) => service.selectAmp(value || null)}
          />
        )}
      </SettingsRow>
      <SettingsRow title={t('settings.currentHeadphone')} field>
        {(ids) => (
          <SettingsSelect
            {...ids}
            options={headphoneOptions}
            value={rig.selectedHeadphoneId ?? ''}
            onChange={(value) => service.selectHeadphone(value || null)}
          />
        )}
      </SettingsRow>
      <div className={styles.group}>
        <h3 className={styles.groupTitle}>{t('settings.ampList')}</h3>
        {rig.amps.map((amp) =>
          draft?.kind === 'amp' && draft.id === amp.id ? (
            <AmpForm
              key={amp.id}
              draft={draft}
              failed={failed}
              onChange={setDraft}
              onSave={save}
              onCancel={() => setDraft(null)}
            />
          ) : (
            <SettingsRow
              key={amp.id}
              title={amp.name}
              description={`${amp.vrmsAt0db.toFixed(2)} Vrms · ${amp.gainDb} dB`}
            >
              {() => (
                <div className={styles.actions}>
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<Edit16Regular />}
                    aria-label={`${t('settings.edit')} ${amp.name}`}
                    onClick={() => openAmp(amp.id)}
                  />
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<Delete16Regular />}
                    aria-label={
                      confirm === amp.id
                        ? t('settings.confirmDelete')
                        : `${t('settings.delete')} ${amp.name}`
                    }
                    onClick={() => remove('amp', amp.id)}
                  />
                </div>
              )}
            </SettingsRow>
          ),
        )}
        {draft?.kind === 'amp' && !draft.id && (
          <AmpForm
            draft={draft}
            failed={failed}
            onChange={setDraft}
            onSave={save}
            onCancel={() => setDraft(null)}
          />
        )}
        <div className={styles.add}>
          <Button
            size="small"
            appearance="subtle"
            icon={<Add16Regular />}
            onClick={() => openAmp()}
          >
            {t('settings.addAmp')}
          </Button>
        </div>
      </div>
      <div className={styles.group}>
        <h3 className={styles.groupTitle}>{t('settings.headphoneList')}</h3>
        {rig.headphones.map((headphone) =>
          draft?.kind === 'headphone' && draft.id === headphone.id ? (
            <HeadphoneForm
              key={headphone.id}
              draft={draft}
              failed={failed}
              onChange={setDraft}
              onSave={save}
              onCancel={() => setDraft(null)}
            />
          ) : (
            <SettingsRow
              key={headphone.id}
              title={headphone.name}
              description={`${headphone.impedanceOhm} Ω · ${headphone.sensitivity} ${
                headphone.sensitivityUnit === 'dbPerV' ? 'dB/V' : 'dB/mW'
              }`}
            >
              {() => (
                <div className={styles.actions}>
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<Edit16Regular />}
                    aria-label={`${t('settings.edit')} ${headphone.name}`}
                    onClick={() => openHeadphone(headphone.id)}
                  />
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<Delete16Regular />}
                    aria-label={
                      confirm === headphone.id
                        ? t('settings.confirmDelete')
                        : `${t('settings.delete')} ${headphone.name}`
                    }
                    onClick={() => remove('headphone', headphone.id)}
                  />
                </div>
              )}
            </SettingsRow>
          ),
        )}
        {draft?.kind === 'headphone' && !draft.id && (
          <HeadphoneForm
            draft={draft}
            failed={failed}
            onChange={setDraft}
            onSave={save}
            onCancel={() => setDraft(null)}
          />
        )}
        <div className={styles.add}>
          <Button
            size="small"
            appearance="subtle"
            icon={<Add16Regular />}
            onClick={() => openHeadphone()}
          >
            {t('settings.addHeadphone')}
          </Button>
        </div>
      </div>
      {/* 默认关闭；把 SHOW_DX52_DIAGNOSTICS 改成 true 恢复面板。 */}
      {SHOW_DX52_DIAGNOSTICS && dx52Enabled && (
        <div className={styles.group} data-dx52-diagnostics>
          <h3 className={styles.groupTitle}>{t('settings.dx52Diagnostics')}</h3>
          <p className={styles.diagHint}>{t('settings.dx52DiagnosticsHint')}</p>
          <div
            className={styles.diagSummary}
            data-dx52-diag-status={dx52Diagnostics.status.kind}
            data-dx52-diag-snapshot={`total=${dx52Diagnostics.snapshot.total} received=${dx52Diagnostics.snapshot.received}`}
            data-dx52-diag-missing={dx52Diagnostics.snapshot.missing.join(',')}
          >
            <span>
              {t('settings.dx52DiagStatus')}: {dx52Diagnostics.status.kind}
            </span>
            <span>
              {t('settings.dx52DiagSnapshot')}: total={dx52Diagnostics.snapshot.total} · received=
              {dx52Diagnostics.snapshot.received}/{dx52Diagnostics.snapshot.expected}
              {dx52Diagnostics.snapshot.missing.length
                ? ` · missing=${dx52Diagnostics.snapshot.missing.join(',')}`
                : ''}
            </span>
            <span data-dx52-diag-descriptor={descriptorText}>
              {t('settings.dx52DiagDescriptor')}: {descriptorText}
            </span>
            <span data-dx52-diag-transport={transportText}>
              {t('settings.dx52DiagTransport')}: {transportText}
            </span>
            <span>
              {t('settings.dx52DiagLastError')}: {dx52Diagnostics.lastError ?? '—'}
            </span>
          </div>
          <div className={styles.diagActions}>
            <Button
              size="small"
              icon={<Copy16Regular />}
              onClick={() => void copyDiagnostics()}
            >
              {t(copied ? 'settings.dx52Copied' : 'settings.dx52Copy')}
            </Button>
            <Button
              size="small"
              icon={<ArrowClockwise16Regular />}
              onClick={() => dx52.retry()}
            >
              {t('settings.dx52Reread')}
            </Button>
          </div>
          <pre className={styles.diagLog} data-dx52-diag-log>
            {formatDx52Diagnostics(dx52Diagnostics)}
          </pre>
        </div>
      )}
    </SettingsExpander>
  );
}
