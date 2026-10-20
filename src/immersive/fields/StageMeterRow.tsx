import { useAtomValueRawSync } from 'jotai/react';
import type { CSSProperties, ReactNode } from 'react';
import { currentTrackAtom } from '../../playback/playback.ts';
import { moduleHidden, type ImmersivePanelId } from '../page/immersiveComponents.ts';
import { SoundPressureCell } from '../sound/SoundPressureCell.tsx';
import { StageBpm } from '../tempo/StageBpm.tsx';
import { durationTextAtom, remainingTextAtom } from './clockText.ts';
import type { StageBox } from '../paper/paperComponentLayout.ts';
import { Placed, type Placements } from '../layout/Placed.tsx';
import styles from './StageMeterRow.module.css';

/** 右对齐到 x 1780 的 Duration 格，附行是剩余时间；行里只有这一格跟着播放位置走。 */
function DurationCell() {
  const duration = useAtomValueRawSync(durationTextAtom);
  const remaining = useAtomValueRawSync(remainingTextAtom);
  return (
    <div className={styles['duration-cell']}>
      <span className={`${styles.key} ${styles['duration-key']}`}>Duration</span>
      <span className={styles.clock} data-field="duration">
        {duration}
      </span>
      <div className={styles.remain}>
        <span className={styles['sub-key']}>Remain</span>
        <span className={styles['remain-value']} data-field="remaining">
          {remaining}
        </span>
      </div>
    </div>
  );
}

export interface StageMeterRowProps {
  /** 左格里的声场件。 */
  readonly stereo: ReactNode;
  /** 整行相对舞台的纵向位移；可见模块变化时由布局算。 */
  readonly offsetY?: number;
  /** 当前视图/布局隐藏的模块；按仪表格的叶子 ID 过滤。 */
  readonly hidden?: ReadonlySet<string>;
  /** 布局算出的每格盒子；格子的横向位置跟着它走，藏一格后面的左移。 */
  readonly boxes?: ReadonlyMap<ImmersivePanelId, StageBox>;
  /** 编排器里挪过或改过大小的组件。 */
  readonly placements?: Placements;
}

/** 各格在图纸上的默认左缘；布局给的盒子减去它就是这一格的横移。 */
const CELL_LEFT = {
  stereo: 760,
  bpm: 1140,
  soundPressure: 1336,
  albumArtist: 1336,
} as const;

/** 没有布局盒子时（降级路径）用空表。 */
const NO_BOXES: ReadonlyMap<ImmersivePanelId, StageBox> = new Map();

/**
 * full 档舞台右栏 By 行下面的仪表第一行（y 296–451）：主行小标的顶边与声场图顶边齐平在 y 296，这一线就是
 * 本行的上沿，不另画横线。四格：声场 | BPM（`StageBpm`）| 耳机声压（下面上下排 Album artist，与 Artist 相同
 * 或为空时不出）| Duration（附行剩余时间）。本身是铺满舞台的定位层，各件按舞台坐标绝对定位，字按基线落位。
 * 缺值写 `—`，键名保留。
 *
 * 四格横向流动：藏掉一格，后面的跟着左移，不留一段空当；分隔线跟着两格之间的空当走。
 */
export function StageMeterRow({
  stereo,
  offsetY = 0,
  hidden = new Set<string>(),
  boxes,
  placements = {},
}: StageMeterRowProps) {
  const track = useAtomValueRawSync(currentTrackAtom);
  const albumArtist =
    track?.albumArtist && track.albumArtist !== track.artist ? track.albumArtist : '';
  const show = (
    id:
      | 'right.meter.stereo'
      | 'right.meter.bpm'
      | 'right.meter.soundPressure'
      | 'right.meter.albumArtist'
      | 'right.meter.duration',
  ) => !moduleHidden(hidden, id);
  const stereoShown = show('right.meter.stereo');
  const bpmShown = show('right.meter.bpm');
  const pressureShown = show('right.meter.soundPressure');
  const leftOf = (id: ImmersivePanelId, base: number): number =>
    (boxes?.get(id)?.x ?? base) - base;
  const shiftX = (delta: number): CSSProperties | undefined =>
    delta === 0 ? undefined : { transform: `translateX(${delta}px)` };
  const stereoLeft = leftOf('right.meter.stereo', CELL_LEFT.stereo);
  const bpmLeft = leftOf('right.meter.bpm', CELL_LEFT.bpm);
  const pressureLeft = leftOf('right.meter.soundPressure', CELL_LEFT.soundPressure);
  const artistLeft = leftOf('right.meter.albumArtist', CELL_LEFT.albumArtist);
  // 分隔线画在两格之间的空当里：下一格的左缘往回 30。
  const nextAfterStereo = bpmShown ? bpmLeft + CELL_LEFT.bpm : pressureLeft + CELL_LEFT.soundPressure;
  const nextAfterBpm = pressureLeft + CELL_LEFT.soundPressure;
  const map = boxes ?? NO_BOXES;
  return (
    <div
      className={styles.meter}
      style={offsetY !== 0 ? { transform: `translateY(${offsetY}px)` } : undefined}
    >
      {stereoShown && (
        <Placed id="right.meter.stereo" boxes={map} placements={placements}>
          <div className={styles['stereo-cell']} style={shiftX(stereoLeft)}>
            {stereo}
          </div>
        </Placed>
      )}
      {stereoShown && (bpmShown || pressureShown) && (
        <span
          className={`${styles.divider} ${styles.first}`}
          aria-hidden
          style={{ left: nextAfterStereo - 30 }}
        />
      )}
      {bpmShown && (
        <Placed id="right.meter.bpm" boxes={map} placements={placements}>
          <div className={styles['cell-shift']} style={shiftX(bpmLeft)}>
            <StageBpm />
          </div>
        </Placed>
      )}
      {bpmShown && pressureShown && (
        <span
          className={`${styles.divider} ${styles.second}`}
          aria-hidden
          style={{ left: nextAfterBpm - 30 }}
        />
      )}
      {pressureShown && (
        <Placed id="right.meter.soundPressure" boxes={map} placements={placements}>
          <div className={styles['cell-shift']} style={shiftX(pressureLeft)}>
            <SoundPressureCell variant="stage" />
          </div>
        </Placed>
      )}
      {show('right.meter.albumArtist') && albumArtist && (
        <Placed id="right.meter.albumArtist" boxes={map} placements={placements}>
          <span
            className={`${styles.base} ${styles['sub-key']} ${styles['album-artist-key']}`}
            style={shiftX(artistLeft)}
          >
            Album artist
          </span>
          <div
            className={`${styles.base} ${styles['album-artist']}`}
            data-field="albumArtist"
            style={shiftX(artistLeft)}
          >
            {albumArtist}
          </div>
        </Placed>
      )}
      {show('right.meter.duration') && (
        <Placed id="right.meter.duration" boxes={map} placements={placements}>
          <DurationCell />
        </Placed>
      )}
    </div>
  );
}
