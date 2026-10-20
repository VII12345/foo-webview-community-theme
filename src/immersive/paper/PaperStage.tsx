import type { CSSProperties } from 'react';
import { StageCard } from '../dial/StageCard.tsx';
import { StageDial } from '../dial/StageDial.tsx';
import { PaperFileInfo } from '../fields/PaperFileInfo.tsx';
import { StageFields } from '../fields/StageFields.tsx';
import { PaperGauges } from '../gauges/PaperGauges.tsx';
import { LyricCard } from '../lyrics/LyricCard.tsx';
import { FocusLyricLog } from '../lyrics/FocusLyricLog.tsx';
import { ImmersiveLyricsPlayer } from '../lyrics/ImmersiveLyricsPlayer.tsx';
import { PaperSpectrum } from '../spectrum/PaperSpectrum.tsx';
import { StageStereo } from '../stereo/StageStereo.tsx';
import { PaperWaveform } from '../waveform/PaperWaveform.tsx';
import { STAGE_CROSSES, STAGE_HEIGHT, STAGE_PAD, STAGE_WIDTH } from './paperStage.ts';
import { cardTops, type StageBox } from './paperComponentLayout.ts';
import { Placed, type Placements } from '../layout/Placed.tsx';
import { placementStyle } from '../layout/immersiveBoxes.ts';
import {
  groupVisible,
  moduleHidden,
  type ImmersivePanelId,
} from '../page/immersiveComponents.ts';
import { PaperMarks } from './PaperMarks.tsx';
import styles from './PaperStage.module.css';
import { StageScaleContext } from './stageScale.ts';
import type { PaperVariant } from './paperVariant.ts';

export interface PaperStageProps {
  /** 舞台缩放：宽高两个比值里较小的那个。 */
  readonly scale: number;
  /** 舞台左上角在场景里的位置，CSS 像素。 */
  readonly origin: { readonly x: number; readonly y: number };
  readonly variant?: PaperVariant;
  /** 当前视图/布局隐藏的模块。 */
  readonly hidden?: ReadonlySet<string>;
  /** 编排器里挪过或改过大小的组件；落在组件外层的一套变换上。 */
  readonly placements?: Placements;
  /** 布局算出的每件盒子：右栏按行排布，罗盘与卡片各按图纸坐标。 */
  readonly boxes: ReadonlyMap<ImmersivePanelId, StageBox>;
}

/**
 * full 档的图纸内容：1920 × 1080 的舞台，整幅 `scale(s)` 等比缩放、居中放进场景，里面一律写舞台坐标
 * （`paperStage.ts`）。s 经 `StageScaleContext` 交给舞台里的 canvas 件，canvas 的物理尺寸按它开。
 *
 * 左半（0–960）：图纸/聚焦/歌词三档挂罗盘（`StageDial`），卡片两档挂卡片（`StageCard`）。
 * 右半（960–1920）：四行字（From / 标题 / By / Quality）在顶部，下面是歌词——
 *
 * | 档 | 左半 | 右半顶部 | 右半下面 |
 * |---|---|---|---|
 * | `paper` | 罗盘 | 四行字 + 仪表 | 频谱 / 波形 / 量表 / 文件信息，底部歌词卡 |
 * | `focus` | 罗盘 | 四行字 + 仪表 | 波形 / 量表 / 文件信息上移，底部聚焦歌词日志 |
 * | `lyrics` | 罗盘 | 四行字 | 动画歌词（整块右半，居中） |
 * | `card` | 卡片 | 四行字 | 动画歌词（同歌词视图） |
 * | `cardLyrics` | 卡片（带曲名/艺人） | — | 动画歌词 |
 */
export function PaperStage({
  scale,
  origin,
  variant = 'paper',
  hidden = new Set<string>(),
  placements = {},
  boxes,
}: PaperStageProps) {
  const card = variant === 'card' || variant === 'cardLyrics';
  // 右半整块放动画歌词的三档：歌词、卡片、卡片歌词。
  const animatedLyrics =
    variant === 'lyrics' || variant === 'card' || variant === 'cardLyrics';
  // 聚焦档的右半仍要出垫纸与仪表，只是波形与量表上移压缩，给底部的歌词腾位置。
  const focus = variant === 'focus';
  const metered = variant === 'paper' || focus;
  // 四行字：只有卡片歌词档不出（卡片上已有曲名与艺人）。
  const showFields = variant !== 'cardLyrics';
  const show = (id: ImmersivePanelId) => !moduleHidden(hidden, id);
  const group = (id: ImmersivePanelId) => groupVisible(variant, 'full', hidden, id);
  // 每一格的盒子：右栏可见的按行排布，藏掉的行整行收掉，后面的跟着上移。
  const topOf = (id: ImmersivePanelId): number | null => boxes.get(id)?.y ?? null;
  const cardLayout = card ? cardTops(variant, hidden) : null;
  // 动画歌词这件本来就绝对定位在自己的盒子里（左 1152、上 300、768 × 660），
  // 编排器的平移与缩放直接加在它身上，原点取它自己的左上角。
  const lyricsPlacement = placementStyle(boxes.get('right.lyrics'), placements['right.lyrics']);
  const frame: CSSProperties = {
    left: origin.x,
    top: origin.y,
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    transform: `scale(${scale})`,
  };
  return (
    <StageScaleContext value={scale}>
      <div className={styles.stage} data-scene={variant} style={frame} data-paper-content>
        <PaperMarks
          crosses={STAGE_CROSSES}
          pad={STAGE_PAD}
          showCrosses={show('marks')}
          showPad={metered && show('pad')}
        />
        {card ? (
          <StageCard
            title={variant === 'cardLyrics'}
            hidden={hidden}
            tops={
              cardLayout ?? {
                cover: null,
                meta: null,
                seek: null,
                transport: null,
                cells: null,
                top: null,
                bottom: null,
              }
            }
            boxes={boxes}
            placements={placements}
          />
        ) : (
          <StageDial
            offsetX={variant === 'lyrics' ? 100 : 0}
            hidden={hidden}
            boxes={boxes}
            placements={placements}
          />
        )}
        <StageFields
          stereo={<StageStereo />}
          showMeter={metered && group('right.meter')}
          showFields={showFields}
          showHeader={group('right.header')}
          lyrics={focus ? <FocusLyricLog /> : undefined}
          showLyrics={group('right.lyrics')}
          hidden={hidden}
          boxes={boxes}
          placements={placements}
        />
        {variant === 'paper' && show('right.spectrum') && topOf('right.spectrum') !== null && (
          <Placed id="right.spectrum" boxes={boxes} placements={placements}>
            <div
              className={`${styles.slot} ${styles.spectrum}`}
              style={{ top: topOf('right.spectrum') ?? undefined }}
              data-field-slot="spectrum"
            >
              <PaperSpectrum />
            </div>
          </Placed>
        )}
        {metered && (
          <>
            {show('right.waveform') && topOf('right.waveform') !== null && (
              <Placed id="right.waveform" boxes={boxes} placements={placements}>
                <div
                  className={`${styles.slot} ${styles.waveform}`}
                  style={{ top: topOf('right.waveform') ?? undefined }}
                >
                  <PaperWaveform />
                </div>
              </Placed>
            )}
            {group('right.gauges') && topOf('right.gauges') !== null && (
              <Placed id="right.gauges" boxes={boxes} placements={placements}>
                <div
                  className={`${styles.slot} ${styles.gauges}`}
                  style={{ top: topOf('right.gauges') ?? undefined }}
                >
                  <PaperGauges hidden={hidden} />
                </div>
              </Placed>
            )}
            {group('right.fileInfo') && topOf('right.fileInfo') !== null && (
              <Placed id="right.fileInfo" boxes={boxes} placements={placements}>
                <div
                  className={`${styles.slot} ${styles['file-info']}`}
                  style={{ top: topOf('right.fileInfo') ?? undefined }}
                >
                  <PaperFileInfo hidden={hidden} />
                </div>
              </Placed>
            )}
          </>
        )}
        {variant === 'paper' && group('right.lyrics') && (
          <Placed id="right.lyrics" boxes={boxes} placements={placements}>
            <LyricCard top={topOf('right.lyrics') ?? undefined} hidden={hidden} />
          </Placed>
        )}
        {animatedLyrics && group('right.lyrics') && (
          <ImmersiveLyricsPlayer
            fontScale={scale > 0 ? 1 / scale : 1}
            placement={lyricsPlacement}
            top={
              variant === 'cardLyrics' && cardLayout?.top != null
                ? cardLayout.top
                : (topOf('right.lyrics') ?? undefined)
            }
            bottom={
              variant === 'cardLyrics' && cardLayout?.bottom != null
                ? STAGE_HEIGHT - cardLayout.bottom
                : undefined
            }
            height={
              variant === 'cardLyrics' &&
              cardLayout?.top != null &&
              cardLayout?.bottom != null
                ? cardLayout.bottom - cardLayout.top
                : undefined
            }
            extendLines={variant === 'cardLyrics' ? 1 : undefined}
            edgeAligned
          />
        )}
      </div>
    </StageScaleContext>
  );
}
