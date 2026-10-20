English | [中文](./README.zh-CN.md)

<p align="center">
  <img src=".github/assets/readme-banner.jpg" alt="Default Theme community edition: WinUI 3 design with a foobar2000 heart" width="100%" />
</p>

# foo-webview-community-theme · Community Edition

[![License](https://img.shields.io/badge/license-AGPL--3.0--only-blue)](LICENSE)
[![Release](https://img.shields.io/github/v/release/VII12345/foo-webview-community-theme)](https://github.com/VII12345/foo-webview-community-theme/releases)
[![foo_ui_webview2](https://img.shields.io/badge/foo__ui__webview2-2.0.0%2B-informational)](https://github.com/NereaFantasia/foo_ui_webview2)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-lightgrey)]()

> A community-enhanced fork of [NereaFantasia/foo-webview-default-theme](https://github.com/NereaFantasia/foo-webview-default-theme), based on upstream **0.2.0**. The original UI, page structure and updater are kept; the changes focus on playback, immersive views, lyrics, statistics and settings. See [CHANGES-SINCE-0.2.0.zh-CN.md](./CHANGES-SINCE-0.2.0.zh-CN.md) for the full item-by-item list.

---

## What it is

Default Theme is the default theme for [foo_ui_webview2](https://github.com/NereaFantasia/foo_ui_webview2), giving foobar2000 a WinUI 3 style standalone window. This fork continues from upstream 0.2.0 and is built with React 19, Fluent UI React v9, Jotai and Vite; every player action still goes through [foo-webview-sdk](https://www.npmjs.com/package/foo-webview-sdk).

- License: AGPL-3.0-only
- UI languages: Simplified Chinese, English
- Platform: Windows 10/11 **x64**; requires foobar2000 2.x and foo_ui_webview2 2.0.0+

## Differences from upstream

| Area | Upstream 0.2.0 | This fork |
|---|---|---|
| Immersive view | Paper stage, focus view | Five scenes: paper, focus, lyrics, card, card lyrics; per-element visibility with automatic reflow; the cover-tinted layer adapts to the colour extracted from the cover so the whole view brightens; every component can be moved and resized; in-view lyric search |
| Lyrics | Line/word highlighting | Word highlighting, multi-source online search (ID mode defaults to Kugou hash), local-word priority, drag/wheel preview seeking, automatic online word lyrics saved back to tags |
| Playback | Stock experience | Restore track/playlist/position after closing and reopening; reworked card transport keys, volume and seek bar |
| Sidebar | Fixed sections | A “My headphones” section between Library and Playlists; click a headphone to switch immediately, with a matching rail flyout |
| Track info | Read-only | Tag editing, create missing summary tags, Credits, inline edit/copy actions |
| Statistics | None | Today/week/month/year, top tracks/artists, trend chart and covers from `foo_monthly_stats`; DX52 per-headphone average SPL, headphone listening time, a top-row all-headphones average/time, and an all-statistics detail page with a searchable/sortable all-songs table |
| Headphones | None | Real-time SPL from PCM RMS + FFT spectrum with optional measured FR/impedance profiles and A/K/Z weighting; power, voltage, 80 dB headroom and played-part average; optional automatic TOPPING DX5 II jack/gain/volume reading, automatic reconnect, explicit partial-settings reporting, retry with a non-blocking failure notice, and an HID diagnostics panel with descriptor-aware output/feature transport probing |
| Narrow layouts | Tables without covers | All tables keep a 32 px cover with tighter rows |

## Features

### Playback and resume

- Cover-coloured Now Playing page; closing and reopening restores the last track, playlist and position.
- The bottom player bar restores the cover; the mini player has cover and compact layouts.
- The five card transport keys are centred; order and volume keys use transparent outlines.

### Sidebar

- A **My headphones** section sits between Library and Playlists. It lists the configured headphones in stored order; clicking one switches immediately, without a confirmation dialog or leaving the current page.
- The current headphone is marked with a check and `aria-pressed`. Selecting a headphone does not change the selected amplifier. In rail mode, a headphone icon opens the same list in a flyout.
- The section expansion is stored with the other sidebar preferences; an older sidebar setting opens it by default.

### Immersive view

- **Paper stage**: 1920 × 1080 layout with spectrum, stereo field, full-track waveform, gauges, lyric card and headphone SPL.
- **Focus view**: compact meters with large lyrics.
- **Lyrics view**: dial on the left, word-level lyrics on the right.
- **Card view** / **Card lyrics**: cover, title, rating, more button, seek bar and transport keys.
- Settings → Components: hide individual elements per view and layout tier — background grid/arcs, the four header lines, meter cells, gauges, the six file-info fields, dial/card cells, lyric main/sub lines and more; remaining content reflows while analysis services keep running.
- The cover-tinted layer fills the whole immersive view: a dark cover darkens it, the view goes dim and the lyrics get hard to read. The layer now adapts to the colour extracted from the cover — brightness and chroma are separated, brightness is pulled back towards the paper brightness and the cover only contributes its colour; how much it brightens follows how dark the cover is, and bright covers are left alone. The “Scene brightness” slider in Settings → Background controls the strength.
- Settings → Immersive arrangement: move and resize components per view and layout tier. Click a box to select it (the selected box gets a solid ring and its list row is marked), then drag it to move or drag its corner to resize; nudge by 1 pixel with the arrow keys (hold to keep nudging, Shift for 8 pixels, Alt to resize), Tab switches components, Esc undoes. The preview carries a short usage hint next to it and can be zoomed to 100% / 200% for fine work. The view, layout and selected component are remembered, so you can check the result and carry on. Only the parts you moved are stored, so nothing drifts when the window changes.
- A search button in the top-right opens the lyric search panel without leaving the immersive view; Escape closes the panel first and leaves the view on the second press.

### Lyrics

- Local embedded/sidecar lyrics, LRCLIB, NetEase, Kugou, QQ Music, AMLL TTML DB and lrcmux; manual lookup by source ID/hash, with ID mode defaulting to a Kugou hash.
- Word-level highlighting, translations/romanisation, grouped candidates with duration and cover; words already sung in the active line follow the current accent color.
- Reorderable priority: local word → online word → local other → online line → plain.
- Drag or mouse wheel enters a dashed preview; only the play chip seeks. The preview disappears after 3 seconds.
- Optional “save online word lyrics to the `LYRICS` tag when the local file has no word timing”; the local display stays until the tag is read back.
- Kugou automatic search uses every artist (e.g. `银临、司南 - 天和山雨雪`) and filters UGC/instrumental clips; QQ search and MID lookups fetch decrypted QRC word timing first.

### Track info and tags

- Edit, delete and copy tags; create missing summary tags directly.
- Row actions appear on hover or keyboard focus so they do not squeeze tag names.
- Credits page lists the open-source components used by the theme.

### Statistics

- Today/week/month/year play counts and duration, top tracks/artists and a monthly trend chart; weeks start on Monday.
- Top tracks show a 32 px cover; trend bars show duration labels and omit some labels in dense views.
- Headphone average volume: only time with the DX52 auto reading active, headphones selected and playback running is counted. Per-headphone energy-weighted average SPL and an all-headphones average are shown for day/week/month/year and stored independently in `<profile>\webview-ui-stats\loudness-v2.json`. A/K/Z energies are recorded together; the page follows the SPL weighting setting (default A). The old `loudness-v1.json` is read as legacy duration only. The section still works when `foo_monthly_stats` is missing. The totals row also shows the selected period's all-headphones average and headphone listening time.
- **All statistics** opens a detail page with the four-period overview, per-headphone SPL and listening-time matrices, the per-period top artists, and a table of every song over all time. Each song row has a 32 px cover and shows title, artist, album, listened time, plays and last-played date, with title/artist/album search, sortable headers and 100-row pages.
- Requires the bundled modified `foo_monthly_stats` (official v1.6 lacks the duration fields used by the page).

### Headphone SPL estimate

- Replaces Genre in paper/focus views with live dB SPL, power, voltage and 80 dB headroom.
- Multiple amplifiers/headphones, selected independently, switched immediately; managed in Settings → Headphones.
- Calibrated to the BS.1770 stereo reference with mono/5.1 channel-weight correction. SPL is now computed from raw PCM RMS plus the host FFT spectrum, optional measured FR/impedance profiles (FiiO FT1, FiiO JT7, Sony MDR-M1), and selectable A/K/Z weighting (default A). The Loudness gauge remains K-weighted LUFS, and the 80 dB margin is always A-weighted. ReplayGain is not added separately; if the host already applies it upstream, the reading includes it. Settings → Headphones can also import additional huihifi evaluation links into a local profile file (`webview-ui-headphones\measurements-v1.json`).
- Optional “Read DAC/amp automatically” (tooltip: “Topping DX52 only”): authorize WebHID once on the switch, then read the DX5 II output jack, high/low gain, device volume, mute and sample rate. Device volume and foobar volume are independent and both apply. The cell shows the current output (e.g. `4.4mm XLR · High`) and the popover lists the device state. With the switch off, no DX5 II-specific information is shown and the manual amplifier profile is used. A disconnected device shows “waiting” and reconnects automatically; a short reply is never mistaken for full settings, a partial read is marked as incomplete, and a failed read can be retried from a non-blocking notice. The client reads the HID report descriptor, fits each frame to the declared report size, records whether the write was actually accepted, and falls back to feature reports with polling when no input report arrives. The HID diagnostics panel is kept in the code but hidden by default; set `SHOW_DX52_DIAGNOSTICS` to `true` in `SoundPressureSection.tsx` when debugging.

## Screenshots

> Placeholders are reserved under `docs/screenshots/`. See [docs/screenshots/README.md](./docs/screenshots/README.md) for the capture list.

| Scene | File |
|---|---|
| Home / playlist | `docs/screenshots/01-home.png` |
| Now Playing | `docs/screenshots/02-now-playing.png` |
| Immersive · Paper stage | `docs/screenshots/03-immersive-paper.png` |
| Immersive · Focus | `docs/screenshots/04-immersive-focus.png` |
| Immersive · Lyrics | `docs/screenshots/05-immersive-lyrics.png` |
| Immersive · Card | `docs/screenshots/06-immersive-card.png` |
| Immersive · Card lyrics | `docs/screenshots/07-immersive-card-lyrics.png` |
| Lyrics search | `docs/screenshots/08-lyrics-search.png` |
| Statistics | `docs/screenshots/09-stats.png` |
| Headphone SPL | `docs/screenshots/10-headphones.png` |
| Settings · Components | `docs/screenshots/11-settings-components.png` |
| Track info editing | `docs/screenshots/12-track-info.png` |
| Mini player | `docs/screenshots/13-mini-player.png` |
| Lyrics priority | `docs/screenshots/14-lyrics-priority.png` |

## Installation

Requires foobar2000 2.x x64, foo_ui_webview2 2.0.0+ and the standalone `Webview2 UI` user interface. DUI/CUI panels only show the unsupported-panel notice.

### All-in-one package

1. Download `foo-webview-community-theme-0.3.0-full.zip` from [Releases](https://github.com/VII12345/foo-webview-community-theme/releases).
2. Close foobar2000.
3. Copy `components/foo_ui_webview2/` and `components/foo_monthly_stats/` into `<profile>\user-components-x64\`.
   - Portable: `<foobar2000>\profile\user-components-x64\`
   - Installed: `%APPDATA%\foobar2000-v2\user-components-x64\`
4. Extract the contents of `theme/` into `<profile>\webview-ui\<template>\`; `index.html` must be directly inside that folder.
5. Start foobar2000, select the template in foo_ui_webview2 preferences, apply and restart.

### Theme-only update

If the components are already installed, download `foo-webview-community-theme-0.3.0.zip` and extract it over the template folder. `foo-webview-components-0.3.0.zip` contains the components separately.

> **Do not install an upstream theme update over this fork.** The built-in updater still points at the upstream repository and would overwrite the fork's features. Keep the update mode on “manual check” in Settings → About, or replace the template folder by hand.

## Modified components

Full hashes, sources and install paths: [docs/COMPONENTS.md](./docs/COMPONENTS.md).

| Component | Status | Notes |
|---|---|---|
| `foo_ui_webview2/foo_ui_webview2.dll` | **Modified (unofficial)** | Built for this theme; hash differs from the official v2.0.0 DLL |
| `foo_ui_webview2/WebView2Loader.dll` | Official Microsoft | WebView2Loader 1.0.3719.77, unmodified |
| `foo_monthly_stats/foo_monthly_stats.dll` | **Modified (unofficial)** | Adds the duration fields and alternate-version fallback used by the statistics page; hash differs from official v1.6 |

The modified DLLs are distributed only with this release and remain copyright of their original authors. They will be removed from future releases if the original authors request it.

This `foo_ui_webview2.dll` also fixes general file writes: a portable profile under `Program Files` stays writable. The older DLL made playback statistics and huihifi link imports unable to save local data.

## Known issues and feedback

- Online lyrics and artist biographies depend on public APIs and may break temporarily.
- Headphone SPL is an **estimate**: output impedance, headphone impedance curves, ear coupling and HRTF are not modelled; 80 dB is a product safety reference, not a medical limit.
- Modified DLLs may trigger antivirus false positives; see the component notes for sources and hashes.
- Please open a [GitHub Issue](https://github.com/VII12345/foo-webview-community-theme/issues) with the foobar2000 version, component versions, steps and screenshots.

## Building from source

> End users do not need this section.

### Requirements

- Node.js 24, npm 11
- Microsoft Edge (browser tests)

### Commands

```powershell
npm ci
npm run dev        # dev server on port 5190
npm run build      # output in dist/
npm test           # unit tests (Vitest)
npm run test:e2e   # browser tests (Playwright)
```

To debug inside foobar2000, enable “Use development server” on the foo_ui_webview2 Developer page and enter `http://127.0.0.1:5190`.

Build the GitHub release assets (requires the local modified component folder):

```powershell
npm run build
npm run release:bundle -- --components "C:\Program Files\foobar2000\profile\user-components-x64"
```

`vendor/foo-webview-sdk.tgz` is a pre-release build of foo-webview-sdk; its version and checksum are in `vendor/foo-webview-sdk.json`.

### Tech stack

| Layer | Technology |
|---|---|
| UI | React 19, Fluent UI React v9 |
| State | Jotai |
| Build | Vite 8, TypeScript 5.9 |
| Lyrics | Apple Music-like Lyrics |
| Cover colours | Material Color Utilities |
| Host bridge | foo-webview-sdk (`vendor/`) |
| Tests | Vitest, Playwright |

### Project structure

```text
src/
├── app/          # service wiring, page table, providers
├── boot/         # loader: version selection, startup confirmation, rollback
├── shell/        # title bar, sidebar, player bar, right card
├── library/      # home, albums, artists, genres, songs, folders, search, biographies
├── playlist/     # playlists
├── immersive/    # five immersive scenes, component visibility and arrangement, SPL and meters
├── lyrics/       # local/online lyrics, priority, drag preview, tag writes
├── stats/        # playback statistics
├── settings/     # settings pages
├── playback/ track/ table/ covers/ nav/   # shared domain modules
└── host/ i18n/ theme/ motion/ styles/ kit/ # foundation
docs/             # component notes, release notes, screenshot list
scripts/release/  # release bundling and GitHub publishing
tests/            # Vitest + Playwright
```

---

## License

This theme is licensed under **GNU Affero General Public License v3.0 only** (AGPL-3.0-only); see [LICENSE](LICENSE). Upstream copyright belongs to NereaFantasia; this fork's changes are released under the same license.

Third-party code and components keep their own licenses; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Acknowledgements

- Upstream: [NereaFantasia/foo-webview-default-theme](https://github.com/NereaFantasia/foo-webview-default-theme)
- [foobar2000](https://www.foobar2000.org/)
- [foo_ui_webview2](https://github.com/NereaFantasia/foo_ui_webview2)
- [foo_monthly_stats](https://github.com/shirafukayayoi/foo_monthly_stats)
- [Fluent UI React](https://github.com/microsoft/fluentui)
- [Apple Music-like Lyrics](https://github.com/amll-dev/applemusic-like-lyrics)
- [Material Color Utilities](https://github.com/material-foundation/material-color-utilities)
- [OpenCC](https://github.com/BYVoid/OpenCC)
- [Lyricify Lyrics Helper](https://github.com/WXRIW/Lyricify-Lyrics-Helper)
- [foobox](https://github.com/dream7180) — volume curve

Banner artwork uses public-domain (CC0) covers from the Art Institute of Chicago. foobar2000 and its logo belong to their respective owners.
