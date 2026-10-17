import { expect, test, type Page } from '@playwright/test';
import { openPlayer, PLAYING_TRACK } from '../fixtures/playerPage.ts';
import type { PageHost } from '../fixtures/pageHost.ts';

const RECOVERY_KEY = 'defaultTheme.playback.recovery';
const GUID = '{11111111-1111-1111-1111-111111111111}';
const RECORD = {
  key: `${PLAYING_TRACK.path}|0`,
  handle: PLAYING_TRACK.handle,
  title: PLAYING_TRACK.title,
  artist: PLAYING_TRACK.artist,
  album: PLAYING_TRACK.album,
  duration: PLAYING_TRACK.duration,
  position: 73,
  playlistGuid: GUID,
  row: 4,
};

const bar = (page: Page) => page.locator('[data-player-bar]');

/** 恢复目标那一行仍属于这首歌。 */
function acceptRow(host: PageHost): void {
  host.answer('playlist.getTracks', (params) => ({
    success: true,
    playlist: 0,
    playlistGuid: GUID,
    start: Number(params['start'] ?? 0),
    count: 1,
    total: 10,
    tracks: [{ handle: PLAYING_TRACK.handle, index: 4 }],
  }));
}

test('没有当前曲目时底部播放栏常驻上次那一首，点播放按原列表行恢复并定位', async ({ page }) => {
  let loaded = false;
  const player = await openPlayer(page, {
    state: { state: 'stopped', track: null, position: 0 },
    config: { [RECOVERY_KEY]: RECORD },
    onHost(host) {
      acceptRow(host);
    },
  });
  // openPlayer 装完自己的缺省应答后再换成「起播之后才装载」这一版。
  player.host.answer('playback.getCurrentTrack', () =>
    loaded ? { success: true, found: true, track: PLAYING_TRACK } : { success: true, found: false },
  );
  player.host.answer('playlist.playTrack', () => {
    loaded = true;
    return { success: true };
  });
  await expect(page.getByText(PLAYING_TRACK.title).first()).toBeVisible();
  await expect(bar(page)).toHaveAttribute('data-recovery', '');
  await bar(page).getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => player.calls('playlist.playTrack').length).toBe(1);
  expect(player.calls('playlist.playTrack')[0]).toMatchObject({ playlistGuid: GUID, index: 4 });
  await expect
    .poll(() => player.calls('playback.mute').map((call) => call['muted']))
    .toEqual([true, false]);
  await expect.poll(() => player.calls('playback.setPosition').length).toBe(1);
  expect(Number(player.calls('playback.setPosition')[0]?.['position'])).toBe(73);
  expect(player.errors).toEqual([]);
});

test('原记录没有播放列表行：恢复栏保留提示，点播放不往任何列表加歌', async ({ page }) => {
  const player = await openPlayer(page, {
    state: { state: 'stopped', track: null, position: 0 },
    config: { [RECOVERY_KEY]: { ...RECORD, playlistGuid: '', row: -1 } },
  });
  await expect(bar(page)).toHaveAttribute('data-recovery', '');
  await expect(bar(page)).toContainText('没有保存的播放列表位置');
  await bar(page).getByRole('button', { name: '播放', exact: true }).click();
  await expect(bar(page)).toContainText('没有保存的播放列表位置');
  expect(player.calls('playlist.playTrack')).toEqual([]);
  expect(player.calls('playback.playPath')).toEqual([]);
  expect(player.errors).toEqual([]);
});

test('原行已换成别的曲目：提示无法恢复，不改列表', async ({ page }) => {
  const player = await openPlayer(page, {
    state: { state: 'stopped', track: null, position: 0 },
    config: { [RECOVERY_KEY]: RECORD },
    onHost(host) {
      host.answer('playlist.getTracks', (params) => ({
        success: true,
        playlist: 0,
        playlistGuid: GUID,
        start: Number(params['start'] ?? 0),
        count: 1,
        total: 10,
        tracks: [{ handle: 'E:/Music/other.flac', index: 4 }],
      }));
    },
  });
  await bar(page).getByRole('button', { name: '播放', exact: true }).click();
  await expect(bar(page)).toContainText('已不是这首歌');
  expect(player.calls('playlist.playTrack')).toEqual([]);
  expect(player.errors).toEqual([]);
});

test('foobar 自己从头上次那首：第一次按播放先定位，再继续', async ({ page }) => {
  const player = await openPlayer(page, {
    state: { state: 'paused', track: PLAYING_TRACK, position: 3 },
    config: { [RECOVERY_KEY]: RECORD },
  });
  await expect(bar(page)).not.toHaveAttribute('data-recovery', '');
  await bar(page).getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => player.calls('playback.play').length).toBe(1);
  expect(Number(player.calls('playback.setPosition')[0]?.['position'])).toBe(73);
  expect(player.errors).toEqual([]);
});
