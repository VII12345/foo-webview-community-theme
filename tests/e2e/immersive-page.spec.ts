import { expect, test } from '@playwright/test';
import { openImmersive } from '../fixtures/immersivePage.ts';
import { PLAYING_TRACK } from '../fixtures/playerPage.ts';

// 正在播放全屏页的进出与舞台上的字：盖住整窗、曲目字段写出来，Esc 与胶囊都是后退。

test('歌词视图去掉白框与框内元素，只留歌词占原白框范围', async ({ page }) => {
  const { view, errors } = await openImmersive(page, {
    onHost(host) {
      host.answer('lyrics.get', {
        success: true,
        available: true,
        source: 'embedded',
        path: '',
        lyrics: '[00:40]沉浸歌词第一句\n[00:45]沉浸歌词第二句',
        synced: true,
      });
    },
  });
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '歌词视图', exact: true }).click();
  await expect(view.locator('[data-tier][data-scene="lyrics"]')).toBeVisible();
  // 白框外的场景元素保留。
  await expect(view.locator('[data-paper-content]')).toHaveCount(1);
  await expect(view.locator('[data-dial-cover]')).toBeVisible();
  await expect(view.locator('[data-field="title"]')).toBeVisible();
  await expect(view.locator('[data-field="artist"]')).toBeVisible();
  // 白框与框内信息全部去掉。
  await expect(view.locator('[data-pad]')).toHaveCount(0);
  await expect(view.locator('[data-field-slot="spectrum"]')).toHaveCount(0);
  await expect(view.locator('[data-field="genre"]')).toHaveCount(0);
  await expect(view.locator('[data-field="soundPressure"]')).toHaveCount(0);
  await expect(view.locator('[data-field="duration"]')).toHaveCount(0);
  await expect(view.locator('[data-field="loudness"]')).toBeHidden();
  // 歌词在，且占着原白框的位置（不是屏幕中央、也不是底部条）。
  const player = view.locator('.amll-lyric-player');
  await expect(player).toBeVisible();
  await expect(player).toContainText('沉浸歌词第一句');
  await expect(player).toContainText('沉浸歌词第二句');
  expect(errors).toStrictEqual([]);
});

test('歌词视图在紧凑档不铺满右栏、不盖住标题', async ({ page }) => {
  const { view, errors } = await openImmersive(page, {
    width: 1000,
    state: { track: { ...PLAYING_TRACK } },
    onHost(host) {
      host.answer('lyrics.get', {
        success: true,
        available: true,
        source: 'embedded',
        path: '',
        lyrics: '[00:40]紧凑档歌词一句\n[00:45]紧凑档歌词二句',
        synced: true,
      });
    },
  });
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '歌词视图', exact: true }).click();
  await expect(view.locator('[data-paper-content]')).toHaveCount(1);
  await expect(view.locator('[data-field="title"]')).toBeVisible();
  await expect(view.locator('.amll-lyric-player')).toBeVisible();
  // 播放器顶部不能高过标题底部——紧凑档里它是右栏下半，不盖标题。
  const title = await view.locator('[data-field="title"]').boundingBox();
  const player = await view.locator('.amll-lyric-player').boundingBox();
  expect(title && player && player.y >= title.y + title.height - 1).toBe(true);
  expect(errors).toStrictEqual([]);
});
test('右上角切换键鼠标点过不留焦点框，键盘聚焦才显示', async ({ page }) => {
  const { view, errors } = await openImmersive(page);
  const trigger = view.getByRole('button', { name: '沉浸视图', exact: true });
  await trigger.click();
  await page.getByRole('menuitemradio', { name: '聚焦视图', exact: true }).click();
  // 鼠标走完一圈后焦点回到触发键上，但不该有焦点框：outline-style 与 Fluent 的 ::after 环都不出现。
  const mouseRing = await trigger.evaluate((node) => ({
    outline: getComputedStyle(node).outlineStyle,
    after: getComputedStyle(node, '::after').display,
    keyVisible: node.matches(':focus-visible'),
  }));
  expect(mouseRing.keyVisible).toBe(false);
  expect(mouseRing.outline).toBe('none');
  expect(mouseRing.after).toBe('none');
  // 键盘聚焦时仍要能看到轴点。
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const keyRing = await trigger.evaluate((node) => ({
    outline: getComputedStyle(node).outlineStyle,
    keyVisible: node.matches(':focus-visible'),
  }));
  expect(keyRing.keyVisible).toBe(true);
  expect(keyRing.outline).not.toBe('none');
  expect(errors).toStrictEqual([]);
});
test('右上角可以切换聚焦视图，隐藏频谱并保持原图纸视图可恢复', async ({ page }) => {
  const { view, errors } = await openImmersive(page, {
    onHost(host) {
      host.answer('lyrics.get', {
        success: true,
        available: true,
        source: 'embedded',
        path: '',
        lyrics: '[00:40]聚焦第一句',
        synced: true,
      });
    },
  });
  await expect(view.locator('[data-tier][data-scene="paper"]')).toBeVisible();
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '聚焦视图', exact: true }).click();
  const focus = view.locator('[data-tier][data-scene="focus"]');
  await expect(focus).toBeVisible();
  await expect(view.locator('[data-field-slot="spectrum"]')).toHaveCount(0);
  // 只去掉频谱柱；垫纸、四行字、仪表、波形、量表与文件信息都要留着。
  await expect(focus.locator('[data-pad]')).toHaveCount(1);
  await expect(view.locator('[data-field="title"]')).toBeVisible();
  await expect(view.locator('[data-field="soundPressure"]')).toBeVisible();
  await expect(view.locator('[data-field="duration"]')).toBeVisible();
  await expect(view.locator('[data-field="playhead"]')).toBeVisible();
  await expect(view.locator('[data-field="dynamicRange"]')).toBeVisible();
  await expect(view.locator('[data-field="sampleRate"]')).toBeVisible();
  // 歌词在右栏底部，不压在量表上。
  const lyrics = view.locator('[data-focus-lyrics]');
  await expect(lyrics).toBeVisible();
  const boxes = await Promise.all([
    lyrics.boundingBox(),
    view.locator('[data-field="loudness"]').boundingBox(),
  ]);
  const [lyricBox, loudnessBox] = boxes;
  if (!lyricBox || !loudnessBox) throw new Error('聚焦视图的元素不可见');
  expect(lyricBox.y).toBeGreaterThanOrEqual(loudnessBox.y + loudnessBox.height);
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '图纸舞台', exact: true }).click();
  await expect(view.locator('[data-tier][data-scene="paper"]')).toBeVisible();
  await expect(view.locator('[data-field-slot="spectrum"]')).toHaveCount(1);
  expect(errors).toStrictEqual([]);
});
test('歌词视图在 full 与紧凑档的屏幕字号一致，不随舞台缩放变小', async ({ page }) => {
  const { view, errors } = await openImmersive(page, {
    onHost(host) {
      host.answer('lyrics.get', {
        success: true,
        available: true,
        source: 'embedded',
        path: '',
        lyrics: '[00:01]字号第一句\n[00:03]字号第二句',
        synced: true,
      });
    },
  });
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '歌词视图', exact: true }).click();
  const screenFont = async () =>
    view.locator('.amll-lyric-player').evaluate((element) => {
      const stage = element.closest('[data-paper-content]');
      const width = stage?.getBoundingClientRect().width ?? 1920;
      const tier = element.closest('[data-tier]')?.getAttribute('data-tier');
      const scale = tier === 'full' ? width / 1920 : 1;
      return { stage: parseFloat(getComputedStyle(element).fontSize), scale };
    });
  const full = await screenFont();
  expect(full.stage * full.scale).toBeCloseTo(22, 0);

  await page.setViewportSize({ width: 900, height: 700 });
  await expect(view.locator('[data-tier]')).toHaveAttribute('data-tier', 'compact');
  const compact = await screenFont();
  expect(compact.scale).toBe(1);
  expect(compact.stage).toBeCloseTo(22, 0);

  for (const label of ['卡片视图', '卡片歌词']) {
    await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
    await page.getByRole('menuitemradio', { name: label, exact: true }).click();
    await expect(view.locator('.amll-lyric-player')).toContainText('字号第一句');
    const card = await screenFont();
    expect(card.stage * card.scale).toBeCloseTo(22, 0);
  }
  expect(errors).toStrictEqual([]);
});

test('歌词视图左区罗盘在左半区居中，图纸/聚焦仍在原位', async ({ page }) => {
  const { view, errors } = await openImmersive(page);
  const center = () =>
    view.locator('[data-dial-cover]').evaluate((element) => {
      const stage = element.closest('[data-paper-content]');
      if (!stage) throw new Error('罗盘不在舞台上');
      const stageRect = stage.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const scale = stageRect.width / 1920;
      return Math.round((rect.left + rect.width / 2 - stageRect.left) / scale);
    });
  expect(await center()).toBe(380);
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '歌词视图', exact: true }).click();
  await expect.poll(center).toBe(480);
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '聚焦视图', exact: true }).click();
  expect(await center()).toBe(380);
  expect(errors).toStrictEqual([]);
});

test('卡片两档的播放键透明，图纸/聚焦仍是实心', async ({ page }) => {
  const { view, errors } = await openImmersive(page);
  const background = () =>
    view
      .getByRole('group', { name: '播放控制' })
      .getByRole('button', { name: /^(暂停|播放)$/ })
      .evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(await background()).not.toBe('rgba(0, 0, 0, 0)');
  for (const label of ['卡片视图', '卡片歌词']) {
    await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
    await page.getByRole('menuitemradio', { name: label, exact: true }).click();
    expect(await background()).toBe('rgba(0, 0, 0, 0)');
    const group = view.getByRole('group', { name: '播放控制' });
    const play = group.getByRole('button', { name: /^(暂停|播放)$/ });
    expect(await play.getAttribute('data-play-glyph')).toMatch(/outline/);
    for (const name of ['上一首', '下一首', '播放顺序：默认', '音量与输出设备']) {
      const button = group.getByRole('button', { name, exact: true });
      expect(
        await button.evaluate((node) => getComputedStyle(node).borderTopColor),
      ).toBe('rgba(0, 0, 0, 0)');
    }
  }
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '图纸舞台', exact: true }).click();
  expect(await background()).not.toBe('rgba(0, 0, 0, 0)');
  expect(errors).toStrictEqual([]);
});

test('卡片视图：左区换成方封面卡片，背景与右栏四行字照旧；原视图仍在', async ({ page }) => {
  const { view, errors } = await openImmersive(page, {
    onHost(host) {
      host.answer('lyrics.get', {
        success: true,
        available: true,
        source: 'embedded',
        path: '',
        lyrics: '[00:40]卡片视图第一句',
        synced: true,
      });
    },
  });
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '卡片视图', exact: true }).click();
  await expect(view.locator('[data-tier][data-scene="card"]')).toBeVisible();
  // 左区：方封面、星级、进度条与播放控制都在，罗盘组不在。
  await expect(view.locator('[data-dial-cover]')).toBeVisible();
  await expect(view.locator('[data-now-playing-rating]')).toBeVisible();
  await expect(view.locator('[data-card-seek]')).toBeVisible();
  await expect(view.locator('[data-card-seek]').getByRole('slider', { name: '播放进度' })).toBeVisible();
  await expect(view.getByRole('group', { name: '播放控制' })).toBeVisible();
  // 卡片下面的三格照旧。
  await expect(view.locator('[data-field="date"]')).toBeVisible();
  await expect(view.locator('[data-field="label"]')).toBeVisible();
  // 罗盘组（三圈实线环、转动层、刻度字）不在。
  await expect(view.locator('[data-scene="card"] [data-dial-ring]')).toHaveCount(0);
  await expect(view.locator('canvas[data-orbit]')).toHaveCount(0);
  // 背景与装饰照旧，右栏四行字也照旧；卡片不自带曲名/艺人，避免与右栏重复。
  await expect(view.locator('[data-paper-content]')).toHaveCount(1);
  await expect(view.locator('[data-field="title"]')).toHaveText(PLAYING_TRACK.title);
  await expect(view.locator('[data-field="artist"]')).toHaveText(PLAYING_TRACK.artist);
  await expect(view.locator('[data-card-text]')).toHaveCount(0);
  // 右半是动画歌词（与歌词视图一致），不是仪表与波形。
  await expect(view.locator('.amll-lyric-player')).toBeVisible();
  await expect(view.locator('[data-field-slot="spectrum"]')).toHaveCount(0);
  // 原视图仍可切回。
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '图纸舞台', exact: true }).click();
  await expect(view.locator('[data-tier][data-scene="paper"]')).toBeVisible();
  expect(errors).toStrictEqual([]);
});

test('卡片两档的播放键组：顺序在上一首左、音量在下一首右；聚焦与图纸不加这两颗', async ({
  page,
}) => {
  const { view, errors } = await openImmersive(page);
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '卡片视图', exact: true }).click();
  const transport = view.getByRole('group', { name: '播放控制' });
  await expect(transport.locator('[data-player-key="order"]')).toBeVisible();
  await expect(transport.locator('[data-player-key="volume"]')).toBeVisible();
  const order = await transport.evaluate((group) =>
    [...group.querySelectorAll('button')].map(
      (button) => button.getAttribute('data-player-key') ?? button.getAttribute('aria-label'),
    ),
  );
  expect(order).toEqual(['order', '上一首', '暂停', '下一首', 'volume']);
  const geometry = await transport.evaluate((group) => ({
    left: group.offsetLeft,
    width: group.offsetWidth,
  }));
  // 五颗键 56×4 + 80 + 4×8 = 336；左缘 312，中心落在封面中线 480。
  expect(geometry).toEqual({ left: 312, width: 336 });

  // 卡片歌词档共用同一组键，也按同一中线居中。
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '卡片歌词', exact: true }).click();
  const lyricsCard = view.getByRole('group', { name: '播放控制' });
  await expect(lyricsCard.locator('[data-player-key="order"]')).toBeVisible();
  await expect(lyricsCard.locator('[data-player-key="volume"]')).toBeVisible();
  expect(
    await lyricsCard.evaluate((group) => ({
      left: group.offsetLeft,
      width: group.offsetWidth,
    })),
  ).toEqual({ left: 312, width: 336 });

  for (const label of ['聚焦视图', '图纸舞台']) {
    await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
    await page.getByRole('menuitemradio', { name: label, exact: true }).click();
    const plain = view.getByRole('group', { name: '播放控制' });
    await expect(plain.locator('[data-player-key="order"]')).toHaveCount(0);
    await expect(plain.locator('[data-player-key="volume"]')).toHaveCount(0);
  }
  expect(errors).toStrictEqual([]);
});

test('卡片左区文字、进度、星级与更多按钮放大，且不压住进度条', async ({ page }) => {
  const { view, errors } = await openImmersive(page);
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '卡片歌词', exact: true }).click();
  const title = view.locator('[data-field="cardTitle"]');
  const artist = view.locator('[data-field="cardArtist"]');
  const typography = await Promise.all([
    title.evaluate((node) => {
      const style = getComputedStyle(node);
      return { size: style.fontSize, line: style.lineHeight };
    }),
    artist.evaluate((node) => {
      const style = getComputedStyle(node);
      return { size: style.fontSize, line: style.lineHeight };
    }),
  ]);
  expect(typography).toEqual([
    { size: '30px', line: '36px' },
    { size: '20px', line: '24px' },
  ]);
  const seek = view.locator('[data-card-seek]');
  expect(
    await seek.locator('[data-seek-fill]').evaluate((fill) => fill.parentElement?.offsetHeight),
  ).toBe(6);
  expect(await seek.locator('[data-seek-thumb]').evaluate((node) => node.offsetWidth)).toBe(16);
  expect(
    await seek.locator('[data-seek-clock]').first().evaluate((node) => getComputedStyle(node).fontSize),
  ).toBe('14px');
  expect(
    await view.locator('[data-now-playing-rating] span').first().evaluate((node) => {
      const style = getComputedStyle(node);
      return { width: style.width, height: style.height };
    }),
  ).toEqual({ width: '18px', height: '18px' });
  const more = view.getByRole('button', { name: '更多', exact: true });
  expect(await more.evaluate((node) => node.offsetHeight)).toBe(40);
  expect(await view.locator('[data-decor-guard="24"]').evaluate((node) => node.offsetLeft)).toBe(250);
  const titleBox = await view.locator('[data-card-text]').boundingBox();
  const seekBox = await seek.boundingBox();
  expect(titleBox && seekBox && titleBox.y + titleBox.height <= seekBox.y).toBe(true);
  expect(errors).toStrictEqual([]);
});

test('卡片视图在紧凑档也按 full 舞台排、整体缩小，不退回落盘', async ({ page }) => {
  // 用户平时的窗口约 1275 宽，以前落 compact 档、卡片根本不出现。
  const { view, errors } = await openImmersive(page, { width: 1275 });
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '卡片视图', exact: true }).click();
  await expect(view.locator('[data-tier="full"][data-scene="card"]')).toBeVisible();
  await expect(view.locator('[data-dial-cover]')).toBeVisible();
  await expect(view.locator('[data-card-seek]')).toBeVisible();
  await expect(view.locator('[data-scene="card"] [data-dial-ring]')).toHaveCount(0);
  expect(errors).toStrictEqual([]);
});

test('歌词一律排在右半靠左五分之一处，左对齐', async ({ page }) => {
  const { view, errors } = await openImmersive(page, {
    onHost(host) {
      host.answer('lyrics.get', {
        success: true,
        available: true,
        source: 'embedded',
        path: '',
        lyrics: '[00:40]右半第一句',
        synced: true,
      });
    },
  });
  for (const label of ['歌词视图', '卡片视图', '卡片歌词']) {
    await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
    await page.getByRole('menuitemradio', { name: label, exact: true }).click();
    const pane = view.locator('[data-immersive-lyrics-player]');
    await expect(pane).toBeVisible();
    await expect(pane.locator('.amll-lyric-player')).toContainText('右半第一句');
    const box = await pane.evaluate((element) => {
      const stage = element.closest('[data-paper-content]');
      if (!stage) throw new Error('歌词不在舞台上');
      const stageRect = stage.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const scale = stageRect.width / 1920;
      const row = element.querySelector('[class*="lyricLineWrapper"]');
      const rowRect = row?.getBoundingClientRect();
      return {
        left: Math.round((rect.left - stageRect.left) / scale),
        right: Math.round((rect.right - stageRect.left) / scale),
        // 行盒的左缘贴着容器左缘 = 左对齐（居中的话会留出一大截空白）。
        rowInset: rowRect ? Math.round(rowRect.left - rect.left) : null,
        // AMLL 默认 1em 行内边距；full 舞台要去掉，文字实际左缘贴住容器。
        textInset: (() => {
          const line = element.querySelector('[class*="lyricMainLine"]');
          if (!line) return null;
          const range = document.createRange();
          range.selectNodeContents(line);
          return Math.round((range.getBoundingClientRect().left - rect.left) / scale);
        })(),
      };
    });
    // 舞台左缘 1152（右半 960–1920 靠左五分之一处），右缘不超过舞台。
    expect(box.left).toBe(1152);
    expect(box.right).toBeLessThanOrEqual(1920);
    expect(box.rowInset).toBeLessThan(4);
    expect(box.textInset ?? 999).toBeLessThan(4);
  }
  expect(errors).toStrictEqual([]);
});

test('当前行主行使用强调色，其他行保持中性', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('default-theme.immersive.textBoost.v1', '0'),
  );
  const { view, host, state, errors } = await openImmersive(page, {
    onHost(host) {
      host.answer('lyrics.get', {
        success: true,
        available: true,
        source: 'embedded',
        path: '',
        lyrics: '[00:00]第一句字\n[00:05]第二句字',
        synced: true,
      });
    },
  });
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '歌词视图', exact: true }).click();
  state.position = 1;
  host.emit('playback:seeked', { hostTime: Date.now(), position: 1 });
  const player = view.locator('.amll-lyric-player');
  await expect(player).toContainText('第一句字');
  const colors = await player.evaluate((root) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent)';
    root.appendChild(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    const active = root.querySelector('[class*="lyricMainLine"][class*="_active"]');
    const others = [...root.querySelectorAll('[class*="lyricMainLine"]')].filter(
      (line) => line !== active,
    );
    return {
      accent,
      active: active ? getComputedStyle(active).color : null,
      others: others.map((line) => getComputedStyle(line).color),
    };
  });
  expect(colors.active).toBe(colors.accent);
  expect(colors.others.length).toBeGreaterThan(0);
  expect(colors.others.every((color) => color !== colors.accent)).toBe(true);
  expect(errors).toStrictEqual([]);
});

test('卡片歌词：左区卡片带曲名/艺人，右栏四行字删掉、动画歌词保留', async ({ page }) => {
  const { view, errors } = await openImmersive(page, {
    onHost(host) {
      host.answer('lyrics.get', {
        success: true,
        available: true,
        source: 'embedded',
        path: '',
        lyrics: '[00:40]卡片歌词第一句\n[00:45]卡片歌词第二句',
        synced: true,
      });
    },
  });
  await view.getByRole('button', { name: '沉浸视图', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '卡片歌词', exact: true }).click();
  await expect(view.locator('[data-tier][data-scene="cardLyrics"]')).toBeVisible();
  // 左区卡片：方封面、星级、进度条、播放控制与曲名/艺人。
  await expect(view.locator('[data-dial-cover]')).toBeVisible();
  await expect(view.locator('[data-now-playing-rating]')).toBeVisible();
  await expect(view.locator('[data-card-seek]').getByRole('slider', { name: '播放进度' })).toBeVisible();
  await expect(view.getByRole('group', { name: '播放控制' })).toBeVisible();
  await expect(view.locator('[data-field="cardTitle"]')).toHaveText(PLAYING_TRACK.title);
  await expect(view.locator('[data-field="cardArtist"]')).toHaveText(PLAYING_TRACK.artist);
  // 右栏四行字全删。
  await expect(view.locator('[data-field="title"]')).toHaveCount(0);
  await expect(view.locator('[data-field="artist"]')).toHaveCount(0);
  await expect(view.locator('[data-field="album"]')).toHaveCount(0);
  await expect(view.locator('[data-field="quality"]')).toHaveCount(0);
  // 右栏的动画歌词保留，上下边界与左区卡片一致（220–978）。
  const player = view.locator('.amll-lyric-player');
  await expect(player).toBeVisible();
  await expect(player).toContainText('卡片歌词第一句');
  const geometry = await view
    .locator('[data-immersive-lyrics-player]')
    .evaluate((element) => {
      const stage = element.closest('[data-paper-content]');
      if (!stage) throw new Error('歌词不在舞台上');
      const stageRect = stage.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const scale = stageRect.width / 1920;
      return {
        top: Math.round((rect.top - stageRect.top) / scale),
        bottom: Math.round((rect.bottom - stageRect.top) / scale),
      };
    });
  const line = await view.locator('.amll-lyric-player').evaluate((element) => {
    const value = getComputedStyle(element).getPropertyValue('--amll-lp-font-size');
    return Math.round(Number.parseFloat(value) * 1.2);
  });
  // 卡片歌词上下各多留一行：220−line 到 978+line。
  expect(Math.abs(geometry.top - (220 - line))).toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.bottom - (978 + line))).toBeLessThanOrEqual(2);
  // 白框、频谱、波形与量表都不在（同歌词视图）。
  await expect(view.locator('[data-pad]')).toHaveCount(0);
  await expect(view.locator('[data-field-slot="spectrum"]')).toHaveCount(0);
  await expect(view.locator('canvas[data-orbit]')).toHaveCount(0);
  expect(errors).toStrictEqual([]);
});

test('走到正在播放：整窗盖住，舞台写出曲名与艺术家，焦点收进这一层', async ({ page }) => {
  const { view, errors } = await openImmersive(page);
  await expect(view.locator('[data-field="title"]')).toHaveText(PLAYING_TRACK.title);
  await expect(view.locator('[data-field="artist"]')).toHaveText(PLAYING_TRACK.artist);
  // 进场过渡由小放大，播完才是整窗大小。
  await expect
    .poll(() => view.boundingBox())
    .toStrictEqual({ x: 0, y: 0, width: 1280, height: 800 });
  await expect(view).toBeFocused();
  expect(errors).toStrictEqual([]);
});

test('canvas 件都挂上：山脊图、网格、转动层、声场图、频谱柱与整轨波形，挂载与首帧不报错', async ({
  page,
}) => {
  const { view, errors } = await openImmersive(page);
  await expect(view.locator('[data-terrain] canvas')).toHaveCount(1);
  // 网格、转动层、声场图、频谱柱、整轨波形各一块，山脊图一块，封面底色没有源图时不挂。
  await expect.poll(() => view.locator('canvas').count()).toBeGreaterThanOrEqual(6);
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
  expect(errors).toStrictEqual([]);
});

test('Esc 后退：这一层退场移走，回到进来前的页面', async ({ page }) => {
  const { view, errors } = await openImmersive(page);
  await page.keyboard.press('Escape');
  await expect(view).toHaveCount(0);
  await expect(page.locator('[data-page="albums"]')).toBeVisible();
  expect(errors).toStrictEqual([]);
});

test('右上的 Esc 胶囊与按 Esc 一样是后退', async ({ page }) => {
  const { view } = await openImmersive(page);
  await view.getByRole('button', { name: '退出沉浸' }).click();
  await expect(view).toHaveCount(0);
});

test('空格经命令登记处切一次播放 / 暂停', async ({ page }) => {
  const { calls } = await openImmersive(page);
  await page.keyboard.press(' ');
  await expect.poll(() => calls('playback.playOrPause').length).toBe(1);
  // 再走一轮到宿主的往返，同一次按键若被接手两次，第二次这时也到了。
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(calls('playback.playOrPause')).toHaveLength(1);
});

test('Tab 只在这一层里转，不落到底下被盖住的键上', async ({ page }) => {
  const { view } = await openImmersive(page);
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press('Tab');
    const inside = await view.evaluate((root) => root.contains(document.activeElement));
    expect(inside, `第 ${step + 1} 次 Tab`).toBe(true);
  }
});
