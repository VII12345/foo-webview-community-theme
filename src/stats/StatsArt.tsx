import { MusicNote2Regular } from '@fluentui/react-icons';
import { useAtomValueRawSync } from 'jotai/react';
import { useEffect, useState } from 'react';
import { fb } from 'foo-webview-sdk/bridge';
import { settle } from '../host/hostCall.ts';
import { translateAtom } from '../i18n/locale.ts';
import styles from './StatsPage.module.css';

/** 统计页只画 32px 缩略图；同一条路径在切换今天/本月/今年时不重复问宿主。 */
const CACHE_LIMIT = 200;
const covers = new Map<string, Promise<string | null>>();

function coverUrl(path: string): Promise<string | null> {
  const known = covers.get(path);
  if (known) return known;
  const pending = settle(() =>
    fb.artwork.getFb2kUrlByPath(path, 'front', { maxSize: 128 }),
  ).then((answer) => (answer && answer.success !== false && answer.available ? answer.dataUrl : null));
  covers.set(path, pending);
  if (covers.size > CACHE_LIMIT) {
    const oldest = covers.keys().next().value;
    if (oldest !== undefined) covers.delete(oldest);
  }
  return pending;
}

export function StatsArt({ path, title }: { readonly path: string; readonly title: string }) {
  const t = useAtomValueRawSync(translateAtom);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setUrl(null);
    if (!path) return undefined;
    void coverUrl(path).then((next) => {
      if (current) setUrl(next);
    });
    return () => {
      current = false;
    };
  }, [path]);
  return (
    <span className={styles.cover} data-stats-cover>
      {url ? (
        <img
          src={url}
          alt={t('player.page.cover', { title })}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setUrl(null)}
        />
      ) : (
        <MusicNote2Regular aria-hidden />
      )}
    </span>
  );
}
