import { useAtomValueRawSync } from 'jotai/react';
import { translateAtom } from '../i18n/locale.ts';
import { formatDuration } from './format.ts';
import type { StatsPeriod, StatsTotals } from './monthlyStats.ts';
import type { StatsScope } from './statsRange.ts';
import { splUnit, type SplWeighting } from '../playback/splWeighting.ts';
import styles from './StatsPage.module.css';
import { StatsArt } from './StatsArt.tsx';

export type Scope = StatsScope;
export const SCOPES: readonly Scope[] = ['today', 'week', 'month', 'year'];
export const SCOPE_LABELS: Readonly<
  Record<Scope, 'stats.today' | 'stats.week' | 'stats.month' | 'stats.year'>
> = {
  today: 'stats.today',
  week: 'stats.week',
  month: 'stats.month',
  year: 'stats.year',
};

/** 环比：本期减上期；正负各给一种颜色。 */
function Delta({ now, before }: { readonly now: number; readonly before: number }) {
  const t = useAtomValueRawSync(translateAtom);
  const difference = now - before;
  if (before === 0 && difference === 0) return null;
  const sign = difference > 0 ? '+' : difference < 0 ? '−' : '';
  return (
    <span className={styles.delta} data-dir={difference > 0 ? 'up' : difference < 0 ? 'down' : 'flat'}>
      {difference === 0 ? t('stats.flat') : `${sign}${formatDuration(Math.abs(difference), t)}`}
    </span>
  );
}

export function Totals({
  totals,
  previous,
  averageSpl,
  headphoneSeconds,
  weighting = 'A',
}: {
  readonly totals: StatsTotals;
  readonly previous: StatsTotals;
  /** 当前范围全部耳机的能量加权平均 SPL；无数据为 null。 */
  readonly averageSpl?: number | null;
  /** 当前范围 DX52 自动统计的耳机使用时长；无数据为 null。 */
  readonly headphoneSeconds?: number | null;
  readonly weighting?: SplWeighting;
}) {
  const t = useAtomValueRawSync(translateAtom);
  return (
    <div className={styles.totals}>
      <div className={styles.total}>
        <span className={styles['total-value']}>{formatDuration(totals.seconds, t)}</span>
        <span className={styles['total-key']}>{t('stats.time')}</span>
        <Delta now={totals.seconds} before={previous.seconds} />
      </div>
      <div className={styles.total}>
        <span className={styles['total-value']}>{totals.plays}</span>
        <span className={styles['total-key']}>{t('stats.plays')}</span>
        <Delta now={totals.plays} before={previous.plays} />
      </div>
      <div className={styles.total}>
        <span className={styles['total-value']}>{totals.tracks}</span>
        <span className={styles['total-key']}>{t('stats.tracks')}</span>
      </div>
      <div className={styles.total} data-stats-total-spl title={t('stats.averageSplHint')}>
        <span className={styles['total-value']}>
          {averageSpl === null || averageSpl === undefined
            ? '—'
            : `${averageSpl.toFixed(1)} ${splUnit(weighting)}`}
        </span>
        <span className={styles['total-key']}>{t('stats.averageSpl')}</span>
      </div>
      <div
        className={styles.total}
        data-stats-total-headphone-time
        title={t('stats.headphoneTimeHint')}
      >
        <span className={styles['total-value']}>
          {headphoneSeconds === null || headphoneSeconds === undefined
            ? '—'
            : formatDuration(headphoneSeconds, t)}
        </span>
        <span className={styles['total-key']}>{t('stats.headphoneTime')}</span>
      </div>
    </div>
  );
}

export function PeriodBlock({
  title,
  period,
  topArtists,
  averageSpl,
  headphoneSeconds,
  weighting = 'A',
  showTracks = true,
  showTotals = true,
}: {
  readonly title: string;
  readonly period: StatsPeriod;
  readonly topArtists?: boolean;
  readonly averageSpl?: number | null;
  readonly headphoneSeconds?: number | null;
  readonly weighting?: SplWeighting;
  readonly showTracks?: boolean;
  readonly showTotals?: boolean;
}) {
  const t = useAtomValueRawSync(translateAtom);
  return (
    <div className={styles.period}>
      {showTotals && (
        <Totals
          totals={period.totals}
          previous={period.previous}
          averageSpl={averageSpl}
          headphoneSeconds={headphoneSeconds}
          weighting={weighting}
        />
      )}
      <div className={styles.columns}>
        {showTracks && (
          <section className={styles.section} aria-label={t('stats.topTracks')}>
            <h2>{t('stats.topTracks')}</h2>
            <ol className={styles.list} data-stats-top-tracks={title}>
              {period.tracks.slice(0, 10).map((row, index) => (
                <li key={`${row.title}\u0000${row.artist}\u0000${index}`}>
                  <span className={styles.rank}>{index + 1}</span>
                  <StatsArt path={row.path} title={row.title || t('stats.unknown')} />
                  <span className={styles.name}>
                    <span className={styles['name-main']}>{row.title || t('stats.unknown')}</span>
                    <span className={styles['name-sub']}>{row.artist}</span>
                  </span>
                  <span className={styles.amount}>{formatDuration(row.seconds, t)}</span>
                  <span className={styles.plays}>{row.plays}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        {topArtists && (
          <section className={styles.section} aria-label={t('stats.topArtists')}>
            <h2>{t('stats.topArtists')}</h2>
            <ol className={styles.list} data-stats-top-artists={title}>
              {period.artists.slice(0, 10).map((row, index) => (
                <li key={`${row.artist}\u0000${index}`}>
                  <span className={styles.rank}>{index + 1}</span>
                  <span className={styles.name}>
                    <span className={styles['name-main']}>{row.artist || t('stats.unknown')}</span>
                  </span>
                  <span className={styles.amount}>{formatDuration(row.seconds, t)}</span>
                  <span className={styles.plays}>{row.plays}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
