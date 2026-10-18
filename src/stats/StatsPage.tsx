import { Spinner } from '@fluentui/react-components';
import { useAtomValueRawSync } from 'jotai/react';
import { useEffect, useMemo, useState } from 'react';
import { fb } from 'foo-webview-sdk/bridge';
import { translateAtom } from '../i18n/locale.ts';
import type { Translate } from '../i18n/translate.ts';
import { durationText } from '../table/cellText.ts';
import {
  loadStats,
  type StatsData,
  type StatsLoad,
  type StatsPeriod,
  type StatsTotals,
} from './monthlyStats.ts';
import styles from './StatsPage.module.css';
import { StatsArt } from './StatsArt.tsx';

/** 秒数写成「X 小时 Y 分」这种给人看的写法；不足一分钟写秒。 */
function formatDuration(seconds: number, t: Translate): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  if (hours > 0) return `${hours}${t('stats.hour')} ${minutes}${t('stats.minute')}`;
  if (minutes > 0) return `${minutes}${t('stats.minute')}`;
  return `${whole}${t('stats.second')}`;
}

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

function Totals({ totals, previous }: { readonly totals: StatsTotals; readonly previous: StatsTotals }) {
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
    </div>
  );
}

/** 按天/月的柱状趋势：高度相对最大值；点少时逐柱写时长，点密时只标最高柱和首尾日期。 */
function Trend({ points }: { readonly points: StatsPeriod['trend'] }) {
  const t = useAtomValueRawSync(translateAtom);
  if (points.length === 0) return null;
  const max = Math.max(...points.map((point) => point.seconds), 1);
  const dense = points.length > 12;
  const maxIndex = points.reduce(
    (best, point, index) => (point.seconds > (points[best]?.seconds ?? 0) ? index : best),
    0,
  );
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <section className={styles.section} aria-label={t('stats.trend')}>
      <h2>{t('stats.trend')}</h2>
      <div className={styles.trend} data-stats-trend data-dense={dense || undefined}>
        {points.map((point, index) => (
          <span key={point.ymd} className={styles.point}>
            {(!dense || index === maxIndex) && (
              <span className={styles['bar-value']} data-stats-bar-value>
                {durationText(point.seconds) || '0:00'}
              </span>
            )}
            <span className={styles.slot}>
              <span
                className={styles.bar}
                data-stats-bar
                style={{ height: `${Math.max(2, Math.round((point.seconds / max) * 100))}%` }}
                title={`${point.ymd} · ${formatDuration(point.seconds, t)} · ${point.plays} ${t('stats.plays')}`}
                aria-label={`${point.ymd} · ${formatDuration(point.seconds, t)} · ${point.plays} ${t('stats.plays')}`}
              />
            </span>
          </span>
        ))}
      </div>
      {dense && first && last && (
        <div className={styles['trend-dates']} data-stats-trend-dates>
          <span>{first.ymd}</span>
          <span>{last.ymd}</span>
        </div>
      )}
    </section>
  );
}

function PeriodBlock({ title, period, topArtists }: { readonly title: string; readonly period: StatsPeriod; readonly topArtists?: boolean }) {
  const t = useAtomValueRawSync(translateAtom);
  return (
    <div className={styles.period}>
      <Totals totals={period.totals} previous={period.previous} />
      <div className={styles.columns}>
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

type Scope = 'today' | 'month' | 'year';
const SCOPES: readonly Scope[] = ['today', 'month', 'year'];

/** 播放统计页：读 `foo_monthly_stats` 的库，展示概览、Top 榜、趋势与环比。 */
export function StatsPage() {
  const t = useAtomValueRawSync(translateAtom);
  const [state, setState] = useState<StatsLoad | null>(null);
  const [scope, setScope] = useState<Scope>('month');
  const host = useMemo(
    () => ({ config: fb.config, file: fb.file }),
    [],
  );
  useEffect(() => {
    let alive = true;
    void loadStats(host).then((result) => {
      if (alive) setState(result);
    });
    return () => {
      alive = false;
    };
  }, [host]);

  if (state === null)
    return (
      <div className={styles.root}>
        <Spinner size="small" label={t('stats.loading')} />
      </div>
    );
  if (state.state !== 'ready')
    return (
      <div className={styles.root} data-stats-empty data-stats-state={state.state}>
        <p role="status">
          {t(
            state.state === 'empty'
              ? 'stats.empty'
              : state.state === 'denied'
                ? 'stats.denied'
                : 'stats.failed',
          )}
        </p>
      </div>
    );

  const data: StatsData = state.data;
  const period = data[scope];
  return (
    <div className={styles.root} data-stats-page>
      <header className={styles.head}>
        <h1>{t('stats.title')}</h1>
        <div className={styles.tabs} role="tablist" aria-label={t('stats.range')}>
          {SCOPES.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={scope === value}
              data-stats-scope={value}
              onClick={() => setScope(value)}
            >
              {t(value === 'today' ? 'stats.today' : value === 'month' ? 'stats.month' : 'stats.year')}
            </button>
          ))}
        </div>
      </header>
      <PeriodBlock title={scope} period={period} topArtists />
      <Trend points={period.trend} />
    </div>
  );
}
