import { expect, test, type Locator, type Page } from '@playwright/test';
import { openImmersive, type ImmersivePage } from '../fixtures/immersivePage.ts';

// 封面底色那一层铺满整幅沉浸视图，它就是"整个界面"的背景。深色封面会把底色压暗、
// 整个界面跟着发暗，歌词贴在上面看不清；提亮把底色拉回纸面亮度附近，封面只留下颜色。
// 提亮程度按封面提取的颜色自适应：亮封面不受影响，深色档也不因为亮封面而失去对比。

const DARK_COVER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAfElEQVR4nO3PsQkAIBDAQEew+ML9J3UIi0MIZIDL2nO+bnFBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjQwHvEycAH9hMAuanuPjwAAAABJRU5ErkJggg==';
const BRIGHT_COVER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAX0lEQVR4nO3PMQ0AMAzAsPJHOwgFscOqFCNI5h03OuBXA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA9oC0FECpMKDuO0AAAAASUVORK5CYII=';

function useCover(page: Page, cover: string, lyrics?: string): Promise<ImmersivePage> {
  return openImmersive(page, {
    onHost(host) {
      host.answer('artwork.getFb2kUrlByPath', () => ({
        success: true,
        available: true,
        type: 'front',
        path: '',
        dataUrl: cover,
      }));
      host.answer('artwork.getAvailableArtwork', () => ({
        success: true,
        available: true,
        artworks: [{ type: 'front', source: 'embedded' }],
        sources: ['embedded'],
      }));
      if (lyrics)
        host.answer('lyrics.get', {
          success: true,
          available: true,
          source: 'embedded',
          path: '',
          lyrics,
          synced: true,
        });
    },
  });
}

async function open(
  page: Page,
  lift: number,
  cover = DARK_COVER,
  lyrics?: string,
): Promise<ImmersivePage> {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    'default-theme.immersive.scene.v1',
    'lyrics',
  ] as const);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    'default-theme.immersive.sceneLift.v1',
    String(lift),
  ] as const);
  // 静态档的底色画在 2D canvas 上，测试能直接取像素；流动档是 WebGL，读不回来。
  await page.addInitScript(() => localStorage.setItem('default-theme.immersive.wash.v1', 'static'));
  await page.addInitScript(() => localStorage.setItem('default-theme.color-mode.v1', 'light'));
  return useCover(page, cover, lyrics);
}

/** 线性亮度，Rec.709 加权；canvas 取样与 CSS 颜色解析都用这一套。 */
const lumaOfRgb = (red: number, green: number, blue: number): number => {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
};

/** 底色那一层的平均亮度：canvas 逐像素取样。 */
const washLumaOf = async (view: ImmersivePage['view']): Promise<number> => {
  const canvas = view.locator('[data-wash] canvas').first();
  // 画布的尺寸由 ResizeObserver 量出来，等它有尺寸再取像素。
  await expect
    .poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).width))
    .toBeGreaterThan(0);  return canvas.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('拿不到 2D 上下文');
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const linear = (channel: number) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    let sum = 0;
    for (let at = 0; at < data.length; at += 4) {
      sum +=
        0.2126 * linear(data[at] ?? 0) +
        0.7152 * linear(data[at + 1] ?? 0) +
        0.0722 * linear(data[at + 2] ?? 0);
    }
    return sum / (data.length / 4);
  });
};

/** 文字的实际颜色：解析成 sRGB 分量。 */
const colorOf = (locator: Locator): Promise<[number, number, number]> =>
  locator.evaluate((element) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('2D canvas is unavailable');
    context.fillStyle = getComputedStyle(element).color;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    return [red ?? 0, green ?? 0, blue ?? 0];
  });

const contrastOf = (first: number, second: number): number => {
  const high = Math.max(first, second);
  const low = Math.min(first, second);
  return (high + 0.05) / (low + 0.05);
};

const titleOf = (view: ImmersivePage['view']) => view.locator('[data-field="title"]').first();

test('深封面上提亮把整个界面拉亮，歌词与底色的对比度跟着上去', async ({ page, context }) => {
  const off = await open(page, 0);
  const offWash = await washLumaOf(off.view);
  const offTitle = await colorOf(titleOf(off.view));
  const offContrast = contrastOf(lumaOfRgb(...offTitle), offWash);

  const second = await context.newPage();
  const on = await open(second, 100);
  const onWash = await washLumaOf(on.view);
  const onTitle = await colorOf(titleOf(on.view));
  const onContrast = contrastOf(lumaOfRgb(...onTitle), onWash);

  // 底色整体变亮。
  expect(onWash).toBeGreaterThan(offWash);
  // 文字仍是主题色（没有为了迁就背景被改过）。
  expect(onTitle).toStrictEqual(offTitle);
  // 文字与底色的对比度不降。
  expect(onContrast).toBeGreaterThanOrEqual(offContrast - 1e-6);
  expect(off.errors).toStrictEqual([]);
  expect(on.errors).toStrictEqual([]);
  await second.close();
});

test('亮封面几乎不受提亮影响', async ({ page, context }) => {
  const off = await open(page, 0, BRIGHT_COVER);
  const offWash = await washLumaOf(off.view);

  const second = await context.newPage();
  const on = await open(second, 100, BRIGHT_COVER);
  const onWash = await washLumaOf(on.view);

  expect(Math.abs(onWash - offWash)).toBeLessThan(0.05);
  expect(off.errors).toStrictEqual([]);
  expect(on.errors).toStrictEqual([]);
  await second.close();
});

test('提亮 0 时与旧样一致：底色亮度就是封面与纸面各占一半', async ({ page }) => {
  const { view, errors } = await open(page, 0);
  const wash = await washLumaOf(view);
  // 纸面（浅色档的纸染色）约 0.85、封面约 0.03，比例 0.5 → 约 0.44。
  expect(wash).toBeGreaterThan(0.3);
  expect(wash).toBeLessThan(0.55);
  expect(errors).toStrictEqual([]);
});

test('当前行强调色仍取强调色，不受提亮影响', async ({ page }) => {
  const LYRICS = '[00:01]第一句\n[00:30]当前句\n[00:45]下一句';
  const active = (view: ImmersivePage['view']) =>
    view.locator('[class*="_lyricMainLine"][class*="_active"]').first();
  const { view, errors } = await open(page, 100, DARK_COVER, LYRICS);
  await expect(active(view)).toBeVisible();
  const accent = await view
    .locator('[data-tier]')
    .first()
    .evaluate((element) => {
      const probe = document.createElement('span');
      probe.style.display = 'none';
      probe.style.color = 'var(--accent)';
      element.appendChild(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    });
  expect(await active(view).evaluate((element) => getComputedStyle(element).color)).toBe(accent);
  expect(errors).toStrictEqual([]);
});
