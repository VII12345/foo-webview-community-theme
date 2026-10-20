# 0.4.0 — 沉浸视图、DX52 与播放统计更新

基于 0.3.0 的社区增强。完整逐项记录见 [CHANGES-SINCE-0.3.0.zh-CN.md](../CHANGES-SINCE-0.3.0.zh-CN.md)。

## 主要变化

### 沉浸视图

- 封面底色那一层铺满整个沉浸视图，原先深色封面会把底色压暗、整个界面跟着发暗，歌词贴在上面看不清。底色现在按封面提取的颜色自适应：亮度与色度分开，亮度拉回纸面亮度附近、封面只留下颜色；提亮程度按封面的深浅自适应，亮封面不受影响。设置 → 背景里的滑杆改名为"界面提亮"（0–100，默认 70），换用新键 `default-theme.immersive.sceneLift.v1`；旧的 `textBoost.v1` 不再读写。
- 组件隐藏后按组件高度回流：藏掉四行字里的某一行、藏掉仪表行里的一格，后面的跟着上移，不再留一段空白。
- 新增"沉浸编排"：按视图与布局档逐件挪位置、改大小。点框即选中（实心描边、清单里那一行也标出来，预览下面写着当前选中）；鼠标拖框或拖右下角；键盘用方向键微调 1 像素（按住不放连续微调，Shift 一次 8 像素，Alt 改宽高），Tab 换焦点，Esc 撤销。预览边上写着操作提示，可缩放到 100% / 200% 细调。
- 编排器记住上次在弄的视图、布局档与选中的组件（`default-theme.immersive.layoutEditor.v1`）：挪完去看沉浸视图的实际效果，回来接着弄，不用重选一遍。
- 歌词组件接上了摆放覆盖：聚焦视图的歌词日志与歌词、卡片、卡片歌词三档的动画歌词都能挪了（原先只在预览里能拖，实际一动不动）。
- 覆盖按组存（`${view}/${tier}`），只存挪过的那几项，存的是相对默认位置的偏移与比例，窗口怎么变都不漂。
- 取消全局键盘焦点框：焦点圈画在 `colorStrokeFocus2` 一个 token 上，把主题里这个 token 置成透明即全局生效。焦点本身与 Tab 顺序不变，只是键盘聚焦不再有可见提示（编排器自己画：选中的框画实心描边，键盘焦点另给一条虚线描边）。
- 耳机 SPL 改为频谱级计算：PCM 原始 RMS 提供总电平，宿主 FFT 频谱提供频率分布，不再用 K 加权 LUFS 反推电压。设置 → 耳机可给 FT1/JT7/MDR-M1 选测量配置（频响 + 阻抗）。
- 设置 → 耳机新增“从 huihifi 链接导入”：粘贴评测链接、预览后导入，自动选中；自定义档案存在便携版 profile 的 `webview-ui-headphones\measurements-v1.json`，支持列表与删除。
- SPL 显示加权可选 A/K/Z，默认 A；Loudness 表仍是 K 加权 LUFS。80 dB 安全余量固定按 A 计算。
- 右上角新增歌词搜索键：在当前沉浸视图内弹出搜索面板，不离开视图；第一次 Esc 关面板，第二次 Esc 才退出。
- 组件显示细化到每个可见元素：四行字、仪表格、两条量表、文件信息六项、罗盘/卡片三格、歌词主/副行、网格与弧线都能单独开关。旧存档里的整组开关继续有效。

### 歌词

- 手动“歌曲 ID”搜索默认来源改为酷狗 Hash，不再默认网易云；来源下拉顺序为酷狗、QQ、网易云。
- 歌词搜索的搜索方式、ID 来源与 ID 类型三个下拉框改用暗色控件样式，暗色主题下不再白底。

### 托盘与后台运行

- 托盘菜单的播放键跟随播放状态：播放中显示“暂停”，停止或暂停时显示“播放”（图标与文案一起换）。
- 双击托盘图标恢复主窗口；收进托盘、页面被冻结时也有效（恢复动作在原生侧执行）。

### 后台三档运行模式

- 设置 → 常规新增“后台运行”：**正常运行**（默认）隐藏时继续实时音频分析；**节能模式**暂停画面工作、计时器照跑；**停止加载**隐藏时停掉页面的计时器与分析。装了 `foo_acoustic_stats` 插件时，停止加载下统计仍照常记录。
- 正常模式的后台采样受浏览器降频限制，属尽力而为；停止加载恢复可见后会立即补上健康检查与 DX52 快照。

### 迷你播放器

- 底部进度行右侧新增瞬时声压读数（如 `72.4 dBA`，无读数时 `—`），悬停可看原因或 80 dB 安全余量。
- 曲目没有评分时，歌手/专辑那一行不再空占 104px，会占满整行。

### 播放统计

- 新增“本周”（周一开始），时长、次数、Top 榜与趋势图都支持。
- 新增“耳机平均音量”：只统计 DX52 自动读数生效、已选耳机且正在播放的时间，按日/周/月/年给出每只耳机的能量加权平均 SPL，以及“全部耳机”总平均。新口径同时记录 A/K/Z 三份能量，统计页跟随 SPL 加权设置，默认 A；旧 `loudness-v1.json` 作为 legacy 读取，不参与新平均。
- 顶部“曲目数”右边显示当前范围的全部耳机平均 SPL 和 DX52 耳机使用时长；右上角“全部统计”打开二级页，集中展示四周期概览、每只/全部耳机平均 SPL 与使用时长矩阵。
- “全部统计”新增所有歌曲表：按全部时间聚合，列出曲名、艺人、专辑、累计收听、播放次数和最近播放，每行带 32 px 封面；支持搜索、列头排序与每页 100 首分页。各时段的 Top 艺人保留。
- 数据独立保存在 `<profile>\webview-ui-stats\loudness-v2.json`；统计库缺失时仍可显示。
- 音量计算的审计报告见 `docs/音量计算审计.md`：结论、口径与已知边界（本次只记录，未改代码）。

### 修复：便携版 profile 写入

- 修复便携版装在 `C:\Program Files` 下时主题无法写 profile 的问题：`foo_ui_webview2` 的通用文件写判定改为 profile/temp 写白名单先于系统黑名单（媒体写入策略不变）。此前表现为 huihifi 链接导入提示“无法保存本地档案”，播放统计的耳机平均音量与使用时长始终为空。
- 修复统计记录器启动时未接入宿主、从不累计的问题；DX52 自动读数与沉浸 SPL 正常时，记录器现在会真正生成 `loudness-v2.json`。
- 主题侧补充宿主错误码显示、原子写失败回退与统计写入状态；统计页打开前先把记录器内存中的累计落盘。导入失败时保留预览，可直接重试。
- 升级主题后需同时替换随包 `foo_ui_webview2.dll`（SHA-256 `628be3f1e9db8d3349d59043e177cbc2bdf9f551d8191191cd88dad3b73e0651`）。

### 侧边栏

- 在“媒体库”和“播放列表”之间新增“我的耳机”分节；图标态有对应的耳机浮层。展开后列出设置里的耳机，点一下立即切换，无需确认，也不会离开当前页面。
- 当前耳机带勾选与 `aria-pressed`；列表为空时显示“还没有耳机”。切换耳机不会连带切换耳放。

### DX52 自动读取

- 设置快照改为多次重试；`total=1` 的短应答不再被当成完整设置，重复帧不会清空已收字段。
- 只收到关键字段时接受部分快照，并显示“设置读取不完整”，不再误报“已关机”；完整快照仍会逐项读取。
- 设备断开显示“等待设备”并自动重连；读取失败可在设置中重试，并弹出非阻塞提醒（重试/关闭）。
- 设置 → 耳机新增“HID 诊断”：记录发送命令、原始输入帧和解析后的字段，可一键复制。真机字段映射仍以这份诊断为准继续修正。
- 读取 HID 描述符后按报告声明长度发送，并分别尝试 output 报告与 Feature Report；Feature 回包通过 `receiveFeatureReport` 轮询接收，同一帧在 inputreport 与轮询之间去重。
- 诊断新增“HID 报告”和“传输”两行，以及每条发送的 `ok`/错误；这能区分“设备拒绝写入”和“设备没回包”。
- 根据真机诊断修正快照解析：DX5 II 实际快照为 `total=52`、`cur=0` 起；连接时的 `0x7130/0x7131/0x7133` 多帧流不再被误当成设置快照，避免整体错位一格后把电源读成 0（“已关机”）。USB 输入、线路/4.4mm 路由与 `0x1107` 采样率也按真机值修正。
- 设置页的 HID 诊断面板默认隐藏（`SHOW_DX52_DIAGNOSTICS = false`）；记录与复制代码保留，排查时改回 `true` 即可恢复。
- 正常升级不需要重新授权：授权记录仍在 WebView2 profile 中。

## 升级说明

- 旧沉浸组件存档（`right.header`、`right.meter`、`right.meta` 等父 ID）继续有效。
- 沉浸组件的摆放覆盖是新的存档键 `default-theme.immersive.layout.v1`；旧的"文字对比度"键 `default-theme.immersive.textBoost.v1` 不再读写，界面提亮改用 `default-theme.immersive.sceneLift.v1`（0–100，默认 70）。
- 编排器记住的视图、布局档与选中项是新键 `default-theme.immersive.layoutEditor.v1`；它只影响编排器自己打开时的位置，不影响沉浸视图，删掉这条即回到默认值。
- 旧侧边栏存档没有“我的耳机”开合项时按展开处理，不需要迁移。
- 耳机平均音量从本版本开始积累；新文件为 `loudness-v2.json`，旧 `loudness-v1.json` 只作为 legacy 时长读取，不参与 A/K/Z 平均。
- SPL 新方法不额外叠加 ReplayGain；读数跟随宿主实际提供的 PCM/频谱电平，宿主已在播放链路中应用时会计入。
- 测量配置来自 huihifi 公开测评曲线；未选配置时继续使用标称参数。
- 所有歌曲按插件写入的 `track_crc` 聚合；同一录音被算成不同 CRC（例如文件移动）时会显示为两行。
- 声压与平均音量仍是估算值，不建模输出阻抗、阻抗曲线、耳道耦合与头相关传输。
- 在线歌词与艺人简介依赖公开接口，可能暂时失效。

## English summary

Community-enhanced fork based on 0.3.0. Highlights: the cover-tinted layer of the immersive view now adapts to the colour extracted from the cover, so a dark cover no longer dims the whole view (brightness and chroma are separated, the cover only contributes its colour; the “Scene brightness” slider replaces the old text-contrast one); hidden components reflow by their own height instead of leaving a gap; a new Immersive arrangement editor moves and resizes components per view and layout tier, with arrow-key nudging (hold to keep nudging), a usage hint and a zoomable preview; clicking a component selects it (a solid ring marks the selection and the line under the preview names it), the editor remembers the view, layout tier and selected component, and the lyric components of every scene now follow the arrangement; the global keyboard focus ring is removed. Also an in-view lyric search panel, per-element immersive component switches, spectrum-level SPL from raw PCM RMS and measured headphone FR/impedance profiles with selectable A/K/Z weighting (default A, fixed-A safety margin), weekly playback statistics, DX52 per-headphone average SPL (energy-weighted, day/week/month/year plus an all-headphones average), an all-headphones average tile and headphone-time tile, an all-statistics detail page with a searchable/sortable all-songs table and per-headphone duration matrix, a “My headphones” sidebar selector between Library and Playlists, Kugou-hash as the default ID search source, and hardened DX52 snapshot assembly with descriptor-aware output/feature transport probing. This release also makes the tray menu’s play/pause row follow playback state, restores the window on tray-icon double-click (natively, so it works while the page is suspended), adds a three-level Background activity setting (Normal / Eco / Stop loading), shows a live SPL readout in the mini player, uses the full width for the artist/album line when a track is unrated, styles the lyric-search dropdowns for dark mode, and ships a volume-math audit report. Existing component, sidebar and WebHID settings keep working after upgrading. Full details are in `CHANGES-SINCE-0.3.0.zh-CN.md`.
