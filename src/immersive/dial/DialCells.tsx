import { useAtomValueRawSync } from 'jotai/react';
import type { CSSProperties } from 'react';
import { currentTrackAtom } from '../../playback/playback.ts';
import { moduleHidden } from '../page/immersiveComponents.ts';
import { MISSING, formatTagDate, formatTrackPosition } from '../paper/paperScale.ts';
import { trackExtrasAtom } from '../fields/trackExtras.ts';
import styles from './DialCells.module.css';

const CELL_KEY_CLASS = `${styles.base} ${styles['cell-key']}`;
const CELL_VALUE_CLASS = `${styles.base} ${styles['cell-value']}`;
const MISSING_VALUE_CLASS = `${CELL_VALUE_CLASS} ${styles.missing}`;

export interface DialCellsProps {
  /** 摆在哪儿；不给就用罗盘下的原位（左 150、顶 776）。 */
  readonly style?: CSSProperties;
  /** 卡片两档：三格字号与行高放大，和卡片左区其余字一起看。 */
  readonly card?: boolean;
  /** 隐藏模块；按 `dial.cell.*` 或 `card.cell.*` 过滤。 */
  readonly hidden?: ReadonlySet<string>;
  /** 罗盘下三格还是卡片左区三格，决定用哪一组模块 ID。 */
  readonly scope?: 'dial' | 'card';
}

/**
 * 罗盘下方与卡片左侧共用的三格（Date · Track · Label）。写法同文件信息 3 × 2：列宽 160，
 * 第一格与封面左边对齐；小标基线 792、值基线 818（舞台坐标）。本身是零尺寸定位锚上的绝对定位块。
 */
export function DialCells({
  style,
  card = false,
  hidden = new Set<string>(),
  scope = 'dial',
}: DialCellsProps = {}) {
  const track = useAtomValueRawSync(currentTrackAtom);
  const extras = useAtomValueRawSync(trackExtrasAtom);
  const cells = [
    { id: 'date', key: 'Date', value: formatTagDate(track?.date) },
    {
      id: 'track',
      key: 'Track',
      value: formatTrackPosition({
        trackNumber: track?.trackNumber,
        discNumber: track?.discNumber,
        totalTracks: extras.totalTracks,
        totalDiscs: extras.totalDiscs,
      }),
    },
    { id: 'label', key: 'Label', value: extras.label || MISSING },
  ].filter((cell) => !moduleHidden(hidden, `${scope}.cell.${cell.id}` as never));
  if (cells.length === 0) return null;
  return (
    <dl className={styles.cells} style={style} data-decor-guard="24" data-card={card || undefined}>
      {cells.map((cell) => (
        <div key={cell.id} className={styles.cell}>
          <dt className={CELL_KEY_CLASS}>{cell.key}</dt>
          <dd
            className={cell.value === MISSING ? MISSING_VALUE_CLASS : CELL_VALUE_CLASS}
            data-field={cell.id}
          >
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
