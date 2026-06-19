import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth } from '@/src/contexts/AuthContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { parseStudyReminderPrefs } from '@/src/lib/webStudyReminder';
import { syncStudyDailyReminder } from '@/src/lib/studyReminderNotifications';

export function runSync(metadata: unknown, t: (key: string) => string) {
  const { enabled, hour } = parseStudyReminderPrefs(metadata);

  void syncStudyDailyReminder({
    enabled,
    hour,
    title: t('pushRepeatWordsTitle'),
    body: t('pushRepeatWordsBody'),
  });
}

/**
 * Keeps the local daily “repeat words” notification in sync with account notification prefs.
 * Re-syncs when the app returns to foreground (Android may drop alarms until then).
 */
export function StudyReminderNotificationSync() {
  const { user } = useAuth();
  const { locale, t } = useLanguage();
  const metaKey = JSON.stringify(user?.user_metadata?.notifications);
  const lastAppState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!user) {
      void syncStudyDailyReminder({
        enabled: false,
        hour: 9,
        title: '',
        body: '',
      });
      return;
    }

    runSync(user.user_metadata, t);
  }, [user?.id, metaKey, user?.user_metadata, locale, t]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = lastAppState.current;
      lastAppState.current = nextState;
      if (prev.match(/inactive|background/) && nextState === 'active' && user) {
        runSync(user.user_metadata, t);
      }
    });
    return () => sub.remove();
  }, [user?.id, metaKey, user?.user_metadata]);

  return null;
}
