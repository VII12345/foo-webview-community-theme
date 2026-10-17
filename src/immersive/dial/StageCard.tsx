import { Button, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { MoreHorizontal20Regular } from '@fluentui/react-icons';
import { useAtomValueRawSync } from 'jotai/react';
import type { CSSProperties } from 'react';
import { translateAtom } from '../../i18n/locale.ts';
import { currentTrackAtom } from '../../playback/playback.ts';
import { NowPlayingRating } from '../../shell/player/now-playing/NowPlayingRating.tsx';
import { displayTitle } from '../../shell/player/now-playing/nowPlaying.ts';
import { NowPlayingMenu } from '../../shell/player/context-menu/NowPlayingMenu.tsx';
import { useNowPlayingMenu } from '../../shell/player/context-menu/useNowPlayingMenu.ts';
import { SeekBar } from '../../shell/player/SeekBar.tsx';
import { DialCells } from './DialCells.tsx';
import { DialCover } from './DialCover.tsx';
import { STAGE_CARD_COVER, STAGE_CARD_SCALE } from './stageCard.ts';
import styles from './StageCard.module.css';
import { PaperTransport } from './PaperTransport.tsx';

/**
 * 卡片场景的左区：与罗盘同位的方封面 + 星级与更多 + 进度条 + 传输三键，下面接原来的三格
 * （Date · Track · Label，`DialCells`）。舞台坐标，与 `StageDial` 占同一块地方。
 *
 * 两档共用这一个件，差别只在 `title` —— 卡片视图不带曲名/艺人（右栏那四行字里已经写了），
 * 卡片歌词档要带（右档那四行字删了，只剩这里的）。封面点右键与「更多」键打开正在播放菜单。
 */
export interface StageCardProps {
  /** 卡片要不要自带曲名与艺人。 */
  readonly title: boolean;
}

const useStyles = makeStyles({
  more: {
    color: tokens.colorNeutralForeground2,
  },
});

export function StageCard({ title }: StageCardProps) {
  const t = useAtomValueRawSync(translateAtom);
  const track = useAtomValueRawSync(currentTrackAtom);
  const menu = useNowPlayingMenu(track);
  const classes = useStyles();
  const coverBox: CSSProperties = {
    left: STAGE_CARD_COVER.x,
    top: STAGE_CARD_COVER.y,
    width: STAGE_CARD_COVER.size,
    height: STAGE_CARD_COVER.size,
  };
  return (
    <div className={styles.card}>
      <DialCover box={coverBox} guard={72} />
      <div className={styles.meta} data-card-meta {...menu.trigger}>
        {title && (
          <div className={styles.text} data-card-text>
            <div className={styles.title} data-field="cardTitle">
              {track ? displayTitle(track) : t('player.idle')}
            </div>
            {track?.artist && (
              <div className={styles.artist} data-field="cardArtist">
                {track.artist}
              </div>
            )}
          </div>
        )}
        <div className={styles.actions}>
          <NowPlayingRating size="small" track={track} />
          <Tooltip content={t('player.more')} relationship="label">
            <Button
              appearance="subtle"
              className={classes.more}
              icon={<MoreHorizontal20Regular />}
              aria-label={t('player.more')}
              {...menu.more}
            />
          </Tooltip>
        </div>
      </div>
      <div className={styles.seek} data-card-seek>
        <SeekBar interactive thickness={4} thumb clock />
      </div>
      <PaperTransport
        className={styles.transport}
        guard={60}
        scale={STAGE_CARD_SCALE}
        extras
      />
      <DialCells style={{ top: 930 }} />
      <NowPlayingMenu at={menu.at} onClose={menu.close} />
    </div>
  );
}
