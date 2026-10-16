import { useCallback, useRef } from 'react';
import { useAtomValueRawSync } from 'jotai/react';
import { useService } from '../kit/useService.ts';
import { lyricsDisplayKey } from './lyricsDisplay.ts';

/** 字号档：与设置页两个编辑器、`parseLyricsDisplay` 的夹取一致（12–48，步长 1）。 */
export const LYRIC_FONT_MIN = 12;
export const LYRIC_FONT_MAX = 48;

/**
 * Ctrl+滚轮 调歌词字号：滚一格按方向加减字号，写进**共享**的 `lyricsDisplayKey`，所以沉浸歌词视图、
 * 卡片视图与右侧卡歌词页三处天然同步。返回一个按滚轮方向（上滚 +1 / 下滚 -1）调一档的回调。
 */
export function useLyricFontZoom(): (direction: 1 | -1) => void {
  const service = useService(lyricsDisplayKey);
  const fontSize = useAtomValueRawSync(service.display).fontSize;
  const current = useRef(fontSize);
  current.current = fontSize;
  return useCallback(
    (direction: 1 | -1) => {
      const next = Math.min(LYRIC_FONT_MAX, Math.max(LYRIC_FONT_MIN, current.current + direction));
      if (next !== current.current) void service.update({ fontSize: next });
    },
    [service],
  );
}
