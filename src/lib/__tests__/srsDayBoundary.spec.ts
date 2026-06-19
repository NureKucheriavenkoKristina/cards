import {
  getNextSrsDayBoundary,
  getSrsDayStart,
  normalizeSrsDayStartHour,
  SRS_DAY_START_HOUR_LOCAL,
} from '../srsDayBoundary';

describe('srsDayBoundary', () => {
  it('normalizes invalid hour values to default or clamp range', () => {
    expect(normalizeSrsDayStartHour(undefined)).toBe(SRS_DAY_START_HOUR_LOCAL);
    expect(normalizeSrsDayStartHour('5')).toBe(5);
    expect(normalizeSrsDayStartHour('24')).toBe(23);
    expect(normalizeSrsDayStartHour(-1)).toBe(0);
    expect(normalizeSrsDayStartHour('not-a-number')).toBe(SRS_DAY_START_HOUR_LOCAL);
  });

  it('returns the current SRS day start before the boundary', () => {
    const now = new Date(2026, 5, 14, 1, 30);
    const start = getSrsDayStart(now, 3);
    expect(start.getHours()).toBe(3);
    expect(start.getDate()).toBe(13);
  });

  it('returns the current SRS day start after the boundary', () => {
    const now = new Date(2026, 5, 14, 4, 15);
    const start = getSrsDayStart(now, 3);
    expect(start.getHours()).toBe(3);
    expect(start.getDate()).toBe(14);
  });

  it('returns the next SRS day boundary after the current one', () => {
    const now = new Date(2026, 5, 14, 4, 15);
    const next = getNextSrsDayBoundary(now, 3);
    expect(next.getHours()).toBe(3);
    expect(next.getDate()).toBe(15);
  });

  it('returns the current boundary when before the start hour', () => {
    const now = new Date(2026, 5, 14, 2, 0);
    const next = getNextSrsDayBoundary(now, 3);
    expect(next.getHours()).toBe(3);
    expect(next.getDate()).toBe(14);
  });
});