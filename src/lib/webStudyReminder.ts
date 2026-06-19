import { Platform } from 'react-native';

export type StudyReminderPrefs = {
  enabled: boolean;
  hour: number;
};

export function localDateKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseStudyReminderPrefs(metadata: unknown): StudyReminderPrefs {
  const raw =
    metadata && typeof metadata === 'object' && 'notifications' in metadata
      ? (metadata as { notifications?: unknown }).notifications
      : metadata;

  if (!raw || typeof raw !== 'object') {
    return { enabled: false, hour: 9 };
  }

  const prefs = raw as Record<string, unknown>;
  const enabled =
    prefs.studyReminder === true || prefs.studyReminder === 'true' || prefs.studyReminder === 1;
  const hourRaw = prefs.studyReminderHour;
  const hourNum = typeof hourRaw === 'number' ? hourRaw : Number(hourRaw);
  const hour = Number.isFinite(hourNum)
    ? Math.max(0, Math.min(23, Math.floor(hourNum)))
    : 9;

  return { enabled, hour };
}

export function webReminderHiddenStorageKey(userId: string, nowMs: number): string {
  return `cardly_web_study_reminder_hidden_${userId}_${localDateKey(new Date(nowMs))}`;
}

export function isWebStudyReminderHidden(userId: string, nowMs: number): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return window.localStorage.getItem(webReminderHiddenStorageKey(userId, nowMs)) === '1';
}

export function hideWebStudyReminderForToday(userId: string, nowMs: number): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.localStorage.setItem(webReminderHiddenStorageKey(userId, nowMs), '1');
}

type WebReminderSchedule = { dateKey: string; hour: number; savedAtMs: number };

const scheduleStorageKey = (userId: string) => `cardly_web_reminder_schedule_${userId}`;

/** Remember when the user last saved reminder prefs (web). */
export function recordWebReminderSchedule(userId: string, hour: number, nowMs: number): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const schedule: WebReminderSchedule = {
    dateKey: localDateKey(new Date(nowMs)),
    hour,
    savedAtMs: nowMs,
  };
  window.localStorage.setItem(scheduleStorageKey(userId), JSON.stringify(schedule));
}

function readWebReminderSchedule(userId: string): WebReminderSchedule | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(scheduleStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WebReminderSchedule;
    if (
      typeof parsed.dateKey === 'string' &&
      typeof parsed.hour === 'number' &&
      typeof parsed.savedAtMs === 'number'
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

/** True when local time is at or after the configured reminder hour today. */
export function isWebStudyReminderDueNow(
  userId: string,
  nowMs: number,
  prefs: StudyReminderPrefs,
  hidden: boolean,
): boolean {
  if (!prefs.enabled || hidden) return false;
  const now = new Date(nowMs);
  if (now.getHours() < prefs.hour) return false;

  const schedule = readWebReminderSchedule(userId);
  const todayKey = localDateKey(now);
  if (schedule?.dateKey === todayKey && schedule.hour === prefs.hour) {
    const reminderToday = new Date(now);
    reminderToday.setHours(prefs.hour, 0, 0, 0);
    if (schedule.savedAtMs >= reminderToday.getTime()) {
      return false;
    }
  }

  return true;
}

/** Ms until the next :00 at reminder hour (today), or a short poll if already past. */
export function msUntilNextReminderCheck(hour: number, nowMs: number): number {
  const now = new Date(nowMs);
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  if (now.getTime() >= target.getTime()) {
    return 15_000;
  }
  return Math.max(1_000, target.getTime() - now.getTime() + 300);
}

export type WebBellReminderItem = {
  id: string;
  title: string;
  body: string;
  kind: 'daily' | 'test';
};

const bellQueueStorageKey = (userId: string) => `cardly_web_bell_reminder_queue_${userId}`;

export function readWebBellReminderQueue(userId: string): WebBellReminderItem[] {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(bellQueueStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is WebBellReminderItem =>
        item != null &&
        typeof item === 'object' &&
        typeof (item as WebBellReminderItem).id === 'string' &&
        typeof (item as WebBellReminderItem).title === 'string' &&
        typeof (item as WebBellReminderItem).body === 'string' &&
        ((item as WebBellReminderItem).kind === 'daily' ||
          (item as WebBellReminderItem).kind === 'test'),
    );
  } catch {
    return [];
  }
}

export function pushWebBellReminderItem(
  userId: string,
  item: Omit<WebBellReminderItem, 'id'> & { id?: string },
): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return item.id ?? '';
  const id = item.id ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const queue = readWebBellReminderQueue(userId);
  queue.push({ ...item, id });
  window.sessionStorage.setItem(bellQueueStorageKey(userId), JSON.stringify(queue));
  return id;
}

export function removeWebBellReminderItem(userId: string, id: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const queue = readWebBellReminderQueue(userId).filter((item) => item.id !== id);
  window.sessionStorage.setItem(bellQueueStorageKey(userId), JSON.stringify(queue));
}

/** Legacy single-flag test trigger (migrated away). */
export function clearLegacyWebTestReminderFlag(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.sessionStorage.removeItem('cardly_web_test_study_reminder');
}
