# 0.4.1 — 统计口径修正

修复 0.4.0 里的一个问题：**DX52 切到线路输出时，收听时间仍被记进耳机统计**。
其余内容与 0.4.0 相同，完整逐项记录见 [CHANGES-SINCE-0.3.0.zh-CN.md](../CHANGES-SINCE-0.3.0.zh-CN.md)。

## 修正

- 统计之前只看「正在播放 + 有配置 + 算得出声压」就记一笔。现在要求同时满足：
  - 页面「自动读取 DAC/耳放」开关打开（主题写进配置的 `autoEnabled`）；
  - 插件自己看到 DX52 **开机、USB 输入、当前是耳机输出**。
- 路由与开关机由插件实时读设备，所以窗口收进托盘、页面被挂起时也跟得上：线路输出期间
  不记，切回耳机后从那一刻起继续记。
- `live.json` 新增 `counted` 字段，直接标出这一秒有没有记进耳机统计；线路输出时会显示
  `false`，便于自查。
- 已经按旧口径记进去的线路输出时段无法从统计文件里回溯分离。

## 升级说明

- 需要同时更新主题与 `foo_acoustic_stats` 插件（插件不在随包组件里，按原来的方式更新
  `foo_acoustic_stats.dll`）。只更新其中一个时：插件自身会按设备路由判断，线路输出同样
  不会再记；主题侧的 `autoEnabled` 用于「自动读取开关关掉时也不记」这一条。
- 随包 `foo_ui_webview2.dll` 与 0.4.0 相同（6,233,088 字节，SHA-256
  `628be3f1e9db8d3349d59043e177cbc2bdf9f551d8191191cd88dad3b73e0651`）。
- 其余升级说明与 0.4.0 相同。

## English summary

Fixes a 0.4.0 issue where listening time was still credited to the selected headphone while
the DX52 was switched to line output. Statistics now require the page's auto-reading switch
to be on and the plugin to observe the device powered on, on USB input and routing to
headphones; the route is read live, so it also holds while the window is hidden to the tray.
`live.json` gains a `counted` flag showing whether the current second was recorded. Content is
otherwise identical to 0.4.0. Update both the theme and the bundled `foo_acoustic_stats` plugin.
