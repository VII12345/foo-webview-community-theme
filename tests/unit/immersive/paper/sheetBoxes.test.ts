import { describe, expect, it } from 'vitest';
import { sheetBoxes } from '../../../../src/immersive/paper/paperComponentLayout.ts';

const none = new Set<string>();

describe('版心右栏的盒子', () => {
  it('紧凑档：块依次排下去，歌词吃掉剩下的', () => {
    const boxes = sheetBoxes('compact', none);
    // 版心 1136 × 700，右栏在 (512, 16) 宽 600。
    expect(boxes.get('right.header.from')).toEqual({ x: 512, y: 16, w: 600, h: 14 });
    expect(boxes.get('right.header.title')).toEqual({ x: 512, y: 40, w: 600, h: 58 });
    expect(boxes.get('right.header.by')).toEqual({ x: 512, y: 98, w: 600, h: 52 });
    // 分隔线 1，元数据行 113、频谱 132、波形 110。
    expect(boxes.get('right.meta')?.y).toBe(159);
    expect(boxes.get('right.spectrum')?.y).toBe(272);
    expect(boxes.get('right.waveform')?.y).toBe(404);
    // 量表与文件信息同一行里并排。
    expect(boxes.get('right.gauges')).toEqual({ x: 512, y: 514, w: 312, h: 80 });
    expect(boxes.get('right.fileInfo')).toEqual({ x: 824, y: 514, w: 288, h: 80 });
    expect(boxes.get('right.footnote')?.y).toBe(594);
    // 歌词吃掉剩下的：700 − 602。
    expect(boxes.get('right.lyrics')).toEqual({ x: 512, y: 602, w: 600, h: 98 });
  });

  it('窄档：只剩频谱、波形与歌词', () => {
    const boxes = sheetBoxes('narrow', none);
    expect(boxes.has('right.meta')).toBe(false);
    expect(boxes.has('right.gauges')).toBe(false);
    expect(boxes.has('right.footnote')).toBe(false);
    expect(boxes.get('right.spectrum')?.h).toBe(132);
    // 窄档右栏从 208 起：四行字 143 + 分隔线 1 → 频谱在 352，波形在 484。
    expect(boxes.get('right.waveform')?.y).toBe(483);
  });

  it('藏掉一块，后面的跟着上移，不留空白', () => {
    const boxes = sheetBoxes('compact', new Set(['right.spectrum']));
    expect(boxes.has('right.spectrum')).toBe(false);
    // 频谱那一块（132 高）收掉，波形跟着上来。
    expect(boxes.get('right.waveform')?.y).toBe(272);
    expect(boxes.get('right.gauges')?.y).toBe(382);
  });

  it('藏掉标题，标题行收掉，后面的跟着上移', () => {
    const boxes = sheetBoxes('compact', new Set(['right.header.title']));
    expect(boxes.has('right.header.title')).toBe(false);
    // 标题行 58 高收掉。
    expect(boxes.get('right.header.by')?.y).toBe(40);
    expect(boxes.get('right.meta')?.y).toBe(101);
  });

  it('罗盘那几件也有盒子（版心坐标）', () => {
    const boxes = sheetBoxes('compact', none);
    expect(boxes.get('dial.cover')).toBeDefined();
    expect(boxes.get('dial.transport')).toBeDefined();
    expect(boxes.get('dial.rings')).toBeDefined();
  });
});
