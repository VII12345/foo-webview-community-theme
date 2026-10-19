import { Button, Spinner } from '@fluentui/react-components';
import { ArrowLeft16Regular } from '@fluentui/react-icons';
import { useAtomValueRawSync } from 'jotai/react';
import { translateAtom } from '../i18n/locale.ts';
import { headphoneRigAtom } from '../playback/soundPressurePrefs.ts';
import { formatDuration } from './format.ts';
import type { LoudnessLoad, LoudnessSummary } from './loudnessStats.ts';
import type { StatsData } from './monthlyStats.ts';
import type { StatsScope } from './statsRange.ts';
import styles from './StatsPage.module.css';
import { PeriodBlock, SCOPES, SCOPE_LABELS } from './StatsSections.tsx';

export interface StatsDetailsPageProps {
  readonly data: StatsData | null;
  readonly loudness: LoudnessLoad | null;
  readonly summaries: Record<StatsScope, LoudnessSummary> | null;
  onBack(): void;
}

/** 全部统计：四周期概览、每只/全部耳机平均 SPL 矩阵、各周期 Top 歌曲与艺人。 */
export function StatsDetailsPage({ data, loudness, summaries, onBack }: StatsDetailsPageProps) {
  const t = useAtomValueRawSync(translateAtom);
  const rig = useAtomValueRawSync(headphoneRigAtom);
  const summaryOf = (scope: StatsScope) => summaries?.[scope] ?? null;
  const nameOf = (id: string): string => {
    const rigName = rig.headphones.find((item) => item.id === id)?.name;
    if (rigName) return rigName;
    for (const scope of SCOPES) {
      const entry = summaryOf(scope)?.perHeadphone.find((item) => item.id === id);
      if (entry?.name) return entry.name;
    }
    return id;
  };
  const headphoneIds = summaries
    ? [...new Set(SCOPES.flatMap((scope) => summaries[scope].perHeadphone.map((item) => item.id)))]
        .map((id) => ({
          id,
          seconds: SCOPES.reduce(
            (total, scope) =>
              total +
              (summaries[scope].perHeadphone.find((item) => item.id === id)?.seconds ?? 0),
            0,
          ),
        }))
        .sort((left, right) => right.seconds - left.seconds)
        .map((entry) => entry.id)
    : [];
  const volumeUnavailable =
    loudness === null
      ? 'loading'
      : loudness.state === 'denied' || loudness.state === 'failed'
        ? 'unavailable'
        : loudness.state === 'ready' && headphoneIds.length > 0
          ? 'ready'
          : 'empty';

  return (
    <div className={styles.details} data-stats-details-page>
      <header className={styles.head}>
        <div className={styles['details-title']}>
          <Button
            appearance="subtle"
            size="small"
            icon={<ArrowLeft16Regular />}
            onClick={onBack}
          >
            {t('stats.back')}
          </Button>
          <h1>{t('stats.allStats')}</h1>
        </div>
      </header>

      {data ? (
        <section className={styles.section} aria-label={t('stats.overview')}>
          <h2>{t('stats.overview')}</h2>
          <div className={styles['detail-scroll']}>
            <table className={styles['detail-table']} data-stats-detail-overview>
              <thead>
                <tr>
                  <th>{t('stats.periodScope')}</th>
                  <th>{t('stats.time')}</th>
                  <th>{t('stats.plays')}</th>
                  <th>{t('stats.tracks')}</th>
                  <th>{t('stats.averageSpl')}</th>
                </tr>
              </thead>
              <tbody>
                {SCOPES.map((scope) => {
                  const period = data[scope];
                  const spl = summaryOf(scope)?.overall.spl ?? null;
                  return (
                    <tr key={scope} data-stats-detail-overview-row={scope}>
                      <th scope="row">{t(SCOPE_LABELS[scope])}</th>
                      <td>{formatDuration(period.totals.seconds, t)}</td>
                      <td>{period.totals.plays}</td>
                      <td>{period.totals.tracks}</td>
                      <td>{spl === null ? '—' : `${spl.toFixed(1)} dB SPL`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className={styles.empty} role="status">
          {t('stats.empty')}
        </p>
      )}

      <section className={styles.section} aria-label={t('stats.splByPeriod')}>
        <h2>{t('stats.splByPeriod')}</h2>
        <p className={styles['section-hint']}>{t('stats.splUnitHint')}</p>
        {volumeUnavailable === 'loading' ? (
          <Spinner size="tiny" label={t('stats.loading')} />
        ) : volumeUnavailable === 'unavailable' ? (
          <p className={styles.empty} role="status">
            {t('stats.loudnessUnavailable')}
          </p>
        ) : volumeUnavailable === 'empty' ? (
          <p className={styles.empty} role="status">
            {t('stats.headphoneSplEmpty')}
          </p>
        ) : (
          <div className={styles['detail-scroll']}>
            <table className={styles['detail-table']} data-stats-detail-spl>
              <thead>
                <tr>
                  <th>{t('stats.headphoneSpl')}</th>
                  {SCOPES.map((scope) => (
                    <th key={scope}>{t(SCOPE_LABELS[scope])}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {headphoneIds.map((id) => (
                  <tr key={id} data-stats-detail-headphone={id}>
                    <th scope="row">{nameOf(id)}</th>
                    {SCOPES.map((scope) => {
                      const spl =
                        summaryOf(scope)?.perHeadphone.find((item) => item.id === id)?.spl ?? null;
                      return (
                        <td key={scope}>{spl === null ? '—' : `${spl.toFixed(1)} dB SPL`}</td>
                      );
                    })}
                  </tr>
                ))}
                <tr className={styles['detail-overall']} data-stats-detail-headphone-all>
                  <th scope="row">{t('stats.allHeadphones')}</th>
                  {SCOPES.map((scope) => {
                    const spl = summaryOf(scope)?.overall.spl ?? null;
                    return <td key={scope}>{spl === null ? '—' : `${spl.toFixed(1)} dB SPL`}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section} aria-label={t('stats.detailsTop')}>
        <h2>{t('stats.detailsTop')}</h2>
        {data ? (
          <div className={styles['detail-periods']}>
            {SCOPES.map((scope) => (
              <div key={scope} data-stats-detail-period={scope}>
                <PeriodBlock
                  title={scope}
                  period={data[scope]}
                  averageSpl={summaryOf(scope)?.overall.spl ?? null}
                  showTotals={false}
                  topArtists
                />
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.empty} role="status">
            {t('stats.empty')}
          </p>
        )}
      </section>
    </div>
  );
}
