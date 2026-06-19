jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

import {
  hideWebStudyReminderForToday,
  isWebStudyReminderHidden,
  localDateKey,
  parseStudyReminderPrefs,
  pushWebBellReminderItem,
  readWebBellReminderQueue,
  removeWebBellReminderItem,
  recordWebReminderSchedule,
  isWebStudyReminderDueNow,
  msUntilNextReminderCheck,
} from '../webStudyReminder';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('webStudyReminder', () => {
  it('parses reminder preferences from metadata and normalizes values', () => {
    expect(parseStudyReminderPrefs(undefined)).toEqual({ enabled: false, hour: 9 });
    expect(
      parseStudyReminderPrefs({
        notifications: { studyReminder: 'true', studyReminderHour: '18' },
      }),
    ).toEqual({ enabled: true, hour: 18 });
    expect(
      parseStudyReminderPrefs({
        notifications: { studyReminder: 1, studyReminderHour: 99 },
      }),
    ).toEqual({ enabled: true, hour: 23 });
  });

  it('computes stable local date keys', () => {
    const date = new Date('2026-06-14T08:23:00.000Z');
    expect(localDateKey(date)).toBe('2026-06-14');
  });

  it('can hide and query web study reminders for today', () => {
    const nowMs = Date.parse('2026-06-14T12:00:00.000Z');
    expect(isWebStudyReminderHidden('user1', nowMs)).toBe(false);

    hideWebStudyReminderForToday('user1', nowMs);
    expect(isWebStudyReminderHidden('user1', nowMs)).toBe(true);
  });

  it('stores and reads queued bell reminders in session storage', () => {
    const id = pushWebBellReminderItem('user1', {
      title: 'Daily',
      body: 'Reminder',
      kind: 'daily',
    });

    const queue = readWebBellReminderQueue('user1');
    expect(queue).toHaveLength(1);
    expect(queue[0]).toEqual(expect.objectContaining({ id, title: 'Daily', body: 'Reminder', kind: 'daily' }));

    removeWebBellReminderItem('user1', id);
    expect(readWebBellReminderQueue('user1')).toHaveLength(0);
  });

  it('considers a reminder due after the configured hour when schedule was saved before the hour', () => {
    const userId = 'user1';
    const prefs = { enabled: true, hour: 18 };
    const savedAtMs = Date.parse('2026-06-14T10:00:00.000Z');
    recordWebReminderSchedule(userId, 18, savedAtMs);

    const nowMs = Date.parse('2026-06-14T18:05:00.000Z');
    expect(isWebStudyReminderDueNow(userId, nowMs, prefs, false)).toBe(true);
  });

  it('avoids due if the schedule was saved after the reminder hour', () => {
    const userId = 'user1';
    const prefs = { enabled: true, hour: 18 };
    const savedAtMs = Date.parse('2026-06-14T18:05:00.000Z');
    recordWebReminderSchedule(userId, 18, savedAtMs);

    const nowMs = Date.parse('2026-06-14T18:10:00.000Z');
    expect(isWebStudyReminderDueNow(userId, nowMs, prefs, false)).toBe(false);
  });

  it('returns a short poll interval when the hour has already passed', () => {
    const nowMs = Date.parse('2026-06-14T19:00:00.000Z');
    expect(msUntilNextReminderCheck(18, nowMs)).toBe(15000);
  });

  it('returns a positive delay before the target hour', () => {
    const nowMs = Date.parse('2026-06-14T16:30:00.000Z');
    expect(msUntilNextReminderCheck(18, nowMs)).toBeGreaterThan(1000);
  });
});