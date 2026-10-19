import {
  Button,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Spinner,
} from '@fluentui/react-components';
import { useAtomValueRawSync } from 'jotai/react';
import { useRef, useState } from 'react';
import { translateAtom } from '../i18n/locale.ts';
import type { MessageKey } from '../i18n/en.ts';
import { Dialog } from '../motion/Surfaces.tsx';
import { useService } from '../kit/useService.ts';
import {
  customHeadphoneMeasurementsKey,
  type MeasurementImportFailure,
  type MeasurementImportPreview,
} from '../playback/customHeadphoneMeasurements.ts';
import styles from './MeasurementImportDialog.module.css';

const FAILURE_KEYS: Readonly<Record<MeasurementImportFailure, MessageKey>> = {
  'invalid-url': 'settings.measurementImportInvalidUrl',
  network: 'settings.measurementImportNetwork',
  'not-found': 'settings.measurementImportNotFound',
  http: 'settings.measurementImportFailed',
  payload: 'settings.measurementImportFailed',
  'too-large': 'settings.measurementImportTooLarge',
  limit: 'settings.measurementImportLimit',
  storage: 'settings.measurementImportStorageFailed',
  denied: 'settings.measurementImportDenied',
  unavailable: 'settings.measurementImportUnavailable',
  cancelled: 'settings.measurementImportCancelled',
};

type Phase = 'edit' | 'fetching' | 'preview' | 'saving' | 'error';

export function MeasurementImportDialog({
  onClose,
  onImported,
}: {
  onClose(): void;
  onImported(value: { readonly id: string; readonly name: string }): void;
}) {
  const t = useAtomValueRawSync(translateAtom);
  const service = useService(customHeadphoneMeasurementsKey);
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('edit');
  const [preview, setPreview] = useState<MeasurementImportPreview | null>(null);
  const [failure, setFailure] = useState<MessageKey | null>(null);
  const [failureCode, setFailureCode] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = phase === 'fetching' || phase === 'saving';

  const fetchProfile = () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setFailure(null);
    setFailureCode(null);
    setPreview(null);
    setPhase('fetching');
    void service.preview(url, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) {
        setPreview(result.value);
        setPhase('preview');
      } else {
        setFailure(FAILURE_KEYS[result.reason]);
        setFailureCode(result.code ?? null);
        setPhase('error');
      }
    });
  };

  const commit = () => {
    if (!preview) return;
    setFailure(null);
    setFailureCode(null);
    setPhase('saving');
    void service.commit(preview).then((result) => {
      if (result.ok) {
        onImported({ id: result.value.id, name: preview.name });
        onClose();
      } else {
        // 保留预览与“导入”按钮，修好存储原因后可以直接重试，不必重新抓取。
        setFailure(FAILURE_KEYS[result.reason]);
        setFailureCode(result.code ?? null);
        setPhase('preview');
      }
    });
  };

  const close = () => {
    abort.current?.abort();
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        if (!data.open && !busy) close();
      }}
    >
      <DialogSurface data-measurement-import-dialog data-measurement-import-phase={phase}>
        <DialogBody>
          <DialogTitle>{t('settings.measurementImportTitle')}</DialogTitle>
          <DialogContent>
            <p className={styles.hint}>{t('settings.measurementImportHint')}</p>
            <Field label={t('settings.measurementImportUrl')}>
              <Input
                type="url"
                value={url}
                disabled={busy}
                spellCheck={false}
                autoFocus
                placeholder="https://huihifi.com/evaluation/…"
                onChange={(_, data) => setUrl(data.value)}
              />
            </Field>
            {phase === 'fetching' && <Spinner size="small" label={t('settings.measurementImportFetching')} />}
            {phase === 'saving' && <Spinner size="small" label={t('settings.measurementImportSaving')} />}
            {phase === 'preview' && preview && (
              <div className={styles.preview} data-measurement-import-preview>
                <div className={styles.row}>
                  <span>{t('settings.measurementImportName')}</span>
                  <strong>{preview.name}</strong>
                </div>
                {preview.brand && (
                  <div className={styles.row}>
                    <span>{t('settings.measurementImportBrand')}</span>
                    <strong>{preview.brand}</strong>
                  </div>
                )}
                <div className={styles.row}>
                  <span>{t('settings.measurementImportFrPoints')}</span>
                  <strong>{preview.rawPointCounts.frequencyResponse}</strong>
                </div>
                <div className={styles.row}>
                  <span>{t('settings.measurementImportImpedancePoints')}</span>
                  <strong>{preview.rawPointCounts.impedance}</strong>
                </div>
                <p className={styles.source}>{preview.sourceUrl}</p>
                {preview.overwrite && (
                  <p className={styles.warning}>{t('settings.measurementImportOverwrite')}</p>
                )}
                {preview.bundledDuplicate && (
                  <p className={styles.warning}>{t('settings.measurementImportBundled')}</p>
                )}
                {preview.impedance.length === 0 && (
                  <p className={styles.warning}>{t('settings.measurementImportNoImpedance')}</p>
                )}
              </div>
            )}
            {failure && (
              <p className={styles.error} role="alert">
                {t(failure)}
                {failureCode && (
                  <span className={styles.code} data-measurement-import-code>
                    {t('settings.measurementImportErrorCode', { code: failureCode })}
                  </span>
                )}
              </p>
            )}
          </DialogContent>
          <DialogActions>
            <Button disabled={busy} onClick={close}>
              {t('common.cancel')}
            </Button>
            {phase === 'preview' ? (
              <Button appearance="primary" onClick={commit}>
                {t('settings.measurementImportAction')}
              </Button>
            ) : (
              <Button
                appearance="primary"
                disabled={busy || !url.trim()}
                onClick={fetchProfile}
              >
                {t('settings.measurementImportFetch')}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
