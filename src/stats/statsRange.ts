/** 播放统计的四种范围；周从周一开始。 */
export type StatsScope = 'today' | 'week' | 'month' | 'year';

export interface DateRange {
  readonly start: string;
  readonly end: string;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** 本地日期写成 `YYYY-MM-DD`；统计库与音量统计共用这个口径。 */
export function ymdOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function ymdOfMs(milliseconds: number): string {
  return ymdOf(new Date(milliseconds));
}

/** 解析 `YYYY-MM-DD` 为本地日期；非法输入回 `1970-01-01`。 */
export function dateOfYmd(ymd: string): Date {
  const [year = 1970, month = 1, day = 1] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(ymd: string, days: number): string {
  const date = dateOfYmd(ymd);
  date.setDate(date.getDate() + days);
  return ymdOf(date);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/** 周一到周日：`getDay()` 的周日 0 换成 6。 */
function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return start;
}

export function rangeForScope(scope: StatsScope, now: Date): DateRange {
  if (scope === 'today') {
    const today = ymdOf(now);
    return { start: today, end: today };
  }
  if (scope === 'week') {
    const start = ymdOf(startOfWeek(now));
    return { start, end: addDays(start, 6) };
  }
  if (scope === 'month') {
    return { start: ymdOf(startOfMonth(now)), end: ymdOf(endOfMonth(now)) };
  }
  return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
}

export function previousRangeForScope(scope: StatsScope, now: Date): DateRange {
  if (scope === 'today') {
    const yesterday = addDays(ymdOf(now), -1);
    return { start: yesterday, end: yesterday };
  }
  if (scope === 'week') {
    const current = rangeForScope('week', now);
    return { start: addDays(current.start, -7), end: addDays(current.end, -7) };
  }
  if (scope === 'month') {
    const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { start: ymdOf(startOfMonth(date)), end: ymdOf(endOfMonth(date)) };
  }
  const year = now.getFullYear() - 1;
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** SQL 的 `ymd` 是 ISO 文本，按字典序比较即可。 */
export function rangeWhere(range: DateRange): string {
  return `ymd BETWEEN '${range.start.replace(/'/g, "''")}' AND '${range.end.replace(/'/g, "''")}'`;
}
