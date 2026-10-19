import { Button, Spinner } from '@fluentui/react-components';
import { DataBarVertical20Regular } from '@fluentui/react-icons';
import { useAtomValueRawSync } from 'jotai/react';
import { useEffect, useMemo, useState } from 'react';
import { fb } from 'foo-webview-sdk/bridge';
import { translateAtom } from '../i18n/locale.ts';
import { splWeightingAtom } from '../playback/soundPressurePrefs.ts';
import { durationText } from '../table/cellText.ts';
import { formatDuration } from './format.ts';
import { LoudnessSection } from './LoudnessSection.tsx';
import {
  loadLoudnessStats,
  summarizeLoudnessScopes,
  type LoudnessLoad,
} from './loudnessStats.ts';
import {
  loadStats,
  type StatsData,
  type StatsLoad,
  type StatsPeriod,
} from './monthlyStats.ts';
import { StatsDetailsPage } from './StatsDetailsPage.tsx';
import styles from './StatsPage.module.css';
import { PeriodBlock, SCOPES, SCOPE_LABELS, type Scope } from './StatsSections.tsx';

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

/** 播放统计页：读 `foo_monthly_stats` 的库，展示概览、Top 榜、趋势与环比。 */
export function StatsPage() {
  const t = useAtomValueRawSync(translateAtom);
  const [state, setState] = useState<StatsLoad | null>(null);
  const [loudness, setLoudness] = useState<LoudnessLoad | null>(null);
  const [scope, setScope] = useState<Scope>('month');
  const [details, setDetails] = useState(false);
  const weighting = useAtomValueRawSync(splWeightingAtom);
  const host = useMemo(
    () => ({ config: fb.config, file: fb.file }),
    [],
  );
  const loudnessHost = useMemo(() => ({ misc: fb.misc, file: fb.file }), []);
  useEffect(() => {
    let alive = true;
    void loadStats(host).then((result) => {
      if (alive) setState(result);
    });
    return () => {
      alive = false;
    };
  }, [host]);
  useEffect(() => {
    let alive = true;
    void loadLoudnessStats(loudnessHost).then((result) => {
      if (alive) setLoudness(result);
    });
    return () => {
      alive = false;
    };
  }, [loudnessHost]);

  const data: StatsData | null = state?.state === 'ready' ? state.data : null;
  const period = data?.[scope] ?? null;
  const summaries = useMemo(
    () =>
      loudness?.state === 'ready'
        ? summarizeLoudnessScopes(loudness.data, new Date(), weighting)
        : null,
    [loudness, weighting],
  );
  const summary = summaries?.[scope] ?? null;

  return (
    <div
      className={styles.root}
      data-stats-page
      data-stats-view={details ? 'details' : 'main'}
    >
      {details ? (
        <StatsDetailsPage
          data={data}
          loudness={loudness}
          summaries={summaries}
          weighting={weighting}
          onBack={() => setDetails(false)}
        />
      ) : (
        <>
          <header className={styles.head}>
            <h1>{t('stats.title')}</h1>
            <div className={styles['head-actions']}>
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
                    {t(SCOPE_LABELS[value])}
                  </button>
                ))}
              </div>
              <Button
                size="small"
                appearance="subtle"
                icon={<DataBarVertical20Regular />}
                onClick={() => setDetails(true)}
              >
                {t('stats.allStats')}
              </Button>
            </div>
          </header>
          {state === null ? (
            <Spinner size="small" label={t('stats.loading')} />
          ) : !data || !period ? (
            <div data-stats-empty data-stats-state={state.state}>
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
          ) : (
            <>
              <PeriodBlock
                title={scope}
                period={period}
                averageSpl={summary?.overall.spl ?? null}
                headphoneSeconds={
                  summary
                    ? summary.overall.seconds + summary.overall.legacySeconds
                    : null
                }
                weighting={weighting}
                topArtists
              />
              <Trend points={period.trend} />
            </>
          )}
          <LoudnessSection
            scope={scope}
            load={loudness}
            summary={summary}
            weighting={weighting}
          />
        </>
      )}
    </div>
  );
}
