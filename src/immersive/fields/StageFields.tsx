import { useAtomValueRawSync } from 'jotai/react';
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { currentTrackAtom } from '../../playback/playback.ts';
import { moduleHidden, type ImmersivePanelId } from '../page/immersiveComponents.ts';
import { MISSING, stageQualityLine } from '../paper/paperScale.ts';
import { STAGE_TITLE, STAGE_TITLE_SOFTNESS, STAGE_TITLE_SPEED } from '../paper/paperStage.ts';
import type { StageBox } from '../paper/paperComponentLayout.ts';
import { Placed, type Placements } from '../layout/Placed.tsx';
import { trackExtrasAtom } from './trackExtras.ts';
import styles from './StageFields.module.css';
import { StageMeterRow } from './StageMeterRow.tsx';
import { useTitleScroll, type TitleScrollOptions } from './useTitleScroll.ts';

const TITLE_SCROLL: TitleScrollOptions = {
  font: STAGE_TITLE.font,
  speed: STAGE_TITLE_SPEED,
  softness: STAGE_TITLE_SOFTNESS,
};

/** 四行字三行（From / 标题 / By）的默认行顶：82 → 108 → 222。 */
const HEADER_BASE = { from: 82, title: 108, by: 222 } as const;
/** 没有布局盒子时（单元测试与降级路径）用空表。 */
const NO_BOXES: ReadonlyMap<ImmersivePanelId, StageBox> = new Map();

export interface StageFieldsProps {
  /** 仪表第一行左格里的声场件，格子 332 × 155、左上角在舞台 (760, 296)。 */
  readonly stereo: ReactNode;
  /** 是否画出横线以下的仪表第一行；歌词场景只留 From / 标题 / By / Quality。 */
  readonly showMeter?: boolean;
  /** 是否画出那四行字（From / 标题 / By / Quality）；卡片歌词档右栏已经由卡片写了曲名，为假。 */
  readonly showFields?: boolean;
  /** 右栏底部那块歌词；不给就不占位（卡片歌词档由右半区自己排歌词）。 */
  readonly lyrics?: ReactNode;
  /** 四行字/仪表的模块开关；默认都显示。 */
  readonly showHeader?: boolean;
  /** 右栏底部的歌词是否出。 */
  readonly showLyrics?: boolean;
  /** 当前视图/布局隐藏的模块；四行字与仪表各格按叶子 ID 过滤。 */
  readonly hidden?: ReadonlySet<string>;
  /**
   * 布局算出的每格盒子。可见模块按行排布，藏掉的行整行收掉——四行字的三行各自落位、
   * 仪表行里的格子横向流动，藏一个不留空白。
   */
  readonly boxes?: ReadonlyMap<ImmersivePanelId, StageBox>;
  /** 编排器里挪过或改过大小的组件。 */
  readonly placements?: Placements;
}

/**
 * full 档舞台的右栏上半：热色方块、From 行、标题、By 与右对齐到 x 1780 的 Quality，下接仪表第一行
 * （`StageMeterRow`）。本身是铺满舞台的定位层，各件按舞台坐标绝对定位；字按基线落位：字盒底边裁到字母基线，
 * `top` 写的就是基线，要省略的字只在横向裁切，下伸部分照常露出。字段名是等宽英文，是版式的一部分，
 * 不进语言包；缺值写 `—`。
 *
 * 标题字号从 76 起，放不下每次降 3、最小 62，仍放不下就循环滚动与擦除（`useTitleScroll`）。
 * From 行与 By 行标了 `data-decor-guard`，生成式网格不在标题块周围放装饰。
 */
export function StageFields({
  stereo,
  showMeter = true,
  showFields = true,
  lyrics,
  showHeader = true,
  showLyrics = true,
  hidden = new Set<string>(),
  boxes,
  placements = {},
}: StageFieldsProps) {
  const track = useAtomValueRawSync(currentTrackAtom);
  const extras = useAtomValueRawSync(trackExtrasAtom);
  const title = track?.title || MISSING;
  const quality = stageQualityLine({
    bitDepth: extras.bitDepth,
    bitrate: track?.bitrate,
    sampleRate: track?.sampleRate,
    encoding: extras.encoding,
  });
  const titleBox = useRef<HTMLHeadingElement>(null);
  const titleText = useRef<HTMLSpanElement>(null);
  const { rolling } = useTitleScroll(titleBox, titleText, title, TITLE_SCROLL);
  const show = (id: 'right.header.from' | 'right.header.title' | 'right.header.by' | 'right.header.quality') =>
    !moduleHidden(hidden, id);
  const headerShown =
    show('right.header.from') ||
    show('right.header.title') ||
    show('right.header.by') ||
    show('right.header.quality');
  // 三行各自落位：藏掉一行，这一行收掉、下面两行跟着上移。
  const boxOf = (id: ImmersivePanelId): StageBox | undefined => boxes?.get(id);
  const headerTops = {
    from: boxOf('right.header.from')?.y ?? HEADER_BASE.from,
    title: boxOf('right.header.title')?.y ?? HEADER_BASE.title,
    by:
      boxOf('right.header.by')?.y ??
      boxOf('right.header.quality')?.y ??
      HEADER_BASE.by,
  };
  const shift = (y: number, base: number): CSSProperties | undefined =>
    y === base ? undefined : { transform: `translateY(${y - base}px)` };
  const meterTop =
    boxOf('right.meter.stereo')?.y ??
    boxOf('right.meter.bpm')?.y ??
    boxOf('right.meter.soundPressure')?.y ??
    boxOf('right.meter.duration')?.y ??
    null;
  const lyricsTop = boxOf('right.lyrics')?.y ?? null;

  return (
    <div className={styles.fields}>
      {showFields && showHeader && headerShown && (
        <div className={styles.headerBlock}>
          {show('right.header.from') && (
            <Placed id="right.header.from" boxes={boxes ?? NO_BOXES} placements={placements}>
              <span
                className={styles['hot-square']}
                aria-hidden
                style={shift(headerTops.from, HEADER_BASE.from)}
              />
              <div
                className={`${styles.base} ${styles.from}`}
                data-decor-guard="40"
                style={shift(headerTops.from, HEADER_BASE.from)}
              >
                <span>From:</span> <span data-field="album">{track?.album || MISSING}</span>
              </div>
            </Placed>
          )}
          {show('right.header.title') && (
            <Placed id="right.header.title" boxes={boxes ?? NO_BOXES} placements={placements}>
              <h1
                ref={titleBox}
                className={`${styles.base} ${styles.title}`}
                style={{ width: STAGE_TITLE.width, ...shift(headerTops.title, HEADER_BASE.title) }}
                data-rolling={rolling || undefined}
                data-field="title"
              >
                <span ref={titleText} className={styles['title-text']}>
                  {title}
                </span>
              </h1>
            </Placed>
          )}
          {show('right.header.by') && (
            <Placed id="right.header.by" boxes={boxes ?? NO_BOXES} placements={placements}>
              <span
                className={`${styles.base} ${styles.key} ${styles['by-key']}`}
                data-decor-guard="40"
                style={shift(headerTops.by, HEADER_BASE.by)}
              >
                By
              </span>
              <div
                className={`${styles.base} ${styles.artist}`}
                data-field="artist"
                data-decor-guard="40"
                style={shift(headerTops.by, HEADER_BASE.by)}
              >
                {track?.artist || MISSING}
              </div>
            </Placed>
          )}
          {show('right.header.quality') && quality && (
            <Placed id="right.header.quality" boxes={boxes ?? NO_BOXES} placements={placements}>
              <span
                className={`${styles.base} ${styles.key} ${styles['quality-key']}`}
                style={shift(headerTops.by, HEADER_BASE.by)}
              >
                Quality
              </span>
              <div
                className={`${styles.base} ${styles.quality}`}
                data-field="quality"
                style={shift(headerTops.by, HEADER_BASE.by)}
              >
                {quality}
              </div>
            </Placed>
          )}
        </div>
      )}
      {showMeter && meterTop !== null && (
        <StageMeterRow stereo={stereo} offsetY={meterTop - 296} hidden={hidden} boxes={boxes} />
      )}
      {lyrics && showLyrics && (
        <div
          className={styles.lyrics}
          style={lyricsTop !== null ? { top: lyricsTop } : undefined}
          data-stage-lyrics-slot
        >
          {lyrics}
        </div>
      )}
    </div>
  );
}
