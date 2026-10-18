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
import {
  clampPreviewIndex,
  DRAG_THRESHOLD_PX,
  PREVIEW_HOLD_MS,
  previewShift,
  wheelSteps,
  type PreviewPhase,
} from './lyricsPreview.ts';
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
  const previewingRef = useRef(false);
  const phase = useRef<PreviewPhase>('idle');
  const drag = useRef<{ startY: number; baseIndex: number; lineHeight: number } | null>(null);
  const lastPoint = useRef<{ clientY: number } | null>(null);
  const moveFrame = useRef<number | null>(null);
  const previewIndex = useRef<number | null>(null);
  const lastAppliedIndex = useRef<number | null>(null);
  const moved = useRef(false);
  const wheelAccumulator = useRef(0);
  const holdEpoch = useRef(0);
  const motionRef = useRef(motion);
  motionRef.current = motion;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
    holdEpoch.current += 1;
    clearTimeout(hideTimer.current);
    hideTimer.current = undefined;
    phase.current = 'idle';
    previewingRef.current = false;
    drag.current = null;
    moved.current = false;
    previewIndex.current = null;
    lastAppliedIndex.current = null;
    lastPoint.current = null;
    wheelAccumulator.current = 0;
    previewRef.current = null;
    if (moveFrame.current !== null) {
      cancelAnimationFrame(moveFrame.current);
      moveFrame.current = null;
    }
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

  // 拖动/滚轮预览共用一套手势状态：按下先等 4px 阈值，拖动或滚轮进入预览，松开/最后一次滚轮后保留 3 秒。
  // Ctrl+滚轮调字号、Alt+滚轮调播放行位置与普通滚轮预览都在捕获阶段处理，避免 AMLL 再滚动一次。
  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    const secondsAt = (index: number) =>
      (linesRef.current[clampPreviewIndex(index, linesRef.current.length)]?.startTime ?? 0) / 1000;
    const showPreview = (seconds: number) => {
      previewRef.current = seconds;
      setPreview(seconds);
    };
    /** 真实行距：取相邻两个歌词行的中心差；只剩一行时用它的高度。底部的填充行不是歌词行。 */
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
    const armHold = () => {
      const epoch = ++holdEpoch.current;
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        if (holdEpoch.current !== epoch || phase.current !== 'holding') return;
        hideTimer.current = undefined;
        endPreview();
      }, PREVIEW_HOLD_MS);
    };
    const beginPreview = (baseIndex: number) => {
      clearTimeout(hideTimer.current);
      holdEpoch.current += 1;
      phase.current = 'holding';
      previewingRef.current = true;
      previewIndex.current = baseIndex;
      lastAppliedIndex.current = null;
      moved.current = false;
      setPreviewing(true);
      setPreviewTop(anchorTop());
      driver.current?.setActive(false);
      player?.setEnableSpring(false);
      player?.setEnableScale(false);
      player?.calcLayout(LayoutReason.ConfigChange);
    };
    const applyIndex = (index: number) => {
      const next = clampPreviewIndex(index, linesRef.current.length);
      if (next === lastAppliedIndex.current && previewRef.current !== null) return;
      lastAppliedIndex.current = next;
      previewIndex.current = next;
      moved.current = true;
      const seconds = secondsAt(next);
      showPreview(seconds);
      const created = player;
      if (created) {
        created.setCurrentTime((seconds - offsetRef.current) * 1000, true);
        created.update(16);
      }
    };
    const flushMove = (clientY: number) => {
      const start = drag.current;
      if (!start) return;
      applyIndex(start.baseIndex + previewShift(start.startY, clientY, start.lineHeight));
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || linesRef.current.length === 0 || !onSeek) return;
      // 点在预览右侧的播放按钮上时交给按钮，不进拖动。
      if (event.target instanceof Element && event.target.closest('[data-lyric-drag-preview]'))
        return;
      clearTimeout(hideTimer.current);
      hideTimer.current = undefined;
      holdEpoch.current += 1;
      if (moveFrame.current !== null) {
        cancelAnimationFrame(moveFrame.current);
        moveFrame.current = null;
      }
      lastPoint.current = null;
      wheelAccumulator.current = 0;
      moved.current = false;
      phase.current = 'pressing';
      // 第二次拖动从当前预览行继续，而不是从实时播放位置重新起算。
      const baseIndex =
        previewRef.current !== null
          ? indexAt(previewRef.current)
          : indexAt(clock.position() - offsetRef.current);
      drag.current = {
        startY: event.clientY,
        baseIndex,
        lineHeight: rowSpacing(),
      };
      element.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      const start = drag.current;
      if (!start || !onSeek) return;
      if (phase.current === 'pressing') {
        if (Math.abs(event.clientY - start.startY) < DRAG_THRESHOLD_PX) return;
        beginPreview(start.baseIndex);
        phase.current = 'dragging';
      }
      if (phase.current !== 'dragging') return;
      lastPoint.current = { clientY: event.clientY };
      if (moveFrame.current !== null) return;
      moveFrame.current = requestAnimationFrame(() => {
        moveFrame.current = null;
        const point = lastPoint.current;
        if (point && phase.current === 'dragging') flushMove(point.clientY);
      });
    };
    const onUp = (event: PointerEvent) => {
      if (phase.current === 'idle') return;
      if (moveFrame.current !== null) {
        cancelAnimationFrame(moveFrame.current);
        moveFrame.current = null;
      }
      const point = lastPoint.current;
      lastPoint.current = null;
      if (point && phase.current === 'dragging') flushMove(point.clientY);
      drag.current = null;
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
      if (phase.current === 'pressing') {
        // 只是点了一下：结束已有预览，不重新挂计时器。
        endPreview();
        return;
      }
      if (phase.current === 'dragging') {
        phase.current = 'holding';
        if (moved.current) armHold();
        else endPreview();
      }
    };
    const onCancel = (event: PointerEvent) => {
      drag.current = null;
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
      endPreview();
    };
    if (onSeek) {
      element.addEventListener('pointerdown', onDown);
      element.addEventListener('pointermove', onMove);
      element.addEventListener('pointerup', onUp);
      element.addEventListener('pointercancel', onCancel);
    }
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
      if (event.altKey) {
        if (!onAlignNudge) return;
        event.preventDefault();
        event.stopPropagation();
        nudge.current?.(up ? -1 : 1);
        return;
      }
      if (!onSeek || phase.current === 'pressing' || phase.current === 'dragging') return;
      event.preventDefault();
      event.stopPropagation();
      const { steps, remainder } = wheelSteps(
        wheelAccumulator.current,
        event.deltaY,
        event.deltaMode,
        element.clientHeight,
      );
      wheelAccumulator.current = remainder;
      if (steps === 0) return;
      if (phase.current === 'idle') {
        const baseIndex =
          previewRef.current !== null
            ? indexAt(previewRef.current)
            : indexAt(clock.position() - offsetRef.current);
        beginPreview(baseIndex);
      }
      const current =
        previewIndex.current ?? indexAt(clock.position() - offsetRef.current);
      applyIndex(current + steps);
      phase.current = 'holding';
      armHold();
    };
    if (onSeek || onZoom || onAlignNudge) {
      element.addEventListener('wheel', onWheel, { passive: false, capture: true });
    }
    return () => {
      if (moveFrame.current !== null) cancelAnimationFrame(moveFrame.current);
      moveFrame.current = null;
      lastPoint.current = null;
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onCancel);
      element.removeEventListener('wheel', onWheel, { capture: true });
    };
  }, [player, clock, onSeek, onZoom, onAlignNudge, endPreview, anchorTop]);

  useEffect(() => () => clearTimeout(hideTimer.current), [player]);

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
        // 拖动/滚轮预览：虚线只做视觉标记，不接指针；只有右侧播放按钮可点。
        <>
          <div
            className={styles['preview-line']}
            data-lyric-drag-line
            aria-hidden
            style={previewTop !== null ? { top: `${previewTop}px` } : undefined}
          />
          <button
            type="button"
            className={styles['preview-chip']}
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
        </>
      )}
    </div>
  );
}
