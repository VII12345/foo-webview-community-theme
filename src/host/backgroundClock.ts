// backgroundClock.ts — 隐藏页面里的帧时钟。
//
// 实时响应/频谱管线用 rAF 驱动。文档隐藏时浏览器不再派发 rAF，所以"正常运行"档
// 若只是不拆订阅，读数依然不会前进。这里给一个替换时钟：可见时照旧 rAF；
// 隐藏且档位是"正常运行"时退到定时器（约 20 Hz 的调度，浏览器会再降频，尽力而为）。
//
// 放在层 0：帧调度器在层 2，不能反过来被它 import；这里只定义结构相同的接口。

import type { Atom } from 'jotai/vanilla';
import type { Store } from '../kit/store.ts';

export interface BackgroundClock {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
}

/** 隐藏时的重排间隔：50 ms 是 20 Hz，与可见时的读数节奏一致。 */
export const BACKGROUND_CLOCK_INTERVAL_MS = 50;

export function backgroundFrameClock(
  store: Store,
  normal: Atom<boolean>,
  intervalMs: number = BACKGROUND_CLOCK_INTERVAL_MS,
): BackgroundClock {
  const pending = new Map<number, () => void>();
  let nextHandle = 1;
  return {
    request(callback) {
      const handle = nextHandle++;
      const hidden = typeof document !== 'undefined' && document.hidden;
      let cancel: () => void;
      if (hidden && store.get(normal)) {
        const timer = setTimeout(() => {
          pending.delete(handle);
          callback(performance.now());
        }, intervalMs);
        cancel = () => clearTimeout(timer);
      } else {
        const frame = requestAnimationFrame((now) => {
          pending.delete(handle);
          callback(now);
        });
        cancel = () => cancelAnimationFrame(frame);
      }
      pending.set(handle, cancel);
      return handle;
    },
    cancel(handle) {
      const cancel = pending.get(handle);
      if (!cancel) return;
      pending.delete(handle);
      cancel();
    },
  };
}
