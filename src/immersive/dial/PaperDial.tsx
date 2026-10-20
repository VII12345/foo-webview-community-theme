import { useAtomValueRawSync } from 'jotai/react';
import { useMemo, type CSSProperties } from 'react';
import { currentTrackAtom } from '../../playback/playback.ts';
import { moduleHidden, type ImmersivePanelId } from '../page/immersiveComponents.ts';
import {
  BRACKET_ARM,
  BRACKET_OUTSET,
  dialLayout,
  narrowLayout,
} from '../paper/paperDialLayout.ts';
import { formatTrackNo } from '../paper/paperScale.ts';
import type { DialPlacement } from '../paper/paperTiers.ts';
import type { StageBox } from '../paper/paperComponentLayout.ts';
import { Placed, type Placements } from '../layout/Placed.tsx';
import { DialCover } from './DialCover.tsx';
import { PaperBrackets } from './PaperBrackets.tsx';
import styles from './PaperDial.module.css';
import { PaperOrbit } from './PaperOrbit.tsx';
import { PaperTransport } from './PaperTransport.tsx';

/** 没有布局盒子时（降级路径）用空表。 */
const NO_BOXES: ReadonlyMap<ImmersivePanelId, StageBox> = new Map();

export interface PaperDialProps {
  /** 罗盘圆心与缩放；narrow 档没有罗盘，为 null。 */
  readonly dial: DialPlacement | null;
  /** 单栏的左缘与宽，narrow 档排封面那一行用。 */
  readonly column: { readonly x: number; readonly width: number };
  readonly hidden?: ReadonlySet<string>;
  /** 布局算出的每件盒子（版心坐标）；编排器里挪过或改过大小的按它落位。 */
  readonly boxes?: ReadonlyMap<ImmersivePanelId, StageBox>;
  readonly placements?: Placements;
}

/**
 * 收缩档与竖版的图纸左栏：罗盘环套封面。三圈实线环与刻度字是版式，两圈虚线环、辐条与四个轨道点在转动层
 * `PaperOrbit` 上，封面压在转动层之上；环内上下是专辑名与曲号，环下是三颗圆键 `PaperTransport`。
 * 本身是版心原点上的零尺寸定位锚，各件按版心坐标绝对定位。
 *
 * 各件的位置按档位给的 `dial` 算：缩放作用于环、封面、刻度与两个文字块到圆心的距离，字号不缩。
 * narrow 档没有罗盘：单栏左上一块 160 的封面，右侧依次是专辑名（最多两行）、传输键与曲号，排在 `column` 的宽里。
 *
 * 封面标了 `data-decor-guard`：图纸的生成式网格不在它周围放装饰。
 */
export function PaperDial({
  dial,
  column,
  hidden = new Set<string>(),
  boxes,
  placements = {},
}: PaperDialProps) {
  const track = useAtomValueRawSync(currentTrackAtom);
  const show = (id: string) => !moduleHidden(hidden, id as never);
  const layout = useMemo(() => (dial ? dialLayout(dial) : narrowLayout(column)), [dial, column]);
  const { left, top, size } = layout.cover;
  const coverBox: CSSProperties = { left, top, width: size, height: size };
  const bracketBox = {
    left: left - BRACKET_OUTSET,
    top: top - BRACKET_OUTSET,
    size: size + 2 * BRACKET_OUTSET,
  };
  return (
    <div className={dial ? styles.dial : `${styles.dial} ${styles.narrow}`}>
      {show('dial.rings') && (
        <Placed id="dial.rings" boxes={boxes ?? NO_BOXES} placements={placements}>
          {layout.rings.map((ring) => (
            <span
              key={ring.radius}
              className={styles.ring}
              style={ring.style}
              data-dial-ring
              aria-hidden
            />
          ))}
        </Placed>
      )}
      {dial && show('dial.orbit') && (
        <Placed id="dial.orbit" boxes={boxes ?? NO_BOXES} placements={placements}>
          <PaperOrbit center={dial} scale={dial.scale} />
        </Placed>
      )}
      {show('dial.ticks') && (
        <Placed id="dial.ticks" boxes={boxes ?? NO_BOXES} placements={placements}>
          {layout.ticks.map((tick) => (
            <span key={tick.text} className={styles.tick} style={tick.style} aria-hidden>
              {tick.text}
            </span>
          ))}
        </Placed>
      )}
      {show('dial.albumText') && (
        <Placed id="dial.albumText" boxes={boxes ?? NO_BOXES} placements={placements}>
          <div className={`${styles.text} ${styles.album}`} style={layout.album} data-field="dialAlbum">
            {track?.album ?? ''}
          </div>
        </Placed>
      )}
      {show('dial.cover') && (
        <Placed id="dial.cover" boxes={boxes ?? NO_BOXES} placements={placements}>
          <DialCover box={coverBox} guard={47} />
        </Placed>
      )}
      {show('dial.brackets') && (
        <Placed id="dial.brackets" boxes={boxes ?? NO_BOXES} placements={placements}>
          <PaperBrackets box={bracketBox} arm={BRACKET_ARM} />
        </Placed>
      )}
      {show('dial.trackNo') && (
        <Placed id="dial.trackNo" boxes={boxes ?? NO_BOXES} placements={placements}>
          <div className={styles.text} style={layout.trackNo} data-field="trackNo">
            {formatTrackNo(track?.trackNumber)}
          </div>
        </Placed>
      )}
      {show('dial.transport') && (
        <Placed id="dial.transport" boxes={boxes ?? NO_BOXES} placements={placements}>
          <PaperTransport className={styles.transport} scale={layout.scale} style={layout.transport} />
        </Placed>
      )}
    </div>
  );
}
