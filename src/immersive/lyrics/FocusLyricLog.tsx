import { useService } from '../../kit/useService.ts';
import { lyricsDisplayKey, lyricsFontFamily } from '../../lyrics/lyricsDisplay.ts';
import { useAtomValueRawSync } from 'jotai/react';
import { useLayoutEffect, useRef } from 'react';
import { reducedMotionAtom } from '../../motion/reducedMotion.ts';
import { CURVE, DURATION_MS } from '../../motion/timing.ts';
import { lyricLogAtom, lyricWindowAtom } from './lyricLog.ts';
import { WordSyncedText } from './WordSyncedText.tsx';
import styles from './FocusLyricLog.module.css';

/** 新进窗口的一行从上方还是下方滑入，按窗口往前还是往后移决定。 */
const ENTER_OFFSET = 18;

export function FocusLyricLog() {
  const display = useAtomValueRawSync(useService(lyricsDisplayKey).display);
  const log = useAtomValueRawSync(lyricLogAtom);
  const lines = useAtomValueRawSync(lyricWindowAtom);
  const reduced = useAtomValueRawSync(reducedMotionAtom);
  const root = useRef<HTMLDivElement>(null);
  // 上一帧每一行的顶边（相对视口）与窗口首行时间：窗口滑动时按行身份把它从旧位置移到新位置。
  const tops = useRef(new Map<string, number>());
  const firstTime = useRef<number | null>(null);
  const running = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    // 先停掉上一轮，量到的才是这一帧的终值；量的元素按稳定身份对上。
    for (const animation of running.current) animation.cancel();
    running.current = [];
    const next = new Map<string, number>();
    const first = lines[0]?.time ?? null;
    const direction = firstTime.current === null || first === null ? 0 : first - firstTime.current;
    firstTime.current = first;
    const rows = element.querySelectorAll<HTMLElement>('[data-focus-lyric-id]');
    for (const row of rows) {
      const id = row.dataset.focusLyricId ?? '';
      const rect = row.getBoundingClientRect();
      const top = rect.top;
      // 舞台整体缩放过：位移按行自身的缩放换算回本地坐标，不然小窗口里会移过头。
      const scaleY = row.offsetHeight > 0 ? rect.height / row.offsetHeight : 1;
      next.set(id, top);
      if (reduced) continue;
      const previous = tops.current.get(id);
      if (previous !== undefined) {
        const shift = (previous - top) / scaleY;
        if (Math.abs(shift) > 0.5) {
          // 已在场的一行：从上一帧的位置连续移到这一帧的位置（多行一起动）。
          running.current.push(
            row.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], {
              duration: DURATION_MS.normal,
              easing: CURVE.pointToPoint.timing,
            }),
          );
        }
      } else if (direction !== 0) {
        // 新进窗口的一行：从窗口滑动来的那一侧淡入。
        const from = (direction > 0 ? ENTER_OFFSET : -ENTER_OFFSET) / scaleY;
        running.current.push(
          row.animate(
            [
              { opacity: 0, transform: `translateY(${from}px)` },
              { opacity: 1, transform: 'none' },
            ],
            { duration: DURATION_MS.normal, easing: CURVE.decelerateMid.timing },
          ),
        );
      }
    }
    tops.current = next;
  }, [lines, reduced]);

  useLayoutEffect(
    () => () => {
      for (const animation of running.current) animation.cancel();
      running.current = [];
    },
    [],
  );

  if (log.state !== 'synced') return null;
  return (
    <div ref={root} className={styles.root} data-focus-lyrics>
      {lines.map((line) => {
        // 行身份不随窗口里的序号变：窗口滑动时同一句还能对上，才能从旧位置连续移过去。
        const id = `${line.time}:${line.text}`;
        return (
          <div
            key={id}
            data-focus-lyric-id={id}
            className={line.current ? styles.current : styles.line}
            data-focus-lyric-current={line.current || undefined}
          >
            <span className={styles.time}>{formatTime(line.time)}</span>
            <span style={{ fontFamily: lyricsFontFamily(display.fontFamily) }}>
              {line.text ? <WordSyncedText words={line.words} text={line.text} /> : ' '}
            </span>
            {display.showTranslation && line.translation && (
              <span className={styles.translation}>{line.translation}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}
