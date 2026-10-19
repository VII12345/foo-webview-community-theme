# 0.4.0 — 沉浸视图、DX52 与播放统计更新

基于 0.3.0 的社区增强。完整逐项记录见 [CHANGES-SINCE-0.3.0.zh-CN.md](../CHANGES-SINCE-0.3.0.zh-CN.md)。

## 主要变化

### 沉浸视图

- 歌词、卡片、卡片歌词三档的文字改为“对比度优先”修正：按封面合成底色自动选择白/黑目标，滑杆控制修正强度；拉高滑杆不会降低对比度。设置 → 背景中的滑杆（0–100，默认 50）沿用原键。背景、图纸与聚焦视图保持不变。
- 右上角新增歌词搜索键：在当前沉浸视图内弹出搜索面板，不离开视图；第一次 Esc 关面板，第二次 Esc 才退出。
- 组件显示细化到每个可见元素：四行字、仪表格、两条量表、文件信息六项、罗盘/卡片三格、歌词主/副行、网格与弧线都能单独开关。旧存档里的整组开关继续有效。

### 歌词

- 手动“歌曲 ID”搜索默认来源改为酷狗 Hash，不再默认网易云；来源下拉顺序为酷狗、QQ、网易云。

### 播放统计

- 新增“本周”（周一开始），时长、次数、Top 榜与趋势图都支持。
- 新增“耳机平均音量”：只统计 DX52 自动读数生效、已选耳机且正在播放的时间，按日/周/月/年给出每只耳机的能量加权平均 SPL，以及“全部耳机”总平均。
- 顶部“曲目数”右边显示当前范围的全部耳机平均 SPL；右上角“全部统计”打开二级页，集中展示四周期概览、每只/全部耳机平均 SPL 矩阵和各周期 Top 歌曲/艺人。
- 数据独立保存在 `<profile>\webview-ui-stats\loudness-v1.json`；统计库缺失时仍可显示。

### DX52 自动读取

- 设置快照改为多次重试；`total=1` 的短应答不再被当成完整设置，重复帧不会清空已收字段。
- 只收到关键字段时接受部分快照，并显示“设置读取不完整”，不再误报“已关机”；完整快照仍会逐项读取。
- 设备断开显示“等待设备”并自动重连；读取失败可在设置中重试，并弹出非阻塞提醒（重试/关闭）。
- 设置 → 耳机新增“HID 诊断”：记录发送命令、原始输入帧和解析后的字段，可一键复制。真机字段映射仍以这份诊断为准继续修正。
- 正常升级不需要重新授权：授权记录仍在 WebView2 profile 中。

## 升级说明

- 旧沉浸组件存档（`right.header`、`right.meter`、`right.meta` 等父 ID）继续有效。
- 耳机平均音量从本版本开始积累，没有历史数据。
- 声压与平均音量仍是估算值，不建模输出阻抗、阻抗曲线、耳道耦合与头相关传输。
- 在线歌词与艺人简介依赖公开接口，可能暂时失效。

## English summary

Community-enhanced fork based on 0.3.0. Highlights: contrast-first text correction in the lyrics/card scenes (raising the slider never lowers contrast), an in-view lyric search panel, per-element immersive component switches, weekly playback statistics, DX52 per-headphone average SPL (energy-weighted, day/week/month/year plus an all-headphones average), an all-headphones average tile and an all-statistics detail page, Kugou-hash as the default ID search source, and hardened DX52 snapshot assembly with partial-settings reporting and an HID diagnostics panel. Existing component settings and WebHID authorization keep working after upgrading. Full details are in `CHANGES-SINCE-0.3.0.zh-CN.md`.
