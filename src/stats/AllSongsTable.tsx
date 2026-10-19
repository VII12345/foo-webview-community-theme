import { Button, Input } from '@fluentui/react-components';
import {
  ArrowDown16Regular,
  ArrowUp16Regular,
  ChevronLeft16Regular,
  ChevronRight16Regular,
  Search16Regular,
} from '@fluentui/react-icons';
import { useAtomValueRawSync } from 'jotai/react';
import { useDeferredValue, useMemo, useState } from 'react';
import { translateAtom } from '../i18n/locale.ts';
import { durationText } from '../table/cellText.ts';
import type { StatsSongRow } from './monthlyStats.ts';
import styles from './StatsPage.module.css';
import { StatsArt } from './StatsArt.tsx';

export const SONG_PAGE_SIZE = 100;

export type SongSortKey = 'title' | 'artist' | 'album' | 'seconds' | 'plays' | 'lastYmd';

interface Sort {
  readonly key: SongSortKey;
  readonly dir: 'asc' | 'desc';
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase();
}

function compare(left: StatsSongRow, right: StatsSongRow, key: SongSortKey): number {
  if (key === 'seconds') return left.seconds - right.seconds;
  if (key === 'plays') return left.plays - right.plays;
  if (key === 'lastYmd') return left.lastYmd.localeCompare(right.lastYmd);
  return collator.compare(left[key], right[key]);
}

/** 全部时间的所有歌曲：搜索、列头排序与分页；只在前端处理已经聚合好的数组。 */
export function AllSongsTable({ songs }: { readonly songs: readonly StatsSongRow[] }) {
  const t = useAtomValueRawSync(translateAtom);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<Sort>({ key: 'seconds', dir: 'desc' });
  const [page, setPage] = useState(0);

  const indexed = useMemo(
    () =>
      songs.map((song) => ({
        song,
        haystack: normalize(`${song.title} ${song.artist} ${song.album}`),
      })),
    [songs],
  );
  const needle = normalize(deferredQuery.trim());
  const filtered = useMemo(
    () =>
      needle
        ? indexed.filter((row) => row.haystack.includes(needle)).map((row) => row.song)
        : songs,
    [indexed, needle, songs],
  );
  const sorted = useMemo(() => {
    const direction = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((left, right) => {
      const result = compare(left, right, sort.key) || left.crc.localeCompare(right.crc);
      return result * direction;
    });
  }, [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / SONG_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = sorted.slice(currentPage * SONG_PAGE_SIZE, (currentPage + 1) * SONG_PAGE_SIZE);

  const toggleSort = (key: SongSortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'seconds' || key === 'plays' || key === 'lastYmd' ? 'desc' : 'asc' },
    );
    setPage(0);
  };

  const header = (key: SongSortKey, label: string) => (
    <th
      aria-sort={
        sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <button
        type="button"
        className={styles['sort-button']}
        data-stats-sort={key}
        onClick={() => toggleSort(key)}
      >
        {label}
        {sort.key === key &&
          (sort.dir === 'asc' ? <ArrowUp16Regular /> : <ArrowDown16Regular />)}
      </button>
    </th>
  );

  return (
    <section className={styles.section} aria-label={t('stats.allSongs')} data-stats-all-songs>
      <div className={styles['songs-toolbar']}>
        <h2>{t('stats.allSongs')}</h2>
        <Input
          size="small"
          className={styles['songs-search']}
          contentBefore={<Search16Regular />}
          value={query}
          aria-label={t('stats.searchSongs')}
          placeholder={t('stats.searchSongs')}
          data-stats-songs-search
          onChange={(_, data) => {
            setQuery(data.value);
            setPage(0);
          }}
        />
      </div>
      <p className={styles['section-hint']} data-stats-songs-count>
        {t('stats.songCount', { count: sorted.length })}
      </p>
      {songs.length === 0 || sorted.length === 0 ? (
        <p className={styles.empty} role="status">
          {songs.length === 0 ? t('stats.noSongs') : t('stats.noSearchResults')}
        </p>
      ) : (
        <div className={styles['detail-scroll']}>
          <table className={styles['songs-table']} data-stats-songs-table>
            <thead>
              <tr>
                {header('title', t('stats.songTitle'))}
                {header('artist', t('stats.artist'))}
                {header('album', t('stats.album'))}
                {header('seconds', t('stats.listenTime'))}
                {header('plays', t('stats.plays'))}
                {header('lastYmd', t('stats.lastPlayed'))}
              </tr>
            </thead>
            <tbody>
              {rows.map((song) => (
                <tr key={song.crc} data-stats-songs-row={song.crc}>
                  <td title={song.title || t('stats.unknown')}>
                    <span className={styles['songs-title-cell']}>
                      <StatsArt path={song.path} title={song.title || t('stats.unknown')} />
                      <span className={styles['songs-title']}>
                        {song.title || t('stats.unknown')}
                      </span>
                    </span>
                  </td>
                  <td title={song.artist || t('stats.unknown')}>
                    {song.artist || t('stats.unknown')}
                  </td>
                  <td title={song.album || '—'}>{song.album || '—'}</td>
                  <td>{durationText(song.seconds) || '0:00'}</td>
                  <td>{song.plays}</td>
                  <td>{song.lastYmd || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className={styles['songs-pager']}>
        <Button
          size="small"
          appearance="subtle"
          icon={<ChevronLeft16Regular />}
          disabled={currentPage === 0}
          data-stats-songs-prev
          onClick={() => setPage((value) => Math.max(0, value - 1))}
        >
          {t('stats.previousPage')}
        </Button>
        <span data-stats-songs-page>
          {t('stats.pageOf', { page: currentPage + 1, pages: pageCount })}
        </span>
        <Button
          size="small"
          appearance="subtle"
          icon={<ChevronRight16Regular />}
          iconPosition="after"
          disabled={currentPage >= pageCount - 1}
          data-stats-songs-next
          onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
        >
          {t('stats.nextPage')}
        </Button>
      </div>
    </section>
  );
}
