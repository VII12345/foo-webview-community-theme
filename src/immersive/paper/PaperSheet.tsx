import { useAtomValueRawSync } from 'jotai/react';
import { useMemo } from 'react';
import { PaperDial } from '../dial/PaperDial.tsx';
import { PaperFields } from '../fields/PaperFields.tsx';
import { PaperGauges } from '../gauges/PaperGauges.tsx';
import { FocusLyricLog } from '../lyrics/FocusLyricLog.tsx';
import { ImmersiveLyricsPlayer } from '../lyrics/ImmersiveLyricsPlayer.tsx';
import { LyricLog } from '../lyrics/LyricLog.tsx';
import { PaperSpectrum } from '../spectrum/PaperSpectrum.tsx';
import { SoundPressureCell } from '../sound/SoundPressureCell.tsx';
import { PaperWaveform } from '../waveform/PaperWaveform.tsx';
import { immersivePlacementsAtom } from '../layout/immersivePlacement.ts';
import { placementsFor } from '../layout/immersiveBoxes.ts';
import { moduleHidden } from '../page/immersiveComponents.ts';
import { sheetBoxes } from './paperComponentLayout.ts';
import { PaperMarks } from './PaperMarks.tsx';
import styles from './PaperSheet.module.css';
import { PaperStereo } from '../stereo/PaperStereo.tsx';
import type { PaperGeometry } from './paperTiers.ts';
import type { PaperVariant } from './paperVariant.ts';

export interface PaperSheetProps {
  /** 这一档的版心几何。 */
  readonly geometry: PaperGeometry;
  readonly variant?: PaperVariant;
  readonly hidden?: ReadonlySet<string>;
}

/**
 * 收缩档与竖版的图纸内容：按版心档给的几何排、不缩放文字，里面是定位十字、垫纸、罗盘与右栏。
 * 右栏是 `PaperFields`，左栏是罗盘（narrow 档换成单栏的封面与文字列）。
 * 这一层不在舞台缩放的上下文里，canvas 件按缩放 1 开物理像素。
 *
 * 卡片两档不走这里：它们在 `PaperScene` 里固定按 full 舞台排（`stageGeometry`），小窗口只是整体缩小。
 */
export function PaperSheet({ geometry, variant = 'paper', hidden = new Set<string>() }: PaperSheetProps) {
  const { origin, sheet, fields } = geometry;
  const lyricsOnly = variant === 'lyrics';
  const placements = useAtomValueRawSync(immersivePlacementsAtom);
  const overrides = placementsFor(placements, variant, geometry.tier);
  // 版心右栏与罗盘那几件的盒子：藏掉一块，后面的跟着上移，不留空白。
  const boxes = useMemo(() => sheetBoxes(geometry.tier, hidden), [geometry.tier, hidden]);
  return (
    <div
      className={styles.sheet}
      style={{ left: origin.x, top: origin.y, width: sheet.width, height: sheet.height }}
      data-paper-content
      data-scene={variant}
    >
      <PaperMarks
        crosses={geometry.crosses}
        pad={geometry.pad}
        showCrosses={!moduleHidden(hidden, 'marks')}
        showPad={!lyricsOnly && !moduleHidden(hidden, 'pad')}
      />
      <PaperDial
        dial={geometry.dial}
        column={{ x: fields.x, width: fields.width }}
        hidden={hidden}
        boxes={boxes}
        placements={overrides}
      />
      <PaperFields
        placement={fields}
        height={sheet.height - fields.y}
        slots={{
          stereo: <PaperStereo />,
          soundPressure: <SoundPressureCell variant="sheet" />,
          spectrum: variant === 'paper' ? <PaperSpectrum /> : null,
          waveform: <PaperWaveform />,
          gauges: <PaperGauges hidden={hidden} />,
          lyrics: lyricsOnly ? (
            <ImmersiveLyricsPlayer />
          ) : variant === 'focus' ? (
            <FocusLyricLog />
          ) : (
            <LyricLog />
          ),
        }}
        hidden={hidden}
        boxes={boxes}
        placements={overrides}
      />
    </div>
  );
}
