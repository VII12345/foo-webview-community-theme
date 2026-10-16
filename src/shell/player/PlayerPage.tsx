import { MusicNote220Regular } from '@fluentui/react-icons';
import { useAtomValueRawSync } from 'jotai/react';
import { translateAtom } from '../../i18n/locale.ts';
import type { PageProps } from '../../nav/places.ts';
import { currentTrackAtom, playbackTrackStatusAtom } from '../../playback/playback.ts';
import { trackKeyOf } from '../../playback/playbackContract.ts';
import { playbackConnectedAtom } from '../../playback/playerAtoms.ts';
import { nowPlayingAtom } from './now-playing/nowPlaying.ts';
import { PlayerArtwork } from './PlayerArtwork.tsx';
import styles from './PlayerPage.module.css';

export function PlayerPage(_props: PageProps) {
  const t = useAtomValueRawSync(translateAtom);
  const track = useAtomValueRawSync(currentTrackAtom);
  const art = useAtomValueRawSync(nowPlayingAtom);
  const status = useAtomValueRawSync(playbackTrackStatusAtom);
  const connected = useAtomValueRawSync(playbackConnectedAtom);

  if (!track) {
    return (
      <section className={styles.empty} data-player-page>
        <MusicNote220Regular aria-hidden />
        <p role="status">{t(connected && status === 'ready' ? 'player.page.empty' : 'player.page.unavailable')}</p>
      </section>
    );
  }

  return (
    <section className={styles.root} data-player-page>
      <PlayerArtwork track={track} artReady={art.key === trackKeyOf(track)} />
    </section>
  );
}
