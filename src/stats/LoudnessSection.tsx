import { Spinner } from '@fluentui/react-components';
import { useAtomValueRawSync } from 'jotai/react';
import { useEffect, useMemo, useState } from 'react';
import { fb } from 'foo-webview-sdk/bridge';
import { translateAtom } from '../i18n/locale.ts';
import { headphoneRigAtom } from '../playback/soundPressurePrefs.ts';
import { formatDuration } from './format.ts';
import {
  loadLoudnessStats,
  summarizeLoudness,
  type LoudnessLoad,
} from './loudnessStats.ts';
import type { StatsScope } from './statsRange.ts';
import styles from './LoudnessSection.module.css';

/** 播放统计里的耳机平均音量：只含 DX52 自动读数生效的耳机输出时段，按日/周/月/年聚合。 */
export function LoudnessSection({ scope }: { readonly scope: StatsScope }) {
  const t = useAtomValueRawSync(translateAtom);
  const rig = useAtomValueRawSync(headphoneRigAtom);
  const [state, setState] = useState<LoudnessLoad | null>(null);
  const host = useMemo(() => ({ misc: fb.misc, file: fb.file }), []);
  useEffect(() => {
    let alive = true;
    void loadLoudnessStats(host).then((result) => {
      if (alive) setState(result);
    });
    return () => {
      alive = false;
    };
  }, [host]);
  const summary = state?.state === 'ready' ? summarizeLoudness(state.data, scope, new Date()) : null;
  const nameOf = (id: string, fallback: string): string =>
    rig.headphones.find((item) => item.id === id)?.name ?? fallback;
  return (
    <section className={styles.root} aria-label={t('stats.headphoneSpl')} data-stats-headphone-spl>
      <h2>{t('stats.headphoneSpl')}</h2>
      <p className={styles.hint}>{t('stats.headphoneSplHint')}</p>
      {state === null ? (
        <Spinner size="tiny" label={t('stats.loading')} />
      ) : state.state === 'denied' || state.state === 'failed' ? (
        <p className={styles.empty} role="status">
          {t('stats.loudnessUnavailable')}
        </p>
      ) : summary && summary.perHeadphone.length > 0 ? (
        <ul className={styles.list} data-stats-headphone-list>
          {summary.perHeadphone.map((item) => (
            <li key={item.id} data-stats-headphone={item.id}>
              <span className={styles.name}>{nameOf(item.id, item.name)}</span>
              <span className={styles.spl}>
                {item.spl === null ? '—' : `${item.spl.toFixed(1)} dB SPL`}
              </span>
              <span className={styles.time}>{formatDuration(item.seconds, t)}</span>
            </li>
          ))}
          <li className={styles.overall} data-stats-headphone-all>
            <span className={styles.name}>{t('stats.allHeadphones')}</span>
            <span className={styles.spl}>
              {summary.overall.spl === null ? '—' : `${summary.overall.spl.toFixed(1)} dB SPL`}
            </span>
            <span className={styles.time}>{formatDuration(summary.overall.seconds, t)}</span>
          </li>
        </ul>
      ) : (
        <p className={styles.empty} role="status">
          {t('stats.headphoneSplEmpty')}
        </p>
      )}
    </section>
  );
}
