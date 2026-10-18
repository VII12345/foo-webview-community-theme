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
export function PaperStage({ scale, origin, variant = 'paper' }: PaperStageProps) {
  const card = variant === 'card' || variant === 'cardLyrics';
  // 右半整块放动画歌词的三档：歌词、卡片、卡片歌词。
  const animatedLyrics =
    variant === 'lyrics' || variant === 'card' || variant === 'cardLyrics';
  // 聚焦档的右半仍要出垫纸与仪表，只是波形与量表上移压缩，给底部的歌词腾位置。
  const focus = variant === 'focus';
  const metered = variant === 'paper' || focus;
  // 四行字：只有卡片歌词档不出（卡片上已有曲名与艺人）。
  const showFields = variant !== 'cardLyrics';
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
        <PaperMarks crosses={STAGE_CROSSES} pad={STAGE_PAD} showPad={metered} />
        {card ? <StageCard title={variant === 'cardLyrics'} /> : (
          <StageDial offsetX={variant === 'lyrics' ? 100 : 0} />
        )}
        <StageFields
          stereo={<StageStereo />}
          showMeter={metered}
          showFields={showFields}
          lyrics={focus ? <FocusLyricLog /> : undefined}
        />
        {variant === 'paper' && (
          <div className={`${styles.slot} ${styles.spectrum}`} data-field-slot="spectrum">
            <PaperSpectrum />
          </div>
        )}
        {metered && (
          <>
            <div className={`${styles.slot} ${styles.waveform}`}>
              <PaperWaveform />
            </div>
            <div className={`${styles.slot} ${styles.gauges}`}>
              <PaperGauges />
            </div>
            <div className={`${styles.slot} ${styles['file-info']}`}>
              <PaperFileInfo />
            </div>
          </>
        )}
        {variant === 'paper' && <LyricCard />}
        {animatedLyrics && (
          <ImmersiveLyricsPlayer
            fontScale={variant === 'lyrics' && scale > 0 ? 1 / scale : 1}
            edgeAligned
          />
        )}
      </div>
    </StageScaleContext>
  );
}
