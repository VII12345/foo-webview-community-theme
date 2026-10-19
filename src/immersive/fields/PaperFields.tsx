import { useAtomValueRawSync } from 'jotai/react';
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { currentTrackAtom } from '../../playback/playback.ts';
import {
  moduleHidden,
  type ImmersivePanelId,
} from '../page/immersiveComponents.ts';
import { MISSING, qualityLine } from '../paper/paperScale.ts';
import type { FieldsMode } from '../paper/paperTiers.ts';
import styles from './PaperFields.module.css';
import { PaperFileInfo } from './PaperFileInfo.tsx';
import { PaperMetaRow } from './PaperMetaRow.tsx';
import { useTitleScroll, type TitleScrollOptions } from './useTitleScroll.ts';

/** 长标题先从 48 降到 36，仍放不下再滚动；滚动速度与擦除软边按版心档的缺省。 */
const TITLE_SCROLL: TitleScrollOptions = { font: { max: 48, min: 36, step: 12 } };

const FOOTNOTE =
  'DR: TT DR Meter · LUFS: ITU-R BS.1770 (short-term 3 s; bar momentary; I whole track)';

const HEADER_IDS = [
  'right.header.from',
  'right.header.title',
  'right.header.by',
  'right.header.quality',
] as const satisfies readonly ImmersivePanelId[];

const META_IDS = [
  'right.meta.stereo',
  'right.meta.soundPressure',
  'right.meta.year',
  'right.meta.label',
  'right.meta.duration',
  'right.meta.elapsed',
] as const satisfies readonly ImmersivePanelId[];

const GAUGE_IDS = [
  'right.gauges.dynamicRange',
  'right.gauges.loudness',
] as const satisfies readonly ImmersivePanelId[];

const FILE_INFO_IDS = [
  'right.fileInfo.sampleRate',
  'right.fileInfo.bitDepth',
  'right.fileInfo.channels',
  'right.fileInfo.bitrate',
  'right.fileInfo.fileSize',
  'right.fileInfo.format',
] as const satisfies readonly ImmersivePanelId[];

/** 右栏里由场景填的五块；场景没填的留出空位，格子照样占高。 */
export interface PaperFieldSlots {
  readonly stereo: ReactNode;
  readonly soundPressure: ReactNode;
  readonly spectrum: ReactNode;
  readonly waveform: ReactNode;
  readonly gauges: ReactNode;
  readonly lyrics: ReactNode;
}

export interface PaperFieldsProps {
  /** 右栏的左上角与宽（版心坐标）和怎么收。 */
  readonly placement: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly mode: FieldsMode;
  };
  /** 从 `placement.y` 到版心底边的高度，歌词一块吃掉剩下的部分。 */
  readonly height: number;
  readonly slots: PaperFieldSlots;
  /** 歌词场景：只留 From / 标题 / By / Quality，横线以下的仪表、频谱、波形、文件信息、脚注全不出。 */
  readonly lyricsOnly?: boolean;
  /** 当前视图/布局隐藏的模块。 */
  readonly hidden?: ReadonlySet<string>;
}

/**
 * 收缩档与竖版的图纸右栏：From 行、标题、By 与 Quality，横线下依次是 `PaperMetaRow`（声场、声压 / Year / Label、
 * Duration / Elapsed）、频谱、整轨波形、量表与文件信息 3 × 2（`PaperFileInfo`）、脚注、歌词。
 * 字段名是等宽英文，是版式的一部分，不进语言包；缺值写 `—`，键名保留，图纸的格子不因为空就塌。
 *
 * 位置与宽由档位给。`compact` 去掉声场与 3 × 2、频谱柱区矮 40；`narrow` 只留 From / 标题 / By / 频谱 / 波形 / 歌词，
 * 频谱柱区同样矮 40，并左缩 26 给幅度刻度（单栏两侧只有 16 的边距）。各块高度是定值，不随内容伸缩；
 * 频谱、整轨波形、量表与文件信息的几何变量在这里按版心档给全。
 *
 * 长标题先降字号（48 → 36），仍放不下就循环滚动与擦除（`useTitleScroll`），减弱动效下留省略号。
 * From 行与 By 行标了 `data-decor-guard`，各外扩 36、正好在标题中间接上：生成式网格不在标题块周围放装饰。
 */
export function PaperFields({
  placement,
  height,
  slots,
  lyricsOnly = false,
  hidden = new Set<string>(),
}: PaperFieldsProps) {
  const track = useAtomValueRawSync(currentTrackAtom);
  const title = track?.title || MISSING;
  const quality = qualityLine(track?.bitrate, track?.sampleRate);
  const titleBox = useRef<HTMLHeadingElement>(null);
  const titleText = useRef<HTMLSpanElement>(null);
  const { rolling } = useTitleScroll(titleBox, titleText, title, TITLE_SCROLL);
  const { mode } = placement;
  const anyShown = (ids: readonly ImmersivePanelId[]) =>
    ids.some((id) => !moduleHidden(hidden, id));
  const shown = (id: ImmersivePanelId) => !moduleHidden(hidden, id);
  const showHeader = anyShown(HEADER_IDS);
  const showMeta = anyShown(META_IDS);
  const showGauges = anyShown(GAUGE_IDS);
  const showFileInfo = anyShown(FILE_INFO_IDS);
  const showBy = shown('right.header.by');
  const showQuality = mode !== 'narrow' && shown('right.header.quality');
  const box: CSSProperties = {
    left: placement.x,
    top: placement.y,
    width: placement.width,
    height,
  };
  return (
    <div className={styles.fields} data-paper-fields={mode} style={box}>
      {showHeader && (
        <>
          {shown('right.header.from') && (
            <div className={styles.from} data-decor-guard="36">
              <span className={styles['hot-square']} aria-hidden />
              <span>From:</span>
              <span className={styles['from-album']} data-field="album">
                {track?.album || MISSING}
              </span>
              <span className={styles['hot-line']} aria-hidden />
            </div>
          )}
          {shown('right.header.title') && (
            <h1
              ref={titleBox}
              className={styles.title}
              data-rolling={rolling || undefined}
              data-field="title"
            >
              <span ref={titleText} className={styles['title-text']}>
                {title}
              </span>
            </h1>
          )}
          {(showBy || showQuality) && (
            <div className={styles.byline} data-decor-guard="36">
              {showBy && (
                <div>
                  <span className={styles.key}>By</span>
                  <div className={styles.artist} data-field="artist">
                    {track?.artist || MISSING}
                  </div>
                </div>
              )}
              {showQuality && quality && (
                <div className={styles.quality}>
                  <span className={styles.key}>Quality</span>
                  <div className={styles['quality-value']} data-field="quality">
                    {quality}
                  </div>
                </div>
              )}
            </div>
          )}
          <hr className={styles.rule} />
        </>
      )}
      {!lyricsOnly && mode !== 'narrow' && showMeta && (
        <PaperMetaRow
          compact={mode === 'compact'}
          stereo={slots.stereo}
          soundPressure={slots.soundPressure}
          hidden={hidden}
        />
      )}
      {!lyricsOnly && slots.spectrum !== null && shown('right.spectrum') && (
        <div className={styles.spectrum} data-field-slot="spectrum">{slots.spectrum}</div>
      )}
      {!lyricsOnly && shown('right.waveform') && (
        <div className={styles.waveform}>{slots.waveform}</div>
      )}
      {!lyricsOnly &&
        mode !== 'narrow' &&
        (showGauges || (mode === 'full' && showFileInfo)) && (
          <div className={styles['row-file']}>
            {showGauges && <div className={styles.gauges}>{slots.gauges}</div>}
            {mode === 'full' && showFileInfo && <PaperFileInfo hidden={hidden} />}
          </div>
        )}
      {!lyricsOnly && mode !== 'narrow' && shown('right.footnote') && (
        <p className={styles.footnote}>{FOOTNOTE}</p>
      )}
      {shown('right.lyrics') && (
        <div className={styles.lyrics} data-lyrics-slot>
          {slots.lyrics}
        </div>
      )}
    </div>
  );
}
