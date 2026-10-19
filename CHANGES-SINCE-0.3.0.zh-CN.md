# 0.3.0 之后的本地改动

基线：`main` 上 0.3.0 之后的社区增强。分支 `feature/immersive-search-stats-dx52`。
本文件按改动批次记录行为、配置键、限制与验证方式，供下一次 release notes 直接取用。

## 1. DX52 自动读取恢复与失败提醒

### 1.1 快照重试与部分快照

- `getSettings` 不再只发一次：首次 `connectState` + `getSettings`，随后在 0.4/0.9/1.6/2.5/4 秒重发 `getSettings`，6 秒截止。
- 截止时若已收到包含关键字段（电源、音量、输入、输出、耳机增益）的部分快照，按部分快照连接；一帧都没有才报“读取设置失败”。
- 连接期间把未知但多帧的应答也当作设置快照，兼容不同固件/命令号。
- 任何有效输入报告都会刷新 `updatedAtMs`（每秒最多一次），供播放统计判断 DX52 读数是否过期。

### 1.2 连接状态

- 状态新增 `waiting`（等待设备）。设备断开不再误报为“未授权”，而是“已授权，正在等待 DX5 II 连接”。
- 监听 WebHID 的 `connect` 事件；设备重新出现时自动 `getDevices()` 并连接，不弹设备选择器。
- `waiting` 时每 10 秒自动重试一次 `getDevices()`。
- `retry()` 在设备已打开时重新请求快照，否则重新查找已授权设备。
- 设置页动作按钮按状态区分：
  - 未授权 / 等待设备：`重新授权`（用户手势，弹设备选择器）。
  - 读取失败 / 设备占用：`重试`（不弹选择器）。
  - 连接中：不显示按钮。

### 1.3 失败提醒弹窗

- 自动读取开启且状态为 `error` / `busy` 时，弹一个非阻塞的提醒对话框：
  - 标题“DX5 II 自动读取失败”。
  - 正文按状态显示“读取设置失败”或“无法打开设备”。
  - 按钮：`重试`、`关闭`。
- 同一次失败只弹一次；关闭后本次不再弹；点“重试”后再次失败会重新弹出。
- 对话框挂在应用壳层，位于沉浸视图之上。

### 1.4 配置与兼容

- 不新增配置键；原 `defaultTheme.playback.dx52Auto` / `defaultTheme.playback.dx52Jack` 不变。
- 原“重新授权”记录仍由 WebView2 profile 保存；正常启动不需要重新授权。只有 profile 的 WebView2 用户数据目录被重建、或改用 dev server 源时，才需要重新授权一次。

### 1.5 验证

- `tests/unit/playback/dx52Prefs.test.ts`：迟到快照、部分快照、无帧超时、重试、失败提醒、connect 自动重连、等待状态。
- `tests/unit/immersive/sound/soundPressureReading.test.ts`：`waiting` 原因。
- `tests/e2e/dx52-failure.spec.ts`：读取失败弹窗、重试后再次失败再弹、关闭后不再弹。
- `tests/e2e/immersive-sound-pressure.spec.ts`、`tests/e2e/settings-sound-pressure.spec.ts`：原有 DX52 显示与设置行为不回归。

## 2. 歌词/卡片文字自适应提亮

- 新增配置键 `default-theme.immersive.textBoost.v1`（0–100，缺省 50）。设置 → 沉浸 → 背景新增“歌词与卡片文字提亮”滑杆，0% 关闭。
- 只作用于沉浸视图的歌词、卡片、卡片歌词三档；图纸与聚焦视图保持原样。
- 提亮程度按封面亮度自适应：
  - 用预糊封面的平均线性亮度、纸面亮度与 `WASH_STRENGTH`（浅色 0.5 / 深色 0.4）估算合成底色。
  - 合成底色 ≥ 0.55 不提亮；≤ 0.25 按设置强度全额提亮；中间线性过渡。
  - 亮封面不会额外提亮；0% 与未开启封面底色时也不提亮。
- 只覆盖内容层的文字颜色 token（`--colorNeutralForeground1/2/3`、`--paper-ink`、`--paper-hot`）；纸面染色、封面底色、网格与背景全部不变。
- 当前行强调色保持不变，保留强调色识别度。
- 新增 `src/theme/luminance.ts`、`src/immersive/paper/textBoost.ts`，封面亮度由 `imageLuminance()` / `coverLumaAtom` 提供。
- 验证：
  - `tests/unit/immersive/wash/coverWarp.test.ts`：线性亮度。
  - `tests/unit/immersive/wash/coverSource.test.ts`：`coverLumaAtom`。
  - `tests/unit/immersive/paper/textBoost.test.ts`：边界与混合。
  - `tests/unit/immersive/page/immersivePrefs.test.ts`、`tests/unit/app/immersivePrefs.test.ts`：偏好读回与坏值。
  - `tests/e2e/immersive-text-boost.spec.ts`：深封面上歌词文字提亮、纸面背景不变、图纸不提亮。
  - `tests/e2e/settings-immersive.spec.ts`：滑杆保存与回读。

## 3. 沉浸视图内歌词搜索

- 沉浸视图右上角新增搜索键，与场景、全屏、Esc 同排；没有当前曲目时禁用。
- 点击后在沉浸视图内弹出搜索面板，不离开视图：
  - 复用右侧卡的歌词搜索件（关键词/ID 搜索、来源分组、候选、使用）。
  - 不显示右侧卡的返回标题，不把搜索状态挂到右侧卡历史。
  - 面板标题与关闭键；输入框自动聚焦。
  - “使用”后关闭面板，歌词服务把新歌词推给当前沉浸视图。
  - 在线歌词开关与隐私提示可在面板内操作。
- Esc 行为：面板打开时第一次 Esc 关闭面板，第二次 Esc 才离开沉浸视图。
- 面板打开期间控件层保持显示，不会因空闲计时把面板一起淡出。
- `LyricsSearch` 新增可选 `heading`、`snapshot`、`onPreview`；右侧卡行为不变。
- 顺带修正 `LyricsSearch` 的候选类型与本地格式文案类型，`tsc` 不再在这三处报错。
- 验证：
  - `tests/e2e/immersive-lyrics.spec.ts`：沉浸内搜索、选词后歌词更新、Esc 先关面板、右侧卡预览恢复。
  - `tests/e2e/immersive-page.spec.ts`：右上角控件、Esc 与 Tab 行为不回归。
  - `tests/e2e/lyrics-panel.spec.ts`：右侧卡搜索与历史快照不回归（同时稳定了几处等待可见性的断言）。

## 4. 沉浸组件开关细化到每个可见元素

- 组件可见性改为“父组 + 叶子”两层：
  - 父组保留旧 ID（`right.header`、`right.meter`、`right.meta`、`right.gauges`、`right.fileInfo`、`dial.album`、`dial.cells`、`card.title`、`card.cells`、`right.lyrics`、`decor`），旧存档继续隐藏整组。
  - 新叶子：
    - 背景：`decor.grid`、`decor.arcs`。
    - 罗盘：`dial.albumText`、`dial.trackNo`、`dial.cell.date`、`dial.cell.track`、`dial.cell.label`。
    - 卡片：`card.titleText`、`card.artist`、`card.cell.date`、`card.cell.track`、`card.cell.label`。
    - 四行字：`right.header.from`、`.title`、`.by`、`.quality`。
    - 仪表：`right.meter.stereo`、`.bpm`、`.soundPressure`、`.albumArtist`、`.duration`。
    - 版心元数据：`right.meta.stereo`、`.soundPressure`、`.year`、`.label`、`.duration`、`.elapsed`。
    - 量表：`right.gauges.dynamicRange`、`.loudness`。
    - 文件信息：`right.fileInfo.sampleRate`、`.bitDepth`、`.channels`、`.bitrate`、`.fileSize`、`.format`。
    - 歌词卡：`right.lyrics.main`、`.sub`、`.source`、`.status`。
- 隐藏判断走祖先链：隐藏父组即隐藏全部子项；隐藏单个叶子只影响该元素。父组在布局里按“至少一个可用子项可见”决定是否收起。
- 设置页按背景、罗盘、卡片、四行字、仪表、版心元数据、右栏媒体、歌词分组，只列当前视图/布局实际可用的叶子；父组有可用子项时不重复显示父开关。
- 行内单个元素隐藏留空，整行/整带全隐藏时沿用原有垂直重排；三格与文件信息过滤后横向重排。
- 网格与弧线在同一 canvas 里按 `showGrid`/`showArcs` 分开绘制；canvas 上带 `data-decor-grid`/`data-decor-arcs` 供测试与调试。
- 验证：
  - `tests/unit/immersive/page/immersiveComponents.test.ts`：父/子可见性、设置页叶子过滤、新 ID 的场景/档位可用性。
  - `tests/e2e/immersive-components.spec.ts`：旧父 ID 兼容 + 四行字/仪表格/量表/文件信息/三格/歌词主副行/卡片曲名艺人/网格弧线逐项开关。
  - `tests/e2e/settings-immersive.spec.ts`：设置页叶子列表与旧持久化行为。
  - `tests/e2e/immersive-page.spec.ts`、`immersive-tiers.spec.ts`：布局与档位不回归。

## 5. 播放统计：本周 + DX52 耳机平均音量

### 5.1 本周

- 播放统计页新增“本周”标签，范围按周一到周日；上一期是上一自然周。
- 时长、次数、Top 歌曲/艺人、趋势图都支持本周。
- 月份/年份改为明确的日期区间查询（`ymd BETWEEN start AND end`），与原来的前缀查询结果一致。

### 5.2 耳机平均音量

- 新增“耳机平均音量”区块，跟随统计页的今日/本周/本月/今年范围：
  - 每只耳机一行：名称、平均 SPL、累计收听时长。
  - 末尾“全部耳机”一行：所有耳机合计的能量加权平均 SPL 与总时长。
  - 只统计 DX52 自动读数生效、正在播放、未静音、已选耳机的时段；手动耳放/耳机模式不计。
  - 平均 SPL 用能量平均 `10·log10(Σenergy/Σseconds)`，不直接平均 dB。
- 全局实时响度改为单一实例：
  - 沉浸页打开，或 DX52 自动读数可用且正在播放时订阅 PCM；其它页面不订阅。
  - 沉浸页不再自己启动响度服务，避免模块级读数被第二实例清掉。
  - 响度与记录器模块经动态导入加载，主启动包仍不含 `liveLoudness`。
- 记录器：
  - 每秒取样；时长优先用播放位置差，seek/换曲的大跳退回墙钟并夹到 2 秒；暂停、静音、读数过期不计。
  - DX52 状态超过 30 秒没有新报告就视为过期。
  - 内存累计，约 20 秒防抖落盘；停止/换曲、页面隐藏、dispose 时冲刷。
- 存储：`<profile>\webview-ui-stats\loudness-v1.json`
  - `{ version: 1, days: { "YYYY-MM-DD": { "<headphoneId>": { "name", "seconds", "energy" } } } }`
  - profile 路径由 `misc.getProfilePath` 取得，写入带 `atomic: true`；`NOT_FOUND` 按空开始，`PERMISSION_DENIED` 不覆盖。
- 统计库缺失/读取失败时，“耳机平均音量”仍独立显示。
- 验证：
  - `tests/unit/stats/statsRange.test.ts`：周一到周日、跨月跨年、上一期。
  - `tests/unit/stats/monthlyStats.test.ts`：本周总量、上一周、趋势与 Top 榜。
  - `tests/unit/stats/loudnessStats.test.ts`：解析、能量平均、按耳机/全部聚合、记录器的播放/暂停/过期/无耳机/seek 边界。
  - `tests/e2e/stats-page.spec.ts`：本周标签、耳机与全部耳机平均、统计库缺失时仍显示音量区块。
  - `tests/unit/build.test.ts`：主启动包仍不含实时响度模块。
