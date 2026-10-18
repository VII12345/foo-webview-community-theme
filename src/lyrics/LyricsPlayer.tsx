import {
  DomLyricPlayer,
  LayoutReason,
  type LyricLine,
} from '@applemusic-like-lyrics/core';
import '@applemusic-like-lyrics/core/style.css';
import { Play16Filled } from '@fluentui/react-icons';
import { useAtomValueRawSync } from 'jotai/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { translateAtom } from '../i18n/locale.ts';
import { formatLyricTime } from '../immersive/lyrics/lyricLog.ts';
import { reducedMotionAtom } from '../motion/reducedMotion.ts';
import { colorSchemeAtom } from '../theme/colorScheme.ts';
import { startLyricsDriver, type LyricsClockFace, type LyricsDriver } from './lyricsDriver.ts';
import type { LyricsMotion } from './lyricsMotion.ts';
import { lyricsFontFamily, lyricsProcessConfig, type LyricsDisplay } from './lyricsDisplay.ts';
import styles from './LyricsPlayer.module.css';

export interface LyricsPlayerProps {
  /** 带时间轴的歌词；换一份就整份重排，滚动位置跟当前播放位置走。 */
  readonly lines: readonly LyricLine[];
  readonly motion: LyricsMotion;
  readonly clock: LyricsClockFace;
  /** 歌词区看得见时为真；看不见时停帧，省下每帧的排版。 */
  readonly active: boolean;
  /** 正文字号，CSS 像素。 */
  readonly fontSize: number;
  /** 字号缩放；full 舞台按 1/舞台缩放传，让缩放后的屏幕字号与设置值一致。 */
  readonly fontScale?: number;
  readonly display?: LyricsDisplay;
  readonly offset?: number;
  /** 点了某一行：交回那一行的开始时间，秒。 */
  readonly onSeek?: (seconds: number) => void;
  /** Ctrl+滚轮 调字号：上滚 +1、下滚 -1。给了才接管 Ctrl+滚轮，普通滚轮照旧交给 AMLL 滚动。 */
  readonly onZoom?: (direction: 1 | -1) => void;
  /** Alt+滚轮 调「播放行位置」：上滚下移播放行、下滚上移。与字号分开一组修饰键，互不干扰。 */
  readonly onAlignNudge?: (direction: 1 | -1) => void;
}

const curve = ([x1, y1, x2, y2]: LyricsMotion['transitionCurve']) =>
  `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;

/**
 * AMLL 的歌词播放器（只用 DOM 播放器，不用它的背景层）。播放器与驱动随组件建、随卸载释放；
 * 减弱动效时关掉弹簧、模糊与缩放，行的移动不再过渡。
 */
export function LyricsPlayer({
  lines,
  motion,
  clock,
  active,
  fontSize,
  fontScale = 1,
  display,
  offset = 0,
  onSeek,
  onZoom,
  onAlignNudge,
}: LyricsPlayerProps) {
  const t = useAtomValueRawSync(translateAtom);
  const host = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState<DomLyricPlayer | null>(null);
  const driver = useRef<LyricsDriver | null>(null);
  const reduced = useAtomValueRawSync(reducedMotionAtom);
  const scheme = useAtomValueRawSync(colorSchemeAtom);
  const seek = useRef(onSeek);
  seek.current = onSeek;
  const zoom = useRef(onZoom);
  zoom.current = onZoom;
  const nudge = useRef(onAlignNudge);
  nudge.current = onAlignNudge;
  const activeRef = useRef(active);
  activeRef.current = active;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const linesRef = useRef(lines);
  linesRef.current = lines;
  // 虚线盖层选中的秒数；null 表示没在预览。渲染虚线与播放按钮。
  const [preview, setPreview] = useState<number | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  // 虚线的中心 Y（相对容器）；按下时量一次就定住，拖动过程中不再改。null 时样式回退到容器中线。
  const [previewTop, setPreviewTop] = useState<number | null>(null);
  // 从按下到 3 秒预览结束都算预览：期间不重开逐帧驱动，也不恢复弹簧/缩放。
  const [previewing, setPreviewing] = useState(false);
  const drag = useRef<{ startY: number; baseIndex: number; lineHeight: number } | null>(null);
  const lastPoint = useRef<{ clientY: number } | null>(null);
  const moveFrame = useRef<number | null>(null);
  const lastIndex = useRef<number | null>(null);
  const motionRef = useRef(motion);
  motionRef.current = motion;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Ctrl+滚轮 调字号、Alt+滚轮 调播放行位置：都在**捕获阶段**抢先拦下，免得 AMLL 自己也把这次滚轮当成竖向滚动。
  // 普通滚轮原样放行，交给 AMLL 滚动歌词。Alt 优先判：Ctrl+Alt 同时按着时算调字号。
  useEffect(() => {
    const element = host.current;
    if (!element || (!onZoom && !onAlignNudge)) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      const up = event.deltaY < 0;
      if (event.ctrlKey) {
        if (!onZoom) return;
        event.preventDefault();
        event.stopPropagation();
        zoom.current?.(up ? 1 : -1);
        return;
      }
      if (!event.altKey || !onAlignNudge) return;
      event.preventDefault();
      event.stopPropagation();
      // Alt+上滚把播放行往下挪，视觉上跟拖歌词同一个方向（往上拖 = 往后看）。
      nudge.current?.(up ? -1 : 1);
    };
    element.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => element.removeEventListener('wheel', onWheel, { capture: true });
  }, [onZoom, onAlignNudge]);

  /** `seconds`（曲目时间）落在第几行：时间不晚于它的最后一行；首行之前是 0，末行之后封顶。 */
  const indexAt = (seconds: number): number => {
    const list = linesRef.current;
    let found = 0;
    for (let index = 0; index < list.length; index += 1) {
      if ((list[index]?.startTime ?? 0) / 1000 <= seconds) found = index;
      else break;
    }
    return found;
  };

  /** 取消 3 秒计时并把歌词与逐帧推进还给驱动。 */
  const endPreview = useCallback(() => {
    clearTimeout(hideTimer.current);
    hideTimer.current = undefined;
    drag.current = null;
    setPreview(null);
    setPreviewTop(null);
    setPreviewing(false);
    const created = player;
    if (!created) return;
    created.setCurrentTime((clock.position() - offsetRef.current) * 1000, true);
    created.setEnableSpring(motionRef.current.spring && !reducedRef.current);
    created.setEnableScale(motionRef.current.scale && !reducedRef.current);
    created.calcLayout(LayoutReason.ConfigChange);
    driver.current?.setActive(activeRef.current);
  }, [player, clock]);

  /**
   * 虚线停在哪：当前行**停稳后**的中心 Y（相对容器，CSS 像素）。按 AMLL 的对齐规则直接算，
   * 不量 DOM —— 拖动一开始 AMLL 就在滚行，量到的只是半路的位置。
   *
   * AMLL 把当前行的锚点落在 `容器高 × alignPosition` 上（`alignAnchor` 决定锚点是在行的
   * 上沿、中线还是下沿），所以：锚点在中线时行的中心就是那一点；在上下沿时再让半个行高。
   * 用 `clientHeight` / `offsetHeight`，不进舞台缩放。
   */
  const anchorTop = useCallback((): number | null => {
    const element = host.current;
    if (!element) return null;
    const height = element.clientHeight;
    if (height <= 0) return null;
    const anchor = height * motion.alignPosition;
    if (motion.alignAnchor === 'center') return anchor;
    const row = [...element.querySelectorAll<HTMLElement>('[class*="lyricLineWrapper"]')].find(
      (item) => !item.className.includes('bottomLineWrapper'),
    );
    const rowHeight = row?.offsetHeight ?? 0;
    if (rowHeight <= 0) return anchor;
    return motion.alignAnchor === 'top' ? anchor + rowHeight / 2 : anchor - rowHeight / 2;
  }, [motion.alignPosition, motion.alignAnchor]);

  // 拖动预览：按住上下拖，把目标行的时间用 `setCurrentTime` 预览出来（不改播放进度）；松手留 3 秒。
  useEffect(() => {
    const element = host.current;
    if (!element || !onSeek) return undefined;
    const secondsAt = (index: number) =>
      (linesRef.current[Math.min(Math.max(index, 0), linesRef.current.length - 1)]?.startTime ?? 0) /
      1000;
    /** 真实行距：取相邻两个歌词行的中心差；只剩一行时用它的高度。底部的填充行不是歌词行，要排掉。 */
    const rowSpacing = (): number => {
      const rows = [...element.querySelectorAll<HTMLElement>('[class*="lyricLineWrapper"]')].filter(
        (row) => !row.className.includes('bottomLineWrapper'),
      );
      const first = rows[0]?.getBoundingClientRect();
      const second = rows[1]?.getBoundingClientRect();
      if (first && second) return Math.max(12, second.top - first.top);
      if (first) return Math.max(12, first.height);
      return 48;
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || linesRef.current.length === 0) return;
      // 点在预览覆盖层的播放按钮上时交给按钮，不进拖动。
      if (event.target instanceof Element && event.target.closest('[data-lyric-drag-preview]'))
        return;
      clearTimeout(hideTimer.current);
      hideTimer.current = undefined;
      // 虚线的位置在按下时定一次，之后不再动：拖动时只有歌词在滚，读起来才像在「挪歌词」。
      setPreviewTop(anchorTop());
      setPreviewing(true);
      lastIndex.current = null;
      lastPoint.current = null;
      drag.current = {
        startY: event.clientY,
        baseIndex: indexAt(clock.position() - offsetRef.current),
        lineHeight: rowSpacing(),
      };
      // 拖动期间停掉驱动的逐帧推送，并把弹簧/缩放关掉，免得反复 seek 与动画互相拉扯。
      driver.current?.setActive(false);
      player?.setEnableSpring(false);
      player?.setEnableScale(false);
      player?.calcLayout(LayoutReason.ConfigChange);
      element.setPointerCapture(event.pointerId);
    };
    const applyMove = (clientY: number) => {
      const start = drag.current;
      if (!start) return;
      const shift = Math.round((start.startY - clientY) / start.lineHeight);
      const index = Math.min(
        Math.max(start.baseIndex + shift, 0),
        Math.max(0, linesRef.current.length - 1),
      );
      if (index === lastIndex.current && previewRef.current !== null) return;
      lastIndex.current = index;
      const seconds = secondsAt(index);
      setPreview(seconds);
      const created = player;
      if (created) {
        created.setCurrentTime((seconds - offsetRef.current) * 1000, true);
        created.update(16);
      }
    };
    const onMove = (event: PointerEvent) => {
      if (!drag.current) return;
      lastPoint.current = { clientY: event.clientY };
      if (moveFrame.current !== null) return;
      moveFrame.current = requestAnimationFrame(() => {
        moveFrame.current = null;
        const point = lastPoint.current;
        if (point) applyMove(point.clientY);
      });
    };
    const onUp = (event: PointerEvent) => {
      if (!drag.current) return;
      if (moveFrame.current !== null) {
        cancelAnimationFrame(moveFrame.current);
        moveFrame.current = null;
      }
      const point = lastPoint.current;
      lastPoint.current = null;
      if (point) applyMove(point.clientY);
      drag.current = null;
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
      // 没真正移动过（只是按了一下）：不必留预览，直接归位。
      if (previewRef.current === null) {
        endPreview();
        return;
      }
      // 松开先保留 3 秒；不点播放按钮就归位。
      hideTimer.current = setTimeout(endPreview, 3000);
    };
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onUp);
    return () => {
      if (moveFrame.current !== null) cancelAnimationFrame(moveFrame.current);
      moveFrame.current = null;
      lastPoint.current = null;
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
    };
  }, [player, clock, onSeek, endPreview, anchorTop]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  // 预览期间只跟容器大小变；拖动中每换一行不再重算锚点，否则虚线会跟着行高变化上下跳。
  useEffect(() => {
    if (!previewing) return undefined;
    const element = host.current;
    if (!element) return undefined;
    const sync = () => setPreviewTop(anchorTop());
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [previewing, motion.alignPosition, motion.alignAnchor, anchorTop]);

  useLayoutEffect(() => {
    const parent = host.current;
    if (!parent) return undefined;
    const created = new DomLyricPlayer();
    parent.append(created.getElement());
    // AMLL 挂入虚拟行后先测量再写位置；非弹簧模式会把这次定位误播成从顶部落下的过渡。
    const inserted = new MutationObserver((records) => {
      if (created.getEnableSpring()) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement) || !node.className.includes('lyricLineWrapper'))
            continue;
          for (const animation of node.getAnimations()) {
            if (animation instanceof CSSTransition && animation.transitionProperty === 'transform')
              animation.finish();
          }
        }
      }
    });
    inserted.observe(created.getElement(), { childList: true });
    const started = startLyricsDriver(created, clock);
    driver.current = started;
    setPlayer(created);
    return () => {
      inserted.disconnect();
      started.dispose();
      driver.current = null;
      created.dispose();
      created.getElement().remove();
      setPlayer(null);
    };
  }, [clock]);

  useEffect(() => {
    // AMLL 收可变数组，复制一份，不让它改到调用方的数据。
    player?.setLyricLines(
      lines.map((line) => ({ ...line, words: [...line.words] })),
      clock.position() * 1000,
    );
  }, [player, lines, clock]);

  useEffect(() => {
    if (!player) return;
    player.setEnableSpring(motion.spring && !reduced);
    player.setEnableScale(motion.scale && !reduced);
    player.setEnableBlur(motion.blur && !reduced);
    player.setHidePassedLines(motion.hidePassedLines);
    player.setWordFadeWidth(motion.wordFadeWidth);
    player.setLineScaleSpringParams(motion.scaleSpring);
    player.setAlignAnchor(motion.alignAnchor);
    player.setAlignPosition(motion.alignPosition);
    player.calcLayout(LayoutReason.ConfigChange);
  }, [player, lines, motion, reduced]);

  useEffect(() => {
    if (!player || !display) return;
    player.setEnableAutoSeekDetection(display.autoSeek);
    player.setOverscanPx(display.overscan);
    player.setAlwaysPostpositionBackground(display.backgroundLast);
    player.updateLyricProcessConfig(lyricsProcessConfig(display));
    // 整理配置重建歌词行时，AMLL 会恢复缩放弹簧缺省值；重建后重新套用当前档位。
    player.setLineScaleSpringParams(motion.scaleSpring);
  }, [player, display, motion.scaleSpring]);

  useEffect(() => {
    driver.current?.setOffset(offset);
  }, [player, offset, lines]);

  useEffect(() => {
    driver.current?.setActive(active && player !== null && !previewing);
  }, [player, active, previewing]);

  useLayoutEffect(() => {
    if (!player) return;
    player.calcLayout(LayoutReason.ConfigChange);
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) player.calcLayout(LayoutReason.ConfigChange);
    });
    return () => {
      cancelled = true;
    };
  }, [
    player,
    fontSize,
    fontScale,
    display?.fontFamily,
    display?.translationFontSize,
    display?.showTranslation,
    display?.showRomanization,
  ]);

  const style: CSSProperties & Record<`--${string}`, string> = {
    fontFamily: lyricsFontFamily(display?.fontFamily ?? ''),
    '--amll-lp-font-size': `${fontSize * fontScale}px`,
    '--lyrics-font-scale': String(fontScale),
    '--lyrics-transition-duration': `${reduced ? 0 : motion.transitionMs}ms`,
    '--lyrics-transition-curve': curve(motion.transitionCurve),
    ...(display?.translationFontSize != null
      ? { '--lyrics-translation-size': `${display.translationFontSize * fontScale}px` }
      : {}),
  };
  return (
    <div
      ref={host}
      className={styles.root}
      style={style}
      data-scheme={scheme}
      data-spring={motion.spring && !reduced ? 'on' : 'off'}
      data-reduced-motion={reduced || undefined}
      data-translation={display?.showTranslation === false ? 'hidden' : undefined}
      data-romanization={display?.showRomanization === false ? 'hidden' : undefined}
    >
      {preview !== null && onSeek && (
        // 拖动预览：被选中的行画一道虚线，右边浮一个播放按钮；点它才真正跳转。
        <button
          type="button"
          className={styles.preview}
          data-lyric-drag-preview
          style={previewTop !== null ? { top: `${previewTop}px` } : undefined}
          aria-label={t('lyrics.seekTo', { time: formatLyricTime(preview) })}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            // 真跳了，预览与虚线立刻收掉，不用再等那 3 秒。
            const target = preview;
            endPreview();
            onSeek(target);
          }}
        >
          <span className={styles['preview-time']} data-lyric-preview-time>
            {formatLyricTime(preview)}
          </span>
          <span className={styles['preview-play']} aria-hidden>
            <Play16Filled />
          </span>
        </button>
      )}
    </div>
  );
}
