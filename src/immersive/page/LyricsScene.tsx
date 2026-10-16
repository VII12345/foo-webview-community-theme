import { useService } from '../../kit/useService.ts';
import { lyricsDisplayKey, lyricsFontFamily } from '../../lyrics/lyricsDisplay.ts';
import { useAtomValueRawSync } from 'jotai/react';
import { translateAtom } from '../../i18n/locale.ts';
import { lyricCardAtom, lyricLogAtom, LYRIC_STATUS_MESSAGES } from '../lyrics/lyricLog.ts';
import styles from './LyricsScene.module.css';

export function LyricsScene() {
  const t = useAtomValueRawSync(translateAtom);
  const displayService = useService(lyricsDisplayKey);
  const display = useAtomValueRawSync(displayService.display);
  const { state, source, lineCount } = useAtomValueRawSync(lyricLogAtom);
  const card = useAtomValueRawSync(lyricCardAtom);
  const synced = state === 'synced' ? card : null;
  return (
    <section className={styles.root} data-scene="lyrics" aria-label={t('immersive.viewLyrics')}>
      <div className={styles.content} data-lyrics-focus>
        {synced ? (
          <>
            <p className={styles.main} style={{ fontFamily: lyricsFontFamily(display.fontFamily) }} data-field="lyric-main">
              {synced.main}
            </p>
            {synced.sub && (
              <p className={styles.sub} style={{ fontFamily: lyricsFontFamily(display.fontFamily) }} data-field="lyric-sub">
                {synced.sub}
              </p>
            )}
            <p className={styles.source} data-field="lyrics-source">{`${source} · synced`}</p>
          </>
        ) : state === 'plain' ? (
          <p className={styles.status} data-field="lyrics-plain">{t('immersive.lyricsPlain', { n: lineCount })}</p>
        ) : state !== 'none' ? (
          <p className={styles.status} data-field="lyrics-status">{t(LYRIC_STATUS_MESSAGES[state])}</p>
        ) : (
          <p className={styles.status}>{t('lyrics.idle')}</p>
        )}
      </div>
    </section>
  );
}
