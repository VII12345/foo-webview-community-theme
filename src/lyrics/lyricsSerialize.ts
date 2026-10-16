import type { LyricLine } from '@applemusic-like-lyrics/core';
import type { LyricsContent } from './lyricsText.ts';

const formatTime = (milliseconds: number): string => {
  const total = Math.max(0, milliseconds) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `[${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}]`;
};

const wordText = (line: LyricLine): string => line.words.map((word) => word.word).join('');

/** 逐字行：行首整行时间码后，每个字再带自己的时间码；只有整行时间时就是一个字。 */
const wordLrc = (line: LyricLine): string =>
  `${formatTime(line.startTime)}${line.words
    .map((word) => `${formatTime(word.startTime)}${word.word}`)
    .join('')}`;

/**
 * 把整理好的歌词序列化成带时间轴的 LRC：逐字行保留每个字的时间码，译文与音译各写一行与正文同码的文本；
 * 纯文本直接按行拼。用来写进音频文件的歌词标签。
 */
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

/** 有时间轴写进 SYNCED LYRICS 标签，纯文本写进 LYRICS 标签。 */
export function lyricsTagName(content: LyricsContent): 'SYNCED LYRICS' | 'LYRICS' {
  return content.kind === 'synced' ? 'SYNCED LYRICS' : 'LYRICS';
}
