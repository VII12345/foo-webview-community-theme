import { useCallback, useRef } from 'react';
import { useAtomValueRawSync } from 'jotai/react';
import { useService } from '../kit/useService.ts';
import { lyricsMotionKey } from './lyricsMotion.ts';

/** 播放行位置的档：与设置页的数字框一致（0–100%，步长 1），换算成 `alignPosition` 的 0–1。 */
export const LYRIC_ALIGN_STEP = 0.01;

/**
 * 快捷调「播放行位置」：一次按方向加减一档，写进**共享**的 `lyricsMotionKey`，所以沉浸歌词视图、
 * 卡片歌词档与右侧卡歌词页三处天然同步。返回一个按方向（上 +1 / 下 −1）调一档的回调。
 *
 * 改的是此刻生效的那一套（`customize` 会把动效档切成自定义），与设置页拉数字框是同一件事。
 */
export function useLyricAlignNudge(): (direction: 1 | -1) => void {
  const service = useService(lyricsMotionKey);
  const align = useAtomValueRawSync(service.motion).alignPosition;
  const current = useRef(align);
  current.current = align;
  return useCallback(
    (direction: 1 | -1) => {
      const next = Math.min(1, Math.max(0, current.current + direction * LYRIC_ALIGN_STEP));
      if (Math.abs(next - current.current) < 1e-6) return;
      service.customize({ alignPosition: next });
    },
    [service],
  );
}
