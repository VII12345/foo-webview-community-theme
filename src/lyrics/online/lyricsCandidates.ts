import { compareTrack, isDurationTooShort } from './lyricsMatch.ts';
import type {
  LyricsCandidate,
  LyricsQuery,
  LyricsSource,
  LyricsSourceId,
  LyricsSourceOutcome,
} from './lyricsSource.ts';

export type { LyricsSourceOutcome } from './lyricsSource.ts';

export interface LyricsCandidates {
  readonly candidates: readonly LyricsCandidate[];
  readonly failed: readonly LyricsSourceId[];
  /** 这次实际问过的来源与各自结果；界面按它保留「无结果」的来源。 */
  readonly sources: readonly LyricsSourceOutcome[];
}

/** 手动搜索保留候选，不用自动取词的匹配门槛淘汰；明显偏短的已知时长版本除外。 */
export async function findLyricsCandidates(
  query: LyricsQuery,
  sources: readonly LyricsSource[],
  signal: AbortSignal,
): Promise<LyricsCandidates> {
  const outcomes = new Map<LyricsSourceId, 'results' | 'empty' | 'failed'>();
  async function ask(source: LyricsSource, request = query): Promise<readonly LyricsCandidate[]> {
    if (signal.aborted) return [];
    try {
      const result = await source.search(request, signal);
      if (signal.aborted) return [];
      if (result !== 'failed') {
        outcomes.set(source.id, result.length ? 'results' : 'empty');
        return result;
      }
    } catch {
      if (signal.aborted) return [];
    }
    outcomes.set(source.id, 'failed');
    return [];
  }
  const byMatch = (a: LyricsCandidate, b: LyricsCandidate) =>
    compareTrack(query, b).points - compareTrack(query, a).points ||
    sources.findIndex((source) => source.id === a.source) -
      sources.findIndex((source) => source.id === b.source);
  const candidates = (
    await Promise.all(
      sources.filter((source) => source.id !== 'lrcmux').map((source) => ask(source)),
    )
  )
    .flat()
    .filter((candidate) => !isDurationTooShort(query, candidate));
  const normalize = (value: string) =>
    value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const currentQuery =
    !query.keywords ||
    [
      query.title,
      [query.title, ...query.artists].join(' '),
      [query.title, query.artists.join(', ')].join(' '),
    ].some((value) => normalize(value) === normalize(query.keywords ?? ''));
  const match = [...candidates].sort(byMatch).find((item) => item.title && item.artists.length);
  // 聚合接口只收曲名和艺人；自由关键词先由直连来源解析成候选，不借当前艺人猜测另一首歌。
  const aggregateQuery: LyricsQuery | null =
    !query.keywords || (!match && currentQuery)
      ? { ...query, keywords: undefined }
      : match
        ? {
            title: match.title,
            artists: match.artists,
            album: match.album,
            albumArtists: match.albumArtists ?? [],
            durationMs: match.durationMs,
          }
        : null;
  if (aggregateQuery) {
    const more = await Promise.all(
      sources
        .filter((source) => source.id === 'lrcmux')
        .map((source) => ask(source, aggregateQuery)),
    );
    candidates.push(...more.flat().filter((candidate) => !isDurationTooShort(query, candidate)));
  }
  const unique = new Map(
    candidates.map((candidate) => [`${candidate.source}:${candidate.ref}`, candidate]),
  );
  const outcomesOf = sources.flatMap((source): LyricsSourceOutcome[] => {
    const status = outcomes.get(source.id);
    return status ? [{ id: source.id, status }] : [];
  });
  return {
    candidates: [...unique.values()].sort(byMatch),
    failed: outcomesOf.filter((item) => item.status === 'failed').map((item) => item.id),
    sources: outcomesOf,
  };
}
