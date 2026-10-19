import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from '@fluentui/react-components';
import { useAtomValueRawSync } from 'jotai/react';
import { translateAtom } from '../i18n/locale.ts';
import { useService } from '../kit/useService.ts';
import { dx52Key } from '../playback/dx52Prefs.ts';

/**
 * 自动读取开启但读取失败时的提醒。非模态，不挡播放与其它操作；同一次失败只弹一次，
 * 点“重试”重新读取，点“关闭”本次不再弹。状态恢复后提醒自行消失。
 */
export function Dx52FailureDialog() {
  const t = useAtomValueRawSync(translateAtom);
  const dx52 = useService(dx52Key);
  const failure = useAtomValueRawSync(dx52.failure);
  return (
    <Dialog open={failure !== null} modalType="non-modal">
      <DialogSurface
        data-dx52-failure-dialog
        style={{ zIndex: 1000 }}
        aria-label={t('dialog.dx52Title')}
      >
        <DialogBody>
          <DialogTitle>{t('dialog.dx52Title')}</DialogTitle>
          <DialogContent>
            <p>
              {t(
                failure === 'busy' ? 'settings.dx52Busy' : 'settings.dx52Error',
              )}
            </p>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={() => dx52.retry()}>
              {t('settings.dx52Retry')}
            </Button>
            <Button onClick={() => dx52.dismissFailure()}>{t('dialog.dx52Close')}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
