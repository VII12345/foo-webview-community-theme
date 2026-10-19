import { Button, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { MoreHorizontal24Regular } from '@fluentui/react-icons';
import { useAtomValueRawSync } from 'jotai/react';
import type { CSSProperties } from 'react';
import { translateAtom } from '../../i18n/locale.ts';
import { currentTrackAtom } from '../../playback/playback.ts';
import { moduleHidden } from '../page/immersiveComponents.ts';
import { NowPlayingRating } from '../../shell/player/now-playing/NowPlayingRating.tsx';
import { displayTitle } from '../../shell/player/now-playing/nowPlaying.ts';
import { NowPlayingMenu } from '../../shell/player/context-menu/NowPlayingMenu.tsx';
import { useNowPlayingMenu } from '../../shell/player/context-menu/useNowPlayingMenu.ts';
import { SeekBar } from '../../shell/player/SeekBar.tsx';
import { DialCells } from './DialCells.tsx';
import { DialCover } from './DialCover.tsx';
import { STAGE_CARD_COVER, STAGE_CARD_SCALE } from './stageCard.ts';
import type { CardTops } from '../paper/paperComponentLayout.ts';
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
  readonly hidden: ReadonlySet<string>;
  readonly tops: CardTops;
}

const useStyles = makeStyles({
  more: {
    color: tokens.colorNeutralForeground2,
  },
});

export function StageCard({ title, hidden, tops }: StageCardProps) {
  const t = useAtomValueRawSync(translateAtom);
  const track = useAtomValueRawSync(currentTrackAtom);
  const menu = useNowPlayingMenu(track);
  const classes = useStyles();
  const show = (id: string) => !moduleHidden(hidden, id as never);
  const coverBox: CSSProperties = {
    left: STAGE_CARD_COVER.x,
    top: tops.cover ?? STAGE_CARD_COVER.y,
    width: STAGE_CARD_COVER.size,
    height: STAGE_CARD_COVER.size,
  };
  return (
    <div
      className={styles.card}
      data-card-top={tops.top ?? undefined}
      data-card-bottom={tops.bottom ?? undefined}
    >
      {tops.cover !== null && <DialCover box={coverBox} guard={72} />}
      {tops.meta !== null && (
        <div
          className={styles.meta}
          style={{ top: tops.meta }}
          data-card-meta
          {...menu.trigger}
        >
          {title && (show('card.titleText') || show('card.artist')) && (
            <div className={styles.text} data-card-text>
              {show('card.titleText') && (
                <div className={styles.title} data-field="cardTitle">
                  {track ? displayTitle(track) : t('player.idle')}
                </div>
              )}
              {show('card.artist') && track?.artist && (
                <div className={styles.artist} data-field="cardArtist">
                  {track.artist}
                </div>
              )}
            </div>
          )}
          {(show('card.rating') || show('card.more')) && (
            <div className={styles.actions}>
              {show('card.rating') && <NowPlayingRating size="card" track={track} />}
              {show('card.more') && (
                <Tooltip content={t('player.more')} relationship="label">
                  <Button
                    appearance="subtle"
                    size="large"
                    className={classes.more}
                    icon={<MoreHorizontal24Regular />}
                    aria-label={t('player.more')}
                    {...menu.more}
                  />
                </Tooltip>
              )}
            </div>
          )}
        </div>
      )}
      {tops.seek !== null && (
        <div className={styles.seek} style={{ top: tops.seek }} data-card-seek>
          <SeekBar interactive thickness={6} thumb clock />
        </div>
      )}
      {tops.transport !== null && (
        <PaperTransport
          className={styles.transport}
          guard={60}
          scale={STAGE_CARD_SCALE}
          style={{ top: tops.transport }}
          extras
        />
      )}
      {tops.cells !== null && <DialCells card hidden={hidden} scope="card" style={{ left: 250, top: tops.cells }} />}
      <NowPlayingMenu at={menu.at} onClose={menu.close} />
    </div>
  );
}
