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

export function ImmersiveLyricsPlayer() {
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
  return (
    <div className={styles.root} data-immersive-lyrics-player>
      <LyricsPlayer
        lines={state.content.lines}
        motion={motion}
        clock={services.lyrics.clock}
        active={services.active}
        fontSize={display.fontSize}
        display={display}
        offset={offset}
        onSeek={canSeek ? (seconds) => void services.lyrics?.seek(state.key, seconds) : undefined}
        onZoom={zoom}
        onAlignNudge={nudge}
        align="center"
      />
    </div>
  );
}
