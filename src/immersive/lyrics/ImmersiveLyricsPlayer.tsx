import { useAtomValueRawSync } from 'jotai/react';
import { useService } from '../../kit/useService.ts';
import { lyricsKey } from '../../lyrics/lyricsService.ts';
import { lyricsDisplayKey } from '../../lyrics/lyricsDisplay.ts';
import { lyricsMotionKey } from '../../lyrics/lyricsMotion.ts';
import { playbackCanSeekAtom } from '../../playback/playerAtoms.ts';
import { LyricsPlayer } from '../../lyrics/LyricsPlayer.tsx';
import { useLyricAlignNudge } from '../../lyrics/useLyricAlignNudge.ts';
import { useLyricFontZoom } from '../../lyrics/useLyricFontZoom.ts';
import { useViewServices } from '../page/viewServices.ts';
import styles from './ImmersiveLyricsPlayer.module.css';

export function ImmersiveLyricsPlayer({
  fontScale = 1,
  edgeAligned = false,
  top,
  bottom,
  height,
  extendLines = 0,
}: {
  readonly fontScale?: number;
  /** full 舞台的动画歌词贴住右区左缘，不用 AMLL 默认的 1em 行内边距。 */
  readonly edgeAligned?: boolean;
  /** 可见模块变化后的纵向位置，舞台坐标。 */
  readonly top?: number;
  /** 可见模块变化后的下边界，舞台坐标换算出的 CSS bottom；不传则铺到舞台底。 */
  readonly bottom?: number;
  /** 卡片歌词跟左区上下对齐时用显式高度覆盖 CSS 的 660。 */
  readonly height?: number;
  /** 上下各多留几行（AMLL 主行行高 1.2em），卡片歌词用 1。 */
  readonly extendLines?: number;
} = {}) {
  const services = useViewServices();
  const lyrics = useService(lyricsKey);
  const display = useAtomValueRawSync(useService(lyricsDisplayKey).display);
  const motion = useAtomValueRawSync(useService(lyricsMotionKey).motion);
  const state = useAtomValueRawSync(lyrics.state);
  const offset = useAtomValueRawSync(lyrics.offset);
  const canSeek = useAtomValueRawSync(playbackCanSeekAtom);
  const zoom = useLyricFontZoom();
  const nudge = useLyricAlignNudge();
  if (!services.lyrics || state.status !== 'ready' || state.content.kind !== 'synced') return null;
  const extend = extendLines > 0 ? extendLines * display.fontSize * fontScale * 1.2 : 0;
  const box =
    top !== undefined || bottom !== undefined || height !== undefined
      ? {
          ...(top !== undefined ? { top: top - extend } : {}),
          ...(bottom !== undefined ? { bottom: bottom - extend } : {}),
          ...(height !== undefined ? { height: height + extend * 2 } : {}),
        }
      : undefined;
  return (
    <div
      className={styles.root}
      style={box}
      data-immersive-lyrics-player
      data-edge-aligned={edgeAligned || undefined}
    >
      <LyricsPlayer
        lines={state.content.lines}
        motion={motion}
        clock={services.lyrics.clock}
        active={services.active}
        fontSize={display.fontSize}
        fontScale={fontScale}
        display={display}
        offset={offset}
        onSeek={canSeek ? (seconds) => void services.lyrics?.seek(state.key, seconds) : undefined}
        onZoom={zoom}
        onAlignNudge={nudge}
      />
    </div>
  );
}
