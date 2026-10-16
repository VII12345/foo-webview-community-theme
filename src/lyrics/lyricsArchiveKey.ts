import type { Track } from 'foo-webview-sdk';

const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

function hash(value: string): string {
  let result = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    result ^= BigInt(value.charCodeAt(index));
    result = BigInt.asUintN(64, result * 0x100000001b3n);
  }
  return result.toString(16).padStart(16, '0');
}

/** A path-free best-effort identity for per-song lyric preferences. */
export function lyricsArchiveKey(track: Pick<Track,
  'title' | 'artists' | 'artist' | 'album' | 'albumArtists' | 'albumArtist' | 'date' | 'discNumber' | 'trackNumber' | 'duration'
> | null): string | null {
  if (!track) return null;
  const title = normalize(track.title);
  const artists = (track.artists.length ? track.artists : [track.artist])
    .map(normalize)
    .filter(Boolean);
  if (!title || !artists.length || track.duration <= 0) return null;
  const albumArtists = (track.albumArtists.length ? track.albumArtists : [track.albumArtist])
    .map(normalize)
    .filter(Boolean);
  const identity = JSON.stringify([
    title,
    artists,
    normalize(track.album),
    albumArtists,
    normalize(track.date),
    track.discNumber,
    track.trackNumber,
    Math.round(track.duration * 1000),
  ]);
  return `metadata-v1:${hash(identity)}`;
}
