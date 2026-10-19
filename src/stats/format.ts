import type { Translate } from '../i18n/translate.ts';

/** 秒数写成「X 小时 Y 分」这种给人看的写法；不足一分钟写秒。 */
export function formatDuration(seconds: number, t: Translate): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  if (hours > 0) return `${hours}${t('stats.hour')} ${minutes}${t('stats.minute')}`;
  if (minutes > 0) return `${minutes}${t('stats.minute')}`;
  return `${whole}${t('stats.second')}`;
}
