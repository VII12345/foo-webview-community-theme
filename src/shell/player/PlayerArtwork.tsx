import type { Track } from 'foo-webview-sdk';
import { fb } from 'foo-webview-sdk/bridge';
import { useEffect, useState } from 'react';
import { artworkRequestSize } from '../../host/artworkSize.ts';
import { settle } from '../../host/hostCall.ts';
import { translateAtom } from '../../i18n/locale.ts';
import { useAtomValueRawSync } from 'jotai/react';
import { trackKeyOf } from '../../playback/playbackContract.ts';
import { MusicNote220Regular } from '@fluentui/react-icons';
import styles from './PlayerPage.module.css';

const COVER_WIDTH = 560;

export function PlayerArtwork({ track, artReady }: { readonly track: Track; readonly artReady: boolean }) {
  const t = useAtomValueRawSync(translateAtom);
  const key = trackKeyOf(track);
  const [image, setImage] = useState<{ key: string; url: string | null; broken?: boolean } | null>(null);
  useEffect(() => {
    let current = true;
    setImage({ key, url: null });
    void settle(() =>
      fb.artwork.getFb2kUrlByPath(track.path, 'front', {
        maxSize: artworkRequestSize(COVER_WIDTH, window.devicePixelRatio || 1),
      }),
    ).then((answer) => {
      if (!current) return;
      setImage({
        key,
        url: answer && answer.success !== false && answer.available ? answer.dataUrl : null,
      });
    });
    return () => {
      current = false;
    };
  }, [key, track.path]);
  const visible = artReady && image?.key === key && image.url && !image.broken ? image.url : null;
  return (
    <div className={styles.artwork} data-player-artwork>
      {visible ? (
        <img
          className={styles.cover}
          src={visible}
          alt={t('player.page.cover', { title: track.title || t('lyrics.untitled') })}
          draggable={false}
          onError={() => setImage({ key, url: visible, broken: true })}
        />
      ) : (
        <div className={styles.coverPlaceholder} role="img" aria-label={t('player.page.coverMissing')}>
          <MusicNote220Regular aria-hidden />
        </div>
      )}
    </div>
  );
}
