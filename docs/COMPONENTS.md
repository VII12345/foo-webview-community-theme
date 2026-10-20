# 随包组件说明 / Bundled components

本主题的完整功能需要以下组件。**标“修改版”的 DLL 不是官方发行版**，只随本仓库的 release 提供；官方版可从下面的来源下载。

| 组件 | 状态 | 大小 | SHA-256 |
|---|---|---|---|
| `foo_ui_webview2/foo_ui_webview2.dll` | 修改版（非官方） | 6,233,088 | `628be3f1e9db8d3349d59043e177cbc2bdf9f551d8191191cd88dad3b73e0651` |
| `foo_ui_webview2/WebView2Loader.dll` | 官方 Microsoft 1.0.3719.77 | 160,368 | `ae69309c5e356350ea28d6b71a900bc43ee7e3f7a457d80a1f82efe6c419cc08` |
| `foo_monthly_stats/foo_monthly_stats.dll` | 修改版（非官方） | 1,651,200 | `75c7d8bc62d6bc6d6c04dd0a6755923fc3a3b794ecb5463385d88f3f036d3773` |

## 来源

- foo_ui_webview2 官方仓库与 v2.0.0 发行：
  <https://github.com/NereaFantasia/foo_ui_webview2/releases/tag/v2.0.0>
- foo_monthly_stats 官方仓库与 v1.6 发行：
  <https://github.com/shirafukayayoi/foo_monthly_stats/releases/tag/v1.6>
  - 官方 v1.6 的 DLL 为 1,617,408 字节，SHA-256
    `05873c8afdcb8533876c0aa460c429a4b6dfa841b9a3d3cd27c104f0dcc2a818`。
  - 本包中的修改版增加了播放统计页使用的 `length_seconds` / `total_time_seconds`
    字段与替代版本回退；具体改动以作者说明为准。
- WebView2Loader.dll 来自官方 foo_ui_webview2 v2.0.0 的 x64 包，未修改。

## 安装

1. 关闭 foobar2000。
2. 把 `foo_ui_webview2/` 与 `foo_monthly_stats/` 两个文件夹复制到：
   - 便携版：`<foobar2000 目录>\profile\user-components-x64\`
   - 安装版：`%APPDATA%\foobar2000-v2\user-components-x64\`
3. 启动 foobar2000，确认组件列表里出现 `WebView2 UI` 与 `Monthly Stats`。

## 更新警告

- 本版 `foo_ui_webview2.dll` 修正了通用文件写判定：profile / temp 写白名单先于
  Program Files 黑名单。便携版装在 `C:\Program Files` 下时，旧 DLL 会拒绝主题写入
  `webview-ui-stats` 与 `webview-ui-headphones`，表现为播放统计没有声压/时长、huihifi
  导入提示“无法保存本地档案”。升级主题后请同时替换组件。
- 主题内置的在线更新仍指向上游仓库；安装上游主题更新会覆盖本分支的功能。
- foo_ui_webview2 的组件更新也可能用官方 DLL 替换这里的修改版。更新前请备份
  `user-components-x64/foo_ui_webview2/` 与 `foo_monthly_stats/`，或关闭自动更新。
- 修改版 DLL 可能被杀毒软件误报；请用上面的 SHA-256 核对文件。

## English

The bundled `foo_ui_webview2.dll` and `foo_monthly_stats.dll` are **unofficial modified
builds**, distributed only with this fork's releases. `WebView2Loader.dll` is the
unmodified Microsoft loader from the official foo_ui_webview2 v2.0.0 x64 package.
Official sources are linked above. Verify the SHA-256 values before use. The theme's
online updater still points at the upstream repository; do not install an upstream theme
update over this fork, and back up the component folders before updating the host plugin.
