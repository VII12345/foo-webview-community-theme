import { useAtomValueRawSync } from 'jotai/react';
import { useEffect, useRef } from 'react';
import { useService } from '../../kit/useService.ts';
import { lyricsKey } from '../../lyrics/lyricsService.ts';
import { useViewServices } from '../page/viewServices.ts';
import type { LyricWord } from './lyricLog.ts';
import styles from './WordSyncedText.module.css';

/**
 * 图纸两行卡、三行日志与聚焦多行列表里的逐字正文：外观（字号、配色、字体）仍由外层样式给，这里只把正文
 * 按字切开、给每个字写一个 `--word-progress`（0…1），由 `WordSyncedText.module.css` 用 `background-clip: text`
 * 把已唱过的部分染上 `--lyric-ink`。进度为 1 时与整行正常文字完全一样，所以不改变原本的排版观感。
 *
 * 进度按共享的 `PlaybackClock` 在 rAF 里逐帧算、直接写 DOM，不经 React 状态：宿主约 100 ms 一次进度事件
 * 之间由时钟插值，字才不会一顿一顿。整行只有一个「字」（逐行 LRC）时退化成整行一起扫；没有逐字数据
 * （间奏空行、纯文本）时退回整行文本。这一层只在沉浸视图里渲染，那里才有 `ViewServices`。
 */
export function WordSyncedText({ words, text }: { readonly words: readonly LyricWord[]; readonly text: string }) {
  const services = useViewServices();
  const lyrics = useService(lyricsKey);
  const offset = useAtomValueRawSync(lyrics.offset);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const clock = services.lyrics?.clock;
    const node = root.current;
    if (!clock || !node) return undefined;
    let handle = 0;
    const tick = () => {
      const position = clock.position() - offset;
      for (const word of node.querySelectorAll<HTMLElement>('[data-word-start]')) {
        const start = Number(word.dataset.wordStart);
        const end = Number(word.dataset.wordEnd);
        const span = end - start;
        const progress =
          span <= 0
            ? position >= start
              ? 1
              : 0
            : Math.min(1, Math.max(0, (position - start) / span));
        word.style.setProperty('--word-progress', progress.toFixed(3));
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [services.lyrics?.clock, offset]);

  if (words.length === 0) return <>{text}</>;
  return (
    <span ref={root} data-word-synced>
      {words.map((word, index) => (
        <span
          key={index}
          className={styles.word}
          data-word-start={word.start}
          data-word-end={word.end}
        >
          {word.word}
        </span>
      ))}
    </span>
  );
}
