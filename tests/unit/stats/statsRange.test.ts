import { describe, expect, it } from 'vitest';
import {
  addDays,
  previousRangeForScope,
  rangeForScope,
  ymdOf,
} from '../../../src/stats/statsRange.ts';

describe('统计范围', () => {
  it('今天与上一期', () => {
    const now = new Date(2026, 9, 17);
    expect(ymdOf(now)).toBe('2026-10-17');
    expect(rangeForScope('today', now)).toEqual({ start: '2026-10-17', end: '2026-10-17' });
    expect(previousRangeForScope('today', now)).toEqual({
      start: '2026-10-16',
      end: '2026-10-16',
    });
  });

  it('本周周一到周日：周六、周一、周日都落在同一周', () => {
    for (const day of [12, 17, 18]) {
      expect(rangeForScope('week', new Date(2026, 9, day))).toEqual({
        start: '2026-10-12',
        end: '2026-10-18',
      });
    }
    expect(previousRangeForScope('week', new Date(2026, 9, 17))).toEqual({
      start: '2026-10-05',
      end: '2026-10-11',
    });
  });

  it('跨月与跨年的周也按日历算', () => {
    expect(rangeForScope('week', new Date(2026, 0, 1))).toEqual({
      start: '2025-12-29',
      end: '2026-01-04',
    });
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('本月/本月上一期/今年/去年', () => {
    const now = new Date(2026, 9, 17);
    expect(rangeForScope('month', now)).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(previousRangeForScope('month', now)).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
    expect(rangeForScope('year', now)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(previousRangeForScope('year', now)).toEqual({
      start: '2025-01-01',
      end: '2025-12-31',
    });
  });
});
