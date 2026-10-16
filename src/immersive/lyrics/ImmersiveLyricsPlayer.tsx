import { useAtomValueRawSync } from 'jotai/react';
import type { ReactNode } from 'react';
import { useService } from '../../kit/useService.ts';
import { lyricsKey } from '../../lyrics/lyricsService.ts';
import { lyricsDisplayKey } from '../../lyrics/lyricsDisplay.ts';
import { lyricsMotionKey } from '../../lyrics/lyricsMotion.ts';
import { playbackCanSeekAtom } from '../../playback/playerAtoms.ts';
import { LyricsPlayer } from '../../lyrics/LyricsPlayer.tsx';
import { lyricRowsAtom, lyricWindowAtom, lyricLogAtom } from './lyricLog.ts';
import { useViewServices } from '../page/viewServices.ts';
import styles from './ImmersiveLyricsPlayer.module.css';

export type ImmersiveLyricsMode = 'lyrics' | 'card' | 'rows' | 'focus';

export function ImmersiveLyricsPlayer({
  mode = 'lyrics',
  fallback = null,
}: {
  readonly mode?: ImmersiveLyricsMode;
  readonly fallback?: ReactNode;
}) {
  const services = useViewServices();
  const lyrics = useService(lyricsKey);
  const display = useAtomValueRawSync(useService(lyricsDisplayKey).display);
  const motion = useAtomValueRawSync(useService(lyricsMotionKey).motion);
  const state = useAtomValueRawSync(lyrics.state);
  const log = useAtomValueRawSync(lyricLogAtom);
  const rows = useAtomValueRawSync(lyricRowsAtom);
  const windowLines = useAtomValueRawSync(lyricWindowAtom);
  const active = useAtomValueRawSync(services.active);
  const offset = useAtomValueRawSync(lyrics.offset);
  const canSeek = useAtomValueRawSync(playbackCanSeekAtom);
  if (!services.lyrics || state.status !== 'ready' || state.content.kind !== 'synced') return fallback;

  const lines =
    mode === 'lyrics'
      ? state.content.lines
      : mode === 'focus'
        ? windowLines.map((line) => line.raw)
        : mode === 'rows'
          ? [rows.prev?.raw, rows.current?.raw, rows.next?.raw].filter(
              (line): line is NonNullable<typeof line> => line !== undefined,
            )
          : (() => {
              const current = rows.current?.raw;
              if (!current) return [];
              const next = rows.next?.raw;
              return current.translatedLyric || !next ? [current] : [current, next];
            })();
  if (lines.length === 0) return fallback;
  return (
    <div
      className={styles.root}
      data-immersive-lyrics-player
      data-immersive-lyrics-mode={mode}
    >
      <LyricsPlayer
        lines={lines}
        motion={motion}
        clock={services.lyrics.clock}
        active={active}
        fontSize={display.fontSize}
        display={display}
        offset={offset}
        onSeek={canSeek ? (seconds) => void services.lyrics?.seek(state.key, seconds) : undefined}
      />
    </div>
  );
}
