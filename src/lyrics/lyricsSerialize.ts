import type { LyricLine } from '@applemusic-like-lyrics/core';
import type { LyricsContent } from './lyricsText.ts';

const formatTime = (milliseconds: number): string => {
  const total = Math.max(0, milliseconds) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `[${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}]`;
};

const wordText = (line: LyricLine): string => line.words.map((word) => word.word).join('');

const wordLrc = (line: LyricLine): string =>
  `${formatTime(line.startTime)}${line.words
    .map((word) => `${formatTime(word.startTime)}${word.word}`)
    .join('')}`;

/** Serialize parsed lyrics to an LRC form that preserves word timings and translations. */
export function serializeLyricsContent(content: LyricsContent): string {
  if (content.kind === 'plain') return content.lines.join('\n');
  const rows: string[] = [];
  for (const line of content.lines) {
    const text = wordText(line);
    if (!text && !line.translatedLyric && !line.romanLyric) continue;
    rows.push(wordLrc(line));
    if (line.translatedLyric) rows.push(`${formatTime(line.startTime)}${line.translatedLyric}`);
    if (line.romanLyric) rows.push(`${formatTime(line.startTime)}${line.romanLyric}`);
  }
  return rows.join('\n');
}

export function lyricsTagName(content: LyricsContent): 'SYNCED LYRICS' | 'LYRICS' {
  return content.kind === 'synced' ? 'SYNCED LYRICS' : 'LYRICS';
}
