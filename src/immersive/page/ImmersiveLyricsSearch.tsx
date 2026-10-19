import { Button, Switch, Tooltip } from '@fluentui/react-components';
import { Dismiss20Regular } from '@fluentui/react-icons';
import { useAtomValueRawSync } from 'jotai/react';
import { useRef, type RefObject } from 'react';
import { localeAtom, translateAtom } from '../../i18n/locale.ts';
import { useService } from '../../kit/useService.ts';
import { useLightDismiss } from '../../nav/useLightDismiss.ts';
import { lyricsPrefsKey } from '../../lyrics/lyricsPrefs.ts';
import { currentTrackAtom } from '../../playback/playback.ts';
import { playbackConnectedAtom } from '../../playback/playerAtoms.ts';
import { LyricsSearch } from '../../shell/right-card/lyrics/LyricsSearch.tsx';
import styles from './ImmersiveLyricsSearch.module.css';

export interface ImmersiveLyricsSearchProps {
  readonly open: boolean;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  onClose(returnFocus: boolean): void;
}

/**
 * 沉浸视图里的歌词搜索面板：复用右侧卡的搜索件，但不挂右侧卡历史、不显示右侧卡返回标题。
 * 面板是 `.controls` 的直接子元素，因此接指针；Esc 先关面板，命令层排在“离开沉浸”之后登记。
 */
export function ImmersiveLyricsSearch({
  open,
  triggerRef,
  onClose,
}: ImmersiveLyricsSearchProps) {
  const t = useAtomValueRawSync(translateAtom);
  const locale = useAtomValueRawSync(localeAtom).active;
  const prefs = useService(lyricsPrefsKey);
  const online = useAtomValueRawSync(prefs.pref).enabled;
  const connected = useAtomValueRawSync(playbackConnectedAtom);
  const track = useAtomValueRawSync(currentTrackAtom);
  const panel = useRef<HTMLDivElement>(null);
  const markInside = useLightDismiss({
    id: 'immersive.lyricsSearch',
    open,
    panel,
    escapeFromInput: true,
    exempt: (target) => triggerRef.current?.contains(target) ?? false,
    onDismiss: (escape) => onClose(escape),
  });
  return (
    <div
      ref={panel}
      className={styles.panel}
      role="dialog"
      aria-modal="false"
      aria-label={t('lyrics.search')}
      data-immersive-search-panel
      onPointerDownCapture={markInside}
    >
      <div className={styles.head}>
        <strong>{t('lyrics.search')}</strong>
        <Tooltip content={t('lyrics.searchClose')} relationship="label">
          <Button
            type="button"
            appearance="subtle"
            size="small"
            icon={<Dismiss20Regular />}
            aria-label={t('lyrics.searchClose')}
            onClick={() => onClose(true)}
          />
        </Tooltip>
      </div>
      <div className={styles.body}>
        <LyricsSearch
          title={track?.title ?? ''}
          artist={track?.artist ?? ''}
          enabled={connected && online}
          heading={false}
          snapshot={false}
          onlineControl={
            <>
              <Switch
                label={t('lyrics.online')}
                checked={online}
                disabled={!connected}
                onChange={(_, data) => void prefs.setEnabled(data.checked, locale)}
              />
              {!online && <p className={styles.privacy}>{t('lyrics.privacy')}</p>}
            </>
          }
          onUsed={() => onClose(true)}
        />
      </div>
    </div>
  );
}
