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

> 后续真机反馈改为对比度优先，见第 8 节；本节保留第一轮实现记录。

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
  - DX52 状态超过 5 分钟没有新报告就视为过期。
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

## 6. 歌词 ID 搜索默认酷狗

- 右侧卡歌词搜索切到“歌曲 ID”模式时，来源默认酷狗、标识默认酷狗 Hash，不再默认网易云。
- 来源下拉顺序改为酷狗、QQ、网易云；手动切换来源仍会重置到该来源的第一种标识。
- 旧快照里保存的来源/标识仍按原值恢复。
- 验证：`tests/e2e/lyrics-panel.spec.ts` 的 ID 搜索用例；网易云 ID 仍需显式选择网易云后可用。

## 7. DX52 真机反馈：快照加固与 HID 诊断

- 真机反馈：设备一直开机并连接，重试多次仍连不上；偶尔连上却显示“已关机”。上一轮只做了模拟 HID 测试，没有真机验证。
- 快照装配加固：
  - `total <= 1` 的短应答不再当成 45 字段设置快照；这种帧只进诊断日志。
  - 重复首帧不再清空已收帧；重复帧按 index 覆盖，其他帧保留。
  - 完整快照要求 `total >= 45` 且 0..44 全部收到；不再接受短快照后把缺失字段按 0 读成“已关机”。
  - 收到关键字段后静默 1.5 秒即接受部分快照，并标记 `partial`；设置页/声压组件显示“设置读取不完整”，不再显示“已关机”。
  - 重试时补发 `connectState`，并把每轮发送/接收原始帧保留在诊断里。
- 设置 → 耳机新增“HID 诊断”：
  - 状态、快照 total/received/missing、最后错误。
  - 最近 200 条发送/接收原始帧（hex + 解析结果）。
  - “复制诊断”与“重新读取”按钮。
- 真机字段映射仍待用户把诊断文本发回后确认；本轮不猜字段索引。
- 验证：`dx52Prefs.test.ts` 短应答、重复帧、交错重发、部分快照、诊断导出；`dx52-diagnostics.spec.ts` 诊断面板与“设置读取不完整”；`dx52-failure.spec.ts` 与设置页原有行为不回归。

## 8. 文字对比度修正（替换上一轮的固定提亮）

- 真机反馈：滑杆拉高反而更看不清；固定向白色混合会在中亮背景上降低对比度。
- 改为对比度优先：
  - 计算合成背景亮度与文字基色亮度，目标色取白/黑中对比度更高的一端。
  - 基色与目标在背景同一侧时，滑杆直接控制向目标色的混合比例。
  - 在背景两侧时，先数值搜索“不低于原对比度”的安全百分比，再从该点混向目标；任意非零滑杆值都不会比 0% 更差。
  - 作用于 `fg1/fg2/fg3`、`paper-ink`、`paper-hot`，以及当前歌词行的强调色（新增 `--lyrics-active`；右侧卡仍回退 `--accent`）。
  - `0%` 时不输出 `--lyrics-active`，当前歌词行回退到原来的 `--accent`；只有确实需要修正时才覆盖，避免 0% 下颜色序列化差异。
- 背景、纸面染色、封面 wash、图纸/聚焦视图不变；配置键 `default-theme.immersive.textBoost.v1` 与缺省 50 不变，设置文案改为“歌词与卡片文字对比度”。
- 验证：`textBoost.test.ts` 覆盖目标选择、安全百分比、任意滑杆对比度不下降；`immersive-text-boost.spec.ts` 覆盖深/中亮封面、纸面背景不变、图纸不变、当前行强调色；`settings-immersive.spec.ts` 更新滑杆名称。

## 9. 统计页顶部平均声压与全部统计二级页

- 统计页顶部“曲目数”右边新增第四块：当前选中范围（今天/本周/本月/今年）的 **全部耳机能量加权平均 SPL**；无数据时显示 `—`。
- 统计页统一加载 `loudness-v1.json`，一次算出四个范围的 summary；顶部块、耳机区块和详情页共用同一份数据，打开详情不会重复读文件。
- 新增页内二级页“全部统计”（右上角按钮，带返回）：
  - 四周期概览表：范围、时长、次数、曲目数、全部耳机平均 SPL。
  - 每只耳机 × 四周期的平均 SPL 矩阵，末行“全部耳机”。
  - 各周期的 Top 歌曲与艺人（复用现有榜单）。
- 统计库缺失时详情页仍显示耳机音量；loudness 缺失/拒绝时显示对应空状态。
- 验证：`loudnessStats.test.ts` 的 `summarizeLoudnessScopes`；`stats-page.spec.ts` 的顶部块、范围切换、详情页四行概览/SPL 矩阵/四个 Top 区块、返回保持范围、打开详情不重复读文件。

## 10. 全部歌曲表、耳机使用时长与侧边栏快速切换

### 10.1 全部时间的所有歌曲

- `monthlyStats.ts` 新增 `StatsSongRow` 与 `StatsData.songs`：按 `track_crc` 跨全部日期聚合，字段含曲名、艺人、专辑、路径、累计收听秒数、播放次数、首次/最近日期。
- 查询一次探测 `monthly_count` 的可选列（`path`、`album`、`playcount`、`total_time_seconds`）；老库缺列时按空串/0 处理，四个时段查询也一并按探测结果拼接。
- “全部统计”详情页新增“所有歌曲”表：
  - 列：曲名、艺人、专辑、累计收听、播放次数、最近播放；曲名前带 32 px 封面缩略图。
  - 默认按累计收听降序；点击列头切换升降序，文本用 `Intl.Collator` 做自然排序。
  - 搜索框匹配曲名/艺人/专辑，`useDeferredValue` 保持输入流畅。
  - 每页 100 首，上一页/下一页；搜索或排序变化时回到第一页。
  - 区分“统计库没有歌曲”和“搜索无结果”。
- 详情页移除四个时段的 Top 歌曲区块，只保留四个时段的 Top 艺人；主页面的 Top 歌曲不变。

### 10.2 耳机使用时长

- 主页面顶部在“平均声压”右边新增第五块“耳机使用时长”，跟随今天/本周/本月/今年，值来自 `summarizeLoudnessScopes(...).overall.seconds`；无数据显示 `—`。
- 详情页新增“各时段耳机使用时长”矩阵：每只耳机 × 四时段，末行“全部耳机”；与 SPL 矩阵共用同一份 `LoudnessSummary`，不重复读 `loudness-v1.json`。
- 时长仍只统计 DX52 自动读数生效、已选耳机且正在播放的时间；与播放统计的 `total_time_seconds` 是两个口径，界面分别标注。

### 10.3 侧边栏“我的耳机”

- 展开侧边栏在“媒体库”和“播放列表”之间新增可折叠“我的耳机”分节；图标态在资料库项与播放列表锚点之间新增耳机图标，点开浮层。
- 列表按设置里保存的顺序显示 `HeadphoneRig.headphones` 的名字；当前耳机用 `aria-pressed=true` 和行尾勾选标记。
- 点击一行立即调用 `selectHeadphone(id)`：同步更新内存、异步落盘，不跳转页面、不弹确认框、不改变 `selectedAmpId`。
- 分节开合状态写入现有 `default-theme.sidebar.v1` 的 `sections.headphones`；旧存档没有该键时按展开处理。
- 空列表显示“还没有耳机”，不使用“即将推出”的禁用态。
- 验证：`sidebarPrefs.test.ts` 的新分节解析/开合；`sidebar-headphones.spec.ts` 的展开态切换、无确认/无导航、图标态浮层、当前项标记；`sidebar-collapse.spec.ts` 的淡入淡出计数。

## 11. DX52 传输探测：输出报告、Feature Report 与发送结果

- 真机诊断只有 `send`、没有 `receive`。旧代码在 `sendReport` 之前就记日志，且用 `settle()` 吞掉拒绝，所以“已发送”并不代表设备接受。
- `dx52.ts` 新增 HID 描述符读取：
  - `reportByteLength` 按 `reportSize × reportCount` 算字节数。
  - `summarizeDx52Descriptors` 递归 collections，汇总 input/output/feature 报告 ID 与长度。
  - `dx52ReportCandidates` 优先 vendor usage page、report ID 0；描述符不可用时退回 16/64 字节。
  - `fitDx52Report` 按声明长度补零/截断。
  - `pickDx52Device` 给带 vendor 报告的接口加分，避免同名接口永远选第一个。
- 发送改为串行并记录真实结果：
  - `queueSend` 按候选报告发送，`ok=true/false` 与错误文本写进诊断。
  - 输出报告发送时按描述符长度补零；发送失败自动换下一个候选。
- Feature Report 回退：
  - 没有 output 报告或输出发送后仍未收到任何报告时，按 feature 候选发送 `connectState`/`getSettings`。
  - 每 50 ms 调 `receiveFeatureReport(reportId)` 轮询；`NotFoundError` 视为暂时没有数据，继续轮询；其它错误记录一次并停止该候选。
  - 收到可解析帧后锁定发送/接收路径；后续心跳与请求走上锁定的发送路径。
- inputreport 与 feature 轮询可能重复送同一帧；按 hex 在 1 秒窗口内去重。
- 诊断面板新增：
  - `HID 报告`：collections 数量与 input/output/feature 的 `reportId@长度`。
  - `传输`：选中的 send/receive、是否锁定。
  - 每条发送/接收记录带 `via=`、`declared=`、`ok=`、`error=`。
- 验证：`dx52.test.ts` 的描述符/长度/设备评分；`dx52Prefs.test.ts` 的 64 字节输出、发送拒绝、Feature-only 快照；`dx52-diagnostics.spec.ts` 的 Feature-only 设备与诊断文本。
- **2026-10-19 真机诊断补充**：设备已能连上，实际快照为 `total=52`、`cur=0..51`。连接时设备会先推 `0x7130/0x7131/0x7133` 等多帧流；旧代码把这些未知多帧流也当快照，`frameBase` 被设成 1，真正的 `0x710c` 快照整体错位一格，`word[0]` 变成设备名，于是读成“已关机”。
  - 快照候选现在要求 `total >= 45`，短的多帧推送流不再参与 `frameBase`/`frameWords`。
  - 若先收到 1 基帧、随后收到 `cur=0` 的快照重发，会清空并按 0 基重收。
  - 真机字段：`word11=6` 是 USB 输入；`word12=0` 是线路输出、`4` 是 4.4mm 平衡；采样率来自 `0x1107` 推送（`data=44100`），`word27` 不是采样率。
  - 已用真机 52 字快照写单元测试，覆盖先到推送流、4.4mm 与线路输出两种情况。
- 设置页的 HID 诊断面板默认隐藏：`SoundPressureSection.tsx` 里的 `SHOW_DX52_DIAGNOSTICS = false`。记录、复制与格式化代码保留，改成 `true` 即可恢复；e2e 诊断面板用例相应用 `test.skip` 标出。
- 仍然不能宣称所有真机字段都已确认：这次修正解决的是快照错位与“已关机”，其余字段（增益、线路模式、45..51 的扩展字）仍按现有映射，后续以诊断为准。

## 12. 频谱级 SPL、测量档案与 A/K/Z 加权

### 12.1 电气与声学模型

- 不再用 K 加权 Short-term LUFS 反推电压：
  - PCM 流每 100 ms 同时累计 K 加权块能量和每声道**未加权均方**；
  - `rmsDbfs = 10log10(2 × meanSquare)`，满幅正弦 = 0 dBFS；
  - 电压 `V = V0 × 10^((rmsDbfs + volumeDb + ampGainDb)/20)`，DX52 再乘 0.2 Ω 输出阻抗分压。
- 频谱形状来自宿主 `audio.subscribeSpectrum` 的 stereo bins（16384 点 FFT，20 Hz–20 kHz），按 31 个 1/3 倍频程 band 汇总。
- 每帧保留绝对 band 功率；3 秒/曲目窗口累加绝对功率后再归一化成 share，避免安静帧和响帧同权。
- 总能量仍来自 PCM RMS，频谱只提供形状，避免 FFT 重叠帧重复计能；ReplayGain 不额外叠加，若宿主流已包含则随读数计入。
- FR 用 huihifi `RAW_FR`，在 1 kHz 归一化为 0 dB；阻抗用 `IMPEDANCE` 幅值（按 0° 处理）。
- `dB/mW` 转 `dB/V` 的参考阻抗：有档案时用档案 1 kHz 实测阻抗，否则用标称阻抗。
- 每个 band 内积分 `|Z/(Zamp+Z)|²`、FR 与加权曲线，不只取中心频率。
- 多声道：只对 ≤2 声道走新方法；>2 声道回退旧 LUFS 路径，不假装覆盖中置/LFE。
- 不额外叠加 ReplayGain；读数跟随宿主实际提供的 PCM/频谱电平，宿主已在播放链路中应用时会计入。`volumeDb` 仍单独加。

### 12.2 A/K/Z 加权与安全余量

- 设置 → 耳机新增“声压加权”：A/K/Z，默认 **A**。
- A：IEC 61672 解析式，1 kHz 归一化 0 dB。
- K：BS.1770 两级 biquad 的幅频响应，再按 1 kHz 归一化 0 dB；Loudness 表仍用原来的 K 加权 LUFS，不受设置影响。
- Z：0 dB。
- 加权只作用于 SPL 的 band 功率，不作用于电压。
- 80 dB 安全余量固定按 **A** 加权，`state` 超限也按 A；切换显示加权不会改变是否超限。
- SPL 单位随加权显示：`dBA` / `dB SPL (K)` / `dB SPL (Z)`。
- 回退：有 bands + PCM RMS → 完整 A/K/Z；只有 PCM RMS → Z 平坦；都没有 → 旧 LUFS，统计不写入新口径。

### 12.3 测量档案

- 新增 `huihifi-ft1` / `huihifi-jt7` / `huihifi-mdr-m1` 三份测量档案，由 `scripts/build-headphone-measurements.mjs` 从 huihifi 公开测评接口生成。
- FR 降采样到约 1/24 倍频程并 1 kHz 归一化；阻抗降采样到约 1/24 倍频程；THD/动态线性保留在 JSON 中，首版不参与 SPL。
- 耳机设置新增“测量配置”下拉，默认“无（仅用标称参数）”；沉浸视图耳机编辑表单也保留该字段。
- 未选档案或 id 不存在时继续使用平坦 FR + 标称阻抗。
- 测量档案只改变 SPL 计算，不改变耳机声音；曲线来源/许可在 `THIRD_PARTY_NOTICES.md` 标注。

### 12.4 统计 v2

- 新文件 `<profile>\webview-ui-stats\loudness-v2.json`，内部 `version: 2`：
  `{ name, seconds, energyA, energyK, energyZ, legacySeconds?, legacyEnergy? }`。
- 每秒同时记录 A/K/Z 三份能量；统计页跟随全局声压加权，默认 A。
- 旧 `loudness-v1.json` 读取时迁成 `legacySeconds/legacyEnergy`：时长合计包含 legacy，A/K/Z 平均不参与，避免新旧口径混算。
- 顶部平均声压、耳机区块、详情矩阵都按当前加权显示单位；耳机使用时长 = `seconds + legacySeconds`。

### 12.5 验证

- `headphoneMeasurements.test.ts`：三份档案、1 kHz 归一化、插值、band 响应。
- `splWeightingCurves.test.ts`：A 常用频点、K 1 kHz 归一化、band 表。
- `soundPressure.test.ts`：满幅正弦 RMS、0.2 Ω 分压、频带/RMS 路径一致、较响声道、固定 A 余量。
- `liveBandPower.test.ts` 与 `liveBandPowerService.test.ts`：band 功率、stereo 解析、服务发布 shape。
- `loudnessStats.test.ts`：v2 三能量、v1 legacy 迁移、加权聚合。
- `settings-sound-pressure.spec.ts`：测量配置与加权持久化。
- `stats-page.spec.ts`：v2 fixture、默认 A 的 `dBA` 单位。
- `build.test.ts`：新频谱/SPL 模块不在初始包。

## 13. huihifi 链接导入自定义测量档案

### 13.1 流程

- 设置 → 耳机 → 编辑耳机 → “从 huihifi 链接导入”：
  - 粘贴 `https://huihifi.com/evaluation/{uuid}` 或 `https://www.huihifi.com/evaluation/{uuid}`；
  - 获取后显示名称、品牌、原始频响/阻抗点数与覆盖/内置重复/缺阻抗提示；
  - 点“导入”写入本地档案，并自动在“测量配置”下拉选中；
  - 仍需点耳机表单的“保存”才把 `measurementProfileId` 写进耳机配置。
- 设置页“自定义测量档案”列出已导入档案：点数、导入日期、被多少耳机使用；删除需二次点击。
- 删除被耳机引用的档案不会改耳机配置；该耳机会回退到平坦 FR + 标称阻抗，下拉显示“不可用（回退标称参数）”。

### 13.2 存储

- 便携版 profile 下：`<profile>\webview-ui-headphones\measurements-v1.json`。
- 与 `webview-ui-stats`、`webview-ui-artists` 等现有目录同级；使用 `fb.file.write(..., { atomic: true })`。
- Schema `{ version: 1, profiles: [...] }`；每份档案保存归一化/降采样后的 FR 与阻抗、来源链接、导入时间。
- 最多 64 份、文件最多 2 MB；超限明确报错，不自动淘汰。
- 自定义 id 固定 `huihifi-custom-<uuid>`；同链接重复导入覆盖同一条。

### 13.3 链接与安全

- 只接受 huihifi 的 https 评测链接；拒绝其它 host、端口、userinfo、额外路径与坏 UUID。
- 不请求用户粘贴的 URL，只请求由 UUID 派生的 `https://huihifi.com/api/v1/evaluations/<uuid>`，并使用 `redirect: 'error'`，避免重定向/SSRF。
- 载荷限制 `datas <= 64`、单表 `<= 10000` 行、body `<= 4 MB`；FR 至少 8 点、覆盖约 100 Hz–10 kHz 且含 1 kHz；阻抗可缺省。
- 本地文件按不可信输入校验：version/id/UUID/曲线行/点数/大小；坏条目丢弃，坏文件标 `corrupt`，下一次导入覆盖。

### 13.4 验证

- `huihifiEvaluation.test.ts`：链接白名单、载荷解析、1 kHz 归一化、降序阻抗、缺阻抗、超限。
- `customHeadphoneMeasurements.test.ts`：空/坏/拒绝文件、预览不发无效请求、派生 API URL、原子写路径、重复导入覆盖、删除。
- `settings-measurement-import.spec.ts`：无效链接、预览、导入、下拉选中、保存写耳机、刷新持久化、删除。
- `build.test.ts`：自定义导入/解析模块不把内置测量 JSON 带进初始包。

## 14. 便携版 profile 写入修复（huihifi 导入与耳机统计）

- 现象：便携版装在 `C:\Program Files\foobar2000` 时，huihifi 链接导入提示“无法保存本地档案”；播放统计的耳机平均音量与使用时长始终为空。
- 根因：`foo_ui_webview2` 的 `PathSecurity::ValidateFileWriteAccess` 先判系统黑名单、再判 profile 写白名单。profile 同时命中 Program Files 黑名单与 profile 白名单，`file.write` 返回 `PERMISSION_DENIED`；读取路径早已是白名单先判，所以统计页看到的是 `NOT_FOUND`（暂无数据），而不是读取失败。
- 第二个独立原因：`startLoudnessIntegration` 启动 `startLoudnessStats` 时没有传宿主，统计记录器直接返回空操作。即使写入权限正常，也不会累计或生成 `loudness-v2.json`。现在把 `fb` 作为默认宿主同时传给实时响度、频谱与统计服务，并新增集成测试覆盖宿主接线。
- 主机修复：
  - `ValidateFileWriteAccess` 改为“写白名单（profile/temp）→ 黑名单 → 监视目录 → 非系统卷 → 媒体库/播放列表”。
  - 判定抽到 `src/utils/WriteRulesOrder.h`，gtest 直接覆盖生产顺序。
  - 黑名单仍先于监视目录、非系统卷与媒体库信任来源；MediaWrite（标签/歌词写媒体文件）不变。
  - 非原子写补 `file.fail()` 检查，避免回退写把部分失败报成成功。
- 主题侧：
  - 新增 `src/host/fileWrite.ts`：原子写失败仅在 `OPERATION_FAILED` 时退回普通写；权限拒绝、不支持、参数错误与调用被 reject 不重试。
  - huihifi 导入显示宿主错误码；提交失败保留预览与“导入”按钮，可直接重试；`PERMISSION_DENIED` 文案提示更新 foo_ui_webview2。
  - 统计记录器发布 `loudnessStorageAtom`（最近采样/写入/失败码）；统计页打开前先触发一次 flush，再读 `loudness-v2.json`，避免刚播放的数据要等防抖。
  - 空状态区分“还没有采样（DX52 门控未满足）”与“已记录，等待写入”；写入失败显示带 code 的提示。
- 组件：随包 `foo_ui_webview2.dll` 更新为 6,233,088 字节，SHA-256 `80e6cbb27597fa391c04da8815d108f2915f6286b308bc62c38170dd034ee7c3`。
- 验证：插件 gtest 1958 项；主题单元 461 个文件 / 3792 项；`settings-measurement-import.spec.ts` 新增原子写回退与权限拒绝后重试；`loudnessIntegration.test.ts` 覆盖记录器拿到宿主；真机导入后 profile 下生成 `webview-ui-headphones\measurements-v1.json`，播放后生成 `webview-ui-stats\loudness-v2.json`。

## 15. 焦点框、界面提亮、隐藏回流与组件编排

### 15.1 取消全局键盘焦点框

- 焦点圈都画在 `colorStrokeFocus2` 这一个 token 上：Fluent 的组件画在带 `data-fui-focus-visible` 的元素的
  `::after` 边框与标签栏的 `box-shadow` 上，本仓库自己的 `:focus-visible` 规则也一律引它。
- 改在主题对象上（`src/theme/themes.ts` 的 `withoutFocusRing`），一处即全局生效：应用、沉浸、封面三处
  FluentProvider 与本仓库全部焦点规则。改在 CSS 类上不行——Fluent 把主题写成一条挂在 provider 根上的 class 规则，
  那条规则排在 Griffel 的原子类之后，同优先级时它说了算。
- 托盘浮层（宿主另起的文档，用的是 theme 原值）与启动页各改一处。
- 焦点本身与 Tab 顺序不受影响，只是键盘聚焦不再有可见提示。

### 15.2 封面底色按提取颜色自适应，整个界面提亮

- 换掉了上一轮的"文字对比度优先"（`src/immersive/paper/textBoost.ts` 整体删除）。那套是让文字去迁就被压暗的
  背景：深封面把场景压到中间亮度后，文字被推向黑色，对比度达标了但界面照样发暗。
- 现在改的是根：封面底色那一层（`PaperCoverWash` 的根是 `inset: 0` 且不透明）铺满整幅场景，它就是"整个界面"
  的背景。底色原先是 `mix(纸面, 封面, 0.5)`（比例是常数），封面亮度直接决定场景亮度。
- 改为把亮度与色度分开：亮度按纸面亮度平移、并夹在当前深浅的可读带里（浅色档近黑字、深色档近白字各有临界），
  色度按上限保留封面的颜色——**封面只给颜色、不给亮度**。做法照主窗口背景（`backgroundPalette.ts` 把封面的
  HCT tone 夹在带里、`flowShaders.ts` 的 `lightField()` 把亮度与色度分开）。
- 平移量按封面提取的亮度自适应：封面亮度离纸面越远，平移越多。同一把尺子也管住反方向——深色档 + 亮封面
  时场景不会被冲淡，近白歌词不会失去对比。
- 静态档（`coverWarp.ts` 的 `shade()`）与流动档（`warpShader.ts` 的片元着色器）同步改，两边算法必须一致。
- 新配置键 `default-theme.immersive.sceneLift.v1`（0–100，缺省 70）；旧键 `textBoost.v1` 语义变了、不再用，
  按 `kit/localPref.ts` 的约定换新键，旧键留给回滚的旧版本读。设置文案改为"界面提亮"。

### 15.3 组件隐藏后按组件高度回流

- 根因：full 档右栏用固定高度的"带"（`paperComponentLayout.ts`），只有整带全隐藏才收带，**带内单个叶子被隐藏
  时那段高度原样留着**——藏掉标题，那 76 px 的字位还在，就是空白。
- 改为每格一个盒子（`stageRightBoxes`）：右栏按行分组，行内可见格子横向流动（藏一格后面的左移），行高取可见
  格子的最大高，整行全藏则收成 0、后面的行跟着上移。四行字拆成 From / 标题 / By 三行，各自落位。
- 全部可见时与现有图纸坐标逐位相同（`header` 82、`meter` 296、`spectrum` 457、`waveform` 705、`media` 828、
  `lyrics` 964）；行间距烘在行顶里，拆行时按"间距 + 内容高"分配，三行之和仍等于 214。

### 15.4 沉浸组件编排器

- 新配置键 `default-theme.immersive.layout.v1`：组键 `${view}/${tier}` → 模块 id → 覆盖
  （相对默认盒子的偏移 dx/dy、尺寸比例 sw/sh、叠放次序 order）。
  只存挪过的那几项，没动过的沿用默认盒子；卡片两档不分档位，一律记在 `full` 组下。
- 设置页新增"沉浸编排"一组：按视图与布局逐个组件调整，拖框挪位置、拖右下角改大小（8 px 吸附，Esc 取消），
  下方清单列出每个组件的 x/y/宽/高，可单个或整组恢复默认。改动即时生效。
- 覆盖落在组件外层的一套 `translate() scale()` 上（`src/immersive/layout/Placed.tsx`）：组件内部照旧按舞台坐标
  排，缩放的原点取默认盒子的左上角，缩放就在原地发生。
- 粒度到每个叶子组件：右栏的四行字、仪表四格、频谱、波形、量表、文件信息、歌词；卡片两档的封面、曲名、艺人、
  星级、更多、进度条、传输键、三格；罗盘那几件（三环、轨道、刻度、专辑名、封面、括号、三格、传输键）。
- 目前的编排器只覆盖 full 档（1920 × 1080 的整幅舞台）与卡片两档：其余各档是版心坐标、由版心的流式排法决定，
  组件之间没有独立的位置可改，暂不支持逐件摆放。存档结构按 `${view}/${tier}` 分组，其余各档的组留空即可。

## 16. 编排器的方向键操作与其他布局

### 16.1 方向键微调

- 编排器原来只能用鼠标拖，落不到 1 px 精度。现在方向键移动 1 像素，Shift+方向键一次 8 像素
  （一个网格），Alt+方向键改宽高，Tab 在组件之间换焦点，Esc 撤销本次编辑。
- 按住方向键不放时系统连发 keydown，每一下都挪一次，长按即连续微调。
- 键盘走元素自己的 onKeyDown，不登记到命令登记处：登记处按"和弦"匹配按键，方向键的四种修饰
  组合要登记十六条，而这里一次按键处理里就能读到修饰键。仓库里表格列头用 Alt+← 换列也是这条路。
- 预览边上（紧贴着预览框下沿）写一块常驻的操作提示，把鼠标与键盘两路怎么用说清楚。
- 另外加一个预览缩放档（适应窗口 / 100% / 200%）：预览是缩着画的，1 舞台像素在屏幕上只有
  零点几像素，不放大按不出来"微调"。预览容器随之改成可滚动的。
- 编排器自己画焦点框：全局的键盘焦点框已经取消了，而这里键盘是主要操作方式。

### 16.2 覆盖改存偏移量

- 版心两档（compact / narrow）的版心宽度随窗口变，绝对坐标在窗口一变窄就会漂。覆盖改存
  **相对默认盒子的偏移与比例**（`dx`/`dy`/`sw`/`sh`）：偏移与窗口无关，比例让宽度跟着右栏
  变动的件（频谱、波形、歌词）也能缩放。存档键还没发布过，直接改格式；旧格式按缺省读。

### 16.3 版心各档也能逐件摆

- 版心右栏原来靠 flex 竖排：块的高写死在 CSS 里，藏掉一块后面的不会跟上来。现在每一块按
  布局算出的盒子绝对定位（`sheetBoxes`），藏掉一块后面的跟着上移，不留空白。
- 版心各档的块：四行字的 From/标题/By、元数据行、频谱、整轨波形、量表、文件信息、脚注、歌词；
  罗盘那几件（三环、轨道、刻度、专辑名、曲号、封面、括号、传输键）也各有盒子。
- 编排器的布局下拉现在给出全部六档，预览按该档的版心画（竖版三档是竖构图）。

## 17. 编排器的选中态、歌词摆放与操作位置记忆

### 17.1 点选与方向键

- 方向键“时好时坏”的根因：拖拽要在 `pointerdown` 上 `preventDefault`，浏览器默认的
  “点谁聚焦谁”被挡掉了，点过的组件拿不到 DOM 焦点，选中态一直是空，方向键整个是哑的；
  焦点还留在上一个点过的组件上，按方向键动的其实是别的组件。现在按下时显式把焦点交给
  那个组件。
- 选中的框画实心品牌色描边、标签反白；键盘焦点另给一条虚线描边。清单里对应那一行也标
  出来，预览下面写着“当前选中”。
- 清单里点组件名也能选中它（并滚到可见处）。
- 键盘挂在整块编排器上：焦点在预览里、在清单里都一样能微调；下拉框展开时自己要用方向键
  选项，不抢。
- 点一下（没拖动）不再在存档里留下一条“挪过”的记录，清单里也不多出一个恢复默认的按钮。

### 17.2 歌词接上摆放覆盖

- 四个场景的歌词原先都没接上覆盖：聚焦档的歌词日志与歌词、卡片、卡片歌词三档的动画歌词
  都直接画在舞台坐标上，预览里能拖、实际一动不动；只有图纸档的歌词卡（外层套着 `Placed`）
  能挪。
- 这两件本来就绝对定位在自己的盒子里，变换直接加在它们身上（`placementStyle`，原点取
  自己的左上角），平移与缩放都落在看得见的地方。
- 卡片歌词档的歌词跟着卡片走，盒子按卡片的上下沿算，不再是右半那块固定的位置。
- `placementStyle` 顺带把叠放次序给上，版心各档的块也能改次序。

### 17.3 记住上次在弄哪个

- 新配置键 `default-theme.immersive.layoutEditor.v1`：视图、布局档、预览缩放与选中的组件。
  挪完去看沉浸视图的实际效果，回来时接着弄，不用把视图、布局与组件重选一遍。
- 存取用仓库既有的 `defineLocalPref`：带版本号、逐项校验，认不出的值按缺省。记的是原始的
  布局档——卡片两档不分档位，别把用户上次挑的紧凑档顶掉。
- 点目录跳到“沉浸编排”这一组时，焦点落在组标题上，再挪到上次选中的那个组件上：回来就能
  接着按方向键调。

## 附录 A：提交对照

| 提交 | 内容 |
|---|---|
| `18b9974` | DX52 快照重试、连接状态与失败提醒弹窗 |
| `4c5db0d` | 歌词/卡片文字按封面自适应提亮 + 设置滑杆 |
| `a58dff6` | 沉浸视图内歌词搜索面板 |
| `73f693e` | 沉浸组件开关细化到每个可见元素 |
| `bc2cff3` | 播放统计本周 + DX52 耳机平均 SPL |
| `c59eef8` | DX52 长时间无新报告时保持 5 分钟新鲜窗口 |
| `46bcb11` | 歌词 ID 搜索默认酷狗 Hash |
| `8bcc800` | DX52 快照加固 + HID 诊断面板 |
| `a2d9a6b` | 文字对比度优先修正 |
| `0a6f96f` | 统计顶部平均声压 + 全部统计二级页 |
| `0d118f9` | 0% 时保留原强调色 + e2e 对比度取样修正 |
| `6542570` | 全部时间的所有歌曲聚合 |
| `8651f2f` | 全部歌曲表 + 耳机使用时长顶部块与矩阵 |
| `07e54c1` | DX52 输出/Feature 传输探测与真实发送结果 |
| `6666b9f` | 侧边栏“我的耳机”快速切换 |
| `cdb0eff` | 所有歌曲表加 32 px 封面缩略图 |
| `326a877` | 按真机 52 字快照修正 DX52 解析（解决“已关机”） |
| `5e5e248` | 抽出不依赖 JSON 的测量曲线数学层 |
| `2bfb183` | huihifi 评测链接与载荷解析 |
| `c7894e0` | 自定义测量档案写入便携版 profile |
| `38d345a` | 设置页导入/管理自定义测量档案 |

## 附录 B：新增配置键与文件

- `default-theme.immersive.sceneLift.v1`：0–100，缺省 70；封面底色往纸面亮度拉回多少，界面整体跟着提亮。
- `default-theme.immersive.textBoost.v1`：旧键，语义变了（文字对比度修正已删除），不再读也不再写。
- `default-theme.immersive.layout.v1`：沉浸组件的摆放覆盖，组键 `${view}/${tier}`。
- `default-theme.immersive.layoutEditor.v1`：编排器记住的视图、布局档、预览缩放与选中的组件；
  只影响编排器自己打开时的位置，不影响沉浸视图。
- `default-theme.immersive.components.v1`：沿用原键；新增叶子 ID 见第 4 节，旧父 ID 继续生效。
- `<profile>\webview-ui-stats\loudness-v2.json`：耳机 A/K/Z 能量累计文件；旧 `loudness-v1.json` 作为 legacy 读取。
- `<profile>\webview-ui-headphones\measurements-v1.json`：用户从 huihifi 链接导入的自定义测量档案；不随主题分发。
- `defaultTheme.playback.splWeighting`：`A` / `K` / `Z`，默认 `A`；只影响 SPL 显示，Loudness 表仍为 K 加权 LUFS。
- 测量档案 id 存在耳机配置的 `measurementProfileId`，不新增独立配置键。
- DX52：`defaultTheme.playback.dx52Auto`、`defaultTheme.playback.dx52Jack` 不变；诊断数据只在内存中，不落盘。
- 歌词搜索默认来源只是界面初始值，不新增配置键。

## 附录 C：下一次 release notes 取用

- 用户可见变化优先取第 1–12 节的标题与首段；细节（边界、存储路径、旧存档兼容）放“改进与修复”。
- 需要提醒用户的限制：耳机平均音量只统计 DX52 自动读数生效的耳机输出时段；统计从本次版本开始积累；声压仍是估算值。
- 新 SPL 方法不额外叠加 ReplayGain；读数跟随宿主实际 PCM/频谱电平，宿主已应用时会计入。
- 测量档案来自 huihifi 公开测评接口；内置三份随包，更多耳机可在设置里粘贴链接导入到本地 profile，不随主题分发。
- 自定义档案最多 64 份；删除被耳机引用的档案会回退标称参数，需要重新选择或导入。
- 旧 `loudness-v1.json` 的时长计入总时长，但不参与 A/K/Z 平均；统计页显示当前加权单位。
- 全部歌曲表按 `track_crc` 聚合；同一录音被插件算出不同 CRC（例如文件移动）时会显示为两行。
- 侧边栏“我的耳机”只切换耳机配置，不连带切换耳放；DX52 自动模式下有效耳放仍由设备决定。
- DX52 真机已能收到 `received=45` 的 52 字快照；快照错位导致的“已关机”已修正。剩余扩展字（45..51）与部分模式字段仍按现有映射，后续以诊断为准。
- 升级兼容：旧沉浸组件存档（父 ID）继续有效；WebHID 授权记录仍在 WebView2 profile 中，正常升级不需要重新授权。
