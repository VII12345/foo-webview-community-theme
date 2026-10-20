/**
 * `foo_acoustic_stats` 插件与主题约好的文件位置。
 *
 * 插件在 foobar 进程里测量播放信号、算声压与耳机使用时长：窗口最小化、收进托盘、网页被挂起时
 * 它照旧在跑 —— 统计的真相只有一份。
 *
 * 主题这一边只有两件事：
 * - 把**算好的**耳机档案与耳放档位写成配置给插件（`config.txt`）。
 * - 读插件写的那份瞬时状态（`live.json`）与统计文件（`webview-ui-stats\loudness-v2.json`）。
 *
 * 放在第 1 层（playback）而不是第 2 层：统计那边（`src/stats`）也要用这些路径。
 */

/** 插件与主题通信用的目录（profile 下）。 */
export const ACOUSTIC_PLUGIN_DIRECTORY = 'webview-ui-acoustic';
/** 主题写给插件的测量配置。 */
export const ACOUSTIC_CONFIG_FILE = 'config.txt';
/** 插件写给页面读的那份瞬时状态；它在就说明插件装着。 */
export const ACOUSTIC_LIVE_FILE = 'live.json';
/** 插件自己的累计存档；它在就说明统计由插件在写，页面不要抢。 */
export const ACOUSTIC_PLUGIN_STATE_FILE = 'stats.state';

/** 配置文件的完整路径。 */
export function acousticConfigPath(profilePath: string): string {
  const base = profilePath.replace(/[\\/]+$/, '');
  return `${base}\\${ACOUSTIC_PLUGIN_DIRECTORY}\\${ACOUSTIC_CONFIG_FILE}`;
}

/** 插件写给页面读的那份瞬时状态的路径。 */
export function acousticLivePath(profilePath: string): string {
  const base = profilePath.replace(/[\\/]+$/, '');
  return `${base}\\${ACOUSTIC_PLUGIN_DIRECTORY}\\${ACOUSTIC_LIVE_FILE}`;
}

/** 插件自己的累计存档的路径。 */
export function acousticPluginStatePath(profilePath: string): string {
  const base = profilePath.replace(/[\\/]+$/, '');
  return `${base}\\${ACOUSTIC_PLUGIN_DIRECTORY}\\${ACOUSTIC_PLUGIN_STATE_FILE}`;
}
