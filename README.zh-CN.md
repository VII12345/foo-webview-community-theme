[English](./README.md) | 中文

<p align="center">
  <img src=".github/assets/readme-banner.jpg" alt="Default Theme 社区增强版：WinUI 3 的设计，装着一颗 foobar2000 的心" width="100%" />
</p>

# foo-webview-community-theme · 社区增强版

[![License](https://img.shields.io/badge/license-AGPL--3.0--only-blue)](LICENSE)
[![Release](https://img.shields.io/github/v/release/VII12345/foo-webview-community-theme)](https://github.com/VII12345/foo-webview-community-theme/releases)
[![foo_ui_webview2](https://img.shields.io/badge/foo__ui__webview2-2.0.0%2B-informational)](https://github.com/NereaFantasia/foo_ui_webview2)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-lightgrey)]()

> 这是 [NereaFantasia/foo-webview-default-theme](https://github.com/NereaFantasia/foo-webview-default-theme) 的社区增强分支，基于上游 **0.2.0**。原版的界面、页面结构与更新器都保留，改动集中在播放、沉浸视图、歌词、统计与设置。完整逐项差异见 [CHANGES-SINCE-0.2.0.zh-CN.md](./CHANGES-SINCE-0.2.0.zh-CN.md)。

---

## 这是什么

Default Theme 是 [foo_ui_webview2](https://github.com/NereaFantasia/foo_ui_webview2) 的默认主题，为 foobar2000 提供 WinUI 3 风格的独立窗口界面。本分支在原作者 0.2.0 的基础上继续开发，使用 React 19、Fluent UI React v9、Jotai 与 Vite 构建，所有播放器操作仍经 [foo-webview-sdk](https://www.npmjs.com/package/foo-webview-sdk) 完成。

- 许可证：AGPL-3.0-only
- 界面语言：简体中文、英文
- 平台：Windows 10/11 **x64**；需要 foobar2000 2.x 与 foo_ui_webview2 2.0.0+

## 和原版有什么区别

| 方面 | 上游 0.2.0 | 本分支 |
|---|---|---|
| 沉浸视图 | 图纸舞台、聚焦视图 | 五种场景：图纸、聚焦、歌词、卡片、卡片歌词；每个视图 × 布局档可逐元素隐藏并自动重排；歌词/卡片文字按封面自适应提亮；视图内可直接搜索歌词 |
| 歌词 | 逐行/逐字高亮 | 逐字高亮、多来源在线搜索（ID 搜索默认酷狗 Hash）、本地逐字优先、拖动/滚轮预览跳转、自动把在线逐字写回标签 |
| 播放 | 默认播放体验 | 关闭再打开恢复曲目/播放列表/进度；卡片两档的传输键、音量与进度条重新排布 |
| 曲目信息 | 只读信息 | 编辑标签、补建缺失标签、Credits、行内编辑/复制 |
| 播放统计 | 无 | 从 `foo_monthly_stats` 读取今日/本周/月/年、Top 曲目/艺人、趋势图与封面；另记 DX52 耳机平均 SPL（按耳机与全部） |
| 耳机 | 无 | 按耳放/耳机参数与实时 Short-term LUFS 估算输出 SPL、功率、电压、80 dB 余量与已播放平均；可选自动读取 TOPPING DX5 II 的接口/增益/音量，断线自动重连、读取失败可重试并弹窗提醒 |
| 窄窗口 | 表格无封面 | 所有表格在窄档保留 32 px 小封面，行高收紧 |

## 功能

### 播放与恢复

- 封面取色的播放页；关闭窗口后再打开，恢复上次的曲目、播放列表与进度。
- 底部播放栏恢复时保留封面；迷你播放器有封面与紧凑两种形态。
- 卡片视图/卡片歌词的五颗传输键居中排列，顺序与音量键外框透明。

### 沉浸视图

- **图纸舞台**：1920 × 1080 版式，频谱、声场、整轨波形、量表、歌词卡与耳机声压。
- **聚焦视图**：更紧凑的仪表与大幅歌词。
- **歌词视图**：左侧罗盘 + 右侧逐字歌词。
- **卡片视图** / **卡片歌词**：封面、标题、星级、更多按钮、进度条与传输键。
- 设置 → 组件显示：按视图与布局档（完整、紧凑、竖版等）逐元素隐藏背景网格/弧线、四行字、仪表格、量表、文件信息六项、罗盘三格、卡片三格、歌词主/副行等；隐藏后剩余内容重新排布，后台分析服务不中断。
- 歌词/卡片/卡片歌词三档的文字会按封面明暗自适应提亮，强度可在设置 → 背景中调（0% 关闭）；背景与图纸/聚焦视图不受影响。
- 右上角新增歌词搜索键：在沉浸视图内弹出搜索面板，不离开当前视图；Esc 先关面板，再按一次才退出沉浸。

### 歌词

- 本地标签/侧载歌词、LRCLIB、网易云、酷狗、QQ 音乐、AMLL TTML DB、lrcmux；支持按来源 ID/Hash 手动查询，ID 模式默认酷狗 Hash。
- 逐字高亮、翻译/音译、候选分组与时长/封面展示；当前行里已经唱过的字随当前强调色变化。
- 歌词优先级可拖动排序：本地逐字 → 在线逐字 → 本地其他 → 在线逐行 → 纯文本。
- 拖动或滚轮进入虚线预览，点预览上的播放键才真正跳转；3 秒后自动收起。
- 可选“本地没有逐字时自动把在线逐字写回 `LYRICS` 标签”；写入后仍显示本地，标签回读成逐字后再切换。
- 酷狗自动搜索使用全部艺人（如 `银临、司南 - 天和山雨雪`），并过滤 UGC/伴奏短片段；QQ 搜索与 MID 查询优先取加密 QRC 逐字词。

### 曲目信息与标签

- 曲目信息面板支持编辑、删除、复制标签；缺失的 summary 标签可以直接补建。
- 行内按钮悬停或键盘聚焦时显示，避免挤占标签名。
- Credits 页列出主题使用的开源组件。

### 播放统计

- 今日/本周/本月/本年播放次数与时长、Top 曲目/艺人、月度趋势图；本周从周一开始。
- Top 曲目带 32 px 小封面；趋势图显示时长数字，密集视图自动省略部分标签。
- 耳机平均音量：只统计 DX52 自动读数生效、已选耳机且正在播放的时间，按日/周/月/年给出每只耳机的能量加权平均 SPL 与“全部耳机”总平均；数据独立保存在 `<profile>\webview-ui-stats\loudness-v1.json`，统计库缺失时仍可显示。
- 需要随包提供的修改版 `foo_monthly_stats`（官方 v1.6 缺少统计页需要的时长字段）。

### 耳机输出声压估算

- 在图纸/聚焦视图替换原来的 Genre 位置，实时显示 dB SPL、功率、电压与 80 dB 安全余量。
- 支持多耳放/多耳机、分别选择、即时切换；参数在设置 → 耳机中维护。
- 声压按 BS.1770 的立体声定标计算；单声道/5.1 按声道权重修正。组件底部显示“曲首至今已播放片段”的平均 SPL 与平均 LUFS。
- 可选“自动读取解码/耳放信息”（悬停提示“仅适用于拓品DX52”）：首次在开关上授权一次 WebHID，之后自动读取 DX5 II 的当前输出接口、高低增益、设备音量、静音与采样率；设备音量与 foobar 音量独立叠加。组件显示当前输出（如 `4.4mm XLR · High`），浮层里列出设备状态。关闭开关时不显示任何 DX5 II 专属信息，继续使用手动耳放配置。设备断开时显示“等待设备”并自动重连；读取设置失败时可重试，并弹出非阻塞提醒。

## 截图

> 截图位已预留，图片将放在 `docs/screenshots/`。完整拍摄清单见 [docs/screenshots/README.md](./docs/screenshots/README.md)。

| 场景 | 文件 |
|---|---|
| 首页 / 播放列表 | `docs/screenshots/01-home.png` |
| 播放页 | `docs/screenshots/02-now-playing.png` |
| 沉浸 · 图纸舞台 | `docs/screenshots/03-immersive-paper.png` |
| 沉浸 · 聚焦视图 | `docs/screenshots/04-immersive-focus.png` |
| 沉浸 · 歌词视图 | `docs/screenshots/05-immersive-lyrics.png` |
| 沉浸 · 卡片视图 | `docs/screenshots/06-immersive-card.png` |
| 沉浸 · 卡片歌词 | `docs/screenshots/07-immersive-card-lyrics.png` |
| 歌词搜索与候选 | `docs/screenshots/08-lyrics-search.png` |
| 播放统计 | `docs/screenshots/09-stats.png` |
| 耳机声压组件 | `docs/screenshots/10-headphones.png` |
| 设置 · 组件显示 | `docs/screenshots/11-settings-components.png` |
| 曲目信息编辑 | `docs/screenshots/12-track-info.png` |
| 迷你播放器 | `docs/screenshots/13-mini-player.png` |
| 歌词优先级 | `docs/screenshots/14-lyrics-priority.png` |

## 安装

需要 foobar2000 2.x x64、foo_ui_webview2 2.0.0 或更高版本，并以独立窗口运行（默认用户界面选 `Webview2 UI`）。DUI/CUI 面板中只显示不支持面板的说明。

### 一键包

1. 从 [Releases](https://github.com/VII12345/foo-webview-community-theme/releases) 下载 `foo-webview-community-theme-0.3.0-full.zip`。
2. 关闭 foobar2000。
3. 把 `components/foo_ui_webview2/` 与 `components/foo_monthly_stats/` 复制到 `<profile>\user-components-x64\`。
   - 便携版：`<foobar2000 目录>\profile\user-components-x64\`
   - 安装版：`%APPDATA%\foobar2000-v2\user-components-x64\`
4. 把 `theme/` 里的内容解压到 `<profile>\webview-ui\<模板名>\`，`index.html` 必须直接位于该目录。
5. 启动 foobar2000，在 foo_ui_webview2 首选项选择该模板，应用并重启。

### 只更新主题

已有组件时，下载 `foo-webview-community-theme-0.3.0.zip`，把内容解压到模板目录覆盖即可。`foo-webview-components-0.3.0.zip` 是单独的组件包。

> **不要用在线更新安装上游主题。** 主题内置的更新器仍指向上游仓库；安装上游版本会覆盖本分支的功能。请在设置 → 关于中保持“手动检查”，或只手动替换模板目录。

## 修改版组件说明

完整哈希、来源与安装路径见 [docs/COMPONENTS.md](./docs/COMPONENTS.md)。

| 组件 | 状态 | 说明 |
|---|---|---|
| `foo_ui_webview2/foo_ui_webview2.dll` | **修改版（非官方）** | 配合本主题的构建，与官方 v2.0.0 的 DLL 哈希不同 |
| `foo_ui_webview2/WebView2Loader.dll` | 官方 Microsoft | WebView2Loader 1.0.3719.77，未修改 |
| `foo_monthly_stats/foo_monthly_stats.dll` | **修改版（非官方）** | 增加统计页需要的时长字段与替代版本回退；与官方 v1.6 哈希不同 |

修改版组件只随本发行包提供，版权归原作者。若原作者提出要求，会从后续发行中移除。

## 已知问题与反馈

- 在线歌词、艺人简介依赖公开接口，接口变更时可能暂时失效。
- 耳机声压是**估算**，不建模输出阻抗、耳机阻抗曲线、耳道耦合与头相关传输；80 dB 只是产品内的安全参考线。
- 修改版 DLL 可能被杀毒软件误报；源链接与哈希见组件说明。
- 问题反馈请开 [GitHub Issue](https://github.com/VII12345/foo-webview-community-theme/issues)，附 foobar2000 版本、组件版本、复现步骤与截图。

## 从源码构建

> 普通用户不需要本节。

### 环境

- Node.js 24、npm 11
- Microsoft Edge（浏览器测试）

### 命令

```powershell
npm ci
npm run dev        # 开发服务器，端口 5190
npm run build      # 产物在 dist/
npm test           # 单元测试 (Vitest)
npm run test:e2e   # 浏览器测试 (Playwright)
```

使用 foobar2000 调试时，在 foo_ui_webview2 首选项的「开发者」页打开「使用开发服务器」，地址填 `http://127.0.0.1:5190`。

生成 GitHub 发行包（需要本机的修改版组件目录）：

```powershell
npm run build
npm run release:bundle -- --components "C:\Program Files\foobar2000\profile\user-components-x64"
```

`vendor/foo-webview-sdk.tgz` 是 foo-webview-sdk 的预发布包，版本与校验值记在 `vendor/foo-webview-sdk.json`。

### 技术栈

| 层 | 技术 |
|---|---|
| 界面 | React 19、Fluent UI React v9 |
| 状态 | Jotai |
| 构建 | Vite 8、TypeScript 5.9 |
| 歌词 | Apple Music-like Lyrics |
| 封面取色 | Material Color Utilities |
| 宿主桥接 | foo-webview-sdk（`vendor/`） |
| 测试 | Vitest、Playwright |

### 项目结构

```text
src/
├── app/          # 服务装配、页面表、Provider
├── boot/         # 引导页：选版、启动确认、回退
├── shell/        # 标题栏、侧边栏、播放栏、右侧卡
├── library/      # 首页、专辑、艺人、流派、歌曲、文件夹、搜索、简介
├── playlist/     # 播放列表
├── immersive/    # 五种沉浸场景、组件可见性、声压与仪表
├── lyrics/       # 本地/在线歌词、优先级、拖动预览、标签写入
├── stats/        # 播放统计
├── settings/     # 设置页
├── playback/ track/ table/ covers/ nav/   # 共享领域模块
└── host/ i18n/ theme/ motion/ styles/ kit/ # 基础层
docs/             # 组件说明、发行说明、截图清单
scripts/release/  # 发行打包与 GitHub 发布
tests/            # Vitest + Playwright
```

---

## 许可证

本主题采用 **GNU Affero General Public License v3.0 only**（AGPL-3.0-only），完整条款见 [LICENSE](LICENSE)。上游版权归 NereaFantasia；本分支的修改同样以 AGPL-3.0-only 发布。

第三方代码与组件保留各自的许可，见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## 致谢

- 原仓库：[NereaFantasia/foo-webview-default-theme](https://github.com/NereaFantasia/foo-webview-default-theme)
- [foobar2000](https://www.foobar2000.org/)
- [foo_ui_webview2](https://github.com/NereaFantasia/foo_ui_webview2)
- [foo_monthly_stats](https://github.com/shirafukayayoi/foo_monthly_stats)
- [Fluent UI React](https://github.com/microsoft/fluentui)
- [Apple Music-like Lyrics](https://github.com/amll-dev/applemusic-like-lyrics)
- [Material Color Utilities](https://github.com/material-foundation/material-color-utilities)
- [OpenCC](https://github.com/BYVoid/OpenCC)
- [Lyricify Lyrics Helper](https://github.com/WXRIW/Lyricify-Lyrics-Helper)
- [foobox](https://github.com/dream7180) —— 音量曲线

头图中的封面均为芝加哥艺术博物馆的公有领域（CC0）藏品。foobar2000 及其标志归其作者所有。
