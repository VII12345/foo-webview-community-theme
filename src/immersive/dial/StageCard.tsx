import { Button, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { MoreHorizontal24Regular } from '@fluentui/react-icons';
import { useAtomValueRawSync } from 'jotai/react';
import type { CSSProperties } from 'react';
import { translateAtom } from '../../i18n/locale.ts';
import { currentTrackAtom } from '../../playback/playback.ts';
import { moduleHidden, type ImmersivePanelId } from '../page/immersiveComponents.ts';
import type { CardTops, StageBox } from '../paper/paperComponentLayout.ts';
import { Placed, type Placements } from '../layout/Placed.tsx';
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
  readonly hidden: ReadonlySet<string>;
  readonly tops: CardTops;
  /** 布局算出的每件盒子，编排器里挪过或改过大小的按它落位。 */
  readonly boxes?: ReadonlyMap<ImmersivePanelId, StageBox>;
  readonly placements?: Placements;
}

const useStyles = makeStyles({
  more: {
    color: tokens.colorNeutralForeground2,
  },
});

/** 没有布局盒子时（降级路径）用空表。 */
const NO_BOXES: ReadonlyMap<ImmersivePanelId, StageBox> = new Map();

export function StageCard({ title, hidden, tops, boxes, placements = {} }: StageCardProps) {
  const t = useAtomValueRawSync(translateAtom);
  const track = useAtomValueRawSync(currentTrackAtom);
  const menu = useNowPlayingMenu(track);
  const classes = useStyles();
  const show = (id: string) => !moduleHidden(hidden, id as never);
  const map = boxes ?? NO_BOXES;
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
      {tops.cover !== null && (
        <Placed id="card.cover" boxes={map} placements={placements}>
          <DialCover box={coverBox} guard={72} />
        </Placed>
      )}
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
                <Placed id="card.titleText" boxes={map} placements={placements}>
                  <div className={styles.title} data-field="cardTitle">
                    {track ? displayTitle(track) : t('player.idle')}
                  </div>
                </Placed>
              )}
              {show('card.artist') && track?.artist && (
                <Placed id="card.artist" boxes={map} placements={placements}>
                  <div className={styles.artist} data-field="cardArtist">
                    {track.artist}
                  </div>
                </Placed>
              )}
            </div>
          )}
          {(show('card.rating') || show('card.more')) && (
            <div className={styles.actions}>
              {show('card.rating') && (
                <Placed id="card.rating" boxes={map} placements={placements}>
                  <NowPlayingRating size="card" track={track} />
                </Placed>
              )}
              {show('card.more') && (
                <Placed id="card.more" boxes={map} placements={placements}>
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
                </Placed>
              )}
            </div>
          )}
        </div>
      )}
      {tops.seek !== null && (
        <Placed id="card.seek" boxes={map} placements={placements}>
          <div className={styles.seek} style={{ top: tops.seek }} data-card-seek>
            <SeekBar interactive thickness={6} thumb clock />
          </div>
        </Placed>
      )}
      {tops.transport !== null && (
        <Placed id="card.transport" boxes={map} placements={placements}>
          <PaperTransport
            className={styles.transport}
            guard={60}
            scale={STAGE_CARD_SCALE}
            style={{ top: tops.transport }}
            extras
          />
        </Placed>
      )}
      {tops.cells !== null && (
        <Placed id="card.cells" boxes={map} placements={placements}>
          <DialCells card hidden={hidden} scope="card" style={{ left: 250, top: tops.cells }} />
        </Placed>
      )}
      <NowPlayingMenu at={menu.at} onClose={menu.close} />
    </div>
  );
}
