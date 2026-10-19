import { useAtomValueRawSync } from 'jotai/react';
import type { ReactNode } from 'react';
import { currentTrackAtom } from '../../playback/playback.ts';
import { moduleHidden } from '../page/immersiveComponents.ts';
import { MISSING, yearOf } from '../paper/paperScale.ts';
import { durationTextAtom, elapsedTextAtom } from './clockText.ts';
import styles from './PaperMetaRow.module.css';
import { trackExtrasAtom } from './trackExtras.ts';

/** Duration / Elapsed 一格；行里只有这一格跟着播放位置走。 */
function TimesCell({
  showDuration,
  showElapsed,
}: {
  readonly showDuration: boolean;
  readonly showElapsed: boolean;
}) {
  const duration = useAtomValueRawSync(durationTextAtom);
  const elapsed = useAtomValueRawSync(elapsedTextAtom);
  return (
    <div className={`${styles.cell} ${styles.times}`}>
      {showDuration && (
        <div>
          <span className={styles.key}>Duration</span>
          <div className={`${styles.value} ${styles.clock}`} data-field="duration">
            {duration}
          </div>
        </div>
      )}
      {showElapsed && (
        <div>
          <span className={styles.key}>Elapsed</span>
          <div className={`${styles.value} ${styles.hot}`} data-field="elapsed">
            {elapsed}
          </div>
        </div>
      )}
    </div>
  );
}

export interface PaperMetaRowProps {
  /** 去掉声场一格，Genre 的位置换成声压，行高 143 → 113。 */
  readonly compact: boolean;
  /** 左格里的声场件；`compact` 时不出。 */
  readonly stereo: ReactNode;
  /** 耳机声压，占原来 Genre 的位置。 */
  readonly soundPressure: ReactNode;
  /** 当前视图/布局隐藏的模块；按叶子 ID 过滤。 */
  readonly hidden?: ReadonlySet<string>;
}

/**
 * 收缩档与竖版图纸右栏横线下的第一行，三格：声场、声压 / Year / Label、Duration / Elapsed（Elapsed 用热色）。
 * 缺值写 `—`，键名保留。格宽、分隔线与字的纵向位置照图纸；等宽字按图纸字号放大一成
 * （图纸用 Geist Mono，这里的等宽字体字面窄一成）。
 */
export function PaperMetaRow({
  compact,
  stereo,
  soundPressure,
  hidden = new Set<string>(),
}: PaperMetaRowProps) {
  const track = useAtomValueRawSync(currentTrackAtom);
  const { label } = useAtomValueRawSync(trackExtrasAtom);
  const show = (id: string) => !moduleHidden(hidden, id as never);
  const showPressure = show('right.meta.soundPressure');
  const showYear = show('right.meta.year');
  const showLabel = show('right.meta.label');
  const showMeta = showPressure || showYear || showLabel;
  const showDuration = show('right.meta.duration');
  const showElapsed = show('right.meta.elapsed');
  return (
    <div className={compact ? `${styles.row} ${styles.compact}` : styles.row}>
      {!compact && show('right.meta.stereo') && <div className={styles.cell}>{stereo}</div>}
      {showMeta && (
        <div className={`${styles.cell} ${styles.meta}`}>
          {showPressure && <div className={styles.wide}>{soundPressure}</div>}
          {showYear && (
            <div>
              <span className={styles.key}>Year</span>
              <div className={`${styles.value} ${styles.mono}`} data-field="year">
                {yearOf(track?.date) || MISSING}
              </div>
            </div>
          )}
          {showLabel && (
            <div>
              <span className={styles.key}>Label</span>
              <div className={`${styles.value} ${styles.mono}`} data-field="label">
                {label || MISSING}
              </div>
            </div>
          )}
        </div>
      )}
      {(showDuration || showElapsed) && (
        <TimesCell showDuration={showDuration} showElapsed={showElapsed} />
      )}
    </div>
  );
}
