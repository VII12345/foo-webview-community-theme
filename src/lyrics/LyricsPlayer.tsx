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
  readonly display?: LyricsDisplay;
  readonly offset?: number;
  /** 点了某一行：交回那一行的开始时间，秒。 */
  readonly onSeek?: (seconds: number) => void;
  /** Ctrl+滚轮 调字号：上滚 +1、下滚 -1。给了才接管 Ctrl+滚轮，普通滚轮照旧交给 AMLL 滚动。 */
  readonly onZoom?: (direction: 1 | -1) => void;
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
  display,
  offset = 0,
  onSeek,
  onZoom,
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
  const activeRef = useRef(active);
  activeRef.current = active;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const linesRef = useRef(lines);
  linesRef.current = lines;
  // 拖动预览选中的秒数；null 表示没在预览。渲染虚线与播放按钮。
  const [preview, setPreview] = useState<number | null>(null);
  const drag = useRef<{ startY: number; baseIndex: number; lineHeight: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Ctrl+滚轮 调字号：在**捕获阶段**抢先拦下，免得 AMLL 自己也把这次滚轮当成竖向滚动。
  // 普通滚轮原样放行，交给 AMLL 滚动歌词。
  useEffect(() => {
    const element = host.current;
    if (!element || !onZoom) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      event.stopPropagation();
      zoom.current?.(event.deltaY < 0 ? 1 : -1);
    };
    element.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => element.removeEventListener('wheel', onWheel, { capture: true });
  }, [onZoom]);

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
    const created = player;
    if (!created) return;
    created.setCurrentTime((clock.position() - offsetRef.current) * 1000, true);
    driver.current?.setActive(activeRef.current);
  }, [player, clock]);

  // 拖动预览：按住上下拖，把目标行的时间用 `setCurrentTime` 预览出来（不改播放进度）；松手留 3 秒。
  useEffect(() => {
    const element = host.current;
    if (!element || !onSeek) return undefined;
    const secondsAt = (index: number) =>
      (linesRef.current[Math.min(Math.max(index, 0), linesRef.current.length - 1)]?.startTime ?? 0) /
      1000;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || linesRef.current.length === 0) return;
      // 点在预览覆盖层的播放按钮上时交给按钮，不进拖动。
      if (event.target instanceof Element && event.target.closest('[data-lyric-drag-preview]'))
        return;
      clearTimeout(hideTimer.current);
      hideTimer.current = undefined;
      const wrapper = element.querySelector<HTMLElement>('[class*="lyricLineWrapper"]');
      const lineHeight = wrapper ? Math.max(24, wrapper.getBoundingClientRect().height) : 48;
      drag.current = {
        startY: event.clientY,
        baseIndex: indexAt(clock.position() - offsetRef.current),
        lineHeight,
      };
      // 拖动期间停掉驱动的逐帧推送，免得它把高亮拉回当前播放位置。
      driver.current?.setActive(false);
      element.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      const start = drag.current;
      if (!start) return;
      const shift = Math.round((start.startY - event.clientY) / start.lineHeight);
      const seconds = secondsAt(start.baseIndex + shift);
      setPreview(seconds);
      const created = player;
      if (created) {
        created.setCurrentTime((seconds - offsetRef.current) * 1000, true);
        created.update(16);
      }
    };
    const onUp = (event: PointerEvent) => {
      if (!drag.current) return;
      drag.current = null;
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
      // 松开先保留 3 秒；不点播放按钮就归位。
      hideTimer.current = setTimeout(endPreview, 3000);
    };
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onUp);
    return () => {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
    };
  }, [player, clock, onSeek, endPreview]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

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
    driver.current?.setActive(active && player !== null);
  }, [player, active]);

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
    display?.fontFamily,
    display?.translationFontSize,
    display?.showTranslation,
    display?.showRomanization,
  ]);

  const style: CSSProperties & Record<`--${string}`, string> = {
    fontFamily: lyricsFontFamily(display?.fontFamily ?? ''),
    '--amll-lp-font-size': `${fontSize}px`,
    '--lyrics-transition-duration': `${reduced ? 0 : motion.transitionMs}ms`,
    '--lyrics-transition-curve': curve(motion.transitionCurve),
    ...(display?.translationFontSize != null
      ? { '--lyrics-translation-size': `${display.translationFontSize}px` }
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
          aria-label={t('lyrics.seekTo', { time: formatLyricTime(preview) })}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onSeek(preview)}
        >
          <span className={styles['preview-time']}>{formatLyricTime(preview)}</span>
          <span className={styles['preview-play']} aria-hidden>
            <Play16Filled />
          </span>
        </button>
      )}
    </div>
  );
}
