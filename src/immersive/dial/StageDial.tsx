import { useAtomValueRawSync } from 'jotai/react';
import type { CSSProperties } from 'react';
import { currentTrackAtom } from '../../playback/playback.ts';
import { moduleHidden, type ImmersivePanelId } from '../page/immersiveComponents.ts';
import { STAGE_COVER, STAGE_DIAL, STAGE_ORBIT, STAGE_RINGS, STAGE_TICKS, STAGE_TRANSPORT } from '../paper/paperStage.ts';
import type { StageBox } from '../paper/paperComponentLayout.ts';
import { Placed, type Placements } from '../layout/Placed.tsx';
import { DialCells } from './DialCells.tsx';
import { DialCover } from './DialCover.tsx';
import { PaperBrackets } from './PaperBrackets.tsx';
import { PaperOrbit } from './PaperOrbit.tsx';
import { PaperTransport } from './PaperTransport.tsx';
import styles from './StageDial.module.css';

/** 括号线宽；拐点压在封面四角，线落在封面外侧，所以括号框比封面各边外扩一个线宽。 */
const BRACKET_STROKE = 2;
const BRACKET_BOX = {
  left: STAGE_COVER.x - BRACKET_STROKE,
  top: STAGE_COVER.y - BRACKET_STROKE,
  size: STAGE_COVER.size + 2 * BRACKET_STROKE,
};
const BRACKET_ARM = STAGE_COVER.bracket + BRACKET_STROKE;

const COVER_BOX: CSSProperties = {
  left: STAGE_COVER.x,
  top: STAGE_COVER.y,
  width: STAGE_COVER.size,
  height: STAGE_COVER.size,
};

const [FIRST_KEY, , LAST_KEY] = STAGE_TRANSPORT.centers;
const TRANSPORT_SIZE = {
  side: STAGE_TRANSPORT.side,
  play: STAGE_TRANSPORT.play,
  width: LAST_KEY - FIRST_KEY + STAGE_TRANSPORT.side,
};
const TRANSPORT_BOX: CSSProperties = {
  left: FIRST_KEY - STAGE_TRANSPORT.side / 2,
  top: STAGE_TRANSPORT.y - STAGE_TRANSPORT.play / 2,
};

const TICK_CLASS = `${styles.base} ${styles.tick}`;
const HOT_TICK_CLASS = `${TICK_CLASS} ${styles['hot-tick']}`;

/** 没有布局盒子时（降级路径）用空表。 */
const NO_BOXES: ReadonlyMap<ImmersivePanelId, StageBox> = new Map();

/** 以环心为圆心、直径是两倍半径的方框；样式里再用 `translate` 拉回中心。 */
function ringBox(radius: number): CSSProperties {
  return { left: STAGE_DIAL.x, top: STAGE_DIAL.y, width: radius * 2, height: radius * 2 };
}

/**
 * full 档舞台的左区：三圈实线环、转动层（`PaperOrbit`，压在实线环之上、刻度字与封面之下）、刻度字、
 * 封面上方的专辑名、封面与四角括号、封面下三格
 * （Date · Track · Label）与传输三键。本身是舞台原点上的零尺寸定位锚，各件按舞台坐标绝对定位；
 * 字按基线落位（字盒底边裁到字母基线，`top` 写基线）。
 *
 * 封面（`DialCover`）与背景的封面底色共用同一份状态。封面、三格与传输键标了
 * `data-decor-guard`，生成式网格不在它们周围放装饰；传输键压在歌词卡之上。
 */
export function StageDial({
  offsetX = 0,
  hidden = new Set<string>(),
  boxes,
  placements = {},
}: {
  readonly offsetX?: number;
  readonly hidden?: ReadonlySet<string>;
  /** 布局算出的每件盒子，编排器里挪过或改过大小的按它落位。 */
  readonly boxes?: ReadonlyMap<ImmersivePanelId, StageBox>;
  readonly placements?: Placements;
} = {}) {
  const track = useAtomValueRawSync(currentTrackAtom);
  const show = (id: string) => !moduleHidden(hidden, id as never);
  const map = boxes ?? NO_BOXES;
  return (
    <div className={styles.dial} style={offsetX ? { left: offsetX } : undefined}>
      {show('dial.rings') && (
        <Placed id="dial.rings" boxes={map} placements={placements}>
          {STAGE_RINGS.map((radius) => (
            <span key={radius} className={styles.ring} style={ringBox(radius)} aria-hidden />
          ))}
        </Placed>
      )}
      {show('dial.orbit') && (
        <Placed id="dial.orbit" boxes={map} placements={placements}>
          <PaperOrbit center={STAGE_DIAL} scale={1} spec={STAGE_ORBIT} />
        </Placed>
      )}
      {show('dial.ticks') && (
        <Placed id="dial.ticks" boxes={map} placements={placements}>
          {STAGE_TICKS.map((tick) => (
            <span
              key={tick.text}
              className={tick.hot ? HOT_TICK_CLASS : TICK_CLASS}
              style={{ left: tick.x, top: tick.base }}
              aria-hidden
            >
              {tick.text}
            </span>
          ))}
        </Placed>
      )}
      {show('dial.albumText') && (
        <Placed id="dial.albumText" boxes={map} placements={placements}>
          <div className={`${styles.base} ${styles.album}`} data-field="dialAlbum">
            {track?.album ?? ''}
          </div>
        </Placed>
      )}
      {show('dial.cover') && (
        <Placed id="dial.cover" boxes={map} placements={placements}>
          <DialCover box={COVER_BOX} guard={72} />
        </Placed>
      )}
      {show('dial.brackets') && (
        <Placed id="dial.brackets" boxes={map} placements={placements}>
          <PaperBrackets box={BRACKET_BOX} arm={BRACKET_ARM} />
        </Placed>
      )}
      {show('dial.cells') && (
        <Placed id="dial.cells" boxes={map} placements={placements}>
          <DialCells hidden={hidden} />
        </Placed>
      )}
      {show('dial.transport') && (
        <Placed id="dial.transport" boxes={map} placements={placements}>
          <PaperTransport
            className={styles.transport}
            size={TRANSPORT_SIZE}
            guard={60}
            style={TRANSPORT_BOX}
          />
        </Placed>
      )}
    </div>
  );
}
