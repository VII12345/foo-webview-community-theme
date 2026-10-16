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

export interface PaperSheetProps {
  /** 这一档的版心尺寸、位置与里面各块的排法（`paperTiers.ts`）。 */
  readonly geometry: PaperGeometry;
  readonly variant?: 'paper' | 'focus' | 'lyrics';
}

/**
 * 收缩档与竖版的图纸内容：按档位给的版心尺寸放进场景、不缩放文字，里面是定位十字、垫纸、罗盘与右栏。
 * 右栏里的声场是版心那一格（`PaperStereo`），歌词是三行日志（`LyricLog`）；频谱、整轨波形与量表与舞台共用同一批件，
 * 几何变量由右栏按版心档给。这一层不在舞台缩放的上下文里，canvas 件按缩放 1 开物理像素。
 */
export function PaperSheet({ geometry, variant = 'paper' }: PaperSheetProps) {
  const { origin, sheet, fields } = geometry;
  return (
    <div
      className={styles.sheet}
      style={{ left: origin.x, top: origin.y, width: sheet.width, height: sheet.height }}
      data-paper-content
      data-scene={variant}
    >
      <PaperMarks crosses={geometry.crosses} pad={geometry.pad} showPad={variant !== 'lyrics'} />
      <PaperDial dial={geometry.dial} column={fields} />
      <PaperFields
        placement={fields}
        height={sheet.height - fields.y}
        slots={{
          stereo: <PaperStereo />,
          spectrum: variant === 'paper' ? <PaperSpectrum /> : null,
          waveform: <PaperWaveform />,
          gauges: <PaperGauges />,
          lyrics:
            variant === 'lyrics' ? (
              <ImmersiveLyricsPlayer mode="lyrics" />
            ) : variant === 'focus' ? (
              <ImmersiveLyricsPlayer mode="focus" fallback={<FocusLyricLog />} />
            ) : (
              <ImmersiveLyricsPlayer mode="rows" fallback={<LyricLog />} />
            ),
        }}
      />
    </div>
  );
}
