const mockOpenSettings = jest.fn();
const mockSetNotificationHandler = jest.fn();
const mockCancelScheduledNotificationAsync = jest.fn(async () => null);
const mockGetPermissionsAsync = jest.fn(async () => ({ status: 'granted' }));
const mockRequestPermissionsAsync = jest.fn(async () => ({ status: 'granted' }));
const mockScheduleNotificationAsync = jest.fn(async () => 'notification-id');

const resetMocks = () => {
  mockOpenSettings.mockClear();
  mockSetNotificationHandler.mockClear();
  mockCancelScheduledNotificationAsync.mockClear();
  mockGetPermissionsAsync.mockClear();
  mockRequestPermissionsAsync.mockClear();
  mockScheduleNotificationAsync.mockClear();
};

const prepareModule = ({ platform = 'web', ownership = 'expo' } = {}) => {
  jest.doMock('react-native', () => ({
    Platform: { OS: platform },
    Linking: { openSettings: mockOpenSettings },
  }));
  jest.doMock('expo-constants', () => ({
    appOwnership: ownership,
  }));
  jest.doMock('expo-notifications', () => ({
    setNotificationHandler: mockSetNotificationHandler,
    cancelScheduledNotificationAsync: mockCancelScheduledNotificationAsync,
    getPermissionsAsync: mockGetPermissionsAsync,
    requestPermissionsAsync: mockRequestPermissionsAsync,
    scheduleNotificationAsync: mockScheduleNotificationAsync,
    AndroidImportance: { HIGH: 1 },
    AndroidNotificationVisibility: { PUBLIC: 1 },
    AndroidNotificationPriority: { MAX: 1 },
    SchedulableTriggerInputTypes: { DAILY: 'daily', TIME_INTERVAL: 'timeInterval' },
  }));
};

describe('studyReminderNotifications', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    resetMocks();
  });
  it('returns ok true on web platform for syncStudyDailyReminder', async () => {
    prepareModule({ platform: 'web', ownership: 'expo' });
    const { syncStudyDailyReminder } = await import('../studyReminderNotifications');
    const result = await syncStudyDailyReminder({ enabled: true, hour: 18, title: 'T', body: 'B' });
    expect(result).toEqual({ ok: true });
  });

  it('returns expo_go error on Android Expo Go when enabled', async () => {
    prepareModule({ platform: 'android', ownership: 'expo' });
    const { syncStudyDailyReminder, isExpoGoAndroid } = await import('../studyReminderNotifications');

    expect(isExpoGoAndroid()).toBe(true);
    const result = await syncStudyDailyReminder({ enabled: true, hour: 10, title: 'T', body: 'B' });
    expect(result).toEqual({ ok: false, reason: 'expo_go' });
  });

  it('schedules a daily notification on native platform when permissions are granted', async () => {
    prepareModule({ platform: 'ios', ownership: 'standalone' });
    const { syncStudyDailyReminder } = await import('../studyReminderNotifications');

    const result = await syncStudyDailyReminder({ enabled: true, hour: 22, title: 'T', body: 'B' });
    expect(result).toEqual({ ok: true });
    expect(mockSetNotificationHandler).toHaveBeenCalled();
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('cardly-study-daily');
    expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'cardly-study-daily' }));
  });

  it('opens settings without throwing on supported platforms', async () => {
    prepareModule({ platform: 'ios', ownership: 'standalone' });
    const { openNotificationSettings } = await import('../studyReminderNotifications');
    await expect(openNotificationSettings()).resolves.toBeUndefined();
    expect(mockOpenSettings).toHaveBeenCalled();
  });

  it('returns ok true on web platform for sendTestPushNotification and dispatches event', async () => {
    prepareModule({ platform: 'web', ownership: 'expo' });
    const { sendTestPushNotification } = await import('../studyReminderNotifications');
    const handle = jest.fn();
    window.addEventListener('cardly-web-reminder-refresh', handle);

    const result = await sendTestPushNotification({ title: 'Test', body: 'body', userId: 'user1' });
    expect(result).toEqual({ ok: true });
    expect(handle).toHaveBeenCalled();
  });
});