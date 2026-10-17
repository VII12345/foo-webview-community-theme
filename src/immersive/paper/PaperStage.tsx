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
 * 左区：图纸三档挂罗盘（`StageDial`），卡片两档挂卡片（`StageCard`），卡片歌词档的卡片带曲名/艺人。
 * 右栏：图纸档挂歌词卡、聚焦档挂聚焦歌词日志、歌词档与卡片歌词档挂 AMLL 播放器。
 *
 * 频谱、整轨波形、量表与文件信息放进这里定位好的外框，外框上给全它们的几何变量（件里不写缺省，
 * 别的档在自己的外框上另给一套）。
 */
export function PaperStage({ scale, origin, variant = 'paper' }: PaperStageProps) {
  const card = variant === 'card' || variant === 'cardLyrics';
  // 右栏只出动画歌词的两档：歌词档与卡片歌词档。
  const lyricsOnly = variant === 'lyrics' || variant === 'cardLyrics';
  // 卡片歌词档右栏那四行字（From / 标题 / By / Quality）删掉，因为卡片上已有曲名与艺人。
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
        <PaperMarks crosses={STAGE_CROSSES} pad={STAGE_PAD} showPad={!lyricsOnly} />
        {card ? <StageCard title={variant === 'cardLyrics'} /> : <StageDial />}
        <StageFields stereo={<StageStereo />} showMeter={!lyricsOnly} showFields={showFields} />
        {variant === 'paper' && (
          <div className={`${styles.slot} ${styles.spectrum}`} data-field-slot="spectrum">
            <PaperSpectrum />
          </div>
        )}
        {!lyricsOnly && (
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
        {lyricsOnly ? (
          <ImmersiveLyricsPlayer />
        ) : variant === 'focus' ? (
          <FocusLyricLog />
        ) : (
          <LyricCard />
        )}
      </div>
    </StageScaleContext>
  );
}
