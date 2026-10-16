import { Button, Tooltip } from '@fluentui/react-components';
import { MoreHorizontal20Regular } from '@fluentui/react-icons';
import { useAtomValueRawSync } from 'jotai/react';
import { translateAtom } from '../../i18n/locale.ts';
import { currentTrackAtom } from '../../playback/playback.ts';
import { NowPlayingCover } from '../../shell/player/now-playing/NowPlayingCover.tsx';
import { NowPlayingRating } from '../../shell/player/now-playing/NowPlayingRating.tsx';
import { PlaybackControls } from '../../shell/player/PlaybackControls.tsx';
import { SeekBar } from '../../shell/player/SeekBar.tsx';
import { NowPlayingMenu } from '../../shell/player/context-menu/NowPlayingMenu.tsx';
import { useNowPlayingMenu } from '../../shell/player/context-menu/useNowPlayingMenu.ts';
import { displayTitle } from '../../shell/player/now-playing/nowPlaying.ts';
import styles from './CardScene.module.css';

/** 封面边长，CSS 像素。 */
const COVER = 360;

/**
 * 卡片式沉浸场景：居中的干净播放卡——封面、曲名与艺人（右侧星级与更多菜单）、进度条与时间、
 * 底部一排播放模式与传输键。与图纸场景不同，这里不带罗盘、括号、转动层与刻度字。
 *
 * 复用底部播放栏的 `SeekBar`/`PlaybackControls`/`NowPlayingRating`/`NowPlayingMenu`：它们都是自包含、
 * 读全局服务的件，放在这一层（同一 provider 树下）即可工作。封面用 `NowPlayingCover` 直接取正在播放的图。
 */
export function CardScene() {
  const t = useAtomValueRawSync(translateAtom);
  const track = useAtomValueRawSync(currentTrackAtom);
  const menu = useNowPlayingMenu(track);
  return (
    <div className={styles.root} data-card-scene>
      <div className={styles.card} {...menu.trigger}>
        <div className={styles.cover}>
          <NowPlayingCover size={COVER} shape="round" />
        </div>
        <div className={styles.meta}>
          <div className={styles.text}>
            <div className={styles.title}>{track ? displayTitle(track) : t('player.idle')}</div>
            {track?.artist && <div className={styles.artist}>{track.artist}</div>}
          </div>
          <div className={styles.actions}>
            <NowPlayingRating size="small" track={track} />
            <Tooltip content={t('player.more')} relationship="label">
              <Button
                appearance="subtle"
                className={styles.more}
                icon={<MoreHorizontal20Regular />}
                aria-label={t('player.more')}
                disabled={menu.more.disabled}
                {...menu.more}
              />
            </Tooltip>
          </div>
        </div>
        <div className={styles.progress}>
          <SeekBar interactive thickness={4} thumb clock />
        </div>
        <div className={styles.controls}>
          <PlaybackControls prominent />
        </div>
      </div>
      <NowPlayingMenu at={menu.at} onClose={menu.close} />
    </div>
  );
}
