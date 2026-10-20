import { ReadingSurface } from '../../../theme/ReadingSurface.tsx';
import { useViewControlStyles } from '../../../theme/controlStyles.ts';
import { Button, Input, Select, Spinner, Tooltip } from '@fluentui/react-components';
import {
  AlbumRegular,
  MicRegular,
  ChevronDown16Regular,
  ChevronRight16Regular,
  Clock16Regular,
  Dismiss16Regular,
  Globe16Regular,
  Info16Regular,
  Search16Regular,
  SoundWaveCircle16Regular,
  Translate16Regular,
} from '@fluentui/react-icons';
import { useAtomValueRawSync } from 'jotai/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { localeAtom, translateAtom } from '../../../i18n/locale.ts';
import { useService } from '../../../kit/useService.ts';
import { lyricsKey } from '../../../lyrics/lyricsService.ts';
import { lyricsCandidateId, type LyricsChoice } from '../../../lyrics/lyricsSearchSession.ts';
import type { LyricsCandidate, LyricsIdKind, LyricsIdQuery } from '../../../lyrics/online/lyricsSource.ts';
import { isWordLevel } from '../../../lyrics/lyricsText.ts';
import { createSnapshotSlot } from '../../../nav/historyStack.ts';
import { useRightCardSnapshot } from '../rightCardContext.ts';
import { LyricsSubpageHeading } from './LyricsSubpageHeading.tsx';
import { LyricsCandidateCover } from './LyricsCandidateCover.tsx';
import styles from './LyricsSearch.module.css';

const SNAPSHOT = createSnapshotSlot<{
  keywords: string;
  mode: 'keyword' | 'id';
  idSource: 'netease' | 'qq' | 'kugou';
  idKind: LyricsIdKind;
  scroll: number;
  focus: string;
}>();

const ID_KINDS: Readonly<Record<'netease' | 'qq' | 'kugou', readonly LyricsIdKind[]>> = {
  netease: ['neteaseSongId'],
  qq: ['qqSongId', 'qqMid'],
  kugou: ['kugouHash'],
};

function defaultKind(source: 'netease' | 'qq' | 'kugou'): LyricsIdKind {
  return ID_KINDS[source][0] ?? 'neteaseSongId';
}

/** 候选时长：`m:ss`，超过一小时写 `h:mm:ss`。 */
function formatDuration(milliseconds: number): string {
  const whole = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(whole / 60);
  const hours = Math.floor(minutes / 60);
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes % 60)}:${pad(whole % 60)}` : `${minutes}:${pad(whole % 60)}`;
}

export function LyricsSearch({
  title,
  artist,
  enabled,
  onlineControl,
  onUsed,
  onPreview,
  heading = true,
  snapshot = true,
}: {
  readonly title: string;
  readonly artist: string;
  readonly enabled: boolean;
  readonly onlineControl: ReactNode;
  /** 右侧卡子页默认显示返回标题；沉浸面板自己画标题时关掉。 */
  readonly heading?: boolean;
  /** 是否把搜索状态挂到右侧卡历史；沉浸面板不挂。 */
  readonly snapshot?: boolean;
  onUsed(): void;
  onPreview?(candidate: LyricsCandidate): void;
}) {
  const t = useAtomValueRawSync(translateAtom);
  const locale = useAtomValueRawSync(localeAtom).active;
  const listFormat = new Intl.ListFormat(locale, { style: 'short', type: 'conjunction' });
  const controls = useViewControlStyles();
  const service = useService(lyricsKey);
  const result = useAtomValueRawSync(service.choices);
  const local = useAtomValueRawSync(service.local);
  const currentLyrics = useAtomValueRawSync(service.state);
  const subject = useAtomValueRawSync(service.subject);
  const canRemember = useAtomValueRawSync(service.canRemember);
  const candidateGroups = Array.from(
    result.candidates.reduce((groups, candidate) => {
      const values = groups.get(candidate.source) ?? [];
      values.push(candidate);
      groups.set(candidate.source, values);
      return groups;
    }, new Map<LyricsCandidate['source'], LyricsChoice[]>()),
  );
  // 每个实际问过的来源都出一组；成功但没有候选的也留着，写明「无结果」。
  const sourceGroups =
    result.sources.length > 0
      ? result.sources.map((outcome) => ({
          source: outcome.id,
          status: outcome.status,
          candidates: candidateGroups.find(([source]) => source === outcome.id)?.[1] ?? [],
        }))
      : candidateGroups.map(([source, candidates]) => ({
          source,
          status: 'results' as const,
          candidates,
        }));
  const allSourcesFailed =
    result.sources.length > 0 && result.sources.every((outcome) => outcome.status === 'failed');
  // 每个词源那一组可折叠；默认展开，状态只在本页存活，不进偏好。
  const [collapsed, setCollapsed] = useState<ReadonlySet<LyricsCandidate['source']>>(new Set());
  const toggleGroup = (source: LyricsCandidate['source']) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  const localReady = local.status === 'ready' ? local : null;
  const localChosen =
    localReady !== null && currentLyrics.status === 'ready' && currentLyrics.source === localReady.source;
  const localKind = localReady
    ? isWordLevel(localReady.content)
      ? 'word'
      : localReady.content.kind === 'synced'
        ? 'line'
        : 'plain'
    : null;
  const localFormatLabel =
    localKind === 'word'
      ? t('lyrics.word')
      : localKind === 'line'
        ? t('lyrics.line')
        : localKind === 'plain'
          ? t('lyrics.plain')
          : '';
  const localTranslated =
    localReady?.content.kind === 'synced' &&
    localReady.content.lines.some((line) => line.translatedLyric.trim());
  const [keywords, setKeywords] = useState(
    result.keywords || [title, artist].filter(Boolean).join(' '),
  );
  const [mode, setMode] = useState<'keyword' | 'id'>('keyword');
  const [idSource, setIdSource] = useState<'netease' | 'qq' | 'kugou'>('kugou');
  const [idKind, setIdKind] = useState<LyricsIdKind>('kugouHash');
  const idValue = keywords.trim();
  const manualId: LyricsIdQuery | undefined =
    mode === 'id' && idValue ? { source: idSource, kind: idKind, value: idValue } : undefined;
  const searchable = mode === 'id' ? manualId !== undefined : idValue.length > 0;
  const upToDate =
    mode === 'id'
      ? result.id?.source === idSource &&
        result.id.kind === idKind &&
        result.id.value === idValue
      : result.keywords.trim() === idValue;
  const [composing, setComposing] = useState(false);
  const [using, setUsing] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const pendingSnapshot = useRef<{
    keywords: string;
    mode: 'keyword' | 'id';
    idSource: 'netease' | 'qq' | 'kugou';
    idKind: LyricsIdKind;
    scroll: number;
    focus: string;
  } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useRightCardSnapshot(SNAPSHOT, {
    capture: () => ({
      keywords,
      mode,
      idSource,
      idKind,
      scroll: results.current?.scrollTop ?? 0,
      focus:
        document.activeElement instanceof HTMLElement
          ? (document.activeElement.dataset.lyricsFocus ?? '')
          : '',
    }),
    restore: (value) => {
      pendingSnapshot.current = value;
      setKeywords(value.keywords);
      setMode(value.mode);
      setIdSource(value.idSource);
      setIdKind(value.idKind);
      const id =
        value.mode === 'id' && value.keywords.trim()
          ? { source: value.idSource, kind: value.idKind, value: value.keywords.trim() }
          : undefined;
      void service.search(value.keywords, false, id);
    },
  }, snapshot);
  useLayoutEffect(() => {
    const pending = pendingSnapshot.current;
    if (
      !pending ||
      result.keywords.trim() !== pending.keywords.trim() ||
      keywords !== pending.keywords ||
      (pending.keywords.trim() && result.status !== 'ready')
    )
      return;
    if (results.current) results.current.scrollTop = pending.scroll;
    const focused = [
      ...(root.current?.querySelectorAll<HTMLElement>('[data-lyrics-focus]') ?? []),
    ].find((element) => element.dataset.lyricsFocus === pending.focus);
    focused?.focus({ preventScroll: true });
    pendingSnapshot.current = null;
  }, [result, keywords]);
  useEffect(() => {
    const id =
      mode === 'id' && keywords.trim()
        ? { source: idSource, kind: idKind, value: keywords.trim() }
        : undefined;
    if (enabled && !composing && searchable && (!upToDate || result.status === 'idle'))
      timer.current = setTimeout(() => void service.search(keywords, false, id), 400);
    return () => clearTimeout(timer.current);
  }, [
    service,
    enabled,
    composing,
    keywords,
    result.keywords,
    result.status,
    result.id?.source,
    result.id?.kind,
    result.id?.value,
    mode,
    idSource,
    idKind,
    searchable,
    upToDate,
  ]);
  return (
    <section ref={root} className={styles.root} aria-label={t('lyrics.search')} data-lyrics-search>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (enabled && !composing && searchable) {
            clearTimeout(timer.current);
            void service.search(keywords, true, manualId);
          }
        }}
      >
        {heading && <LyricsSubpageHeading title={t('lyrics.search')} />}
        <div className={styles['query-mode']}>
          <Select
            size="small"
            select={{ className: controls.field }}
            aria-label={t('lyrics.searchMode')}
            value={mode}
            onChange={(_, data) => {
              service.cancelSearch();
              setKeywords('');
              setMode(data.value === 'id' ? 'id' : 'keyword');
            }}
          >
            <option value="keyword">{t('lyrics.mode.keyword')}</option>
            <option value="id">{t('lyrics.mode.id')}</option>
          </Select>
          {mode === 'id' && (
            <>
              <Select
                size="small"
                select={{ className: controls.field }}
                aria-label={t('lyrics.idSource')}
                value={idSource}
                onChange={(_, data) => {
                  const next =
                    data.value === 'qq' ? 'qq' : data.value === 'kugou' ? 'kugou' : 'netease';
                  service.cancelSearch();
                  setIdSource(next);
                  setIdKind(defaultKind(next));
                }}
              >
                <option value="kugou">{t('lyrics.source.kugou')}</option>
                <option value="qq">{t('lyrics.source.qq')}</option>
                <option value="netease">{t('lyrics.source.netease')}</option>
              </Select>
              <Select
                size="small"
                select={{ className: controls.field }}
                aria-label={t('lyrics.idKind')}
                value={idKind}
                onChange={(_, data) => {
                  const next = ID_KINDS[idSource].find((kind) => kind === data.value);
                  if (!next) return;
                  service.cancelSearch();
                  setIdKind(next);
                }}
              >
                {ID_KINDS[idSource].map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`lyrics.idKind.${kind}`)}
                  </option>
                ))}
              </Select>
            </>
          )}
        </div>
        <Input
          className={controls.field}
          ref={input}
          autoFocus
          data-lyrics-focus="query"
          aria-label={mode === 'id' ? t('lyrics.idValue') : t('lyrics.keywords')}
          placeholder={mode === 'id' ? t('lyrics.idValue') : t('lyrics.keywords')}
          value={keywords}
          onChange={(_, data) => {
            service.cancelSearch();
            setKeywords(data.value);
          }}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          contentBefore={<Search16Regular />}
          contentAfter={
            keywords && (
              <Button
                appearance="subtle"
                size="small"
                className={controls.icon}
                icon={<Dismiss16Regular />}
                aria-label={t('lyrics.clearSearch')}
                onClick={() => {
                  input.current?.focus();
                  service.cancelSearch();
                  setKeywords('');
                }}
              />
            )
          }
        />
        {!enabled && <div onChangeCapture={() => input.current?.focus()}>{onlineControl}</div>}
      </form>
      <div ref={results} className={styles.results}>
        {result.status === 'searching' && <Spinner size="small" label={t('lyrics.searching')} />}
        {(result.status === 'search-failed' || result.failed.length > 0) && (
          <p role="status">
            {result.status === 'search-failed' || allSourcesFailed
              ? t('lyrics.searchFailed')
              : t('lyrics.failedSources', {
                  sources: listFormat.format(
                    result.failed.map((source) => t(`lyrics.source.${source}`)),
                  ),
                })}
          </p>
        )}
        {result.status === 'fetch-failed' && <p role="status">{t('lyrics.fetchFailed')}</p>}
        {result.status === 'missing' && <p role="status">{t('lyrics.selectedMissing')}</p>}
        {result.status === 'ready' && sourceGroups.length === 0 && !result.candidates.length && (
          <p role="status">{t('lyrics.onlineMissing')}</p>
        )}
        {localReady && (
          <section
            className={styles.group}
            data-lyrics-source-group={localReady.source}
            data-lyrics-local-group
          >
            <h2>{t(`lyrics.source.${localReady.source}`)}</h2>
            <article className={styles.local} data-lyrics-local-candidate>
              <ReadingSurface />
              <div className={styles.heading}>
                <strong>{localReady.sourcePath || t(`lyrics.source.${localReady.source}`)}</strong>
                {localChosen && <span className={styles.chosen}>{t('lyrics.selected')}</span>}
              </div>
              <div className={styles.footer}>
                <div className={styles.metadata}>
                  <span className={styles.field}>
                    <Info16Regular aria-label={t('lyrics.sourceLabel')} />
                    <span>{t(`lyrics.source.${localReady.source}`)}</span>
                  </span>
                  {localReady.source === 'embedded' && localReady.tagName && (
                    <span className={styles.field}>
                      <Info16Regular aria-hidden />
                      <span>{t('lyrics.readTag', { tag: localReady.tagName })}</span>
                    </span>
                  )}
                  {(localReady.source === 'embedded' || localReady.source === 'file') && (
                    <span className={styles.field}>
                      <Info16Regular aria-hidden />
                      <span>{t('lyrics.writeTagTarget', { tag: 'LYRICS' })}</span>
                    </span>
                  )}
                  <span className={styles.field}>
                    <SoundWaveCircle16Regular aria-label={t('lyrics.format')} />
                    <span>{localFormatLabel}</span>
                  </span>
                  {localTranslated && (
                    <span className={styles.field}>
                      <Translate16Regular aria-hidden />
                      <span>{t('lyrics.hasTranslation')}</span>
                    </span>
                  )}
                </div>
                <div className={styles.use}>
                  <Button
                    size="small"
                    appearance="primary"
                    data-lyrics-focus="use:local"
                    disabled={!!using}
                    onClick={() => {
                      setUsing('local');
                      void service.chooseLocal(true, subject).then((used) => {
                        if (!mounted.current) return;
                        setUsing('');
                        if (used) onUsed();
                      });
                    }}
                  >
                    {using === 'local'
                      ? t('lyrics.loading')
                      : canRemember
                        ? t(localChosen ? 'lyrics.selected' : 'lyrics.use')
                        : t('lyrics.useTemporarily')}
                  </Button>
                </div>
              </div>
            </article>
          </section>
        )}
        {sourceGroups.map(({ source, status, candidates }) => {
          const isCollapsed = collapsed.has(source);
          return (
          <section key={source} className={styles.group} data-lyrics-source-group={source}>
            <h2>
              <button
                type="button"
                className={styles['group-toggle']}
                aria-expanded={!isCollapsed}
                data-lyrics-group-toggle={source}
                onClick={() => toggleGroup(source)}
              >
                <ChevronDown16Regular
                  className={styles['group-chevron']}
                  data-collapsed={isCollapsed || undefined}
                  aria-hidden
                />
                <span>{t(`lyrics.source.${source}`)}</span>
                <span className={styles['group-count']}>{candidates.length}</span>
              </button>
            </h2>
            {!isCollapsed &&
              (candidates.length === 0 ? (
                <p className={styles['source-status']} role="status">
                  {t(status === 'failed' ? 'lyrics.sourceFailed' : 'lyrics.sourceEmpty')}
                </p>
              ) : (
                candidates.map((candidate) => {
          const id = lyricsCandidateId(candidate);
          const chosen =
            currentLyrics.status === 'ready' &&
            currentLyrics.candidate !== undefined &&
            lyricsCandidateId(currentLyrics.candidate) === id;
          const kind = !candidate.content
            ? candidate.contentStatus === 'loading'
              ? 'loading'
              : candidate.contentStatus === 'missing'
                ? 'candidateMissing'
                : candidate.contentStatus === 'failed'
                  ? 'candidateFailed'
                  : 'unknownFormat'
            : isWordLevel(candidate.content)
              ? 'word'
              : candidate.content.kind === 'synced'
                ? 'line'
                : 'plain';
          const translated =
            candidate.content?.kind === 'synced' &&
            candidate.content.lines.some((line) => line.translatedLyric.trim());
          return (
            <article key={id} className={styles.candidate} data-lyrics-candidate>
              <ReadingSurface />
              <LyricsCandidateCover
                candidate={candidate}
                enabled={enabled}
                viewport={results}
                className={styles.cover}
              />
              <div className={styles.heading}>
                <strong>{candidate.title}</strong>
                {chosen && <span className={styles.chosen}>{t('lyrics.selected')}</span>}
                {onPreview && (
                  <Tooltip content={t('lyrics.preview')} relationship="label">
                    <Button
                      size="small"
                      appearance="subtle"
                      className={controls.icon}
                      icon={<ChevronRight16Regular />}
                      data-lyrics-focus={`preview:${id}`}
                      onClick={() => onPreview(candidate)}
                    />
                  </Tooltip>
                )}
              </div>
              <div className={styles.byline}>
                {candidate.artists.length > 0 && (
                  <span className={styles.field}>
                    <MicRegular aria-label={t('trackInfo.artist')} />
                    <span>{listFormat.format(candidate.artists)}</span>
                  </span>
                )}
                {candidate.album && (
                  <span className={styles.field}>
                    <AlbumRegular aria-label={t('trackInfo.album')} />
                    <span>{candidate.album}</span>
                  </span>
                )}
              </div>
              <div className={styles.footer}>
                <div className={styles.metadata}>
                  <span className={styles.field}>
                    <Globe16Regular aria-label={t('lyrics.sourceLabel')} />
                    <span>{t(`lyrics.source.${candidate.source}`)}</span>
                  </span>
                  {candidate.durationMs > 0 && (
                    <span className={styles.field}>
                      <Clock16Regular aria-label={t('lyrics.duration')} />
                      <span data-lyrics-candidate-duration>{formatDuration(candidate.durationMs)}</span>
                    </span>
                  )}
                  {candidate.content ? (
                    <span className={styles.field}>
                      <SoundWaveCircle16Regular aria-label={t('lyrics.format')} />
                      <span>{t(`lyrics.${kind}`)}</span>
                    </span>
                  ) : (
                    kind !== 'unknownFormat' && (
                      <span className={styles.field}>
                        <Info16Regular aria-hidden />
                        <span>{t(`lyrics.${kind}`)}</span>
                      </span>
                    )
                  )}
                  {translated && (
                    <span className={styles.field}>
                      <Translate16Regular aria-hidden />
                      <span>{t('lyrics.hasTranslation')}</span>
                    </span>
                  )}
                </div>
                <div className={styles.use}>
                  <Button
                    size="small"
                    appearance="primary"
                    data-lyrics-focus={`use:${id}`}
                    disabled={!!using}
                    onClick={() => {
                      setUsing(id);
                      void service.choose(candidate, true, subject).then((used) => {
                        if (!mounted.current) return;
                        setUsing('');
                        if (used) onUsed();
                      });
                    }}
                  >
                    {using === id
                      ? t('lyrics.loading')
                      : canRemember
                        ? t(chosen ? 'lyrics.selected' : 'lyrics.use')
                        : t('lyrics.useTemporarily')}
                  </Button>
                </div>
              </div>
            </article>
            );
                })
              ))}
          </section>
          );
        })}
      </div>
      <div className={styles.actions} role="status">
        {t('lyrics.results', { count: result.candidates.length })}
      </div>
    </section>
  );
}
