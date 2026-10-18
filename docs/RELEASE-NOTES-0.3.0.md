# 0.3.0 — 社区增强版

基于上游 [foo-webview-default-theme 0.2.0](https://github.com/NereaFantasia/foo-webview-default-theme) 的社区增强分支。保留原版界面与架构，新增五种沉浸视图、逐字歌词与多来源搜索、播放恢复、标签编辑、播放统计与耳机声压估算。

## 主要变化

### 沉浸视图

- 图纸舞台、聚焦视图、歌词视图、卡片视图、卡片歌词五种场景。
- 设置 → 组件显示：按视图 × 布局档隐藏背景、罗盘、卡片、右栏模块；剩余内容自动重排。
- 所有动画歌词表面统一使用设置里的字号；卡片两档的播放/暂停改为细线图标，四颗侧键外框透明。

### 歌词

- 本地逐字优先、在线逐字优先等五档优先级，可拖动排序。
- 酷狗自动搜索使用全部艺人并过滤 UGC/伴奏短片段；QQ 搜索与 MID 查询优先解密 QRC 逐字词。
- 拖动与滚轮进入虚线预览，点预览上的播放键才跳转，3 秒后自动收起。
- 本地没有逐字时间轴时，可自动把在线逐字写回 `LYRICS` 标签；写入后仍显示本地，回读后再切换。

### 播放、曲目信息与统计

- 关闭再打开恢复曲目、播放列表与进度；底部播放栏恢复封面。
- 曲目信息支持编辑/删除/复制标签，补建缺失的 summary 标签。
- 播放统计：今日/月/年、Top 曲目/艺人、趋势图数字与 32 px 小封面。

### 耳机声压

- 图纸/聚焦视图实时显示 dB SPL、功率、电压与 80 dB 余量。
- 按 BS.1770 立体声定标计算，单声道/5.1 按声道权重修正。
- 组件底部新增“曲首至今已播放片段”的平均 SPL 与平均 LUFS。

## 安装

1. 下载 `foo-webview-default-theme-0.3.0-full.zip`。
2. 关闭 foobar2000，把 `components/foo_ui_webview2/` 与 `components/foo_monthly_stats/` 复制到 `<profile>\user-components-x64\`。
3. 把 `theme/` 的内容解压到 `<profile>\webview-ui\<模板名>\`，`index.html` 直接位于该目录。
4. 启动 foobar2000，在 foo_ui_webview2 首选项选择模板并重启。

已有组件时可用 `foo-webview-default-theme-0.3.0.zip` 只更新主题；`foo-webview-components-0.3.0.zip` 是单独的组件包。

## 组件说明

- `foo_ui_webview2/foo_ui_webview2.dll`：**修改版（非官方）**。
- `foo_ui_webview2/WebView2Loader.dll`：官方 Microsoft 1.0.3719.77。
- `foo_monthly_stats/foo_monthly_stats.dll`：**修改版（非官方）**，统计页依赖其时长字段。

哈希与官方来源见仓库的 [docs/COMPONENTS.md](https://github.com/VII12345/foo-webview-default-theme/blob/main/docs/COMPONENTS.md)。

> 主题内置在线更新仍指向上游；不要安装上游主题更新覆盖本分支。更新宿主组件前请备份修改版 DLL。

## 已知问题

- 在线歌词与艺人简介依赖公开接口，可能暂时失效。
- 声压是估算，不建模输出阻抗、阻抗曲线、耳道耦合与头相关传输。
- 修改版 DLL 可能被杀毒软件误报；请核对 SHA-256。
- README 截图位已预留，图片会在后续补充。

## 反馈

请开 [GitHub Issue](https://github.com/VII12345/foo-webview-default-theme/issues)，附 foobar2000 版本、组件版本、复现步骤与截图。

## English summary

Community-enhanced fork of the upstream default theme, based on 0.2.0. Highlights: five immersive scenes with per-view component visibility, word-level lyrics with multi-source search and priority, drag/wheel preview seeking, automatic tag writes, playback resume, tag editing, playback statistics, and headphone SPL estimation with a played-part average. Bundled `foo_ui_webview2.dll` and `foo_monthly_stats.dll` are unofficial modified builds; `WebView2Loader.dll` is the official Microsoft loader. Do not install an upstream theme update over this fork. Full details and component hashes are in the repository README and `docs/COMPONENTS.md`.
