import { PaperDial } from '../dial/PaperDial.tsx';
import { PaperFields } from '../fields/PaperFields.tsx';
import { PaperGauges } from '../gauges/PaperGauges.tsx';
import { LyricLog } from '../lyrics/LyricLog.tsx';
import { FocusLyricLog } from '../lyrics/FocusLyricLog.tsx';
import { ImmersiveLyricsPlayer } from '../lyrics/ImmersiveLyricsPlayer.tsx';
import { PaperSpectrum } from '../spectrum/PaperSpectrum.tsx';
import { PaperStereo } from '../stereo/PaperStereo.tsx';
import { PaperWaveform } from '../waveform/PaperWaveform.tsx';
import { PaperMarks } from './PaperMarks.tsx';
import styles from './PaperSheet.module.css';
import type { PaperGeometry } from './paperTiers.ts';
import type { PaperVariant } from './paperVariant.ts';

export interface PaperSheetProps {
  /** 这一档的版心尺寸、位置与里面各块的排法（`paperTiers.ts`）。 */
  readonly geometry: PaperGeometry;
  readonly variant?: PaperVariant;
}

/**
 * 收缩档与竖版的图纸内容：按档位给的版心尺寸放进场景、不缩放文字，里面是定位十字、垫纸、罗盘与右栏。
 * 右栏里的声场是版心那一格（`PaperStereo`），歌词是三行日志（`LyricLog`）；频谱、整轨波形与量表与舞台共用同一批件，
 * 几何变量由右栏按版心档给。这一层不在舞台缩放的上下文里，canvas 件按缩放 1 开物理像素。
 *
 * 卡片两档只在 full 档出（`StageCard` 按 1920 × 1080 的舞台坐标写死，版心档放不下）；窗口小到落这几档时
 * 按图纸档排，左区仍是罗盘。`cardLyrics` 的「右栏只留动画歌词」在版心档照旧成立。
 */
export function PaperSheet({ geometry, variant = 'paper' }: PaperSheetProps) {
  const { origin, sheet, fields } = geometry;
  const lyricsOnly = variant === 'lyrics' || variant === 'cardLyrics';
  return (
    <div
      className={styles.sheet}
      style={{ left: origin.x, top: origin.y, width: sheet.width, height: sheet.height }}
      data-paper-content
      data-scene={variant}
    >
      <PaperMarks crosses={geometry.crosses} pad={geometry.pad} showPad={!lyricsOnly} />
      <PaperDial dial={geometry.dial} column={fields} />
      <PaperFields
        placement={fields}
        height={sheet.height - fields.y}
        lyricsOnly={lyricsOnly}
        slots={{
          stereo: <PaperStereo />,
          spectrum: variant === 'paper' ? <PaperSpectrum /> : null,
          waveform: <PaperWaveform />,
          gauges: <PaperGauges />,
          lyrics: lyricsOnly ? (
            <ImmersiveLyricsPlayer />
          ) : variant === 'focus' ? (
            <FocusLyricLog />
          ) : (
            <LyricLog />
          ),
        }}
      />
    </div>
  );
}
