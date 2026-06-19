import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import type { NotificationTriggerInput } from 'expo-notifications';

import { pushWebBellReminderItem } from '@/src/lib/webStudyReminder';

export const STUDY_DAILY_NOTIFICATION_ID = 'cardly-study-daily';
const ANDROID_STUDY_CHANNEL_ID = 'study-reminders';

let handlerRegistered = false;
let androidChannelEnsured = false;

/** Remote/push APIs were removed from Expo Go on Android (SDK 53+). Avoid loading the module there. */
export function isExpoGoAndroid(): boolean {
  return Platform.OS === 'android' && Constants.appOwnership === 'expo';
}

async function loadNotifications() {
  if (isExpoGoAndroid()) return null;
  return import('expo-notifications');
}

async function registerForegroundHandler() {
  if (handlerRegistered || Platform.OS === 'web') return;
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  handlerRegistered = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidStudyChannel(
  Notifications: Awaited<ReturnType<typeof loadNotifications>>,
): Promise<void> {
  if (!Notifications || Platform.OS !== 'android' || androidChannelEnsured) return;
  androidChannelEnsured = true;
  await Notifications.setNotificationChannelAsync(ANDROID_STUDY_CHANNEL_ID, {
    name: 'Study reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/** Opens app settings so the user can allow alarms / disable battery restrictions (Android). */
export async function openNotificationSettings(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Linking.openSettings();
  } catch {
    // no-op
  }
}

export type SyncStudyDailyReminderResult =
  | { ok: true }
  | { ok: false; reason: 'web' | 'permission_denied' | 'unavailable' | 'expo_go' };

/**
 * Local repeating daily notification (not remote push). iOS/Android only; web is a no-op.
 */
export async function syncStudyDailyReminder(options: {
  enabled: boolean;
  hour: number;
  title: string;
  body: string;
}): Promise<SyncStudyDailyReminderResult> {
  if (Platform.OS === 'web') {
    return { ok: true };
  }

  if (isExpoGoAndroid()) {
    if (!options.enabled) return { ok: true };
    return { ok: false, reason: 'expo_go' };
  }

  try {
    const Notifications = await loadNotifications();
    if (!Notifications) {
      return { ok: false, reason: 'unavailable' };
    }

    await registerForegroundHandler();
    await Notifications.cancelScheduledNotificationAsync(STUDY_DAILY_NOTIFICATION_ID);
    if (!options.enabled) {
      return { ok: true };
    }

    await ensureAndroidStudyChannel(Notifications);

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return { ok: false, reason: 'permission_denied' };
    }

    const hour = Math.max(0, Math.min(23, Math.floor(options.hour)));
    const trigger: NotificationTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_STUDY_CHANNEL_ID } : {}),
    };

    await Notifications.scheduleNotificationAsync({
      identifier: STUDY_DAILY_NOTIFICATION_ID,
      content: {
        title: options.title,
        body: options.body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: { kind: 'study-daily' },
        ...(Platform.OS === 'android' ? { channelId: ANDROID_STUDY_CHANNEL_ID } : {}),
      },
      trigger,
    });

    return { ok: true };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export type SendTestPushResult = SyncStudyDailyReminderResult;

/** Sends an immediate local test notification to this device (admin tooling). */
export async function sendTestPushNotification(options: {
  title: string;
  body: string;
  userId?: string;
}): Promise<SendTestPushResult> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      if (options.userId) {
        pushWebBellReminderItem(options.userId, {
          title: options.title,
          body: options.body,
          kind: 'test',
        });
      }
      window.dispatchEvent(new Event('cardly-web-reminder-refresh'));
    }
    return { ok: true };
  }

  if (isExpoGoAndroid()) {
    return { ok: false, reason: 'expo_go' };
  }

  try {
    const Notifications = await loadNotifications();
    if (!Notifications) {
      return { ok: false, reason: 'unavailable' };
    }

    await registerForegroundHandler();
    await ensureAndroidStudyChannel(Notifications);

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return { ok: false, reason: 'permission_denied' };
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: options.title,
        body: options.body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: { kind: 'admin-test' },
        ...(Platform.OS === 'android' ? { channelId: ANDROID_STUDY_CHANNEL_ID } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        repeats: false,
      },
    });

    return { ok: true };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
