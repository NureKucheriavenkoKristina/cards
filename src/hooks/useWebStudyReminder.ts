import type { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  clearLegacyWebTestReminderFlag,
  hideWebStudyReminderForToday,
  isWebStudyReminderDueNow,
  isWebStudyReminderHidden,
  localDateKey,
  msUntilNextReminderCheck,
  parseStudyReminderPrefs,
  readWebBellReminderQueue,
  removeWebBellReminderItem,
  type WebBellReminderItem,
} from '@/src/lib/webStudyReminder';

/**
 * Web-only clock for in-app study reminders (NotificationBell).
 * Polls on an interval, at the configured hour, and when the tab becomes visible.
 */
export function useWebStudyReminder(user: User | null) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [hidden, setHidden] = useState(false);
  const [queueTick, setQueueTick] = useState(0);
  const scheduleGenRef = useRef(0);

  const prefs = useMemo(
    () => parseStudyReminderPrefs(user?.user_metadata),
    [user?.user_metadata],
  );

  const bumpQueue = useCallback(() => {
    setQueueTick((v) => v + 1);
  }, []);

  const refresh = useCallback(() => {
    const ts = Date.now();
    setNowMs(ts);
    if (Platform.OS !== 'web' || !user) {
      setHidden(false);
      return;
    }
    clearLegacyWebTestReminderFlag();
    setHidden(isWebStudyReminderHidden(user.id, ts));
    bumpQueue();
  }, [bumpQueue, user]);

  const dismissDailyForToday = useCallback(() => {
    if (!user) return;
    clearLegacyWebTestReminderFlag();
    hideWebStudyReminderForToday(user.id, Date.now());
    setHidden(true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('cardly-web-reminder-refresh'));
    }
  }, [user]);

  const dismissBellItem = useCallback(
    (id: string) => {
      if (!user) return;
      removeWebBellReminderItem(user.id, id);
      bumpQueue();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('cardly-web-reminder-refresh'));
      }
    },
    [bumpQueue, user],
  );

  useEffect(() => {
    refresh();
  }, [prefs.hour, refresh]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !user || typeof window === 'undefined') return;

    refresh();

    const intervalId = window.setInterval(refresh, 30_000);
    const gen = ++scheduleGenRef.current;
    let exactTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const scheduleExactCheck = () => {
      if (gen !== scheduleGenRef.current || !prefs.enabled) return;
      const delay = msUntilNextReminderCheck(prefs.hour, Date.now());
      exactTimeoutId = window.setTimeout(() => {
        if (gen !== scheduleGenRef.current) return;
        refresh();
        scheduleExactCheck();
      }, delay);
    };

    scheduleExactCheck();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const onFocus = () => refresh();
    const onRefreshEvent = () => refresh();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('cardly-web-reminder-refresh', onRefreshEvent);

    return () => {
      scheduleGenRef.current += 1;
      window.clearInterval(intervalId);
      if (exactTimeoutId != null) window.clearTimeout(exactTimeoutId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('cardly-web-reminder-refresh', onRefreshEvent);
    };
  }, [prefs.enabled, prefs.hour, refresh, user?.id]);

  const dailyDue =
    Platform.OS === 'web' &&
    Boolean(user) &&
    isWebStudyReminderDueNow(user!.id, nowMs, prefs, hidden);

  const queuedReminders: WebBellReminderItem[] = useMemo(() => {
    if (Platform.OS !== 'web' || !user) return [];
    void queueTick;
    return readWebBellReminderQueue(user.id);
  }, [queueTick, user]);

  const dailyReminderId = user
    ? `study-daily-${user.id}-${localDateKey(new Date(nowMs))}`
    : 'study-daily';

  return {
    dailyDue,
    dailyReminderId,
    queuedReminders,
    dismissDailyForToday,
    dismissBellItem,
    prefs,
    refresh,
  };
}
