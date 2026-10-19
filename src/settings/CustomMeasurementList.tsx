import { Button } from '@fluentui/react-components';
import { Delete16Regular } from '@fluentui/react-icons';
import { useAtomValueRawSync } from 'jotai/react';
import { useState } from 'react';
import { translateAtom } from '../i18n/locale.ts';
import type { MessageKey } from '../i18n/en.ts';
import { useService } from '../kit/useService.ts';
import { headphoneRigAtom } from '../playback/soundPressurePrefs.ts';
import {
  customHeadphoneMeasurementsKey,
  customMeasurementProfilesAtom,
  customMeasurementStatusAtom,
} from '../playback/customHeadphoneMeasurements.ts';
import styles from './CustomMeasurementList.module.css';

export function CustomMeasurementList({
  onDeleted,
}: {
  readonly onDeleted?: (id: string) => void;
}) {
  const t = useAtomValueRawSync(translateAtom);
  const service = useService(customHeadphoneMeasurementsKey);
  const profiles = useAtomValueRawSync(customMeasurementProfilesAtom);
  const status = useAtomValueRawSync(customMeasurementStatusAtom);
  const rig = useAtomValueRawSync(headphoneRigAtom);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [failure, setFailure] = useState<MessageKey | null>(null);

  if (status.kind === 'loading') {
    return <p className={styles.state}>{t('settings.customMeasurementsLoading')}</p>;
  }
  if (status.kind === 'denied') {
    return <p className={styles.state}>{t('settings.customMeasurementsDenied')}</p>;
  }
  if (status.kind === 'failed' || status.kind === 'unavailable') {
    return (
      <p className={styles.state}>
        {t(
          status.kind === 'unavailable'
            ? 'settings.customMeasurementsUnavailable'
            : 'settings.customMeasurementsFailed',
        )}
      </p>
    );
  }
  if (status.kind === 'corrupt') {
    return <p className={styles.state}>{t('settings.customMeasurementsCorrupt')}</p>;
  }
  if (profiles.length === 0) {
    return <p className={styles.state}>{t('settings.customMeasurementsEmpty')}</p>;
  }

  const usedBy = (id: string) =>
    rig.headphones.filter((headphone) => headphone.measurementProfileId === id).length;

  return (
    <div className={styles.list} data-custom-measurement-list>
      {profiles.map((profile) => {
        const used = usedBy(profile.id);
        return (
          <div key={profile.id} className={styles.row} data-custom-measurement-row={profile.id}>
            <div className={styles.text}>
              <strong>{profile.name}</strong>
              <span>
                {t('settings.customMeasurementsPoints', {
                  fr: profile.rawPointCounts.frequencyResponse,
                  imp: profile.rawPointCounts.impedance,
                })}
              </span>
              <span>
                {t('settings.customMeasurementsImported', {
                  date: new Date(profile.importedAt).toLocaleDateString(),
                })}
                {used > 0
                  ? ` · ${
                      used === 1
                        ? t('settings.customMeasurementsUsedByOne')
                        : t('settings.customMeasurementsUsedBy', { count: used })
                    }`
                  : ''}
              </span>
            </div>
            <Button
              size="small"
              appearance={confirm === profile.id ? 'primary' : 'subtle'}
              icon={<Delete16Regular />}
              aria-label={t('settings.customMeasurementsDelete')}
              onClick={() => {
                if (confirm !== profile.id) {
                  setConfirm(profile.id);
                  setFailure(null);
                  return;
                }
                setConfirm(null);
                void service.remove(profile.id).then((result) => {
                  if (result.ok) {
                    onDeleted?.(profile.id);
                    setFailure(null);
                  } else {
                    setFailure('settings.customMeasurementsDeleteFailed');
                  }
                });
              }}
            >
              {confirm === profile.id
                ? t('settings.customMeasurementsConfirmDelete')
                : t('settings.customMeasurementsDelete')}
            </Button>
          </div>
        );
      })}
      <p className={styles.hint}>{t('settings.customMeasurementsDeleteHint')}</p>
      {failure && (
        <p className={styles.error} role="alert">
          {t(failure)}
        </p>
      )}
    </div>
  );
}
