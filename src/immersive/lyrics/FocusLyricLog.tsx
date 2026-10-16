import { useService } from '../../kit/useService.ts';
import { lyricsDisplayKey, lyricsFontFamily } from '../../lyrics/lyricsDisplay.ts';
import { useAtomValueRawSync } from 'jotai/react';
import { lyricLogAtom, lyricWindowAtom } from './lyricLog.ts';
import { WordSyncedText } from './WordSyncedText.tsx';
import styles from './FocusLyricLog.module.css';

export function FocusLyricLog() {
  const display = useAtomValueRawSync(useService(lyricsDisplayKey).display);
  const log = useAtomValueRawSync(lyricLogAtom);
  const lines = useAtomValueRawSync(lyricWindowAtom);
  if (log.state !== 'synced') return null;
  return (
    <div className={styles.root} data-focus-lyrics>
      {lines.map((line, index) => (
        <div
          key={`${line.time}:${index}`}
          className={line.current ? styles.current : styles.line}
          data-focus-lyric-current={line.current || undefined}
        >
          <span className={styles.time}>{formatTime(line.time)}</span>
          <span style={{ fontFamily: lyricsFontFamily(display.fontFamily) }}>
            {line.text ? <WordSyncedText words={line.words} text={line.text} /> : ' '}
          </span>
          {display.showTranslation && line.translation && (
            <span className={styles.translation}>{line.translation}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}
