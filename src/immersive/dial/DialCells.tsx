import { useAtomValueRawSync } from 'jotai/react';
import type { CSSProperties } from 'react';
import { currentTrackAtom } from '../../playback/playback.ts';
import { MISSING, formatTagDate, formatTrackPosition } from '../paper/paperScale.ts';
import { trackExtrasAtom } from '../fields/trackExtras.ts';
import styles from './DialCells.module.css';

const CELL_KEY_CLASS = `${styles.base} ${styles['cell-key']}`;
const CELL_VALUE_CLASS = `${styles.base} ${styles['cell-value']}`;
const MISSING_VALUE_CLASS = `${CELL_VALUE_CLASS} ${styles.missing}`;

export interface DialCellsProps {
  /** 摆在哪儿；不给就用罗盘下的原位（左 150、顶 776）。 */
  readonly style?: CSSProperties;
}

/**
 * 罗盘下方与卡片左侧共用的三格（Date · Track · Label）。写法同文件信息 3 × 2：列宽 160，
 * 第一格与封面左边对齐；小标基线 792、值基线 818（舞台坐标）。本身是零尺寸定位锚上的绝对定位块。
 */
export function DialCells({ style }: DialCellsProps) {
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
  ];
  return (
    <dl className={styles.cells} style={style} data-decor-guard="24">
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
