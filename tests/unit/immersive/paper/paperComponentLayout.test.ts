import { describe, expect, it } from 'vitest';
import {
  cardTops,
  stageRightBoxes,
  stageRightTops,
} from '../../../../src/immersive/paper/paperComponentLayout.ts';

const none = new Set<string>();

describe('full 舞台右栏重排', () => {
  it('全部可见时就是现有舞台坐标', () => {
    expect(stageRightTops('paper', 'full', none)).toEqual({
      header: 82,
      meter: 296,
      spectrum: 457,
      waveform: 705,
      media: 828,
      gauges: 828,
      fileInfo: 828,
      lyrics: 964,
    });
    expect(stageRightTops('focus', 'full', none)).toEqual({
      header: 82,
      meter: 296,
      spectrum: null,
      waveform: 460,
      media: 552,
      gauges: 552,
      fileInfo: 552,
      lyrics: 700,
    });
    expect(stageRightTops('lyrics', 'full', none)).toMatchObject({
      header: 82,
      lyrics: 300,
    });
    expect(stageRightTops('cardLyrics', 'full', none)).toMatchObject({
      header: null,
      lyrics: 300,
    });
  });

  it('隐藏 header / spectrum / 媒体行后，后面的块上移', () => {
    expect(stageRightTops('paper', 'full', new Set(['right.header']))).toMatchObject({
      meter: 82,
      spectrum: 243,
      waveform: 491,
      media: 614,
      lyrics: 750,
    });
    expect(stageRightTops('paper', 'full', new Set(['right.spectrum']))).toMatchObject({
      meter: 296,
      waveform: 481,
      media: 604,
      lyrics: 740,
    });
    expect(
      stageRightTops('paper', 'full', new Set(['right.gauges', 'right.fileInfo'])),
    ).toMatchObject({
      waveform: 705,
      media: null,
      lyrics: 848,
    });
  });

  it('只留一个媒体模块时按它的高度收带', () => {
    expect(stageRightTops('paper', 'full', new Set(['right.fileInfo']))).toMatchObject({
      gauges: 828,
      media: 828,
      lyrics: 948,
    });
    expect(stageRightTops('paper', 'full', new Set(['right.gauges']))).toMatchObject({
      fileInfo: 828,
      lyrics: 964,
    });
  });

  it('藏掉四行字里的一个叶子：那一行收掉，后面的跟着上移', () => {
    const boxes = stageRightBoxes('paper', 'full', new Set(['right.header.title']));
    // From 行 82、标题行 108、By 行 222：藏掉标题行，它收成 0，By 行上移到 108。
    expect(boxes.get('right.header.from')?.y).toBe(82);
    expect(boxes.get('right.header.title')).toBeUndefined();
    expect(boxes.get('right.header.by')?.y).toBe(108);
    // 仪表行跟着上移一个标题行的高（114）。
    expect(boxes.get('right.meter.stereo')?.y).toBe(182);
    expect(boxes.get('right.spectrum')?.y).toBe(343);
  });

  it('藏掉 From 行：标题行上移，下面各行跟着走', () => {
    const boxes = stageRightBoxes('paper', 'full', new Set(['right.header.from']));
    expect(boxes.get('right.header.from')).toBeUndefined();
    expect(boxes.get('right.header.title')?.y).toBe(82);
    expect(boxes.get('right.header.by')?.y).toBe(196);
    expect(boxes.get('right.meter.stereo')?.y).toBe(270);
  });

  it('藏掉仪表行里的一格：后面的横向跟着左移，不留空当', () => {
    const all = stageRightBoxes('paper', 'full', none);
    expect(all.get('right.meter.stereo')?.x).toBe(760);
    expect(all.get('right.meter.bpm')?.x).toBe(1140);
    expect(all.get('right.meter.soundPressure')?.x).toBe(1336);
    expect(all.get('right.meter.albumArtist')?.x).toBe(1336);

    const noBpm = stageRightBoxes('paper', 'full', new Set(['right.meter.bpm']));
    expect(noBpm.get('right.meter.stereo')?.x).toBe(760);
    // 声压格接着声场格排：760 + 332 + 48 = 1140。
    expect(noBpm.get('right.meter.soundPressure')?.x).toBe(1140);
    expect(noBpm.get('right.meter.albumArtist')?.x).toBe(1140);
  });

  it('藏掉仪表行：整行收掉，下面的块上移', () => {
    const boxes = stageRightBoxes('paper', 'full', new Set(['right.meter']));
    expect(boxes.get('right.meter.stereo')).toBeUndefined();
    expect(boxes.get('right.spectrum')?.y).toBe(302);
  });
});

describe('卡片左区纵向流', () => {
  it('全部可见时保持原坐标', () => {
    expect(cardTops('card', none)).toEqual({
      cover: 220,
      meta: 700,
      seek: 766,
      transport: 806,
      cells: 930,
      top: 220,
      bottom: 978,
    });
    expect(cardTops('cardLyrics', none)).toEqual({
      cover: 220,
      meta: 700,
      seek: 766,
      transport: 806,
      cells: 930,
      top: 220,
      bottom: 978,
    });
  });

  it('隐藏封面/进度/传输后其余上移，边界跟着可见模块走', () => {
    expect(cardTops('card', new Set(['card.cover']))).toEqual({
      cover: null,
      meta: 220,
      seek: 286,
      transport: 326,
      cells: 450,
      top: 220,
      bottom: 498,
    });
    expect(cardTops('card', new Set(['card.seek']))).toMatchObject({
      transport: 766,
      cells: 890,
    });
    expect(cardTops('card', new Set(['card.transport']))).toMatchObject({
      seek: 766,
      cells: 806,
    });
  });

  it('卡片歌词隐藏标题/动作时收缩标题带', () => {
    expect(cardTops('cardLyrics', new Set(['card.title']))).toMatchObject({
      meta: 700,
      seek: 740,
    });
    expect(
      cardTops('cardLyrics', new Set(['card.title', 'card.rating', 'card.more'])),
    ).toMatchObject({
      meta: null,
      seek: 700,
      transport: 740,
      cells: 864,
    });
  });
});
