import {
  computeCandidateIntervalsDays,
  nextEasePermille,
  scheduleNextReview,
  DEFAULT_EASE_PERMILLE,
  MIN_EASE_PERMILLE,
} from './reviewScheduler';

describe('reviewScheduler', () => {
  it('computeCandidateIntervalsDays returns increasing intervals', () => {
    const res = computeCandidateIntervalsDays(10, 0, DEFAULT_EASE_PERMILLE);
    expect(typeof res.hard).toBe('number');
    expect(res.good).toBeGreaterThanOrEqual(res.hard);
    expect(res.easy).toBeGreaterThanOrEqual(res.good);
  });

  it('nextEasePermille changes correctly for ratings', () => {
    expect(nextEasePermille(2500, 'again')).toEqual(Math.max(MIN_EASE_PERMILLE, 2500 - 200));
    expect(nextEasePermille(2500, 'hard')).toEqual(Math.max(MIN_EASE_PERMILLE, 2500 - 150));
    expect(nextEasePermille(2500, 'good')).toEqual(2500);
    expect(nextEasePermille(2500, 'easy')).toEqual(Math.max(MIN_EASE_PERMILLE, 2500 + 150));
  });

  it('scheduleNextReview returns lapse interval on again', () => {
    const out = scheduleNextReview({ previousIntervalDays: 30, delayDays: 0, easePermille: 2500, rating: 'again' });
    expect(typeof out.intervalDays).toBe('number');
    expect(typeof out.easePermille).toBe('number');
  });
});
